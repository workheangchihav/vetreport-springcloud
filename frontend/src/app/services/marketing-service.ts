import { apiFetch } from "@/services/httpClient";
import { PaginatedResponse } from "@/types/types";

export interface WeeklyScheduleDayRequest {
  dayNumber: number;
  dayName: string;
  date: string;
  isDayOff: boolean;
  remark: string;
  morningSchedule: string;
  afternoonSchedule: string;
  inMonth: boolean;
}

export interface WeeklyScheduleRequest {
  userId: number;
  year: number;
  month: number;
  weekNumber: number;
  branchId?: number;
  days: WeeklyScheduleDayRequest[];
}

export interface WeeklyScheduleDayResponse {
  id: number;
  dayNumber: number;
  dayName: string;
  date: string;
  isDayOff: boolean;
  remark: string;
  morningSchedule: string;
  afternoonSchedule: string;
  inMonth: boolean;
}

export interface BranchInfo {
  id: number;
  name: string;
}

export interface WeeklyScheduleResponse {
  id: number;
  userId: number;
  createdBy: string;
  createdByFullName: string;
  createdByPhone: string;
  year: number;
  month: number;
  weekNumber: number;
  days: WeeklyScheduleDayResponse[];
  branch?: BranchInfo;
  createdAt: string;
  updatedAt: string;
  createdByUserId: number;
}

export const weeklyScheduleService = {
  // Generate business month structure
  generateMonth: async (year: number, month: number): Promise<WeeklyScheduleResponse[]> => {
    const response = await apiFetch(`/api/marketing/weekly-schedules/generate-month?year=${year}&month=${month}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Create a new schedule
  createSchedule: async (schedule: WeeklyScheduleRequest): Promise<WeeklyScheduleResponse> => {
    const response = await apiFetch('/api/marketing/weekly-schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schedule),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Update an existing schedule
  updateSchedule: async (id: number, schedule: WeeklyScheduleRequest): Promise<WeeklyScheduleResponse> => {
    const response = await apiFetch(`/api/marketing/weekly-schedules/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schedule),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Get schedules for a specific user
  getUserSchedules: async (userId: number, year: number, month: number): Promise<WeeklyScheduleResponse[]> => {
    const response = await apiFetch(`/api/marketing/weekly-schedules/user/${userId}?year=${year}&month=${month}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Get all schedules (with optional user filter)
  getAllSchedules: async (year: number, month: number, userId?: number): Promise<WeeklyScheduleResponse[]> => {
    let url = `/api/marketing/weekly-schedules?year=${year}&month=${month}`;
    if (userId) {
      url += `&userId=${userId}`;
    }
    const response = await apiFetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Get paginated schedules
  getPaginatedSchedules: async (page: number, size: number, year: number, month: number, userId?: number): Promise<PaginatedResponse<WeeklyScheduleResponse>> => {
    let url = `/api/marketing/weekly-schedules/paginated?page=${page}&size=${size}&year=${year}&month=${month}`;
    if (userId) {
      url += `&userId=${userId}`;
    }
    const response = await apiFetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Get a specific schedule by ID
  getSchedule: async (id: number): Promise<WeeklyScheduleResponse> => {
    const response = await apiFetch(`/api/marketing/weekly-schedules/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },

  // Delete a schedule
  deleteSchedule: async (id: number): Promise<void> => {
    const response = await apiFetch(`/api/marketing/weekly-schedules/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }
};
