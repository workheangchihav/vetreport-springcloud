import { apiFetch } from "@/services/httpClient";

// Import Service interface from serviceService
export interface Service {
  id: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface User {
  id: number;
  username: string;
  fullName: string;
  phone?: string;
  active: boolean;
  enabled: boolean;
  accountLocked: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserRequest {
  username: string;
  fullName: string;
  password: string;
  phone?: string;
  serviceIds?: number[];
}

export interface UpdateUserRequest {
  fullName: string;
  phone?: string;
  serviceIds?: number[];
}

class UserService {
  private getAuthHeaders() {
    return {
      "Content-Type": "application/json",
    };
  }

  private safeJsonParse(text: string | null): any | null {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn(
        "Received non-JSON response body",
        error,
        "body snippet:",
        text?.slice(0, 256),
      );
      return null;
    }
  }

  private mapUser(user: any): User {
    return {
      ...user,
      active: user.enabled,
    };
  }

  private mapUsers(users: any[]): User[] {
    return users.map((user) => this.mapUser(user));
  }

  private async parseJsonResponse<T>(
    response: Response,
    fallbackMessage: string,
  ): Promise<T> {
    const text = await response.text();
    const parsed = this.safeJsonParse(text);
    if (parsed === null) {
      throw new Error(fallbackMessage);
    }

    return parsed as T;
  }

  async getAllUsers(): Promise<User[]> {
    try {
      // Use auth-server endpoint to get all users
      const response = await apiFetch("/api/users", {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const users = await this.parseJsonResponse<any[]>(
        response,
        "Received unexpected response while fetching all users",
      );
      return this.mapUsers(users);
    } catch (error) {
      console.error("Error fetching all users:", error);
      throw error;
    }
  }

  async getAllUsersFromUserService(): Promise<User[]> {
    try {
      // Use auth-server endpoint for managing all users across services
      const response = await apiFetch("/api/users", {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const users = await this.parseJsonResponse<any[]>(
        response,
        "Received unexpected response while fetching all users from auth-server",
      );
      return this.mapUsers(users);
    } catch (error) {
      console.error("Error fetching all users from auth-server:", error);
      throw error;
    }
  }

  async getActiveUsers(): Promise<User[]> {
    try {
      // Use auth-server endpoint to get all active users
      const response = await apiFetch("/api/users", {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const users = await this.parseJsonResponse<any[]>(
        response,
        "Received unexpected response while fetching active users",
      );
      // Filter for active users since call-service doesn't have a separate active endpoint
      return this.mapUsers(users.filter((user) => user.active));
    } catch (error) {
      console.error("Error fetching active users:", error);
      throw error;
    }
  }

  async createUser(userData: CreateUserRequest): Promise<User> {
    try {
      const response = await apiFetch("/api/users", {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUserWithServices(
    id: number,
    userData: UpdateUserRequest,
  ): Promise<User> {
    try {
      const response = await apiFetch(`/api/users/${id}`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorData = this.safeJsonParse(errorText);
        const errorMessage =
          (errorData && (errorData.message || errorData.error)) ||
          `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      const parsed = this.safeJsonParse(responseText);
      if (!parsed) {
        throw new Error("Unexpected response format from auth-server");
      }
      return parsed;
    } catch (error) {
      console.error("Error updating user with services:", error);
      throw error;
    }
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    try {
      const response = await apiFetch(`/api/users/${id}`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorData = this.safeJsonParse(errorText);
        throw new Error(
          errorData?.message || `HTTP error! status: ${response.status}`,
        );
      }

      const responseText = await response.text();
      const parsed = this.safeJsonParse(responseText);
      if (!parsed) {
        throw new Error(
          "Received unexpected response format while updating user",
        );
      }
      return parsed;
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  async updatePassword(id: number, newPassword: string): Promise<void> {
    try {
      const response = await apiFetch(`/api/users/${id}/password`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ newPassword }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorData = this.safeJsonParse(errorText);
        throw new Error(
          errorData?.message || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("Error updating password:", error);
      throw error;
    }
  }

  async deleteUser(id: number): Promise<void> {
    try {
      const response = await apiFetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  }

  async getUserServices(userId: number): Promise<Service[]> {
    try {
      const response = await apiFetch(`/api/users/${userId}/services`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching user services:", error);
      throw error;
    }
  }

  async getUsersByService(serviceId: number): Promise<User[]> {
    try {
      const response = await apiFetch(`/api/services/${serviceId}/users`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching users by service:", error);
      throw error;
    }
  }

  async searchUsers(query: string, type?: string): Promise<User[]> {
    try {
      const url = new URL("/api/users/search", window.location.origin);
      url.searchParams.append("query", query);
      if (type) {
        url.searchParams.append("type", type);
      }

      const response = await apiFetch(url.pathname + url.search, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error searching users:", error);
      throw error;
    }
  }

  async assignServicesToUser(
    userId: number,
    serviceIds: number[],
  ): Promise<void> {
    try {
      const response = await apiFetch(`/api/users/${userId}/services`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ serviceIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("Error assigning services to user:", error);
      throw error;
    }
  }

  async replaceServicesForUser(
    userId: number,
    serviceIds: number[],
  ): Promise<void> {
    try {
      const response = await apiFetch(`/api/users/${userId}/services/replace`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ serviceIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("Error replacing services for user:", error);
      throw error;
    }
  }

  async activateUser(userId: number): Promise<User> {
    try {
      const response = await apiFetch(`/api/users/${userId}/activate`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }

      const user = await response.json();
      // Map backend 'enabled' field to frontend 'active' field
      return {
        ...user,
        active: user.enabled,
      };
    } catch (error) {
      console.error("Error activating user:", error);
      throw error;
    }
  }

  async deactivateUser(userId: number): Promise<User> {
    try {
      const response = await apiFetch(`/api/users/${userId}/deactivate`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }

      const user = await response.json();
      // Map backend 'enabled' field to frontend 'active' field
      return {
        ...user,
        active: user.enabled,
      };
    } catch (error) {
      console.error("Error deactivating user:", error);
      throw error;
    }
  }
}

export const userService = new UserService();
