package com.example.gateway.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import javax.crypto.SecretKey;
import java.util.List;

/**
 * Standard Spring Security WebFlux JWT Authentication Filter.
 * 
 * This follows Spring Security best practices:
 * - Implements WebFilter for reactive security
 * - Integrates with Spring Security context
 * - Standard JWT validation
 * - Supports both Authorization header and cookies
 * - Uses JWT_SECRET from .env file (standard practice)
 */
@Component
public class JwtAuthenticationWebFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationWebFilter.class);
    private static final String ACCESS_TOKEN_COOKIE = "access_token";

    @Value("${security.jwt.secret}")
    private String jwtSecret;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();

        log.debug("JwtAuthenticationWebFilter processing: {} {}", request.getMethod(), request.getURI().getPath());

        // Skip authentication for public endpoints
        String path = request.getURI().getPath();
        if (isPublicEndpoint(path)) {
            return chain.filter(exchange);
        }

        try {
            String token = extractToken(request);
            if (token != null) {
                Claims claims = validateToken(token);
                if (claims != null) {
                    // Create standard Spring Security authentication object
                    UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                            claims.getSubject(),
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_USER")));

                    // Add custom claims to details for downstream services
                    auth.setDetails(claims);

                    // Inject user identity headers for downstream microservices
                    String userId = claims.get("uid") != null ? claims.get("uid").toString() : "";
                    String username = claims.getSubject() != null ? claims.getSubject() : "";
                    
                    ServerHttpRequest mutatedRequest = request.mutate()
                            .header("X-User-Id", userId)
                            .header("X-Username", username)
                            .build();
                            
                    ServerWebExchange mutatedExchange = exchange.mutate()
                            .request(mutatedRequest)
                            .build();

                    // Set authentication in Spring Security context
                    return chain.filter(mutatedExchange)
                            .contextWrite(ReactiveSecurityContextHolder.withAuthentication(auth))
                            .doOnSuccess(
                                    aVoid -> log.debug("Authentication successful for user: {}", claims.getSubject()));
                }
            }
        } catch (Exception e) {
            log.error("JWT authentication failed: {}", e.getMessage());
        }

        // Continue without authentication if token is invalid
        return chain.filter(exchange);
    }

    private boolean isPublicEndpoint(String path) {
        return path.startsWith("/api/auth/login") ||
                path.startsWith("/api/auth/register") ||
                path.startsWith("/actuator/") ||
                path.startsWith("/api/branchreport/");
    }

    private String extractToken(ServerHttpRequest request) {
        // First try Authorization header (standard JWT approach)
        String authHeader = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            log.debug("Token extracted from Authorization header");
            return token;
        }

        // Fallback to cookies for web clients
        String cookieHeader = request.getHeaders().getFirst(HttpHeaders.COOKIE);
        if (cookieHeader != null) {
            String[] cookies = cookieHeader.split(";");
            for (String cookie : cookies) {
                cookie = cookie.trim();
                if (cookie.startsWith(ACCESS_TOKEN_COOKIE + "=")) {
                    String token = cookie.substring((ACCESS_TOKEN_COOKIE + "=").length());
                    log.debug("Token extracted from cookie");
                    return token;
                }
            }
        }
        return null;
    }

    private Claims validateToken(String token) {
        try {
            SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes());
            return Jwts.parserBuilder()
                    .setSigningKey(key)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (JwtException e) {
            log.debug("Invalid JWT token: {}", e.getMessage());
            return null;
        } catch (Exception e) {
            log.error("Error validating JWT token: {}", e.getMessage(), e);
            return null;
        }
    }
}
