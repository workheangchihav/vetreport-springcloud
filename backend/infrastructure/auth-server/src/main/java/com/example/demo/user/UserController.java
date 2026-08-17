package com.example.demo.user;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        List<User> allUsers = userService.getAllUsers();
        return ResponseEntity.ok(allUsers);
    }

    @GetMapping("/active")
    public ResponseEntity<List<User>> getActiveUsers() {
        List<User> activeUsers = userService.getActiveUsers();
        return ResponseEntity.ok(activeUsers);
    }

    @PostMapping
    public ResponseEntity<User> createUser(@RequestBody CreateUserRequest request, HttpServletRequest httpRequest) {
        Long creatorId = extractUserIdFromHeader(httpRequest);
        User newUser = userService.createUser(
                request.getUsername(),
                request.getPassword(),
                request.getFullName(),
                request.getPhone(),
                request.getServiceIds(),
                creatorId);
        return ResponseEntity.ok(newUser);
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<User> updateUser(@PathVariable Long id, @RequestBody UpdateUserRequest request) {
        User updatedUser = userService.updateUser(
                id,
                request.getFullName(),
                request.getPhone(),
                request.getServiceIds());
        return ResponseEntity.ok(updatedUser);
    }

    @PutMapping("/{id}/password")
    public ResponseEntity<Void> updatePassword(@PathVariable Long id, @RequestBody UpdatePasswordRequest request) {
        userService.updatePassword(id, request.getNewPassword());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/activate")
    public ResponseEntity<User> activateUser(@PathVariable Long id) {
        User user = userService.activateUser(id);
        return ResponseEntity.ok(user);
    }

    @PutMapping("/{id}/deactivate")
    public ResponseEntity<User> deactivateUser(@PathVariable Long id) {
        User user = userService.deactivateUser(id);
        return ResponseEntity.ok(user);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{userId}/services")
    public ResponseEntity<Void> assignServices(@PathVariable Long userId,
            @RequestBody java.util.Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Long> serviceIds = (List<Long>) request.get("serviceIds");
        userService.replaceServicesForUser(userId, serviceIds);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{userId}/services")
    public ResponseEntity<Void> replaceServices(@PathVariable Long userId,
            @RequestBody java.util.Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Long> serviceIds = (List<Long>) request.get("serviceIds");
        userService.replaceServicesForUser(userId, serviceIds);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{userId}/services/replace")
    public ResponseEntity<Void> replaceServicesPost(@PathVariable Long userId,
            @RequestBody java.util.Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Long> serviceIds = (List<Long>) request.get("serviceIds");
        userService.replaceServicesForUser(userId, serviceIds);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{userId}/services/{serviceId}")
    public ResponseEntity<Void> removeService(@PathVariable Long userId, @PathVariable Long serviceId) {
        userService.removeServiceFromUser(userId, serviceId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{userId}/services")
    public ResponseEntity<?> getUserServices(@PathVariable Long userId) {
        var services = userService.getUserServices(userId);
        return ResponseEntity.ok(services);
    }

    @GetMapping("/username/{username}/id")
    public ResponseEntity<Long> getUserIdByUsername(@PathVariable String username) {
        Optional<User> user = userService.findUserByUsername(username);
        return user.map(u -> ResponseEntity.ok(u.getId()))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/username/{username}/fullname")
    public ResponseEntity<java.util.Map<String, String>> getUserFullNameByUsername(@PathVariable String username) {
        Optional<User> user = userService.findUserByUsername(username);
        if (user.isPresent()) {
            java.util.Map<String, String> response = new java.util.HashMap<>();
            response.put("fullName", user.get().getFullName());
            response.put("phone", user.get().getPhone());
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/{id}/username")
    public ResponseEntity<String> getUsername(@PathVariable Long id) {
        User user = userService.getUserById(id);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(user.getUsername());
    }

    public static class CreateUserRequest {
        private String username;
        private String password;
        private String fullName;
        private String phone;
        private List<Long> serviceIds;

        // Getters and setters
        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getFullName() {
            return fullName;
        }

        public void setFullName(String fullName) {
            this.fullName = fullName;
        }

        public String getPhone() {
            return phone;
        }

        public void setPhone(String phone) {
            this.phone = phone;
        }

        public List<Long> getServiceIds() {
            return serviceIds;
        }

        public void setServiceIds(List<Long> serviceIds) {
            this.serviceIds = serviceIds;
        }
    }

    public static class UpdateUserRequest {
        private String fullName;
        private String phone;
        private List<Long> serviceIds;

        // Getters and setters
        public String getFullName() {
            return fullName;
        }

        public void setFullName(String fullName) {
            this.fullName = fullName;
        }

        public String getPhone() {
            return phone;
        }

        public void setPhone(String phone) {
            this.phone = phone;
        }

        public List<Long> getServiceIds() {
            return serviceIds;
        }

        public void setServiceIds(List<Long> serviceIds) {
            this.serviceIds = serviceIds;
        }
    }

    public static class UpdatePasswordRequest {
        private String newPassword;

        public String getNewPassword() {
            return newPassword;
        }

        public void setNewPassword(String newPassword) {
            this.newPassword = newPassword;
        }
    }

    public static class AssignServicesRequest {
        private List<Long> serviceIds;

        public List<Long> getServiceIds() {
            return serviceIds;
        }

        public void setServiceIds(List<Long> serviceIds) {
            this.serviceIds = serviceIds;
        }
    }

    private Long extractUserIdFromHeader(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String header = request.getHeader("X-User-Id");
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(header);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
