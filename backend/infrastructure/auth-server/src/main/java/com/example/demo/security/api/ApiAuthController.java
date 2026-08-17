package com.example.demo.security.api;

import com.example.demo.security.blacklist.TokenBlacklistService;
import com.example.demo.security.device.DeviceInfo;
import com.example.demo.security.jti.JtiTrackingService;
import com.example.demo.security.jwt.JwtService;
import com.example.demo.security.ratelimit.RateLimitService;
import com.example.demo.security.ratelimit.RateLimitService.RateLimitResult;
import com.example.demo.security.token.RefreshTokenService;
import com.example.demo.security.token.RefreshTokenService.RefreshTokenRotationResult;
import com.example.demo.user.User;
import com.example.demo.user.UserService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/**
 * REST API Authentication Controller for JWT-based authentication.
 * 
 * Endpoints:
 * - POST /api/auth/login - Authenticate and get tokens
 * - POST /api/auth/refresh - Refresh access token
 * - POST /api/auth/logout - Logout and revoke tokens
 * - POST /api/auth/logout-all - Logout from all devices
 */
@RestController
@RequestMapping("/api/auth")
public class ApiAuthController {

    private static final Logger log = LoggerFactory.getLogger(ApiAuthController.class);

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final TokenBlacklistService tokenBlacklistService;
    private final JtiTrackingService jtiTrackingService;
    private final RateLimitService rateLimitService;
    private final UserService userService;

    @Value("${security.refresh-token.expiration-days:7}")
    private int refreshTokenExpirationDays;

    @Value("${security.jwt.access-token-expiration-minutes:3}")
    private int accessTokenExpirationMinutes;

    @Value("${security.cookie.secure:true}")
    private boolean secureCookies;

    @Value("${security.brute-force.max-attempts:5}")
    private int maxLoginAttempts;

    @Value("${security.brute-force.lock-duration-minutes:15}")
    private int lockDurationMinutes;

    public ApiAuthController(AuthenticationManager authenticationManager,
            JwtService jwtService,
            RefreshTokenService refreshTokenService,
            TokenBlacklistService tokenBlacklistService,
            JtiTrackingService jtiTrackingService,
            RateLimitService rateLimitService,
            UserService userService) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.tokenBlacklistService = tokenBlacklistService;
        this.jtiTrackingService = jtiTrackingService;
        this.rateLimitService = rateLimitService;
        this.userService = userService;
    }

    /**
     * Register endpoint - create new user account.
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        log.info("Registration attempt for user: {}", request.username());

        try {
            // Check if user already exists
            if (userService.findUserByUsername(request.username()).isPresent()) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "Username already exists"));
            }

            // Create new user
            userService.register(request.username(), request.password(), request.fullName());

            log.info("User {} registered successfully", request.username());

            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(Map.of("message", "User registered successfully"));

        } catch (Exception e) {
            log.error("Registration failed for user: {}", request.username(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Registration failed"));
        }
    }

    /**
     * Login endpoint - authenticate and issue tokens.
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        // Rate limiting - 5 requests per minute per IP
        String clientIp = extractClientIp(httpRequest);
        RateLimitResult rateLimit = rateLimitService.checkLoginLimit(clientIp);
        if (!rateLimit.isAllowed()) {
            log.warn("Rate limit exceeded for login from IP: {}", clientIp);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(rateLimit.retryAfterSeconds()))
                    .header("X-RateLimit-Remaining", "0")
                    .body(Map.of(
                            "error", "Too many login attempts",
                            "retryAfter", rateLimit.retryAfterSeconds()));
        }

        log.info("Login attempt for user: {}", request.username());

        // Find user first to check lock status
        Optional<User> userOpt = userService.findUserByUsername(request.username());
        if (userOpt.isPresent()) {
            User user = userOpt.get();

            // Check if account is locked
            if (user.isAccountLocked()) {
                if (user.isLockExpired()) {
                    // Unlock the account
                    user.setAccountLocked(false);
                    user.setFailedLoginAttempts(0);
                    user.setLockExpiresAt(null);
                    userService.save(user);
                } else {
                    log.warn("Login attempt for locked account: {}", request.username());
                    return ResponseEntity.status(HttpStatus.LOCKED)
                            .body(Map.of(
                                    "error", "Account is locked",
                                    "message", "Too many failed attempts. Try again later.",
                                    "lockedUntil", user.getLockExpiresAt().toString()));
                }
            }
        }

        try {
            // Authenticate
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));

            // Get user
            User user = userService.findUserByUsername(request.username())
                    .orElseThrow(() -> new BadCredentialsException("User not found"));

            // Reset failed attempts on successful login
            if (user.getFailedLoginAttempts() > 0) {
                user.setFailedLoginAttempts(0);
            }
            user.setLastLoginAt(Instant.now());
            userService.save(user);

            // Generate tokens
            DeviceInfo deviceInfo = DeviceInfo.fromRequest(httpRequest, request.deviceId());
            String accessToken = jwtService.generateAccessToken(user, deviceInfo.getFingerprint());
            String refreshToken = refreshTokenService.createRefreshToken(user, deviceInfo);

            // Register JTI for tracking
            String jti = jwtService.extractJti(accessToken);
            long ttl = accessTokenExpirationMinutes * 60L;
            jtiTrackingService.registerJti(jti, user.getId(), deviceInfo.getFingerprint(), clientIp, ttl);

            // Set cookies
            setTokenCookies(httpResponse, accessToken, refreshToken, deviceInfo);

            log.info("User {} logged in successfully from {}", user.getUsername(), deviceInfo.getDeviceName());

            return ResponseEntity.ok(new AuthResponse(
                    accessTokenExpirationMinutes * 60,
                    refreshTokenExpirationDays * 24 * 60 * 60,
                    "Bearer"));

        } catch (BadCredentialsException e) {
            // Increment failed attempts
            userOpt.ifPresent(user -> {
                int attempts = user.getFailedLoginAttempts() + 1;
                user.setFailedLoginAttempts(attempts);

                if (attempts >= maxLoginAttempts) {
                    user.setAccountLocked(true);
                    user.setLockExpiresAt(Instant.now().plus(Duration.ofMinutes(lockDurationMinutes)));
                    log.warn("Account locked due to {} failed attempts: {}", attempts, user.getUsername());
                }

                userService.save(user);
            });

            log.warn("Failed login attempt for user: {}", request.username());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));

        } catch (LockedException e) {
            return ResponseEntity.status(HttpStatus.LOCKED)
                    .body(Map.of("error", "Account is locked"));
        }
    }

    /**
     * Refresh endpoint - exchange refresh token for new access token.
     * Implements token rotation for security.
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@RequestBody(required = false) RefreshRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        // Get refresh token ONLY from HttpOnly cookie (do not trust frontend-supplied
        // tokens)
        String refreshToken = null;
        Cookie[] cookies = httpRequest.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("refresh_token".equals(cookie.getName())) {
                    refreshToken = cookie.getValue();
                    break;
                }
            }
        }

        if (refreshToken == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Refresh token is required"));
        }

        // Rate limiting - 10 requests per minute per IP
        String clientIp = extractClientIp(httpRequest);
        RateLimitResult rateLimit = rateLimitService.checkRefreshLimit(clientIp);
        if (!rateLimit.isAllowed()) {
            log.warn("Rate limit exceeded for refresh from IP: {}", clientIp);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(rateLimit.retryAfterSeconds()))
                    .body(Map.of("error", "Too many refresh attempts"));
        }

        // Get device ID from request body or header
        String deviceId = (request != null) ? request.deviceId() : httpRequest.getHeader("X-Device-ID");
        DeviceInfo deviceInfo = DeviceInfo.fromRequest(httpRequest, deviceId);
        Optional<RefreshTokenRotationResult> result = refreshTokenService.rotateToken(refreshToken, deviceInfo);

        if (result.isEmpty()) {
            // Clear cookies on invalid refresh
            clearTokenCookies(httpResponse);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid or expired refresh token"));
        }

        RefreshTokenRotationResult rotationResult = result.get();
        User user = rotationResult.user();
        String newRefreshToken = rotationResult.newToken();
        String newAccessToken = jwtService.generateAccessToken(user, deviceInfo.getFingerprint());

        // Register new JTI for tracking
        String jti = jwtService.extractJti(newAccessToken);
        long ttl = accessTokenExpirationMinutes * 60L;
        jtiTrackingService.registerJti(jti, user.getId(), deviceInfo.getFingerprint(), clientIp, ttl);

        // Update cookies
        setTokenCookies(httpResponse, newAccessToken, newRefreshToken, deviceInfo);

        log.debug("Tokens refreshed for user: {}", user.getUsername());

        return ResponseEntity.ok(new AuthResponse(
                accessTokenExpirationMinutes * 60,
                refreshTokenExpirationDays * 24 * 60 * 60,
                "Bearer"));
    }

    /**
     * Logout endpoint - revoke current refresh token.
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestBody(required = false) RefreshRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        // Rate limiting - 5 requests per minute per IP
        String clientIp = extractClientIp(httpRequest);
        RateLimitResult rateLimit = rateLimitService.checkLogoutLimit(clientIp);
        if (!rateLimit.isAllowed()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(rateLimit.retryAfterSeconds()))
                    .body(Map.of("error", "Too many logout attempts"));
        }

        // Get refresh token ONLY from HttpOnly cookie (do not trust frontend-supplied
        // tokens)
        String refreshToken = null;
        Cookie[] cookies = httpRequest.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("refresh_token".equals(cookie.getName())) {
                    refreshToken = cookie.getValue();
                    break;
                }
            }
        }

        // Revoke refresh token
        if (refreshToken != null) {
            refreshTokenService.revokeToken(refreshToken);
        }

        // Blacklist current access token if present
        String accessToken = extractAccessToken(httpRequest);
        if (accessToken != null) {
            String jti = jwtService.extractJti(accessToken);
            long remainingTtl = jwtService.getExpirationSeconds(accessToken);
            if (jti != null && remainingTtl > 0) {
                tokenBlacklistService.blacklistToken(jti, remainingTtl);
                jtiTrackingService.blacklistJti(jti, remainingTtl);
            }
        }

        // Clear cookies
        clearTokenCookies(httpResponse);

        // Clear security context
        SecurityContextHolder.clearContext();

        log.info("User logged out");

        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    /**
     * Logout from all devices - revoke all refresh tokens and increment token
     * version.
     */
    @PostMapping("/logout-all")
    public ResponseEntity<?> logoutAll(HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() ||
                auth instanceof org.springframework.security.authentication.AnonymousAuthenticationToken ||
                "anonymousUser".equals(auth.getName())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        String username = auth.getName();
        User user = userService.findUserByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Increment token version to invalidate all existing tokens
        user.incrementTokenVersion();
        userService.save(user);

        // Revoke all refresh tokens
        refreshTokenService.revokeAllUserTokens(user);

        // Update Redis with new token version
        tokenBlacklistService.blacklistUserTokens(user.getId(), user.getTokenVersion());

        // Blacklist all JTIs for this user
        jtiTrackingService.blacklistAllUserJtis(user.getId());

        // Clear cookies
        clearTokenCookies(httpResponse);

        // Clear security context
        SecurityContextHolder.clearContext();

        log.info("User {} logged out from all devices", username);

        return ResponseEntity.ok(Map.of("message", "Logged out from all devices"));
    }

    /**
     * Get current user info.
     */
    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(HttpServletRequest httpRequest) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() ||
                auth instanceof org.springframework.security.authentication.AnonymousAuthenticationToken ||
                "anonymousUser".equals(auth.getName())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        // Rate limiting - 60 requests per minute per user
        String username = auth.getName();
        RateLimitResult rateLimit = rateLimitService.checkMeLimit(username);
        if (!rateLimit.isAllowed()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(rateLimit.retryAfterSeconds()))
                    .header("X-RateLimit-Remaining", "0")
                    .body(Map.of("error", "Rate limit exceeded"));
        }

        User user = userService.findUserByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "fullName", user.getFullName() != null ? user.getFullName() : "",
                "lastLoginAt", user.getLastLoginAt() != null ? user.getLastLoginAt().toString() : null));
    }

    // ========== Helper Methods ==========

    private void setTokenCookies(HttpServletResponse response, String accessToken, String refreshToken,
            DeviceInfo deviceInfo) {
        // Ensure we are not using a servlet session for authentication
        clearSessionCookie(response);

        // Device ID cookie (not HttpOnly) - enables server-side device binding checks
        // This is not a secret; it's an identifier to make token theft less useful.
        if (deviceInfo != null && deviceInfo.getDeviceId() != null && !deviceInfo.getDeviceId().isBlank()) {
            Cookie deviceCookie = new Cookie("device_id", deviceInfo.getDeviceId());
            deviceCookie.setHttpOnly(false);
            deviceCookie.setSecure(secureCookies);
            deviceCookie.setPath("/");
            deviceCookie.setMaxAge(refreshTokenExpirationDays * 24 * 60 * 60);
            // Use Lax for better mobile compatibility, None for cross-site
            deviceCookie.setAttribute("SameSite", "None");
            response.addCookie(deviceCookie);
        }

        // Access token cookie - short-lived
        Cookie accessCookie = new Cookie("access_token", accessToken);
        accessCookie.setHttpOnly(true);
        accessCookie.setSecure(secureCookies);
        accessCookie.setPath("/");
        accessCookie.setMaxAge(accessTokenExpirationMinutes * 60);
        // Use Lax for better mobile compatibility
        accessCookie.setAttribute("SameSite", "None");
        response.addCookie(accessCookie);

        // Refresh token cookie - longer-lived
        Cookie refreshCookie = new Cookie("refresh_token", refreshToken);
        refreshCookie.setHttpOnly(true);
        refreshCookie.setSecure(secureCookies);
        refreshCookie.setPath("/");
        refreshCookie.setMaxAge(refreshTokenExpirationDays * 24 * 60 * 60);
        // Use Lax for better mobile compatibility
        refreshCookie.setAttribute("SameSite", "None");
        response.addCookie(refreshCookie);
    }

    private void clearTokenCookies(HttpServletResponse response) {
        clearSessionCookie(response);

        Cookie deviceCookie = new Cookie("device_id", "");
        deviceCookie.setHttpOnly(false);
        deviceCookie.setSecure(secureCookies);
        deviceCookie.setPath("/");
        deviceCookie.setMaxAge(0);
        deviceCookie.setAttribute("SameSite", "None");
        response.addCookie(deviceCookie);

        Cookie accessCookie = new Cookie("access_token", "");
        accessCookie.setHttpOnly(true);
        accessCookie.setSecure(secureCookies);
        accessCookie.setPath("/");
        accessCookie.setMaxAge(0);
        accessCookie.setAttribute("SameSite", "None");
        response.addCookie(accessCookie);

        Cookie refreshCookie = new Cookie("refresh_token", "");
        refreshCookie.setHttpOnly(true);
        refreshCookie.setSecure(secureCookies);
        refreshCookie.setPath("/");
        refreshCookie.setMaxAge(0);
        refreshCookie.setAttribute("SameSite", "None");
        response.addCookie(refreshCookie);
    }

    private void clearSessionCookie(HttpServletResponse response) {
        Cookie sessionCookie = new Cookie("JSESSIONID", "");
        sessionCookie.setHttpOnly(true);
        sessionCookie.setSecure(secureCookies);
        sessionCookie.setPath("/");
        sessionCookie.setMaxAge(0);
        sessionCookie.setAttribute("SameSite", "Lax");
        response.addCookie(sessionCookie);
    }

    private String extractAccessToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }

        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("access_token".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }

        return null;
    }

    /**
     * Extract client IP, handling proxies.
     */
    private String extractClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }
        return request.getRemoteAddr();
    }

    // ========== DTOs ==========

    public record LoginRequest(
            @NotBlank(message = "Username is required") String username,
            @NotBlank(message = "Password is required") String password,
            String deviceId // Optional client-provided device ID
    ) {
    }

    public record RegisterRequest(
            @NotBlank(message = "Username is required") String username,
            @NotBlank(message = "Password is required") String password,
            @NotBlank(message = "Full name is required") String fullName) {
    }

    public record RefreshRequest(String refreshToken, String deviceId) {
    }

    public record AuthResponse(
            int accessTokenExpiresIn,
            int refreshTokenExpiresIn,
            String tokenType) {
    }
}
