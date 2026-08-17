package com.example.demo.user;

import com.example.demo.service.UserServiceEntity;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.core.userdetails.User.UserBuilder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class UserService implements UserDetailsService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final UserXServiceRepository userXServiceRepository;
    private final com.example.demo.service.UserServiceManagementService userServiceManagementService;
    private final PasswordEncoder passwordEncoder;
    private final ObjectProvider<UserService> selfProvider;

    public UserService(UserRepository userRepository,
            UserXServiceRepository userXServiceRepository,
            com.example.demo.service.UserServiceManagementService userServiceManagementService,
            PasswordEncoder passwordEncoder,
            ObjectProvider<UserService> selfProvider) {
        this.userRepository = userRepository;
        this.userXServiceRepository = userXServiceRepository;
        this.userServiceManagementService = userServiceManagementService;
        this.passwordEncoder = passwordEncoder;
        this.selfProvider = selfProvider;
    }

    @CacheEvict(cacheNames = "usersByUsername", key = "#username")
    public com.example.demo.user.User register(String username, String rawPassword, String fullName) {
        com.example.demo.user.User u = new com.example.demo.user.User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(rawPassword));
        u.setFullName(fullName);
        return save(u);
    }

    @Transactional
    public com.example.demo.user.User createUser(String username,
            String rawPassword,
            String fullName,
            String phone,
            List<Long> serviceIds,
            Long creatorId) {
        com.example.demo.user.User u = new com.example.demo.user.User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(rawPassword));
        u.setFullName(fullName);
        u.setPhone(phone);
        u.setEnabled(true);
        u.setAccountLocked(false);
        u.setCreatedBy(creatorId);
        u = save(u);

        // Assign services if provided
        if (serviceIds != null && !serviceIds.isEmpty()) {
            assignServicesToUser(u.getId(), serviceIds);
        }

        return u;
    }

    @Transactional
    public void assignServicesToUser(Long userId, List<Long> serviceIds) {
        com.example.demo.user.User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        for (Long serviceId : serviceIds) {
            // Check if already assigned
            if (!userXServiceRepository.findByUserIdAndServiceIdAndActiveTrue(userId, serviceId).isPresent()) {
                com.example.demo.service.UserServiceEntity service = userServiceManagementService
                        .getServiceById(serviceId)
                        .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));

                UserXService userXService = new UserXService(user, service, "system");
                userXServiceRepository.save(userXService);
            }
        }
    }

    @Transactional
    public void replaceServicesForUser(Long userId, List<Long> serviceIds) {
        com.example.demo.user.User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Get all current service assignments
        List<UserXService> currentAssignments = userXServiceRepository.findByUserId(userId);

        // Create a set of new service IDs for efficient lookup
        Set<Long> newServiceIds = new HashSet<>();
        if (serviceIds != null) {
            newServiceIds.addAll(serviceIds);
        }

        // Process existing assignments
        Set<Long> currentServiceIds = new HashSet<>();
        for (UserXService assignment : currentAssignments) {
            Long serviceId = assignment.getService().getId();
            currentServiceIds.add(serviceId);

            if (newServiceIds.contains(serviceId)) {
                // Keep this assignment active
                assignment.setActive(true);
                assignment.setAssignedBy("system");
                userXServiceRepository.save(assignment);
            } else {
                // Deactivate this assignment
                assignment.setActive(false);
                userXServiceRepository.save(assignment);
            }
        }

        // Add new assignments that didn't exist before
        for (Long serviceId : newServiceIds) {
            if (!currentServiceIds.contains(serviceId)) {
                com.example.demo.service.UserServiceEntity service = userServiceManagementService
                        .getServiceById(serviceId)
                        .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));

                UserXService userXService = new UserXService(user, service, "system");
                userXServiceRepository.save(userXService);
            }
        }
    }

    @Transactional
    public void updateServicesForUser(Long userId, List<Long> serviceIds, boolean replace) {
        if (replace) {
            replaceServicesForUser(userId, serviceIds);
        } else {
            assignServicesToUser(userId, serviceIds);
        }
    }

    @Transactional
    public void removeServiceFromUser(Long userId, Long serviceId) {
        userXServiceRepository.deleteByUserIdAndServiceId(userId, serviceId);
    }

    public List<UserServiceEntity> getUserServices(Long userId) {
        return userXServiceRepository.findActiveServicesByUserId(userId);
    }

    public List<com.example.demo.user.User> getActiveUsers() {
        return userRepository.findByEnabledTrue();
    }

    public List<com.example.demo.user.User> getAllUsers() {
        return userRepository.findAll();
    }

    public com.example.demo.user.User activateUser(Long userId) {
        com.example.demo.user.User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.setEnabled(true);
        return save(user);
    }

    public com.example.demo.user.User deactivateUser(Long userId) {
        com.example.demo.user.User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.setEnabled(false);
        return save(user);
    }

    @Transactional
    public void deleteUser(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new IllegalArgumentException("User not found with id: " + userId);
        }

        try {
            com.example.demo.user.User user = userRepository.findById(userId)
                    .orElseThrow(() -> new IllegalArgumentException("User not found with id: " + userId));

            // Soft delete by deactivating the user instead of hard deletion
            // This avoids foreign key constraint issues
            user.setEnabled(false);
            user.setAccountLocked(true);
            userRepository.save(user);

            logger.info("Successfully soft-deleted user {} (deactivated and locked)", userId);

        } catch (Exception e) {
            logger.error("Error deleting user {}: {}", userId, e.getMessage(), e);
            throw new IllegalArgumentException("Failed to delete user: " + e.getMessage());
        }
    }

    public User updateUser(Long userId, String fullName, String phone, List<Long> serviceIds) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found with id: " + userId));

        // Update user details
        user.setFullName(fullName);
        if (phone != null) {
            user.setPhone(phone);
        }

        // Handle service assignments inline to avoid transaction issues
        if (serviceIds != null) {
            // Get current assignments
            List<UserXService> currentAssignments = userXServiceRepository.findByUserId(userId);

            // Create sets for comparison
            Set<Long> newServiceIds = new HashSet<>(serviceIds);
            Set<Long> currentServiceIds = new HashSet<>();

            // Deactivate assignments not in the new list
            for (UserXService assignment : currentAssignments) {
                Long serviceId = assignment.getService().getId();
                currentServiceIds.add(serviceId);

                if (!newServiceIds.contains(serviceId)) {
                    assignment.setActive(false);
                    userXServiceRepository.save(assignment);
                } else {
                    // Keep active
                    assignment.setActive(true);
                    assignment.setAssignedBy("system");
                    userXServiceRepository.save(assignment);
                }
            }

            // Add new assignments
            for (Long serviceId : newServiceIds) {
                if (!currentServiceIds.contains(serviceId)) {
                    com.example.demo.service.UserServiceEntity service = userServiceManagementService
                            .getServiceById(serviceId)
                            .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));

                    UserXService userXService = new UserXService(user, service, "system");
                    userXServiceRepository.save(userXService);
                }
            }
        }

        return userRepository.save(user);
    }

    @Transactional
    public void updatePassword(Long userId, String newRawPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found with id: " + userId));
        user.setPassword(passwordEncoder.encode(newRawPassword));
        user.setPasswordChangedAt(java.time.Instant.now());
        user.setAccountLocked(false);
        user.setLockExpiresAt(null);
        user.setFailedLoginAttempts(0);
        selfProvider.getObject().save(user);
    }

    public com.example.demo.user.User getUserByUsername(String username) {
        return userRepository.findByUsername(username).orElse(null);
    }

    public Optional<com.example.demo.user.User> findUserByUsername(String username) {
        return Optional.ofNullable(selfProvider.getObject().getUserByUsername(username));
    }

    public com.example.demo.user.User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }

    @CacheEvict(cacheNames = "usersByUsername", key = "#user.username")
    public com.example.demo.user.User save(com.example.demo.user.User user) {
        return userRepository.save(user);
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        com.example.demo.user.User u = selfProvider.getObject().getUserByUsername(username);
        if (u == null) {
            throw new UsernameNotFoundException("User not found");
        }

        UserBuilder builder = org.springframework.security.core.userdetails.User.withUsername(u.getUsername())
                .password(u.getPassword())
                .authorities(Collections.emptyList()); // no roles for now

        return builder.build();
    }
}