"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/services/httpClient";
import { areaBranchService, Area, Subarea, Branch } from "@/services/areaBranchService";
import { ExcelDataProcessor } from "@/components/ExcelDataProcessor";
import { processExcelData } from "@/utils/excelDataProcessor";
import { useToast } from "@/components/ui/Toast";

type CallStatusResponse = {
  key: string;
  label: string;
  createdBy: string;
  createdAt: string;
};

type BranchResponse = {
  id: number;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type UserBranchResponse = {
  id: number;
  userId: number;
  branchId: number;
  branchName: string;
  active: boolean;
  assignedAt: string;
  updatedAt: string;
};

type CallReportResponse = {
  id: number;
  calledAt: string;
  arrivedAt?: string;
  branchId: number;
  branchName: string;
  createdBy: string;
  createdAt: string;
  entries: Record<string, number>;
  remarks?: Record<string, string>;
  remark?: string;
};

type ReportRecord = {
  id: number;
  date: string;
  arrivedAt?: string;
  createdAt: string;
  createdBy: string;
  branchId: number;
  branchName: string;
  entries: Record<string, number>;
  remarks: Record<string, string>;
  remark?: string;
};

const getStoredUserId = (): number | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const userStr = window.localStorage.getItem("user");
  if (!userStr) {
    return null;
  }

  try {
    const parsed = JSON.parse(userStr);
    return parsed?.id ?? null;
  } catch {
    return null;
  }
};

const fetchAndCacheUserId = async (): Promise<number | null> => {
  try {
    const response = await apiFetch("/api/auth/me", {
      method: "GET",
    });

    if (!response.ok) {
      return null;
    }

    // Check if response has content before trying to parse JSON
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      const user = JSON.parse(text);
      if (user?.id && typeof window !== "undefined") {
        window.localStorage.setItem("user", JSON.stringify(user));
        return user.id;
      }
      return user?.id ?? null;
    } catch (jsonError) {
      console.error("Failed to parse user response as JSON:", jsonError);
      console.error("Response text:", text);
      return null;
    }
  } catch (error) {
    console.error("Failed to fetch current user info", error);
    return null;
  }
};

const buildAuthHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Remove manual X-User-Id header - let gateway handle it
  return headers;
};

// Custom date input component for dd/mm/yyyy format with calendar
const CustomDateInput = ({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  className = ""
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  useEffect(() => {
    setInputValue(value);
    // Update calendar date when value changes
    if (value) {
      const dateMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        setCalendarDate(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));
      }
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;

    // Auto-format as user types
    const numbersOnly = newValue.replace(/[^\d]/g, '');

    if (numbersOnly.length <= 2) {
      newValue = numbersOnly;
    } else if (numbersOnly.length <= 4) {
      newValue = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2)}`;
    } else if (numbersOnly.length <= 8) {
      newValue = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2, 4)}/${numbersOnly.slice(4)}`;
    } else {
      newValue = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2, 4)}/${numbersOnly.slice(4, 8)}`;
    }

    setInputValue(newValue);

    // Validate and call onChange if valid
    const dateMatch = newValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      // Basic validation
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        onChange(newValue);
      }
    } else if (newValue === '') {
      onChange('');
    }
  };

  const handleCalendarSelect = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    setInputValue(formattedDate);
    onChange(formattedDate);
    setShowCalendar(false);
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const renderCalendar = () => {
    const today = new Date();
    const daysInMonth = getDaysInMonth(calendarDate);
    const firstDay = getFirstDayOfMonth(calendarDate);
    const days = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
      const isSelected = value === `${day.toString().padStart(2, '0')}/${(calendarDate.getMonth() + 1).toString().padStart(2, '0')}/${calendarDate.getFullYear()}`;
      const isToday =
        day === today.getDate() &&
        calendarDate.getMonth() === today.getMonth() &&
        calendarDate.getFullYear() === today.getFullYear();

      days.push(
        <button
          key={day}
          onClick={() => handleCalendarSelect(currentDate)}
          className={`p-2 text-sm rounded transition-colors relative ${isSelected
            ? 'bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.45)]'
            : isToday
              ? 'text-white border border-sky-400 bg-sky-500/30'
              : 'text-slate-300 hover:bg-orange-500 hover:text-white'
            }`}
        >
          {day}
          {isToday && !isSelected && (
            <span className="absolute inset-0 rounded pointer-events-none border border-sky-300/40 animate-pulse"></span>
          )}
        </button>
      );
    }

    return days;
  };

  const changeMonth = (increment: number) => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + increment, 1));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={`${className} flex-1`}
          maxLength={10}
        />
        <button
          type="button"
          onClick={() => setShowCalendar(!showCalendar)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white hover:bg-slate-600 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      {showCalendar && (
        <div className="absolute top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-sm font-medium text-white">
              {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-xs text-slate-400 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="p-2 text-center font-medium">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {renderCalendar()}
          </div>
        </div>
      )}
    </div>
  );
};

function Page() {
  const [statuses, setStatuses] = useState<CallStatusResponse[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  // Area, Subarea, Branch cascading selection states
  const [areas, setAreas] = useState<Area[]>([]);
  const [subareas, setSubareas] = useState<Subarea[]>([]);
  const [areaBranches, setAreaBranches] = useState<Branch[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [selectedSubareaId, setSelectedSubareaId] = useState<number | null>(null);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [loadingSubareas, setLoadingSubareas] = useState(false);
  const [loadingAreaBranches, setLoadingAreaBranches] = useState(false);

  // Helper function to format date to dd/mm/yyyy for display
  const formatDateToDDMMYYYY = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Helper function to parse dd/mm/yyyy to yyyy-mm-dd for input fields
  const parseDDMMYYYYToInputFormat = (dateString: string): string => {
    const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month}-${day}`;
    }
    // If it's already in yyyy-mm-dd format, return as is
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateString;
    }
    // Default to today's date
    return new Date().toISOString().slice(0, 10);
  };

  // Initialize with empty arrived date, but called date defaults to today
  const [date, setDate] = useState<string>("");
  const [calledAt, setCalledAt] = useState(formatDateToDDMMYYYY(new Date()));
  const [arrivedAt, setArrivedAt] = useState<string>("");
  const [inputType, setInputType] = useState<"new-call" | "recall">("new-call");
  const [entries, setEntries] = useState<Record<string, string>>({});

  // Filter statuses for recall - exclude "ដឹកដល់ផ្ទះ"
  const filteredStatuses = useMemo(() => {
    if (inputType === "recall") {
      return statuses.filter(status => status.label !== "ដឹកដល់ផ្ទះ");
    }
    return statuses;
  }, [statuses, inputType]);

  // Function to get the most recent arrivedAt date from user's reports
  const getMostRecentArrivedAt = (userReports: ReportRecord[]): string => {
    const reportsWithArrivedAt = userReports.filter(report => report.arrivedAt && report.arrivedAt.trim() !== "");

    if (reportsWithArrivedAt.length === 0) {
      return formatDateToDDMMYYYY(new Date()); // Default to today if no previous data
    }

    // Sort by created date to get the most recent
    reportsWithArrivedAt.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return reportsWithArrivedAt[0].arrivedAt || formatDateToDDMMYYYY(new Date());
  };
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [recordRemark, setRecordRemark] = useState<string>("");
  const [expandedRemarks, setExpandedRemarks] = useState<Record<string, boolean>>({});
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [showAddStatusForm, setShowAddStatusForm] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusCode, setNewStatusCode] = useState("");
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasBranchAssignment, setHasBranchAssignment] = useState(false);

  // New state for popup menu
  const [showManagePopup, setShowManagePopup] = useState(false);
  const [managingStatusKey, setManagingStatusKey] = useState<string | null>(
    null,
  );
  const [editingLabel, setEditingLabel] = useState("");
  const [showQuickInputPopup, setShowQuickInputPopup] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(null);

  const { showToast } = useToast();

  const totalCount = useMemo(
    () => Object.values(entries).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [entries],
  );

  const handleEntryChange = (statusKey: string, value: string) => {
    setEntries((prev) => ({
      ...prev,
      [statusKey]: value,
    }));
  };

  const handleRemarkChange = (statusKey: string, value: string) => {
    setRemarks((prev) => ({
      ...prev,
      [statusKey]: value,
    }));
  };

  const toggleRemarkExpansion = (statusKey: string) => {
    setExpandedRemarks((prev) => ({
      ...prev,
      [statusKey]: !prev[statusKey],
    }));
  };

  const handleAddStatus = () => {
    setNewStatusName("");
    setNewStatusCode("");
    setShowAddStatusForm(true);
  };

  const handleSaveNewStatus = async () => {
    const trimmedName = newStatusName.trim();
    const trimmedCode = newStatusCode.trim();

    if (!trimmedName || !trimmedCode) {
      return;
    }

    const normalizedKey = trimmedCode.toLowerCase().replace(/\s+/g, "-");
    if (statuses.some((item) => item.key === normalizedKey)) {
      return;
    }

    setApiError(null);

    try {
      const response = await apiFetch("/api/calls/statuses", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          key: normalizedKey,
          label: trimmedName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Unable to save status");
      }

      const createdStatus: CallStatusResponse = await response.json();
      setStatuses((prev) => [
        ...prev,
        createdStatus,
      ]);
      setEntries((prev) => ({
        ...prev,
        [createdStatus.key]: prev[createdStatus.key] ?? "",
      }));
      setSelectedStatus(createdStatus.key);
      setShowAddStatusForm(false);
      setNewStatusName("");
      setNewStatusCode("");
    } catch (error) {
      console.error("Failed to create status", error);
      setApiError("Unable to create the new status.");
    }
  };

  const handleCancelAddStatus = () => {
    setShowAddStatusForm(false);
    setNewStatusName("");
    setNewStatusCode("");
  };

  const openManagePopup = (statusKey: string) => {
    const status = statuses.find((s) => s.key === statusKey);
    if (status) {
      setManagingStatusKey(statusKey);
      setEditingLabel(status.label);
      setShowManagePopup(true);
    }
  };

  const closeManagePopup = () => {
    setShowManagePopup(false);
    setManagingStatusKey(null);
    setEditingLabel("");
  };

  const handleUpdateStatus = async () => {
    if (!managingStatusKey) {
      return;
    }

    const trimmedLabel = editingLabel.trim();
    if (!trimmedLabel) {
      return;
    }

    setApiError(null);

    try {
      const response = await apiFetch(`/api/calls/statuses/${managingStatusKey}`, {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          key: managingStatusKey,
          label: trimmedLabel,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Unable to update status");
      }

      const updated: CallStatusResponse = await response.json();
      setStatuses((prev) =>
        prev.map((status) =>
          status.key === updated.key
            ? updated
            : status,
        ),
      );
      closeManagePopup();
    } catch (error) {
      console.error("Failed to update status", error);
      setApiError("Unable to update the status label.");
    }
  };

  const handleDeleteStatus = async () => {
    if (!managingStatusKey) {
      return;
    }

    if (!confirm("Are you sure you want to delete this status?")) {
      return;
    }

    setApiError(null);

    try {
      const response = await apiFetch(`/api/calls/statuses/${managingStatusKey}`, {
        method: "DELETE",
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Unable to delete status");
      }

      setStatuses((prev) =>
        prev.filter((status) => status.key !== managingStatusKey),
      );
      setEntries((prev) => {
        const cloned = { ...prev };
        delete cloned[managingStatusKey];
        return cloned;
      });
      if (selectedStatus === managingStatusKey) {
        setSelectedStatus(
          statuses.find((status) => status.key !== managingStatusKey)?.key ??
          "",
        );
      }
      closeManagePopup();
    } catch (error) {
      console.error("Failed to delete status", error);
      setApiError("Unable to delete the status.");
    }
  };

  const loadReports = async () => {
    setLoadingReports(true);
    setApiError(null);

    try {
      const response = await apiFetch("/api/calls/reports", {
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to load reports");
      }

      const serverReports: CallReportResponse[] = await response.json();
      const mappedReports: ReportRecord[] = serverReports.map((report) => ({
        id: report.id,
        date: report.calledAt,
        arrivedAt: report.arrivedAt,
        createdAt: report.createdAt,
        createdBy: report.createdBy,
        branchId: report.branchId,
        branchName: report.branchName,
        entries: report.entries,
        remarks: report.remarks || {},
        remark: report.remark,
      }));

      setReports(mappedReports);

      // Auto-set arrivedAt from the most recent report if it's not already set
      if (!arrivedAt || arrivedAt.trim() === "") {
        const mostRecentArrivedAt = getMostRecentArrivedAt(mappedReports);
        setArrivedAt(mostRecentArrivedAt);
      }
    } catch (error) {
      console.error("Failed to fetch reports", error);
      setApiError("Unable to load call reports from backend");
    } finally {
      setLoadingReports(false);
    }
  };

  const loadStatuses = async () => {
    setLoadingStatuses(true);
    setApiError(null);

    try {
      const response = await apiFetch("/api/calls/statuses", {
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to load statuses");
      }

      const serverStatuses: CallStatusResponse[] = await response.json();
      if (serverStatuses.length === 0) {
        return;
      }

      setStatuses(serverStatuses);

      setEntries((prev) =>
        Object.fromEntries(
          serverStatuses.map((status) => [status.key, prev[status.key] ?? ""]),
        ),
      );

      setSelectedStatus((prev) =>
        serverStatuses.some((status) => status.key === prev)
          ? prev
          : (serverStatuses[0]?.key ?? prev),
      );
    } catch (error) {
      console.error("Failed to fetch statuses", error);
      setApiError("Unable to load statuses from backend");
    } finally {
      setLoadingStatuses(false);
    }
  };

  const loadFallbackBranches = async () => {
    const fallbackResponse = await apiFetch("/api/calls/branches/active", {
      headers: buildAuthHeaders(),
    });

    if (!fallbackResponse.ok) {
      throw new Error("Failed to load branches for selection");
    }

    const allBranches: BranchResponse[] = await fallbackResponse.json();
    const activeBranches = allBranches.filter((branch) => branch.active);

    setHasBranchAssignment(false);
    setBranches(activeBranches);
    setSelectedBranchId(activeBranches[0]?.id ?? null);
  };

  // Load all data at once (following dashboard pattern)
  const loadAreas = async () => {
    setLoadingAreas(true);
    try {
      const areasData = await areaBranchService.getActiveAreas();
      setAreas(areasData);
    } catch (error) {
      console.error("Failed to load areas:", error);
    } finally {
      setLoadingAreas(false);
    }
  };

  const loadSubareas = async () => {
    setLoadingSubareas(true);
    try {
      const subareasData = await areaBranchService.getActiveSubareas();
      setSubareas(subareasData);
    } catch (error) {
      console.error("Failed to load subareas:", error);
      setSubareas([]);
    } finally {
      setLoadingSubareas(false);
    }
  };

  const loadAllBranches = async () => {
    setLoadingAreaBranches(true);
    try {
      const branchesData = await areaBranchService.getActiveBranches();
      setAreaBranches(branchesData);
    } catch (error) {
      console.error("Failed to load branches:", error);
      setAreaBranches([]);
    } finally {
      setLoadingAreaBranches(false);
    }
  };

  const loadBranches = async () => {
    setLoadingBranches(true);
    setApiError(null);
    setHasBranchAssignment(false);

    const fetchedUserId = await fetchAndCacheUserId();
    let userId = fetchedUserId ?? getStoredUserId();
    if (!userId) {
      try {
        await loadFallbackBranches();
      } catch (error) {
        console.error("Failed to load fallback branches without user", error);
        setApiError("Unable to load branch list.");
        setBranches([]);
        setSelectedBranchId(null);
      } finally {
        setLoadingBranches(false);
      }
      return;
    }

    try {
      const response = await apiFetch(`/api/calls/user-branches/user/${userId}`, {
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to load user branches");
      }

      const assignments: UserBranchResponse[] = await response.json();
      const activeAssignments = assignments.filter(
        (assignment) => assignment.active,
      );

      if (activeAssignments.length > 0) {
        const mappedBranches = activeAssignments.map<BranchResponse>(
          (assignment) => ({
            id: assignment.branchId,
            name: assignment.branchName,
            active: assignment.active,
            createdAt: assignment.assignedAt,
            updatedAt: assignment.updatedAt,
          }),
        );

        setHasBranchAssignment(true);
        setBranches(mappedBranches);
        setSelectedBranchId(mappedBranches[0].id);
      } else {
        setHasBranchAssignment(false);
        await loadFallbackBranches();
      }
    } catch (error) {
      console.error("Failed to fetch user branches", error);
      setApiError(
        "Unable to load user branches from backend. Showing all active branches instead.",
      );
      try {
        await loadFallbackBranches();
      } catch (fallbackError) {
        console.error("Failed to fetch fallback branches", fallbackError);
        setBranches([]);
        setSelectedBranchId(null);
      }
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    loadStatuses();
    loadBranches();
    loadReports();
    loadAreas();
    loadSubareas();
    loadAllBranches();
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const isUpdate = editingReportId !== null;
      const url = isUpdate
        ? `/api/calls/reports/${editingReportId}`
        : "/api/calls/reports";
      const method = isUpdate ? "PUT" : "POST";

      // Default to today's date if no date is provided
      const defaultDate = formatDateToDDMMYYYY(new Date());

      let payloadCalledAt = null;
      let payloadArrivedAt = null;

      if (inputType === "new-call") {
        // For new calls, use separate calledAt and arrivedAt dates
        const calledAtToUse = calledAt || defaultDate;
        const arrivedAtToUse = date || defaultDate;
        payloadCalledAt = parseDDMMYYYYToInputFormat(calledAtToUse);
        payloadArrivedAt = parseDDMMYYYYToInputFormat(arrivedAtToUse);
      } else {
        // For recall, use both date fields
        const calledAtToUse = calledAt || defaultDate;
        const arrivedAtToUse = date || defaultDate;
        payloadCalledAt = parseDDMMYYYYToInputFormat(calledAtToUse);
        payloadArrivedAt = parseDDMMYYYYToInputFormat(arrivedAtToUse);
      }

      const response = await apiFetch(url, {
        method,
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          calledAt: payloadCalledAt,
          arrivedAt: payloadArrivedAt,
          type: inputType === "new-call" ? "new-call" : "recall",
          branchId: selectedBranchId,
          entries: Object.fromEntries(
            Object.entries(entries).map(([key, value]) => [key, Number(value) || 0])
          ),
          remarks,
          remark: recordRemark,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || `Failed to ${isUpdate ? "update" : "submit"} report`,
        );
      }

      await loadReports();
      showToast(`Report ${isUpdate ? "updated" : "submitted"} successfully`, "success");
      setEntries(Object.fromEntries(filteredStatuses.map((status) => [status.key, ""])));
      setRemarks({});
      setRecordRemark("");
      setExpandedRemarks({});
      // Don't reset arrivedAt - keep it from user's past data
      setDate(""); // Reset to empty instead of today's date
      setCalledAt(formatDateToDDMMYYYY(new Date())); // Reset calledAt to today's date
      setEditingReportId(null);
    } catch (error) {
      console.error(
        `Failed ${editingReportId ? "updating" : "submitting"} report`,
        error,
      );
      setApiError(
        `Unable to ${editingReportId ? "update" : "submit"} the report.`,
      );
      showToast(
        error instanceof Error ? error.message : `Failed to ${editingReportId ? "update" : "submit"} report`,
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!confirm("Are you sure you want to delete this report?")) {
      return;
    }

    setApiError(null);

    try {
      const response = await apiFetch(`/api/calls/reports/${id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Unable to delete report");
      }

      setReports((prev) => prev.filter((report) => report.id !== id));
      showToast("Report deleted", "success");
    } catch (error) {
      console.error("Failed to delete report", error);
      setApiError("Unable to delete the report.");
      showToast(
        error instanceof Error ? error.message : "Failed to delete report",
        "error",
      );
    }
  };

  const handleLoadReport = (report: ReportRecord) => {
    setDate(report.date);
    setArrivedAt(report.arrivedAt || "");
    setEntries(Object.fromEntries(
      Object.entries(report.entries).map(([key, value]) => [key, String(value)])
    ));
    setRemarks({ ...report.remarks });
    setRecordRemark(report.remark || "");
    setSelectedBranchId(report.branchId);
    setEditingReportId(report.id);
  };

  const handleBranchChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedBranchId(value ? Number(value) : null);
  };

  const handleAreaChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const areaId = value ? Number(value) : null;
    setSelectedAreaId(areaId);
    setSelectedSubareaId(null);
    setSelectedBranchId(null);
    // No API call needed - data is already loaded and filtered client-side
  };

  const handleSubareaChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const subareaId = value ? Number(value) : null;
    setSelectedSubareaId(subareaId);
    setSelectedBranchId(null);
    // No API call needed - data is already loaded and filtered client-side
  };

  const handleAreaBranchChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedBranchId(value ? Number(value) : null);
  };

  // Filter subareas based on selected area (following dashboard pattern)
  const filteredSubareas = useMemo(() => {
    if (!selectedAreaId) {
      // When no area selected, show all subareas
      return subareas.filter((subarea) => subarea.active);
    }
    // When area is selected, show only subareas within that area
    return subareas.filter((subarea) => {
      return subarea.areaId === selectedAreaId && subarea.active;
    });
  }, [subareas, selectedAreaId]);

  // Filter branches based on selected subarea (following dashboard pattern)
  const filteredBranches = useMemo(() => {
    if (!selectedSubareaId) {
      // When no subarea selected, show all active branches
      return areaBranches.filter((branch) => branch.active);
    }
    // When subarea is selected, show only branches within that subarea
    return areaBranches.filter((branch) => {
      return branch.subareaId === selectedSubareaId && branch.active;
    });
  }, [areaBranches, selectedSubareaId]);

  const handleQuickInputData = (entries: Record<string, string>, arrivedAt?: string) => {
    setEntries(prev => ({ ...prev, ...entries }));

    // Set the arrived date if provided from quick input
    if (arrivedAt && arrivedAt.trim()) {
      setDate(arrivedAt);
    }

    console.log(`Processed data with ${Object.keys(entries).length} status entries${arrivedAt ? ` and arrived date: ${arrivedAt}` : ''}`);
  };

  const filteredReports = reports.filter((report) => {
    if (!reportSearch.trim()) {
      return true;
    }
    const normalized = reportSearch.trim().toLowerCase();
    return (
      report.date.toLowerCase().includes(normalized) ||
      report.createdBy.toLowerCase().includes(normalized) ||
      (report.branchName?.toLowerCase() ?? "").includes(normalized)
    );
  });

  return (
    <>
      <div className="min-h-screen px-4 py-8 relative overflow-hidden">
        <div className="mx-auto flex w-full flex-col gap-8 relative z-10">
          {/* Status Management Section */}
          <section className="hidden glass-card animate-fade-in-up">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                  Status Management
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Manage your call statuses with ease
                </p>
              </div>
              <button
                onClick={handleAddStatus}
                className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:shadow-lg hover:scale-105 transition-all duration-300"
              >
                <span className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Status
                </span>
              </button>
            </div>

            {/* Status Grid */}
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredStatuses.map((status, index) => (
                <div
                  key={status.key}
                  className="status-card group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-white group-hover:text-transparent group-hover:bg-linear-to-r group-hover:from-orange-400 group-hover:to-orange-600 group-hover:bg-clip-text transition-all duration-300">
                        {status.label}
                      </h3>
                      <p className="mt-0.5 text-[10px] text-slate-500 font-mono">
                        {status.key}
                      </p>
                    </div>
                    <button
                      onClick={() => openManagePopup(status.key)}
                      className="menu-button"
                      title="Manage status"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500/0 via-orange-500/0 to-orange-600/0 group-hover:from-orange-500/5 group-hover:via-orange-500/5 group-hover:to-orange-600/5 transition-all duration-500"></div>
                </div>
              ))}
            </div>

            {/* Add Status Form */}
            {showAddStatusForm && (
              <div className="mt-4 glass-card-inner animate-slide-down">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full"></div>
                  <p className="text-sm font-semibold text-white">
                    Add New Status
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 mb-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Display Name
                    </span>
                    <input
                      type="text"
                      value={newStatusName}
                      onChange={(event) => setNewStatusName(event.target.value)}
                      placeholder="e.g., Called Back"
                      className="px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Status Key
                    </span>
                    <input
                      type="text"
                      value={newStatusCode}
                      onChange={(event) => setNewStatusCode(event.target.value)}
                      placeholder="e.g., called-back"
                      className="px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveNewStatus}
                    disabled={!newStatusName.trim() || !newStatusCode.trim()}
                    className="px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    Create Status
                  </button>
                  <button
                    onClick={handleCancelAddStatus}
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {apiError && (
              <div className="mt-4 glass-card-inner border-l-4 border-red-500 animate-shake">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm text-red-400">{apiError}</p>
                </div>
              </div>
            )}
          </section>

          {/* Report Entry Section */}
          <section
            className="glass-card animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-6 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full"></div>
              <h2 className="text-2xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                Submit {inputType === "new-call" ? "New Call" : "Recall"} Report
              </h2>

            </div>

            {/* Call Type Options */}
            <div className="mb-4">
              <span className="text-sm font-medium text-slate-300 mb-2 block">Call Type</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setInputType("new-call")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all duration-200 ${inputType === "new-call"
                    ? "bg-orange-500/20 border-orange-500 text-orange-400"
                    : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="font-medium">New Call</span>
                </button>
                <button
                  onClick={() => setInputType("recall")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all duration-200 ${inputType === "recall"
                    ? "bg-blue-500/20 border-blue-500 text-blue-400"
                    : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="font-medium">Re-call</span>

                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Arrived Date
                </label>
                <CustomDateInput
                  value={date}
                  onChange={(value) => setDate(value)}
                  placeholder="Select date (defaults to today if empty)"
                  className="px-3 py-2 w-full text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Called Date
                </label>
                <CustomDateInput
                  value={calledAt}
                  onChange={(value) => setCalledAt(value)}
                  placeholder="Select date (defaults to today if empty)"
                  className="px-3 py-2 w-full text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Area
                </label>
                <select
                  value={selectedAreaId !== null ? String(selectedAreaId) : ""}
                  onChange={handleAreaChange}
                  className="px-3 py-2 w-full text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                  disabled={loadingAreas}
                >
                  <option value="">Select area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={String(area.id)}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Subarea
                </label>
                <select
                  value={selectedSubareaId !== null ? String(selectedSubareaId) : ""}
                  onChange={handleSubareaChange}
                  className="px-3 py-2 w-full text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                  disabled={loadingSubareas || !selectedAreaId}
                >
                  <option value="">Select subarea</option>
                  {filteredSubareas.map((subarea) => (
                    <option key={subarea.id} value={String(subarea.id)}>
                      {subarea.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Branch
                </label>
                {hasBranchAssignment ? (
                  <div className="px-3 py-2 w-full text-sm bg-slate-800 border border-slate-600 rounded-lg text-slate-300 flex items-center justify-between">
                    <span>
                      {branches.find((branch) => branch.id === selectedBranchId)
                        ?.name ?? "Assigned branch"}
                    </span>
                    <span className="text-[11px] text-emerald-300">
                      Auto-selected
                    </span>
                  </div>
                ) : (
                  <select
                    value={selectedBranchId !== null ? String(selectedBranchId) : ""}
                    onChange={handleAreaBranchChange}
                    className="px-3 py-2 w-full text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                    disabled={loadingAreaBranches || !selectedSubareaId}
                  >
                    <option value="">Select branch</option>
                    {filteredBranches.map((branch) => (
                      <option key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Total Count
                </p>
                <div className="text-2xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                  {totalCount.toLocaleString()}
                </div>
                <button
                  onClick={() => setShowQuickInputPopup(true)}
                  className="group relative mt-2 h-10.5 px-5 text-xs font-semibold uppercase tracking-wide text-white rounded-xl overflow-hidden flex items-center justify-center bg-linear-to-r from-sky-500 via-blue-500 to-indigo-600 shadow-[0_8px_25px_rgba(59,130,246,0.45)] transition-all duration-200 hover:shadow-[0_12px_35px_rgba(59,130,246,0.55)] hover:scale-[1.01]"
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/80 to-transparent translate-x-[-160%] group-hover:translate-x-[160%] transition-transform duration-400 ease-out"></span>
                  <span className="absolute inset-0 opacity-40 blur-xl bg-sky-400 group-hover:opacity-80 transition-opacity duration-200"></span>
                  <span className="relative z-10 flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Quick Input
                  </span>
                </button>
              </div>
            </div>

            {/* Record-Level Remark Section */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                Report Remark (Optional)
              </label>
              <textarea
                value={recordRemark}
                onChange={(event) => setRecordRemark(event.target.value)}
                placeholder="Add a general remark for this entire report..."
                className="w-full text-sm bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 resize-none focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                rows={3}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 mb-2">
              {filteredStatuses.map((status, index) => (
                <div
                  key={status.key}
                  className="entry-card"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                    {status.label}
                  </label>
                  <input
                    value={entries[status.key] ?? ""}
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onChange={(event) => {
                      // Only allow numbers
                      const value = event.target.value.replace(/[^0-9]/g, '');
                      handleEntryChange(status.key, value);
                    }}
                    className="w-full text-right text-lg font-bold mb-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                    placeholder=""
                  />

                  {/* Collapsible Remark Section */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleRemarkExpansion(status.key)}
                      className="flex items-center justify-between w-full text-xs font-medium text-slate-400 mb-1 hover:text-slate-300 transition-colors duration-200 group"
                    >
                      <span>Remark (Optional)</span>
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${expandedRemarks[status.key] ? 'rotate-180' : ''
                          }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedRemarks[status.key] && (
                      <div className="animate-fade-in-up">
                        <textarea
                          value={remarks[status.key] || ""}
                          onChange={(event) =>
                            handleRemarkChange(status.key, event.target.value)
                          }
                          placeholder="Add a remark for this status..."
                          className="w-full text-sm bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 resize-none focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                          rows={4}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={() => {
                  setEntries(
                    Object.fromEntries(
                      filteredStatuses.map((status) => [status.key, ""]),
                    ),
                  );
                  setRemarks({});
                  setRecordRemark("");
                  setExpandedRemarks({});
                  // Don't reset arrivedAt - keep it from user's past data
                  setDate(""); // Reset to empty instead of today's date
                  setCalledAt(formatDateToDDMMYYYY(new Date())); // Reset calledAt to today's date
                }}
                className="px-4 py-2 text-xs font-semibold bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white transition-all duration-300"
              >
                Reset All
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedBranchId}
                className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  "Submit Report"
                )}
              </button>
            </div>
          </section>

          {/* Reports Table */}
          {reports.length > 0 && (
            <section
              className="glass-card animate-fade-in-up"
              style={{ animationDelay: "400ms" }}
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 bg-linear-to-b from-orange-500 to-orange-600 rounded-full"></div>
                  <h2 className="text-2xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                    Submitted Reports
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-400">
                    Search
                  </label>
                  <input
                    value={reportSearch}
                    onChange={(event) => setReportSearch(event.target.value)}
                    placeholder="Filter reports..."
                    className="px-3 py-2 w-48 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[1200px]">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Created At
                        </th>
                        <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Arrived At
                        </th>
                        <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Called At
                        </th>
                        <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Created By
                        </th>
                        <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Branch
                        </th>
                        {filteredStatuses.map((status) => (
                          <th
                            key={status.key}
                            className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold"
                          >
                            {status.label}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredReports.map((report, index) => (
                        <tr
                          key={report.id}
                          className="table-row hover:bg-white/5 transition-colors duration-200"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <td className="px-3 py-3 text-slate-300 text-xs">
                            {new Date(report.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-white font-medium text-xs">
                            {report.arrivedAt ?? "-"}
                          </td>
                          <td className="px-3 py-3 text-white font-medium text-xs">
                            {report.date}
                          </td>
                          <td className="px-3 py-3 text-slate-300 text-xs">
                            {report.createdBy}
                          </td>
                          <td className="px-3 py-3 text-slate-300 text-xs">
                            {report.branchName}
                          </td>
                          {filteredStatuses.map((status) => (
                            <td
                              key={`${report.id}-${status.key}`}
                              className="px-3 py-3 text-slate-300 font-medium text-xs"
                            >
                              {report.entries[status.key] ?? 0}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-slate-300 text-xs">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleLoadReport(report)}
                                className="px-3 py-1 text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg hover:shadow-lg transition-colors"
                              >
                                Update
                              </button>
                              <button
                                onClick={() => handleDeleteReport(report.id)}
                                className="px-3 py-1 text-xs font-semibold bg-gradient-to-r from-red-600 to-red-800 text-white rounded-lg hover:shadow-lg transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>        </div>

      {/* Manage Status Popup */}
      {
        showManagePopup && managingStatusKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={closeManagePopup}
            ></div>
            <div className="popup-card w-full max-w-md animate-scale-in">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                    Manage Status
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    {managingStatusKey}
                  </p>
                </div>
                <button
                  onClick={closeManagePopup}
                  className="menu-button hover:rotate-90"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Display Name
                  </span>
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(event) => setEditingLabel(event.target.value)}
                    className="px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                  />
                </label>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleUpdateStatus}
                    disabled={!editingLabel.trim()}
                    className="w-full px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleDeleteStatus}
                    className="w-full px-4 py-2 text-xs font-semibold bg-gradient-to-r from-red-600 to-red-800 text-white rounded-lg hover:shadow-lg transition-all duration-300"
                  >
                    Delete Status
                  </button>
                  <button
                    onClick={closeManagePopup}
                    className="w-full px-4 py-2 text-xs font-semibold bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Quick Input Popup */}
      <ExcelDataProcessor
        isOpen={showQuickInputPopup}
        onClose={() => setShowQuickInputPopup(false)}
        onDataProcessed={handleQuickInputData}
        statuses={statuses}
        filterArrivedDate={date}
        filterCalledDate={calledAt}
      />

    </>
  );
}

export default Page;
