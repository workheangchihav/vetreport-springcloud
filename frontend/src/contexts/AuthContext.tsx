"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  apiService,
  UserInfo,
  LoginRequest,
  RegisterRequest,
  ApiError,
  UserServiceEntity,
} from "@/services/api";
import { API_BASE_URL } from "@/config/env";
import { apiFetch, registerUnauthorizedHandler, unregisterUnauthorizedHandler } from "@/services/httpClient";

interface AuthContextType {
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  hasServiceAccess: (serviceKey: string) => boolean;
  getAccessibleServices: () => string[];
  hasPermission: (permissionCode: string, serviceContext?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const permissionCache = useRef<Record<string, boolean>>({});
  const router = useRouter();

  const clearError = () => setError(null);

  const refreshUser = async () => {
    try {
      const userInfo = await apiService.getCurrentUser();

      // Fetch user services separately and add them to user info
      if (userInfo.id) {
        try {
          const userServices = await apiService.getUserServices(userInfo.id);
          // Transform backend services to frontend UserRole format
          const userRoles = userServices.map((service: UserServiceEntity) => ({
            id: service.id,
            userId: userInfo.id,
            roleId: service.id, // Using service.id as roleId for now
            serviceKey: service.code.replace("-service", ""), // Convert "call-service" to "call"
            active: service.active,
            assignedAt: service.createdAt || new Date().toISOString(),
            assignedBy: 0, // Default value as number (system user ID)
          }));

          setUser({
            ...userInfo,
            userRoles,
          });
        } catch (serviceError) {
          console.error("Failed to fetch user services:", serviceError);
          // Still set user info even if services fail
          setUser(userInfo);
        }
      } else {
        setUser(userInfo);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        console.error("Failed to refresh user:", err);
      }
    }
  };

  const login = async (data: LoginRequest) => {
    clearError();

    try {
      await apiService.login(data);
      await refreshUser();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const message = err.response?.error || err.message;
        setError(message);
      } else {
        setError("Login failed");
      }
      throw err;
    }
  };

  const register = async (data: RegisterRequest) => {
    setIsLoading(true);
    clearError();

    try {
      await apiService.register(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const message = err.response?.error || err.message;
        setError(message);
      } else {
        setError("Registration failed");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    // Clear user immediately so the redirect is instant
    setUser(null);
    clearError();
    // Fire API call in the background — don't block the UI
    apiService.logout().catch((err) => console.error("Logout API failed:", err));
  };

  const logoutAll = async () => {
    // Clear user immediately so the redirect is instant
    setUser(null);
    clearError();
    // Fire API call in the background — don't block the UI
    apiService.logoutAll().catch((err) => console.error("Logout all API failed:", err));
  };

  // Service access methods
  const hasServiceAccess = (serviceKey: string): boolean => {
    // Root user has access to all services
    if (user?.username === "root") {
      return true;
    }

    if (!user?.userRoles) return false;

    // Map service keys to menu section IDs
    const serviceKeyToSectionMap: Record<string, string> = {
      call: "call-service",
      "call-service": "call-service",
      delivery: "delivery-service",
      "delivery-service": "delivery-service",
      user: "auth-server",
      marketing: "marketing-service",
      "marketing-service": "marketing-service",
    };

    const sectionId = serviceKeyToSectionMap[serviceKey];
    if (!sectionId) return false;

    return user.userRoles.some(
      (role) => role.serviceKey === serviceKey && role.active,
    );
  };

  const getAccessibleServices = (): string[] => {
    // Root user has access to all services
    if (user?.username === "root") {
      return [
        "call-service",
        "delivery-service",
        "auth-server",
        "marketing-service",
        "branchreport-service",
        "region-service",
      ];
    }

    if (!user?.userRoles) return [];

    // Map service keys to menu section IDs
    const serviceKeyToSectionMap: Record<string, string> = {
      call: "call-service",
      "call-service": "call-service",
      delivery: "delivery-service",
      "delivery-service": "delivery-service",
      user: "auth-server",
      marketing: "marketing-service",
      "marketing-service": "marketing-service",
      branchreport: "branchreport-service",
      "branchreport-service": "branchreport-service",
      region: "region-service",
      "region-service": "region-service",
    };

    return user.userRoles
      .filter((role) => role.active)
      .map((role) => serviceKeyToSectionMap[role.serviceKey])
      .filter(Boolean);
  };

  const hasPermission = async (permissionCode: string, serviceContext?: string): Promise<boolean> => {
    if (!user?.id) {
      return false;
    }

    if (user.username === "root") {
      return true;
    }

    const cacheKey = serviceContext ? `${serviceContext}:${permissionCode}` : permissionCode;
    const cached = permissionCache.current[cacheKey];
    if (cached !== undefined) {
      return cached;
    }

    // Determine which service to check based on service context
    const serviceMap: Record<string, string> = {
      "call-service": "calls",
      "marketing-service": "marketing",
      "delivery-service": "deliveries",
      "auth-server": "users",
    };

    const serviceEndpoint = serviceMap[serviceContext || ""] || "calls";

    try {
      const response = await apiFetch(
        `/api/${serviceEndpoint}/permissions/user/${user.id}/check/${encodeURIComponent(permissionCode)}`,
      );

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      const hasPerm = !!result?.hasPermission;

      permissionCache.current[cacheKey] = hasPerm;

      return hasPerm;
    } catch (err) {
      console.error(`Permission check failed for ${permissionCode} in ${serviceEndpoint}:`, err);
      return false;
    }
  };

  useEffect(() => {
    // Clear cached permission results whenever the authenticated user changes
    permissionCache.current = {};
  }, [user?.id]);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      setIsLoading(false);
      router.replace("/auth/login");
    };

    registerUnauthorizedHandler(handler);
    return () => unregisterUnauthorizedHandler(handler);
  }, [router]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const isAuth = await apiService.isAuthenticated();
        if (isAuth) {
          await refreshUser();
        } else {
          // Don't set user to null immediately on auth check failure
          // This allows the app to continue with existing session/tokens
          console.log("Initial auth check failed, continuing with existing session");
        }
      } catch (err: unknown) {
        console.error("Auth initialization failed:", err);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    logoutAll,
    refreshUser,
    error,
    clearError,
    hasServiceAccess,
    getAccessibleServices,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
