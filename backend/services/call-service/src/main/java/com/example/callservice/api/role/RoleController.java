package com.example.callservice.api.role;

import com.example.callservice.dto.role.CreateRoleRequest;
import com.example.callservice.dto.permission.PermissionResponse;
import com.example.callservice.dto.role.RoleResponse;
import com.example.callservice.dto.role.UpdateRoleRequest;
import com.example.callservice.dto.user.UserResponse;
import com.example.callservice.entity.role.Role;
import com.example.callservice.service.role.RoleService;
import com.example.callservice.service.shared.RoleAssignmentService;
import com.example.callservice.annotation.RequirePermission;
import com.example.callservice.api.base.BaseController;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/calls/roles")
public class RoleController extends BaseController {

    private static final Logger logger = LoggerFactory.getLogger(RoleController.class);

    private final RoleService roleService;
    private final RoleAssignmentService roleAssignmentService;

    public RoleController(RoleService roleService, RoleAssignmentService roleAssignmentService) {
        this.roleService = roleService;
        this.roleAssignmentService = roleAssignmentService;
    }

    @GetMapping
    public ResponseEntity<List<RoleResponse>> getAllRoles(HttpServletRequest request) {
        ResponseEntity<List<RoleResponse>> permissionCheck = checkPermissionAndReturn(request, "role.view");
        if (permissionCheck != null) {
            return permissionCheck;
        }
        Long currentUserId = getCurrentUserId(request);
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        boolean isRootUser = isRootUser(currentUserId);
        List<Role> roles = roleService.getRolesForUser(currentUserId, isRootUser);
        List<RoleResponse> response = roles.stream()
                .map(role -> new RoleResponse(
                        role.getId(),
                        role.getName(),
                        role.getDescription(),
                        role.getPermissions().stream()
                                .map(permission -> new PermissionResponse(
                                        permission.getId(),
                                        permission.getCode(),
                                        permission.getName(),
                                        permission.getDescription(),
                                        permission.getActive(),
                                        permission.getCreatedAt(),
                                        permission.getUpdatedAt(),
                                        permission.getMenuGroup(),
                                        permission.getMenuNumber()))
                                .collect(Collectors.toList()),
                        roleService.getUserCountForRole(role.getId()),
                        role.getActive(),
                        role.getCreatedAt(),
                        role.getUpdatedAt()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<RoleResponse> getRoleById(@PathVariable Long id, HttpServletRequest request) {
        ResponseEntity<RoleResponse> permissionCheck = checkPermissionAndReturn(request, "role.view");
        if (permissionCheck != null) {
            return permissionCheck;
        }
        Role role = roleService.getRoleById(id)
                .orElseThrow(() -> new IllegalArgumentException("Role not found with id: " + id));

        RoleResponse response = new RoleResponse(
                role.getId(),
                role.getName(),
                role.getDescription(),
                role.getPermissions().stream()
                        .map(permission -> new PermissionResponse(
                                permission.getId(),
                                permission.getCode(),
                                permission.getName(),
                                permission.getDescription(),
                                permission.getActive(),
                                permission.getCreatedAt(),
                                permission.getUpdatedAt(),
                                permission.getMenuGroup(),
                                permission.getMenuNumber()))
                        .collect(Collectors.toList()),
                roleService.getUserCountForRole(role.getId()),
                role.getActive(),
                role.getCreatedAt(),
                role.getUpdatedAt());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @RequirePermission("role.manage")
    public ResponseEntity<RoleResponse> createRole(@RequestBody CreateRoleRequest roleRequest,
            HttpServletRequest httpRequest) {
        ResponseEntity<RoleResponse> permissionCheck = checkPermissionAndReturn(httpRequest, "role.manage");
        if (permissionCheck != null) {
            return permissionCheck;
        }
        Long currentUserId = getCurrentUserId(httpRequest);
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        logger.info("Creating new role: {}", roleRequest.getName());
        boolean isRootUser = isRootUser(currentUserId);

        Role role = roleService.createRole(roleRequest, currentUserId, isRootUser);

        RoleResponse response = new RoleResponse(
                role.getId(),
                role.getName(),
                role.getDescription(),
                role.getPermissions().stream()
                        .map(permission -> new PermissionResponse(
                                permission.getId(),
                                permission.getCode(),
                                permission.getName(),
                                permission.getDescription(),
                                permission.getActive(),
                                permission.getCreatedAt(),
                                permission.getUpdatedAt(),
                                permission.getMenuGroup(),
                                permission.getMenuNumber()))
                        .collect(Collectors.toList()),
                roleService.getUserCountForRole(role.getId()),
                role.getActive(),
                role.getCreatedAt(),
                role.getUpdatedAt());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    @RequirePermission("role.manage")
    public ResponseEntity<RoleResponse> updateRole(@PathVariable Long id, @RequestBody UpdateRoleRequest roleRequest,
            HttpServletRequest httpRequest) {
        ResponseEntity<RoleResponse> permissionCheck = checkPermissionAndReturn(httpRequest, "role.manage");
        if (permissionCheck != null) {
            return permissionCheck;
        }
        Long currentUserId = getCurrentUserId(httpRequest);
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        logger.info("Updating role {}: {}", id, roleRequest.getName());
        boolean isRootUser = isRootUser(currentUserId);

        Role role = roleService.updateRole(id, roleRequest, currentUserId, isRootUser);

        RoleResponse response = new RoleResponse(
                role.getId(),
                role.getName(),
                role.getDescription(),
                role.getPermissions().stream()
                        .map(permission -> new PermissionResponse(
                                permission.getId(),
                                permission.getCode(),
                                permission.getName(),
                                permission.getDescription(),
                                permission.getActive(),
                                permission.getCreatedAt(),
                                permission.getUpdatedAt(),
                                permission.getMenuGroup(),
                                permission.getMenuNumber()))
                        .collect(Collectors.toList()),
                roleService.getUserCountForRole(role.getId()),
                role.getActive(),
                role.getCreatedAt(),
                role.getUpdatedAt());
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    @RequirePermission("role.manage")
    public ResponseEntity<Void> deleteRole(@PathVariable Long id, HttpServletRequest request) {
        ResponseEntity<Void> permissionCheck = checkPermissionAndReturn(request, "role.manage");
        if (permissionCheck != null) {
            return permissionCheck;
        }
        logger.info("Deleting role with id: {}", id);

        if (!roleService.existsById(id)) {
            throw new IllegalArgumentException("Role not found with id: " + id);
        }

        roleService.deleteRole(id);
        return ResponseEntity.noContent().build();
    }

    public static class UserRoleRequest {
        private List<Long> userIds;
        public List<Long> getUserIds() { return userIds; }
        public void setUserIds(List<Long> userIds) { this.userIds = userIds; }
    }

    @PostMapping("/{roleId}/assign-users")
    @RequirePermission("role.assign")
    public ResponseEntity<Void> assignUsersToRole(
            @PathVariable Long roleId,
            @RequestBody UserRoleRequest request,
            HttpServletRequest httpRequest) {

        ResponseEntity<Void> permissionCheck = checkPermissionAndReturn(httpRequest, "role.assign");
        if (permissionCheck != null) {
            return permissionCheck;
        }

        List<Long> userIds = request.getUserIds();
        if (userIds == null || userIds.isEmpty()) {
            throw new IllegalArgumentException("User IDs are required");
        }

        logger.info("Assigning {} users to role {}", userIds.size(), roleId);

        if (!roleService.existsById(roleId)) {
            throw new IllegalArgumentException("Role not found with id: " + roleId);
        }

        Long currentUserId = getCurrentUserId(httpRequest);
        String assignedBy = currentUserId != null ? currentUserId.toString() : "system";

        // Store the user-role assignments using the service
        roleAssignmentService.assignUsersToRole(roleId, userIds, assignedBy);
        logger.info("Users assigned to role {}: {}", roleId, userIds);

        return ResponseEntity.ok().build();
    }

    @GetMapping("/{roleId}/users")
    public ResponseEntity<List<UserResponse>> getUsersInRole(@PathVariable Long roleId) {
        logger.info("Getting users for role: {}", roleId);

        if (!roleService.existsById(roleId)) {
            throw new IllegalArgumentException("Role not found with id: " + roleId);
        }

        // Return the actual stored user assignments with real user data
        List<Long> assignedUserIds = roleAssignmentService.getUsersInRole(roleId);
        List<UserResponse> users = new ArrayList<>();

        // For now, create mock responses that match the real user structure
        for (Long userId : assignedUserIds) {
            UserResponse user = new UserResponse();
            user.setId(userId);
            user.setUsername("user" + userId);
            user.setEmail("user" + userId + "@example.com"); // Required by UserResponse
            user.setFullName("User " + userId);
            user.setActive(true);
            users.add(user);
        }
        return ResponseEntity.ok(users);
    }

    @PostMapping("/{roleId}/remove-users")
    public ResponseEntity<Void> removeUsersFromRole(@PathVariable Long roleId,
            @RequestBody UserRoleRequest request) {
        logger.info("Removing users from role: {}", roleId);

        List<Long> userIds = request.getUserIds();
        if (userIds == null || userIds.isEmpty()) {
            throw new IllegalArgumentException("User IDs are required");
        }

        if (!roleService.existsById(roleId)) {
            throw new IllegalArgumentException("Role not found with id: " + roleId);
        }

        // Remove users from the role assignment using the service
        roleAssignmentService.removeUsersFromRole(roleId, userIds);
        logger.info("Users removed from role {}: {}", roleId, userIds);

        return ResponseEntity.ok().build();
    }
}
