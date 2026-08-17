"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MarketingServiceGuard } from "@/components/marketing-service/MarketingServiceGuard";
import { useToast } from "@/components/ui/Toast";
import { weeklyScheduleService, WeeklyScheduleResponse, WeeklyScheduleRequest } from "@/app/services/marketing-service";
import { apiFetch } from "@/services/httpClient";
import { apiService } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { marketingUserAssignmentService, MarketingUserAssignment } from "@/services/marketingUserAssignmentService";
import { marketingUserProfileService, type MarketingUserProfile } from "@/services/marketing-service/marketingUserProfileService";
import SubAreaCell from "@/components/marketing-service/weekly-schedule/SubAreaCell";
import UserInfoCell from "@/components/marketing-service/weekly-schedule/UserInfoCell";
import { useCopyScheduleImage } from "@/hooks/marketing-service/WeeklySchedule/useCopyScheduleImage";

/* ================= STYLES ================= */
const scrollbarHideStyles = `
  .scrollbar-hide {
    -ms-overflow-style: none;  /* Internet Explorer 10+ */
    scrollbar-width: none;     /* Firefox */
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;             /* Safari and Chrome */
  }
`;

const printStyles = `
  @media print {
    @page {
      size: A3 landscape;
      margin: 0;
      orientation: landscape;
    }
    
    body {
      margin: 0;
      padding: 0;
      background: white !important;
      zoom: 1 !important;
      transform: scale(1) !important;
      transform-origin: top left !important;
    }
    
    /* Hide everything except the modal */
    body > *:not(.fixed.inset-0) {
      display: none !important;
    }
    
    /* Show only the modal and its content */
    .fixed.inset-0 {
      position: static !important;
      background: white !important;
      overflow: visible !important;
      width: 100% !important;
      height: auto !important;
      display: block !important;
    }
    
    .fixed.inset-0 > * {
      display: none !important;
    }
    
    .fixed.inset-0 > div {
      display: block !important;
      position: static !important;
      background: white !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    
    .fixed.inset-0 > div > * {
      display: none !important;
    }
    
    .fixed.inset-0 > div > div {
      display: block !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    
    .fixed.inset-0 > div > div > * {
      display: none !important;
    }
    
    .fixed.inset-0 > div > div > div {
      display: block !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    
    /* Show the schedule content */
    .fixed.inset-0 [ref="scheduleContentRef"],
    .fixed.inset-0 .w-full[ref="scheduleContentRef"] {
      display: block !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    
    /* Show footer text section */
    .fixed.inset-0 .flex.justify-evenly.items-center.mt-6.text-sm.text-gray-600.font-khmer-os-muol {
      display: flex !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      justify-content: space-evenly !important;
      align-items: center !important;
      margin-top: 1.5rem !important;
    }
    
    .fixed.inset-0 .flex.justify-evenly.items-center.mt-6.text-sm.text-gray-600.font-khmer-os-muol > div {
      display: block !important;
      color: black !important;
    }
    
    .flex-1 {
      flex: none !important;
      height: auto !important;
      overflow: visible !important;
      width: 100% !important;
      min-width: 100% !important;
      display: block !important;
    }
    
    .overflow-auto, .overflow-scroll {
      overflow: visible !important;
      height: auto !important;
      max-height: none !important;
      width: 100% !important;
    }
    
    .h-full, .min-h-screen {
      height: auto !important;
      min-height: auto !important;
      width: 100% !important;
    }
    
    .max-h-screen {
      max-height: none !important;
      width: 100% !important;
    }
    
    .p-6 {
      padding: 24px !important;
    }
    
    .bg-slate-900, .bg-slate-800, .bg-gray-900 {
      background: white !important;
      color: black !important;
    }
    
    .text-white {
      color: black !important;
    }
    
    .border-gray-700, .border-slate-600 {
      border-color: #ccc !important;
    }
    
    button {
      display: none !important;
    }
    
    .shadow-xl, .shadow-lg {
      box-shadow: none !important;
    }
    
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      zoom: 1 !important;
    }
    
    table {
      page-break-inside: avoid;
      width: 100% !important;
      table-layout: auto !important;
      min-width: 100% !important;
      max-width: 100% !important;
    }
    
    tr {
      page-break-inside: avoid;
      width: 100% !important;
    }
    
    td, th {
      page-break-inside: avoid;
      white-space: nowrap !important;
      overflow: visible !important;
      width: auto !important;
      min-width: fit-content !important;
    }
    
    .min-w-max {
      min-width: 100% !important;
      max-width: 100% !important;
    }
    
    .w-full {
      width: 100% !important;
      min-width: 100% !important;
    }
  }
`;

/* ================= TYPES ================= */

type DaySchedule = {
  date: string;
  dayName: string;
  isDayOff: boolean;
  remark: string;
  morning: string;
  afternoon: string;
  inMonth: boolean;
};

type WeekSchedule = {
  weekNumber: number;
  days: DaySchedule[];
};

type MonthlySchedule = {
  year: number;
  month: number;
  weeks: WeekSchedule[];
};

type UserInfo = {
  month: number;
  week: number;
};

type SubmittedSchedule = {
  id?: number;
  userInfo: UserInfo;
  createdBy: string;
  createdByFullName?: string;
  createdByPhone?: string;
  userProfile?: MarketingUserProfile | null;
  selectedWeek: number | null;
  currentWeekIndex: number | null;
  weekDetails: {
    id?: number;
    weekNumber: number;
    days: Array<{
      id?: number;
      dayNumber: number;
      dayName: string;
      date: string;
      isDayOff: boolean;
      morningSchedule: string;
      afternoonSchedule: string;
      inMonth: boolean;
    }>;
  } | null;
  timestamp: string;
};

/* ================= UTILS ================= */

const dayNames = ["ថ្ងៃអាទិត្យ", "ថ្ងៃចន្ទ", "ថ្ងៃអង្គារ", "ថ្ងៃពុធ", "ថ្ងៃព្រហស្បតិ៍", "ថ្ងៃសុក្រ", "ថ្ងៃសៅរ៍"];

const khmerMonthNames = [
  "មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា",
  "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"
];

function getKhmerMonthName(month: number): string {
  return khmerMonthNames[month - 1] || "កុម្ភៈ";
}

function translateDayToKhmer(dayName: string): string {
  const dayTranslations: { [key: string]: string } = {
    "Sunday": "ថ្ងៃអាទិត្យ",
    "Monday": "ថ្ងៃចន្ទ",
    "Tuesday": "ថ្ងៃអង្គារ",
    "Wednesday": "ថ្ងៃពុធ",
    "Thursday": "ថ្ងៃព្រហស្បតិ៍",
    "Friday": "ថ្ងៃសុក្រ",
    "Saturday": "ថ្ងៃសៅរ៍",
    "SUNDAY": "ថ្ងៃអាទិត្យ",
    "MONDAY": "ថ្ងៃចន្ទ",
    "TUESDAY": "ថ្ងៃអង្គារ",
    "WEDNESDAY": "ថ្ងៃពុធ",
    "THURSDAY": "ថ្ងៃព្រហស្បតិ៍",
    "FRIDAY": "ថ្ងៃសុក្រ",
    "SATURDAY": "ថ្ងៃសៅរ៍"
  };
  return dayTranslations[dayName] || dayName;
}

function formatLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * BUSINESS RULES:
 * - Week = Monday → Sunday
 * - Cross-month weeks allowed
 * - Late month week can extend into next month
 * - BUT new month first Monday = Week 1
 * - Week numbers RESET every month
 */
function generateBusinessMonth(year: number, month: number): WeekSchedule[] {
  const weeks: WeekSchedule[] = [];

  const firstOfMonth = new Date(year, month - 1, 1, 12);
  const lastOfMonth = new Date(year, month, 0, 12);

  // find Monday on/before first day
  const start = new Date(firstOfMonth);
  const day = start.getDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);

  let current = new Date(start);

  let weekNumber = 0; // will start when first Monday of month appears
  let startedMonth = false;

  while (current <= lastOfMonth || current.getDay() !== 1) {
    const days: DaySchedule[] = [];


    for (let i = 0; i < 7; i++) {
      const d = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 12);

      days.push({
        date: formatLocalDate(d),
        dayName: dayNames[d.getDay()],
        isDayOff: false,
        remark: "",
        morning: "",
        afternoon: "",
        inMonth: d.getMonth() === month - 1,
      });

      current.setDate(current.getDate() + 1);
    }

    const hasMonthDay = days.some(d => d.inMonth);

    // detect first Monday inside month
    if (!startedMonth) {
      const mondayInMonth = days.find(d => d.dayName === "ថ្ងៃចន្ទ" && d.inMonth);
      if (mondayInMonth) {
        startedMonth = true;
        weekNumber = 1;
      }
    } else {
      weekNumber++;
    }

    if (hasMonthDay && startedMonth) {
      weeks.push({
        weekNumber,
        days,
      });
    }
  }

  return weeks;
}

const usePortal = () => {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPortalRoot(document.body);
    }
  }, []);

  return portalRoot;
};

/* ================= PAGE ================= */

export default function MonthlySchedulePage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schedule, setSchedule] = useState<MonthlySchedule | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [currentWeekIndex, setCurrentWeekIndex] = useState<number | null>(null);

  const [userInfo, setUserInfo] = useState<UserInfo>({
    month: month,
    week: 1
  });
  const { showToast } = useToast();
  const portalRoot = usePortal();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const [submittedSchedules, setSubmittedSchedules] = useState<SubmittedSchedule[]>([]);
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [showSubmittedTable, setShowSubmittedTable] = useState(false);
  const [showSubmittedDetailsModal, setShowSubmittedDetailsModal] = useState(false);
  const [selectedSubmittedSchedule, setSelectedSubmittedSchedule] = useState<SubmittedSchedule | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<SubmittedSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [selectedSubAreaFilter, setSelectedSubAreaFilter] = useState<string>('all');
  const [selectedYearFilter, setSelectedYearFilter] = useState<number>(new Date().getFullYear());
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<number>(new Date().getMonth() + 1);
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>('all');
  const [userCache, setUserCache] = useState<Map<string, { fullName: string; phone: string }>>(new Map());
  const [userAssignmentCache, setUserAssignmentCache] = useState<Map<string, MarketingUserAssignment[]>>(new Map());
  const [marketingProfile, setMarketingProfile] = useState<MarketingUserProfile | null>(null);
  const scheduleContentRef = useRef<HTMLDivElement>(null);
  const { copyingImage, copyScheduleAsImage } = useCopyScheduleImage(scheduleContentRef, selectedSubmittedSchedule);

  // Fetch user info for all unique users
  useEffect(() => {
    const fetchUserInfos = async () => {
      const uniqueUserIds = [...new Set(submittedSchedules.map(s => s.createdBy).filter(Boolean))];

      for (const userId of uniqueUserIds) {
        if (!userCache.has(userId)) {
          try {
            let fullName: string;
            let phone: string;

            if (/^\d+$/.test(userId)) {
              // If it's a user ID, get username first, then get user info
              const usernameResponse = await apiFetch(`/api/users/${userId}/username`, {
                method: "GET",
              });

              if (usernameResponse.ok) {
                const username = await usernameResponse.text();
                // Now get full name and phone using username
                const userInfoResponse = await apiFetch(`/api/users/username/${username}/fullname`, {
                  method: "GET",
                });

                if (userInfoResponse.ok) {
                  const userData = await userInfoResponse.json();
                  fullName = userData.fullName;
                  phone = userData.phone;
                } else {
                  fullName = userId;
                  phone = 'N/A';
                }
              } else {
                fullName = userId;
                phone = 'N/A';
              }
            } else {
              // If it's a username, get user info directly
              const userInfoResponse = await apiFetch(`/api/users/username/${userId}/fullname`, {
                method: "GET",
              });

              if (userInfoResponse.ok) {
                const userData = await userInfoResponse.json();
                fullName = userData.fullName;
                phone = userData.phone;
              } else {
                fullName = userId;
                phone = 'N/A';
              }
            }

            setUserCache(prev => new Map(prev.set(userId, { fullName, phone })));
          } catch (error) {
            console.error('Failed to fetch user info:', error);
            setUserCache(prev => new Map(prev.set(userId, { fullName: userId, phone: 'N/A' })));
          }
        }
      }
    };

    if (submittedSchedules.length > 0) {
      fetchUserInfos();
    }
  }, [submittedSchedules]);

  // Fetch user assignments for subarea filtering
  useEffect(() => {
    const fetchUserAssignments = async () => {
      const uniqueUserIds = [...new Set(submittedSchedules.map(s => s.createdBy).filter(Boolean))];

      for (const userId of uniqueUserIds) {
        if (!userAssignmentCache.has(userId)) {
          try {
            let actualUserId: number;

            if (/^\d+$/.test(userId)) {
              actualUserId = parseInt(userId, 10);
            } else {
              const userIdResponse = await apiFetch(`/api/users/username/${userId}/id`, {
                method: "GET",
              });

              if (userIdResponse.ok) {
                actualUserId = await userIdResponse.json();
              } else {
                continue;
              }
            }

            if (actualUserId) {
              const assignments = await marketingUserAssignmentService.getUserAssignments(actualUserId);
              setUserAssignmentCache(prev => new Map(prev.set(userId, assignments)));
            }
          } catch (error) {
            console.error('Failed to fetch user assignments:', error);
          }
        }
      }
    };

    if (submittedSchedules.length > 0) {
      fetchUserAssignments();
    }
  }, [submittedSchedules]);

  // Check if current user can edit/delete a schedule
  const canEditSchedule = (schedule: SubmittedSchedule) => {
    // Root user can edit all schedules
    if (user?.username === "root") {
      return true;
    }

    // User can only edit their own schedules
    const currentUserId = user?.id?.toString();
    const scheduleUserId = schedule.createdBy?.toString();

    return currentUserId === scheduleUserId;
  };

  // Get unique subareas from submitted schedules
  const getUniqueSubAreas = () => {
    const subAreas = new Set<string>();

    submittedSchedules.forEach(schedule => {
      const assignments = userAssignmentCache.get(schedule.createdBy);
      if (assignments) {
        const userSubAreas = assignments
          .filter(assignment => assignment.active && assignment.subAreaName)
          .map(assignment => assignment.subAreaName!);
        userSubAreas.forEach(subArea => subAreas.add(subArea));
      }
    });

    return Array.from(subAreas).sort();
  };

  const expandRow = (weekIndex: number, dayIndex: number) => {
    const uniqueKey = `${weekIndex}-${dayIndex}`;
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      newSet.add(uniqueKey); // Only add, never remove
      return newSet;
    });
    setFocusedRow(uniqueKey);
  };

  const collapseRow = (weekIndex: number, dayIndex: number) => {
    const uniqueKey = `${weekIndex}-${dayIndex}`;
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      newSet.delete(uniqueKey);
      return newSet;
    });
    setFocusedRow(null);
  };

  const isRowExpanded = (weekIndex: number, dayIndex: number) => {
    const uniqueKey = `${weekIndex}-${dayIndex}`;
    return expandedRows.has(uniqueKey) && focusedRow === uniqueKey;
  };

  // Auto-generate schedule when year/month/page changes
  useEffect(() => {
    if (year && month) {
      loadScheduleFromBackend();
    }
  }, [year, month, page, selectedUserFilter]);

  const loadScheduleFromBackend = async () => {
    try {
      setLoading(true);
      const backendWeeks = await weeklyScheduleService.generateMonth(year, month);

      // Convert backend response to frontend format
      const weeks: WeekSchedule[] = backendWeeks.map(week => ({
        weekNumber: week.weekNumber,
        days: week.days.map(day => ({
          date: day.date,
          dayName: day.dayName,
          isDayOff: day.isDayOff,
          remark: day.remark || '',
          morning: day.morningSchedule || '',
          afternoon: day.afternoonSchedule || '',
          inMonth: day.inMonth
        }))
      }));

      setSchedule({ year, month, weeks });

      // Auto-select the first week for better UX
      if (weeks.length > 0) {
        setCurrentWeekIndex(0);
        setSelectedWeek(weeks[0].weekNumber);
        setUserInfo(prev => ({ ...prev, week: weeks[0].weekNumber }));
      }

      // Load existing schedules for this month using pagination
      const paginatedSchedules = await weeklyScheduleService.getPaginatedSchedules(
        page, 
        size, 
        year, 
        month,
        selectedUserFilter !== 'all' ? parseInt(selectedUserFilter) : undefined
      );
      const existingSchedules = paginatedSchedules.content || [];
      setTotalElements(paginatedSchedules.totalElements || 0);
      setTotalPages(paginatedSchedules.totalPages || 0);

      const submittedSchedulesData = existingSchedules.map(schedule => ({
        id: schedule.id,
        userInfo: {
          month: schedule.month,
          week: schedule.weekNumber
        },
        createdBy: schedule.createdBy,
        createdByFullName: schedule.createdByFullName,
        createdByPhone: schedule.createdByPhone,
        selectedWeek: schedule.weekNumber,
        currentWeekIndex: schedule.weekNumber - 1,
        weekDetails: {
          id: schedule.id,
          weekNumber: schedule.weekNumber,
          days: schedule.days.map(day => ({
            id: day.id,
            dayNumber: day.dayNumber,
            dayName: day.dayName,
            date: day.date,
            isDayOff: day.isDayOff,
            morningSchedule: day.morningSchedule || '',
            afternoonSchedule: day.afternoonSchedule || '',
            inMonth: day.inMonth
          }))
        },
        timestamp: schedule.createdAt
      }));
      setSubmittedSchedules(submittedSchedulesData);

      // Show submitted table if there are existing schedules
      if (submittedSchedulesData.length > 0) {
        setShowSubmittedTable(true);
      }

      setCurrentWeekIndex(null);
      setSelectedWeek(null);
    } catch (error) {
      console.error('Error loading schedule:', error);
      showToast('Failed to load schedule data', 'error');
      // Fallback to local generation
      const weeks = generateBusinessMonth(year, month);
      setSchedule({ year, month, weeks });
    } finally {
      setLoading(false);
    }
  };

  // Inject scrollbar hide styles and print styles
  useEffect(() => {
    if (typeof window !== "undefined") {
      const styleElement = document.createElement('style');
      styleElement.textContent = scrollbarHideStyles + printStyles;
      document.head.appendChild(styleElement);

      return () => {
        document.head.removeChild(styleElement);
      };
    }
  }, []);

  const updateDay = (
    wIndex: number,
    dIndex: number,
    field: keyof DaySchedule,
    value: any
  ) => {
    if (!schedule) return;
    const newSchedule = structuredClone(schedule);
    (newSchedule.weeks[wIndex].days[dIndex] as any)[field] = value;
    setSchedule(newSchedule);
  };

  const openEditModal = (schedule: SubmittedSchedule) => {
    setEditingSchedule(schedule);
    setShowEditModal(true);
  };

  const updateEditingSchedule = (dayIndex: number, field: 'morning' | 'afternoon' | 'isDayOff', value: string | boolean) => {
    if (!editingSchedule || !editingSchedule.weekDetails) return;

    const updatedSchedule = structuredClone(editingSchedule);
    if (updatedSchedule.weekDetails) {
      if (field === 'morning') {
        updatedSchedule.weekDetails.days[dayIndex].morningSchedule = value as string;
      } else if (field === 'afternoon') {
        updatedSchedule.weekDetails.days[dayIndex].afternoonSchedule = value as string;
      } else if (field === 'isDayOff') {
        updatedSchedule.weekDetails.days[dayIndex].isDayOff = value as boolean;
      }
    }
    setEditingSchedule(updatedSchedule);
  };

  const saveEditedSchedule = async () => {
    if (!editingSchedule || !editingSchedule.id) return;

    try {
      setLoading(true);

      // Prepare data for backend
      const scheduleRequest: WeeklyScheduleRequest = {
        userId: 1, // Hardcoded for now
        year: year,
        month: month,
        weekNumber: editingSchedule.selectedWeek!,
        days: editingSchedule.weekDetails?.days.map(day => ({
          dayNumber: day.dayNumber,
          dayName: day.dayName,
          date: day.date,
          isDayOff: day.isDayOff,
          remark: '',
          morningSchedule: day.morningSchedule || '',
          afternoonSchedule: day.afternoonSchedule || '',
          inMonth: day.inMonth
        })) || []
      };

      // Update on backend
      const updatedSchedule = await weeklyScheduleService.updateSchedule(editingSchedule.id, scheduleRequest);

      // Update local state
      setSubmittedSchedules(prev =>
        prev.map(schedule =>
          schedule.id === editingSchedule.id ? {
            ...editingSchedule,
            createdByFullName: updatedSchedule.createdByFullName,
            createdByPhone: updatedSchedule.createdByPhone,
            weekDetails: {
              ...editingSchedule.weekDetails!,
              days: updatedSchedule.days.map((backendDay, index) => ({
                ...editingSchedule.weekDetails!.days[index],
                morningSchedule: backendDay.morningSchedule,
                afternoonSchedule: backendDay.afternoonSchedule,
                isDayOff: backendDay.isDayOff
              }))
            }
          } : schedule
        )
      );

      setShowEditModal(false);
      setEditingSchedule(null);
      showToast('Schedule updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating schedule:', error);

      // Check for duplicate constraint violation
      const errorMessage = error instanceof Error ? error.message : 'Failed to update schedule';
      if (errorMessage.includes('duplicate key value violates unique constraint') ||
        errorMessage.includes('uk_user_year_month_week')) {
        showToast('A schedule for this user, week, and month already exists. Please choose a different week.', 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const openSubmittedScheduleModal = async (schedule: SubmittedSchedule) => {
    // Create a copy of the schedule to avoid mutation
    const scheduleCopy = { ...schedule };
    setSelectedSubmittedSchedule(scheduleCopy);
    setShowSubmittedDetailsModal(true);

    // Fetch profile for this specific schedule if not already loaded
    if (!scheduleCopy.userProfile) {
      try {
        // Check if createdBy is a username or ID
        const isNumeric = /^\d+$/.test(scheduleCopy.createdBy);
        console.log("Is createdBy numeric?", isNumeric);

        let userId;
        if (isNumeric) {
          // If it's numeric, treat it as a user ID directly
          userId = scheduleCopy.createdBy;
          console.log("Using createdBy as user ID:", userId);
        } else {
          // If it's a username, look up the user ID
          const userIdResponse = await apiFetch(`/api/users/by-username/${scheduleCopy.createdBy}`);
          console.log("User ID response status:", userIdResponse.status);
          if (userIdResponse.ok) {
            const { id: retrievedUserId } = await userIdResponse.json();
            userId = retrievedUserId;
            console.log("User ID retrieved:", userId);
          } else {
            console.log("Failed to get user ID, status:", userIdResponse.status);
            const updatedSchedule = { ...scheduleCopy, userProfile: null };
            setSelectedSubmittedSchedule(updatedSchedule);
            return;
          }
        }

        if (userId) {
          try {
            const profile = await marketingUserProfileService.getUserProfile(userId);
            console.log("Marketing profile retrieved:", profile);
            const updatedSchedule = { ...scheduleCopy, userProfile: profile };
            setSelectedSubmittedSchedule(updatedSchedule);

            // Also update the schedule in the main array
            setSubmittedSchedules(prev =>
              prev.map(s => s.id === schedule.id ? updatedSchedule : s)
            );
          } catch (profileError) {
            console.log("No marketing profile found for user:", scheduleCopy.createdBy, profileError);
            const updatedSchedule = { ...scheduleCopy, userProfile: null };
            setSelectedSubmittedSchedule(updatedSchedule);

            // Also update the schedule in the main array
            setSubmittedSchedules(prev =>
              prev.map(s => s.id === schedule.id ? updatedSchedule : s)
            );
          }
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
        const updatedSchedule = { ...scheduleCopy, userProfile: null };
        setSelectedSubmittedSchedule(updatedSchedule);
      }
    }
  };

  const getCurrentWeek = () => {
    if (!schedule || currentWeekIndex === null || !schedule.weeks[currentWeekIndex]) return null;
    return schedule.weeks[currentWeekIndex];
  };

  // Get unique users from submitted schedules for filter dropdown
  const getUniqueUsers = () => {
    const userMap = new Map<string, string>();
    submittedSchedules.forEach(schedule => {
      if (schedule.createdBy && !userMap.has(schedule.createdBy)) {
        // Use cached user info if available, otherwise use createdByFullName or fallback to ID
        const cachedUser = userCache.get(schedule.createdBy);
        const displayName = cachedUser?.fullName || schedule.createdByFullName || schedule.createdBy || 'Unknown User';
        userMap.set(schedule.createdBy, displayName);
      }
    });

    console.log('Unique users from schedules:', Array.from(userMap.entries()));

    return Array.from(userMap.entries()).map(([userId, fullName]) => ({
      userId,
      fullName: fullName || 'Unknown User'
    })).sort((a, b) => {
      const nameA = String(a.fullName || '').trim();
      const nameB = String(b.fullName || '').trim();
      return nameA.localeCompare(nameB);
    }); // Sort alphabetically by full name
  };

  // Filter submitted schedules based on all filters
  const getFilteredSchedules = () => {
    console.log('Filter debug:', {
      selectedUserFilter,
      selectedSubAreaFilter,
      selectedYearFilter,
      selectedMonthFilter,
      selectedWeekFilter,
      totalSchedules: submittedSchedules.length
    });

    return submittedSchedules.filter(schedule => {
      // User filter
      if (selectedUserFilter !== 'all') {
        const scheduleUserId = String(schedule.createdBy);
        const filterUserId = String(selectedUserFilter);
        if (scheduleUserId !== filterUserId) {
          return false;
        }
      }

      // SubArea filter (using user assignment cache)
      if (selectedSubAreaFilter !== 'all') {
        const assignments = userAssignmentCache.get(schedule.createdBy);
        if (!assignments) {
          return false;
        }

        const userSubAreas = assignments
          .filter(assignment => assignment.active && assignment.subAreaName)
          .map(assignment => assignment.subAreaName!);

        if (!userSubAreas.includes(selectedSubAreaFilter)) {
          return false;
        }
      }

      // Year filter
      if (selectedYearFilter) {
        const scheduleDate = new Date(schedule.timestamp);
        if (scheduleDate.getFullYear() !== selectedYearFilter) {
          return false;
        }
      }

      // Month filter
      if (selectedMonthFilter) {
        const scheduleDate = new Date(schedule.timestamp);
        if (scheduleDate.getMonth() + 1 !== selectedMonthFilter) {
          return false;
        }
      }

      // Week filter
      if (selectedWeekFilter !== 'all' && schedule.selectedWeek !== parseInt(selectedWeekFilter)) {
        return false;
      }

      return true;
    });
  };

  const selectWeek = (weekNumber: number) => {
    if (!schedule) return;
    const weekIndex = schedule.weeks.findIndex(w => w.weekNumber === weekNumber);
    if (weekIndex !== -1) {
      setCurrentWeekIndex(weekIndex);
      setSelectedWeek(weekNumber);
      setUserInfo(prev => ({ ...prev, week: weekNumber }));
    }
  };

  const handleSaveSchedule = async () => {
    const currentWeek = getCurrentWeek();
    if (!currentWeek || !selectedWeek) {
      showToast('Please select a week', 'error');
      return;
    }

    try {
      setLoading(true);

      // Prepare data for backend
      const currentUserId = user?.id;
      console.log('Current user from auth context:', user);
      console.log('Current user ID:', currentUserId);

      const scheduleRequest: WeeklyScheduleRequest = {
        userId: currentUserId || 1, // Use actual user ID from auth context, fallback to 1
        year: year,
        month: month,
        weekNumber: selectedWeek,
        days: currentWeek.days.map((day, index) => ({
          dayNumber: index + 1,
          dayName: day.dayName,
          date: day.date,
          isDayOff: day.isDayOff,
          remark: day.remark || '',
          morningSchedule: day.morning || '',
          afternoonSchedule: day.afternoon || '',
          inMonth: day.inMonth
        }))
      };

      // Send to backend
      const savedSchedule = await weeklyScheduleService.createSchedule(scheduleRequest);

      // Convert to frontend format for local state
      const submissionData: SubmittedSchedule = {
        id: savedSchedule.id,
        userInfo: userInfo,
        createdBy: savedSchedule.createdBy,
        createdByFullName: savedSchedule.createdByFullName,
        createdByPhone: savedSchedule.createdByPhone,
        selectedWeek: selectedWeek,
        currentWeekIndex: currentWeekIndex,
        weekDetails: {
          id: savedSchedule.id,
          weekNumber: currentWeek.weekNumber,
          days: currentWeek.days.map((day, index) => ({
            id: savedSchedule.days[index]?.id,
            dayNumber: index + 1,
            dayName: day.dayName,
            date: day.date,
            isDayOff: day.isDayOff,
            morningSchedule: day.morning,
            afternoonSchedule: day.afternoon,
            inMonth: day.inMonth
          }))
        },
        timestamp: savedSchedule.createdAt
      };

      // Add the submitted data to the array
      setSubmittedSchedules(prev => [...prev, submissionData]);
      setShowSubmittedTable(true);
      showToast('Schedule saved successfully!', 'success');

      // Clear form and reset for new input
      setSelectedWeek(null);
      setCurrentWeekIndex(null);

      // Clear the current week data
      if (schedule && currentWeekIndex !== null) {
        const newSchedule = structuredClone(schedule);
        // Reset all days in the current week
        newSchedule.weeks[currentWeekIndex].days = newSchedule.weeks[currentWeekIndex].days.map(day => ({
          ...day,
          isDayOff: false,
          morning: "",
          afternoon: "",
          remark: ""
        }));
        setSchedule(newSchedule);
      }
    } catch (error) {
      console.error('Error saving schedule:', error);

      // Check for duplicate constraint violation
      const errorMessage = error instanceof Error ? error.message : 'Failed to save schedule';
      if (errorMessage.includes('duplicate key value violates unique constraint') ||
        errorMessage.includes('uk_user_year_month_week')) {
        showToast('A schedule for this user, week, and month already exists. Please choose a different week.', 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketingServiceGuard>
      <div className="font-hanuman">
        <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300/70">
            Marketing · Schedule
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Weekly Schedule
          </h1>
          <p className="text-sm text-slate-300">
            Plan and manage weekly business schedules with detailed time allocations.
          </p>
        </header>

        {/* CONTROLS */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(+e.target.value)}
                className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 w-32 text-white focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(+e.target.value)}
                className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 w-40 text-white focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i + 1} className="bg-slate-900">
                    {new Date(0, i).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>

            {/* WEEK SELECTION DROPDOWN */}
            {schedule && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Week</label>
                <select
                  value={selectedWeek || ""}
                  onChange={(e) => {
                    const weekNumber = e.target.value ? parseInt(e.target.value) : null;
                    if (weekNumber) {
                      selectWeek(weekNumber);
                    }
                  }}
                  className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 w-40 text-white focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="" className="bg-slate-900">Select week...</option>
                  {schedule.weeks.map((week) => (
                    <option key={week.weekNumber} value={week.weekNumber} className="bg-slate-900">
                      Week {week.weekNumber}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* SUBMIT FORM */}
        {schedule && getCurrentWeek() && selectedWeek && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 shadow-xl">
            <h2 className="font-semibold text-xl text-white text-center mb-6">
              Week {getCurrentWeek()!.weekNumber} (ថ្ងៃចន្ទ → ថ្ងៃអាទិត្យ)
            </h2>


            <div
              className="overflow-x-auto cursor-pointer hover:bg-slate-700/10 p-2 rounded-lg transition-colors"

            >
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 text-sm">
                    <th className="border border-slate-600/50 p-3 text-left text-slate-300">Day</th>
                    <th className="border border-slate-600/50 p-3 text-left text-slate-300">Date</th>
                    <th className="border border-slate-600/50 p-3 text-center text-slate-300">Off</th>
                    <th className="border border-slate-600/50 p-3 text-left text-slate-300">Morning</th>
                    <th className="border border-slate-600/50 p-3 text-left text-slate-300">Afternoon</th>
                  </tr>
                </thead>
                <tbody>
                  {getCurrentWeek()!.days.map((day, dIndex) => (
                    <tr
                      key={dIndex}
                      className="bg-slate-800/30 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="border border-slate-600/50 p-3 font-medium text-white font-khmer-os-muol">{translateDayToKhmer(day.dayName)}</td>
                      <td className="border border-slate-600/50 p-3 text-sm text-slate-300">{day.date}</td>
                      <td className="border border-slate-600/50 p-3 text-center">
                        <input
                          type="checkbox"
                          checked={day.isDayOff}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateDay(currentWeekIndex!, dIndex, "isDayOff", e.target.checked);
                          }}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20 focus:ring-2"
                        />
                      </td>
                      <td className="border border-slate-600/50 p-3">
                        <textarea
                          disabled={day.isDayOff}
                          className={`w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 transition-all focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 focus:outline-none resize-y disabled:bg-slate-800/50 disabled:text-slate-500 ${isRowExpanded(currentWeekIndex!, dIndex) ? 'h-24' : 'min-h-12 max-h-24'
                            }`}
                          value={day.morning}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateDay(currentWeekIndex!, dIndex, "morning", e.target.value);
                          }}
                          onFocus={(e) => {
                            e.stopPropagation();
                            expandRow(currentWeekIndex!, dIndex);
                          }}
                          onBlur={(e) => {
                            e.stopPropagation();
                            collapseRow(currentWeekIndex!, dIndex);
                          }}
                          placeholder="Morning schedule..."
                          rows={isRowExpanded(currentWeekIndex!, dIndex) ? 3 : 1}
                        />
                      </td>
                      <td className="border border-slate-600/50 p-3">
                        <textarea
                          disabled={day.isDayOff}
                          className={`w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 transition-all focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 focus:outline-none resize-y disabled:bg-slate-800/50 disabled:text-slate-500 ${isRowExpanded(currentWeekIndex!, dIndex) ? 'h-24' : 'min-h-12 max-h-24'
                            }`}
                          value={day.afternoon}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateDay(currentWeekIndex!, dIndex, "afternoon", e.target.value);
                          }}
                          onFocus={(e) => {
                            e.stopPropagation();
                            expandRow(currentWeekIndex!, dIndex);
                          }}
                          onBlur={(e) => {
                            e.stopPropagation();
                            collapseRow(currentWeekIndex!, dIndex);
                          }}
                          placeholder="Afternoon schedule..."
                          rows={isRowExpanded(currentWeekIndex!, dIndex) ? 3 : 1}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* SAVE BUTTON SECTION */}
            {schedule && (
              <div className="flex justify-end">
                <button
                  onClick={handleSaveSchedule}
                  disabled={loading}
                  className="rounded-2xl bg-gradient-to-r from-green-500/90 to-emerald-500/90 px-8 py-3 text-lg font-semibold text-white hover:from-green-400 hover:to-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            )}

          </div>
        )}
        {/* SUBMITTED SCHEDULE TABLE */}
        {showSubmittedTable && submittedSchedules.length > 0 && (
          <div className="mt-8 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-semibold text-white">Submitted Schedules</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Total: {getFilteredSchedules().length} schedule{getFilteredSchedules().length !== 1 ? 's' : ''}
                  {(selectedUserFilter !== 'all' || selectedSubAreaFilter !== 'all' || selectedYearFilter !== new Date().getFullYear() || selectedMonthFilter !== new Date().getMonth() + 1 || selectedWeekFilter !== 'all') && ` (filtered)`}
                </p>
              </div>
              <button
                onClick={() => setShowSubmittedTable(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              {/* User Filter Dropdown */}
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-slate-300 mb-1">User</label>
                <select
                  value={selectedUserFilter}
                  onChange={(e) => setSelectedUserFilter(e.target.value)}
                  className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-2 py-1.5 w-full text-sm text-white focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                >
                  <option value="all" className="bg-slate-900">All Users</option>
                  {getUniqueUsers().map((user) => (
                    <option key={user.userId} value={user.userId} className="bg-slate-900">
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* SubArea Filter Dropdown */}
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-slate-300 mb-1">SubArea</label>
                <select
                  value={selectedSubAreaFilter}
                  onChange={(e) => setSelectedSubAreaFilter(e.target.value)}
                  className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-2 py-1.5 w-full text-sm text-white focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                >
                  <option value="all" className="bg-slate-900">All SubAreas</option>
                  {getUniqueSubAreas().map((subArea) => (
                    <option key={subArea} value={subArea} className="bg-slate-900">
                      {subArea}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Filter Dropdown */}
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-slate-300 mb-1">Year</label>
                <select
                  value={selectedYearFilter}
                  onChange={(e) => setSelectedYearFilter(parseInt(e.target.value))}
                  className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-2 py-1.5 w-full text-sm text-white focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                    <option key={year} value={year} className="bg-slate-900">
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month Filter Dropdown */}
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-slate-300 mb-1">Month</label>
                <select
                  value={selectedMonthFilter}
                  onChange={(e) => setSelectedMonthFilter(parseInt(e.target.value))}
                  className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-2 py-1.5 w-full text-sm text-white focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i} value={i + 1} className="bg-slate-900">
                      {new Date(0, i).toLocaleString("default", { month: "short" })}
                    </option>
                  ))}
                </select>
              </div>

              {/* Week Filter Dropdown */}
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-slate-300 mb-1">Week</label>
                <select
                  value={selectedWeekFilter}
                  onChange={(e) => setSelectedWeekFilter(e.target.value)}
                  className="bg-slate-900/50 border border-slate-600/50 rounded-lg px-2 py-1.5 w-full text-sm text-white focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                >
                  <option value="all" className="bg-slate-900">All Weeks</option>
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((week) => (
                    <option key={week} value={week} className="bg-slate-900">
                      Week {week}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {getFilteredSchedules().map((submittedSchedule, scheduleIndex) => (
                <div key={scheduleIndex} className="border border-slate-600/30 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-white">Week {submittedSchedule.weekDetails?.weekNumber}</h4>
                      <p className="text-sm text-slate-400">
                        <UserInfoCell userId={submittedSchedule.createdBy} /> • {new Date(submittedSchedule.timestamp).toLocaleString()}
                      </p>
                      <div className="mt-2">
                        <SubAreaCell createdBy={submittedSchedule.createdBy} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {canEditSchedule(submittedSchedule) && (
                        <>
                          <button
                            onClick={() => openEditModal(submittedSchedule)}
                            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (submittedSchedule.id) {
                                try {
                                  setLoading(true);
                                  await weeklyScheduleService.deleteSchedule(submittedSchedule.id);
                                  setSubmittedSchedules(prev => prev.filter((_, index) => index !== scheduleIndex));
                                  showToast('Schedule deleted!', 'success');
                                } catch (error) {
                                  console.error('Error deleting schedule:', error);
                                  showToast(error instanceof Error ? error.message : 'Failed to delete schedule', 'error');
                                } finally {
                                  setLoading(false);
                                }
                              } else {
                                // Fallback for local-only schedules
                                setSubmittedSchedules(prev => prev.filter((_, index) => index !== scheduleIndex));
                                showToast('Schedule deleted!', 'success');
                              }
                            }}
                            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                            disabled={loading}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-900/50 text-sm">
                          <th className="border border-slate-600/50 p-3 text-center text-slate-300">Time</th>
                          {submittedSchedule.weekDetails?.days.map((day: any, index: number) => (
                            <th key={index} className="border border-slate-600/50 p-3 text-center text-slate-300">
                              <div className="text-xs font-khmer-os-muol">{translateDayToKhmer(day.dayName)}</div>
                              <div className="text-xs font-medium">{day.date}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Morning Row */}
                        <tr
                          className="bg-slate-800/30 hover:bg-slate-700/30 transition-colors cursor-pointer"
                          onClick={() => openSubmittedScheduleModal(submittedSchedule)}
                        >
                          <td className="border border-slate-600/50 p-3 font-medium text-white text-center">
                            Morning
                          </td>
                          {submittedSchedule.weekDetails?.days.map((day: any, index: number) => (
                            <td key={index} className={`border border-slate-600/50 p-2 text-sm ${day.isDayOff ? 'bg-red-500/20' : ''}`}>
                              {day.isDayOff ? (
                                <div className="text-center text-red-400 font-medium">OFF</div>
                              ) : (
                                <div className="flex flex-wrap whitespace-pre-wrap break-all">
                                  {day.morningSchedule || '-'}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* Afternoon Row */}
                        <tr
                          className="bg-slate-800/30 hover:bg-slate-700/30 transition-colors cursor-pointer"
                          onClick={() => openSubmittedScheduleModal(submittedSchedule)}
                        >
                          <td className="border border-slate-600/50 p-3 font-medium text-white text-center">
                            Afternoon
                          </td>
                          {submittedSchedule.weekDetails?.days.map((day: any, index: number) => (
                            <td key={index} className={`border border-slate-600/50 p-2 text-sm ${day.isDayOff ? 'bg-red-500/20' : ''}`}>
                              {day.isDayOff ? (
                                <div className="text-center text-red-400 font-medium">OFF</div>
                              ) : (
                                <div className="flex flex-wrap whitespace-pre-wrap break-all">
                                  {day.afternoonSchedule || '-'}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/10 pt-6 mt-6">
                <div className="text-xs text-slate-400">
                  Showing page {page + 1} of {totalPages} ({totalElements} total records)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SUBMITTED SCHEDULE DETAILS MODAL */}
      {showSubmittedDetailsModal && selectedSubmittedSchedule && portalRoot && createPortal(
        <div
          className="fixed inset-0 z-50 bg-white flex flex-col font-hanuman"
          onClick={() => setShowSubmittedDetailsModal(false)}
        >
          {/* Action Buttons - Top Right */}
          <div className="fixed top-4 right-4 z-10 flex gap-2">
            {/* Print Button */}
            <button
              onClick={() => window.print()}
              className="p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              title="Print"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>

            {/* Screenshot Button */}
            <button
              onClick={copyScheduleAsImage}
              disabled={copyingImage}
              className="px-6 py-3 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium text-gray-700"
              title="Copy Screenshot to Clipboard"
              style={{ minWidth: '140px', whiteSpace: 'nowrap' }}
            >
              {copyingImage ? (
                <>
                  <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-gray-500">Copying...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Screenshot</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={() => setShowSubmittedDetailsModal(false)}
              className="p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Full Screen Content - No Scroll */}
          <div className="flex-1 flex flex-col p-6" onClick={(e) => e.stopPropagation()}>
            {/* Header with Logo - Top Left */}

            {/* Table Container - Centered */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full" ref={scheduleContentRef}>
                {/* Title Section - Above Table */}
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center mb-10">
                    {/* Logo from public folder */}
                    <img
                      src="/Logo.png"
                      alt="Logo"
                      className="w-16 h-16 mr-4"
                    />
                    <div className="text-left">
                      <h1 className="text-2xl font-bold text-gray-800 font-khmer-os-muol">
                        ផែនការ ទីផ្សារ
                      </h1>
                      <h2 className="text-black">
                        សម្រាប់ខែ {selectedSubmittedSchedule.userInfo ? getKhmerMonthName(selectedSubmittedSchedule.userInfo.month) : 'កុម្ភៈ'} សប្តាហ៍ទី {selectedSubmittedSchedule.weekDetails?.weekNumber || '០២'}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Additional Info Text */}
                <div className="mb-4 text-gray-600">
                  <div className="text-sm font-khmer-os-muol">
                    • នាយកដ្ឋានទីផ្សារ
                  </div>
                  <div className="text-sm font-khmer-os-muol">
                    • ផែនការ មន្រ្តីទីផ្សារ ({(() => {
                      const assignments = userAssignmentCache.get(selectedSubmittedSchedule.createdBy);
                      if (assignments && assignments.length > 0) {
                        const activeAssignment = assignments.find(a => a.active);
                        if (activeAssignment) {
                          const parts = [];
                          if (activeAssignment.areaName) parts.push(activeAssignment.areaName);
                          if (activeAssignment.subAreaName) parts.push(activeAssignment.subAreaName);
                          return parts.length > 0 ? parts.join(' ') : '';
                        }
                      }
                      return '';
                    })()})
                  </div>
                </div>


                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-sm">
                        <th className="border border-gray-200 p-4 text-center text-gray-700 bg-blue-50 min-w-30 font-khmer-os-muol">ពេលវេលា</th>
                        {selectedSubmittedSchedule.weekDetails?.days.map((day: any, index: number) => (
                          <th key={index} className="border border-gray-200 p-4 text-center text-gray-700 bg-blue-50 min-w-50">
                            <div className="text-sm font-medium font-khmer-os-muol">{translateDayToKhmer(day.dayName)}</div>
                            <div className="text-sm">{day.date}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Morning Row */}
                      <tr className="bg-gray-50">
                        <td className="text-sm border border-gray-200 p-4 font-bold text-gray-900 bg-blue-50 text-center min-w-30 font-khmer-os-muol">
                          ព្រឹក
                        </td>
                        {selectedSubmittedSchedule.weekDetails?.days.map((day: any, dIndex: number) => (
                          <td key={dIndex} className="border border-gray-200 p-4 min-h-25 align-top">
                            {day.isDayOff ? (
                              <div className="text-center text-red-600 font-bold text-lg py-4">Day off</div>
                            ) : (
                              <div className="text-sm text-gray-700 min-h-20 whitespace-pre-wrap wrap-break-word">
                                {day.morningSchedule ? (
                                  <div className="">
                                    {day.morningSchedule}
                                  </div>
                                ) : (
                                  <span className="text-gray-500 italic ">មិនមានទិន្នន័យ</span>
                                )}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>

                      {/* Afternoon Row */}
                      <tr className="bg-gray-50">
                        <td className="border text-sm border-gray-200 p-4 font-bold text-gray-900 bg-blue-50 text-center min-w-30 font-khmer-os-muol">
                          ល្ងាច
                        </td>
                        {selectedSubmittedSchedule.weekDetails?.days.map((day: any, dIndex: number) => (
                          <td key={dIndex} className="border border-gray-200 p-4 min-h-25 align-top">
                            {day.isDayOff ? (
                              <div className="text-center text-red-600 font-bold text-lg py-4">Day off</div>
                            ) : (
                              <div className="text-sm text-gray-700 min-h-20 whitespace-pre-wrap wrap-break-word">
                                {day.afternoonSchedule ? (
                                  <div className="">
                                    {day.afternoonSchedule}
                                  </div>
                                ) : (
                                  <span className="text-gray-500 italic ">មិនមានទិន្នន័យ</span>
                                )}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Footer Text Section */}
                <div className="">

                  <div className="flex justify-evenly items-center mt-8 text-sm text-gray-600 font-khmer-os-muol leading-relaxed pb-4">
                    <div>
                      <div className="text-center">ឯកភាព (ប្រធានប្រតិបត្តិ)</div>
                      <div className="text-center h-32"></div>
                    </div>

                    <div>
                      <div className="text-center">ត្រួតពិនិត្យដោយ (ប្រធានទីផ្សារ)</div>
                      <div className="text-center h-36"></div>
                    </div>


                    <div className="text-center">
                      <div className="text-center">របាយការណ៍ដោយ(មន្រ្តីទីផ្សារ)</div>

                      {selectedSubmittedSchedule?.userProfile?.userSignature ? (
                        <div className="flex justify-center mb-2">
                          <img
                            src={selectedSubmittedSchedule.userProfile.userSignature}
                            alt="User Signature"
                            className="h-20 w-auto object-contain"
                          />
                        </div>
                      ) : (
                        <div className="h-20 flex items-center justify-center">
                        </div>
                      )}
                      <div className="border-t border-gray-300 pt-2 flex justify-center max-w-20 mx-auto">

                      </div>
                      <p className="text-sm text-center font-semibold text-black font-khmer-os-muol">
                        {selectedSubmittedSchedule?.createdByFullName || selectedSubmittedSchedule?.createdBy || 'Unknown User'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>


          </div>
        </div>,
        portalRoot
      )
      }

      {/* EDIT SCHEDULE MODAL */}
      {
        showEditModal && editingSchedule && portalRoot && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-hanuman"
            onClick={() => setShowEditModal(false)}
          >
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-8 max-w-[80vw] w-full mx-4 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-semibold text-white">
                  Edit Week {editingSchedule.weekDetails?.weekNumber} Schedule
                </h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-900/50 text-sm">
                      <th className="border border-slate-600/50 p-3 text-center text-slate-300 bg-blue-900/30 w-16 text-xs">Time</th>
                      {editingSchedule.weekDetails?.days.map((day: any, index: number) => (
                        <th
                          key={index}
                          className="border border-slate-600/50 p-4 text-center text-slate-300 bg-blue-900/30 w-32 cursor-pointer hover:bg-blue-800/30 transition-colors"
                          onClick={() => updateEditingSchedule(index, 'isDayOff', !day.isDayOff)}
                        >
                          <div className="text-xs font-khmer-os-muol">{translateDayToKhmer(day.dayName)}</div>
                          <div className="text-xs font-medium">{day.date}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Morning Row */}
                    <tr className="bg-slate-800/30">
                      <td className="border border-slate-600/50 p-3 font-medium text-white bg-slate-900/50 text-center text-xs w-16">
                        Morning
                      </td>
                      {editingSchedule.weekDetails?.days.map((day: any, dIndex: number) => (
                        <td
                          key={dIndex}
                          className={`border border-slate-600/50 p-2 transition-colors ${day.isDayOff ? 'bg-red-500/20' : ''}`}
                        >
                          {day.isDayOff ? (
                            <div className="text-center text-red-400 font-medium">OFF</div>
                          ) : (
                            <textarea
                              className="w-full bg-transparent border-none text-white placeholder-slate-500 focus:outline-none resize-y min-h-40 text-xs scrollbar-hide"
                              value={day.morningSchedule || ''}
                              onChange={(e) => updateEditingSchedule(dIndex, 'morning', e.target.value)}
                              placeholder="Morning schedule..."
                            />
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Afternoon Row */}
                    <tr className="bg-slate-800/30">
                      <td className="border border-slate-600/50 p-3 font-medium text-white bg-slate-900/50 text-center text-xs w-16">
                        Afternoon
                      </td>
                      {editingSchedule.weekDetails?.days.map((day: any, dIndex: number) => (
                        <td
                          key={dIndex}
                          className={`border border-slate-600/50 p-2 transition-colors ${day.isDayOff ? 'bg-red-500/20' : ''}`}
                        >
                          {day.isDayOff ? (
                            <div className="text-center text-red-400 font-medium">OFF</div>
                          ) : (
                            <textarea
                              className="w-full bg-transparent border-none text-white placeholder-slate-500 focus:outline-none resize-y min-h-40 text-xs scrollbar-hide"
                              value={day.afternoonSchedule || ''}
                              onChange={(e) => updateEditingSchedule(dIndex, 'afternoon', e.target.value)}
                              placeholder="Afternoon schedule..."
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end space-x-4 mt-8">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditedSchedule}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        )
      }
      </div>
    </MarketingServiceGuard >
  );
}
