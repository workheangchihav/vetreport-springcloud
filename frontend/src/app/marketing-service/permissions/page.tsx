"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  marketingPermissionsService,
  Permission,
  Role,
  PermissionGroup,
  CreateRoleRequest,
  UpdateRoleRequest,
} from "@/services/marketingPermissionsService";
import { User } from "@/services/userService";
import { marketingUserService } from "@/services/marketing-service/marketingUserService";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/services/httpClient";
import {
  Plus,
  Trash2,
  Edit,
  Users,
  Shield,
  Check,
  X,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export default function PermissionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Form states
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });

  // User assignment states
  const [showUserAssignment, setShowUserAssignment] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [roleUsers, setRoleUsers] = useState<Map<number, User[]>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [allowedPermissionCodes, setAllowedPermissionCodes] =
    useState<Set<string> | null>(null);
  const [permissionScopeLoaded, setPermissionScopeLoaded] = useState(false);
  const [permissionLimitError, setPermissionLimitError] = useState<
    string | null
  >(null);

  useEffect(() => {
    fetchData();
    loadCurrentUserPermissions();
  }, [user?.id]);

  const loadCurrentUserPermissions = async () => {
    try {
      setPermissionScopeLoaded(false);

      if (!user?.id) {
        setAllowedPermissionCodes(null);
        setPermissionScopeLoaded(false);
        return;
      }

      setCurrentUserId(user.id);

      const response = await apiFetch(
        `/api/marketing/permissions/user/${user.id}`,
      );

      if (!response.ok) {
        throw new Error("Unable to fetch user permissions");
      }

      const userPermissions: { permissionCode: string }[] =
        await response.json();
      const codes = new Set(
        userPermissions
          .map((perm) => perm.permissionCode)
          .filter(
            (code): code is string =>
              typeof code === "string" && code.length > 0,
          ),
      );
      setAllowedPermissionCodes(codes);
      setPermissionScopeLoaded(true);
    } catch (error) {
      console.error("Failed to load current user permissions", error);
      setAllowedPermissionCodes(null);
      setPermissionLimitError(
        "Unable to determine your permission scope. Showing all permissions.",
      );
      setPermissionScopeLoaded(false);
    }
  };

  const fetchData = async () => {
    try {
      // Fetch data using real services
      const [permissionsData, groupsData, rolesData] = await Promise.all([
        marketingPermissionsService.getPermissions(),
        marketingPermissionsService.getPermissionGroups(),
        marketingPermissionsService.getRoles(),
      ]);

      setPermissions(permissionsData);
      setPermissionGroups(groupsData);
      setRoles(rolesData);

      // Fetch users assigned to each role
      const roleUsersMap = new Map<number, User[]>();
      for (const role of rolesData) {
        try {
          const assignedUsers = await marketingPermissionsService.getUsersInRole(
            role.id,
          );
          roleUsersMap.set(role.id, assignedUsers);
        } catch (error) {
          console.warn(`Failed to fetch users for role ${role.id}:`, error);
          roleUsersMap.set(role.id, []);
        }
      }
      setRoleUsers(roleUsersMap);

      // Auto-expand all groups initially
      const allGroupIds = new Set(groupsData.map((group) => group.id));
      setExpandedGroups(allGroupIds);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async () => {
    if (!roleForm.name.trim()) return;

    try {
      const createRoleRequest: CreateRoleRequest = {
        name: roleForm.name,
        description: roleForm.description,
        permissionCodes: selectedPermissions,
      };

      const newRole = await marketingPermissionsService.createRole(createRoleRequest);
      setRoles([...roles, newRole]);
      resetRoleForm();
      console.log("Role created successfully:", newRole);
    } catch (error) {
      console.error("Failed to create role:", error);
      // Show error message to user
      alert("Failed to create role. Please try again.");
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole || !roleForm.name.trim()) return;

    try {
      const updateRoleRequest: UpdateRoleRequest = {
        name: roleForm.name,
        description: roleForm.description,
        permissionCodes: selectedPermissions,
      };

      const updatedRole = await marketingPermissionsService.updateRole(
        editingRole.id,
        updateRoleRequest,
      );
      const updatedRoles = roles.map((role) =>
        role.id === editingRole.id ? updatedRole : role,
      );

      setRoles(updatedRoles);
      resetRoleForm();
      console.log("Role updated successfully:", updatedRole);
    } catch (error) {
      console.error("Failed to update role:", error);
      alert("Failed to update role. Please try again.");
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    try {
      await marketingPermissionsService.deleteRole(roleId);
      setRoles(roles.filter((role) => role.id !== roleId));
      console.log("Role deleted successfully:", roleId);
    } catch (error) {
      console.error("Failed to delete role:", error);
      alert("Failed to delete role. Please try again.");
    }
  };

  const resetRoleForm = () => {
    setRoleForm({ name: "", description: "" });
    setSelectedPermissions([]);
    setShowRoleForm(false);
    setEditingRole(null);
  };

  const openRoleForm = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({ name: role.name, description: role.description });
      const filteredCodes = allowedPermissionCodes
        ? role.permissions
          .map((p) => p.code)
          .filter((code) => allowedPermissionCodes.has(code))
        : role.permissions.map((p) => p.code);
      setSelectedPermissions(filteredCodes);
    } else {
      setEditingRole(null);
      setRoleForm({ name: "", description: "" });
      setSelectedPermissions([]);
    }
    setShowRoleForm(true);
  };

  const togglePermission = (permissionCode: string) => {
    if (allowedPermissionCodes && !allowedPermissionCodes.has(permissionCode)) {
      return;
    }
    setSelectedPermissions((prev) =>
      prev.includes(permissionCode)
        ? prev.filter((p) => p !== permissionCode)
        : [...prev, permissionCode],
    );
  };

  const filteredRoles = useMemo(() => {
    if (!currentUserId) {
      return roles;
    }
    // Backend RoleResponse currently lacks creator metadata, so we cannot filter precisely.
    // Return all roles until API exposes creator information.
    return roles;
  }, [roles, currentUserId]);

  const filteredPermissionGroups = useMemo(() => {
    if (!permissionScopeLoaded || allowedPermissionCodes === null) {
      return [];
    }
    return permissionGroups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((permission) =>
          allowedPermissionCodes.has(permission.code),
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [permissionGroups, allowedPermissionCodes]);

  const openUserAssignment = async (role: Role) => {
    setSelectedRole(role);
    setShowUserAssignment(true);

    try {
      // Fetch fresh user data from marketing-service
      const freshUsers = await marketingUserService.getMarketingUsers();
      setAvailableUsers(freshUsers);

      // Get users already assigned to this role
      const assignedUsers = roleUsers.get(role.id) || [];
      const assignedUserIds = assignedUsers.map((user) => user.id);

      // Auto-select users who are already assigned
      setSelectedUsers(assignedUserIds);
    } catch (error) {
      console.error("Failed to fetch users for assignment:", error);
      setAvailableUsers([]);
      setSelectedUsers([]);
    }
  };

  const handleAssignUsers = async () => {
    if (!selectedRole) return;

    try {
      // Get currently assigned users
      const currentlyAssigned = roleUsers.get(selectedRole.id) || [];
      const currentlyAssignedIds = currentlyAssigned.map((user) => user.id);

      // Calculate users to add and remove
      const usersToAdd = selectedUsers.filter(
        (id) => !currentlyAssignedIds.includes(id),
      );
      const usersToRemove = currentlyAssignedIds.filter(
        (id) => !selectedUsers.includes(id),
      );

      // Add new users
      if (usersToAdd.length > 0) {
        await marketingPermissionsService.assignUsersToRole(selectedRole.id, usersToAdd);
      }

      // Remove users
      if (usersToRemove.length > 0) {
        await marketingPermissionsService.removeUsersFromRole(
          selectedRole.id,
          usersToRemove,
        );
      }

      // Update role user count in local state
      const updatedRoles = roles.map((role) =>
        role.id === selectedRole.id
          ? { ...role, userCount: selectedUsers.length }
          : role,
      );
      setRoles(updatedRoles);

      // Refresh users for this role
      try {
        const assignedUsers = await marketingPermissionsService.getUsersInRole(
          selectedRole.id,
        );
        setRoleUsers((prev) =>
          new Map(prev).set(selectedRole.id, assignedUsers),
        );
      } catch (error) {
        console.warn("Failed to refresh role users:", error);
      }

      setShowUserAssignment(false);
      setSelectedUsers([]);
      console.log(
        "Successfully updated user assignments for role:",
        selectedRole.id,
        { added: usersToAdd, removed: usersToRemove },
      );
    } catch (error) {
      console.error("Failed to update user assignments:", error);
      alert("Failed to update user assignments. Please try again.");
    }
  };

  const toggleUserSelection = (userId: number) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen px-4 py-8 relative overflow-hidden">
        {/* Animated Background Gradients */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-orange-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-orange-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <div className="mx-auto max-w-6xl flex flex-col gap-8 relative z-10">
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-6 bg-linear-to-b from-orange-500 to-orange-600 rounded-full"></div>
            <h1 className="text-2xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              Permissions Management
            </h1>
          </div>
          <p className="text-slate-300">
            Manage roles and permissions for the Marketing service system.
          </p>

          {/* Roles Section */}
          <section className="glass-card animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Roles</h2>
              <PermissionGuard
                permission="menu.5.manage"
                serviceContext="marketing-service"
                fallback={
                  <button
                    disabled
                    className="glass-button px-4 py-2 text-sm font-semibold bg-gray-600 text-gray-400 cursor-not-allowed flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Role (No Permission)
                  </button>
                }
              >
                <button
                  onClick={() => openRoleForm()}
                  className="glass-button px-4 py-2 text-sm font-semibold bg-linear-to-r from-orange-500 to-orange-600 text-white hover:shadow-glow flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create Role
                </button>
              </PermissionGuard>
            </div>
            <div className="space-y-4">
              {filteredRoles.map((role) => (
                <div key={role.id} className="glass-card-inner">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">
                        {role.name}
                      </h3>
                      <p className="text-sm text-slate-300 mt-1">
                        {role.description}
                      </p>

                      {/* Display assigned users */}
                      <div className="mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-300">
                            Assigned Users (
                            {roleUsers.get(role.id)?.length || 0})
                          </span>
                        </div>
                        {roleUsers.get(role.id) &&
                          roleUsers.get(role.id)!.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {roleUsers.get(role.id)!.map((user) => (
                              <span
                                key={user.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600"
                              >
                                {user.fullName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">
                            No users assigned to this role
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <PermissionGuard
                        permission="menu.5.assign"
                        serviceContext="marketing-service"
                        fallback={
                          <button
                            disabled
                            className="table-action-button bg-gray-600 text-gray-400 cursor-not-allowed"
                            title="You don't have permission to assign users"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                        }
                      >
                        <button
                          onClick={() => openUserAssignment(role)}
                          className="table-action-button bg-linear-to-r from-green-600 to-green-800 text-white hover:shadow-glow"
                          title="Assign Users"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      </PermissionGuard>
                      <PermissionGuard
                        permission="menu.5.manage"
                        serviceContext="marketing-service"
                        fallback={
                          <button
                            disabled
                            className="table-action-button bg-gray-600 text-gray-400 cursor-not-allowed"
                            title="You don't have permission to edit roles"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        }
                      >
                        <button
                          onClick={() => openRoleForm(role)}
                          className="table-action-button bg-linear-to-r from-blue-600 to-blue-800 text-white hover:shadow-glow-blue"
                          title="Edit Role"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      </PermissionGuard>
                      <PermissionGuard
                        permission="menu.5.manage"
                        serviceContext="marketing-service"
                        fallback={
                          <button
                            disabled
                            className="table-action-button bg-gray-600 text-gray-400 cursor-not-allowed"
                            title="You don't have permission to delete roles"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        }
                      >
                        <button
                          onClick={() => handleDeleteRole(role.id)}
                          className="table-action-button bg-linear-to-r from-red-600 to-red-800 text-white hover:shadow-glow-red"
                          title="Delete Role"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </PermissionGuard>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Role Form Modal */}
      {showRoleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={resetRoleForm}
          ></div>
          <div className="popup-card w-full max-w-2xl animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                  {editingRole ? "Edit Role" : "Create New Role"}
                </h3>
              </div>
              <button
                onClick={resetRoleForm}
                className="menu-button hover:rotate-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Role Name
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, name: e.target.value })
                  }
                  className="glass-input w-full"
                  placeholder="Enter role name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, description: e.target.value })
                  }
                  className="glass-input w-full"
                  rows={3}
                  placeholder="Enter role description"
                />
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-lg font-semibold text-white mb-4">
                Permissions
              </h4>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {filteredPermissionGroups.map((group) => (
                  <div key={group.id} className="glass-card-inner">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleGroupExpansion(group.id)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedGroups.has(group.id) ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <span className="font-medium text-white">
                          {group.name}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        ({group.permissions.length} permissions)
                      </span>
                    </div>
                    {expandedGroups.has(group.id) && (
                      <div className="mt-2 space-y-1">
                        {group.permissions.map((permission) => {
                          const isAllowed =
                            !allowedPermissionCodes ||
                            allowedPermissionCodes.has(permission.code);
                          return (
                            <label
                              key={permission.code}
                              className={`flex items-center space-x-3 p-2 rounded ${isAllowed
                                ? "cursor-pointer hover:bg-white/5"
                                : "cursor-not-allowed opacity-40"
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPermissions.includes(
                                  permission.code,
                                )}
                                onChange={() =>
                                  togglePermission(permission.code)
                                }
                                disabled={!isAllowed}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded bg-slate-700 disabled:opacity-50"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-white flex items-center gap-2">
                                  <span>
                                    {permission.menuNumber} {permission.name}
                                  </span>
                                  {!isAllowed && (
                                    <span className="text-[10px] uppercase tracking-wide bg-white/10 text-slate-300 px-2 py-0.5 rounded">
                                      Not in your scope
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">
                                  {permission.description}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={resetRoleForm}
                className="glass-button-secondary px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={editingRole ? handleUpdateRole : handleCreateRole}
                className="glass-button px-4 py-2 text-sm font-semibold bg-linear-to-r from-blue-600 to-blue-800 text-white hover:shadow-glow"
              >
                {editingRole ? "Update Role" : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Assignment Modal */}
      {showUserAssignment && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setShowUserAssignment(false)}
          ></div>
          <div className="popup-card w-full max-w-2xl animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                  Assign Users to {selectedRole.name}
                </h3>
              </div>
              <button
                onClick={() => setShowUserAssignment(false)}
                className="menu-button hover:rotate-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto glass-card-inner">
              {availableUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center space-x-3 cursor-pointer hover:bg-white/5 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => toggleUserSelection(user.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded bg-slate-700"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">
                      {user.fullName}
                    </div>
                    <div className="text-xs text-slate-400">
                      @{user.username}
                      {user.phone && ` • ${user.phone}`}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowUserAssignment(false)}
                className="glass-button-secondary px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignUsers}
                disabled={selectedUsers.length === 0}
                className="glass-button px-4 py-2 text-sm font-semibold bg-linear-to-r from-blue-600 to-blue-800 text-white hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign {selectedUsers.length} User
                {selectedUsers.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }

        .glass-card {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 2rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
                      inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .glass-card-inner {
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 1.5rem;
        }

        .glass-input {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          color: white;
          transition: all 0.3s ease;
        }

        .glass-input:focus {
          outline: none;
          border-color: rgba(249, 115, 22, 0.5);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .glass-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .glass-button {
          border-radius: 12px;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          transition: all 0.3s ease;
          border: none;
          cursor: pointer;
        }

        .glass-button-secondary {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .glass-button-secondary:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .table-action-button {
          border-radius: 8px;
          padding: 0.5rem 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          transition: all 0.3s ease;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .shadow-glow {
          box-shadow: 0 0 20px rgba(249, 115, 22, 0.3);
        }

        .shadow-glow-blue {
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
        }

        .shadow-glow-red {
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
        }

        .popup-card {
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 2rem;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          position: relative;
          z-index: 10;
        }

        .menu-button {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 0.5rem;
          color: white;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .menu-button:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </>
  );
}
