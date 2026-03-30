"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Activity, Camera, RefreshCw, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import html2canvas from "html2canvas";
import { apiFetch } from "@/services/httpClient";
import { useToast } from "@/components/ui/Toast";
import { areaBranchService, type Area as AreaType, type Subarea, type Branch } from "@/services/areaBranchService";

const STATUS_COLORS = [
  "#f97316", // orange (primary)
  "#22d3ee", // cyan 
  "#34d399", // green
  "#fb923c", // amber
  "#facc15", // yellow
  "#06b6d4", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#f87171", // red
  "#a78bfa", // indigo
  "#60a5fa", // light blue
  "#34d399", // emerald
];

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  "not-called-yet": "មិនទាន់តេ",
  called: "តេរួច",
  "no-answer": "តេមិនលើក",
  "call-not-connected": "តេមិនចូល",
  "delivered-to-customer": "ដឹកដល់ផ្ទះ",
};

type ChartGranularity = "daily" | "weekly" | "monthly";

const GRANULARITY_ORDER: ChartGranularity[] = ["daily", "weekly", "monthly"];
const GRANULARITY_LABELS: Record<ChartGranularity, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const toUTCDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
};

const getISOWeekInfo = (date: Date) => {
  const temp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNumber = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return {
    year: temp.getUTCFullYear(),
    week: weekNumber,
  };
};

type CallStatusResponse = {
  key: string;
  label: string;
};

type CallReportSummaryResponse = {
  calledAt: string;
  branchId: number | null;
  branchName: string;
  statusTotals: Record<string, number>;
  arrivedAt?: string;
  type: "new-call" | "recall";
};

type ArrivalType = "all" | "new-call" | "recall";

const ARRIVAL_TYPE_LABELS: Record<ArrivalType, string> = {
  "all": "ទាំងអស់",
  "new-call": "ការហៅថ្មី (New Call)",
  "recall": "Re-Call",
};

const normalizeDateForArrival = (value?: string | null) => {
  if (!value) return null;

  // Support formats like yyyy-mm-dd, dd/mm/yyyy, and ISO timestamps
  const isoMatch = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const slashMatch = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }

  return value;
};

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
const LOOKBACK_DAYS = 6;
const defaultStartDate = () =>
  formatDateInput(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
const defaultEndDate = () => formatDateInput(new Date());

// Helper functions for dd/mm/yyyy format
const formatDateToDDMMYYYY = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

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
  return dateString;
};

const defaultStartDateDDMMYYYY = () => formatDateToDDMMYYYY(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
const defaultEndDateDDMMYYYY = () => formatDateToDDMMYYYY(new Date());

const getStoredUserId = (): number | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem("user");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed?.id ?? null;
  } catch {
    return null;
  }
};

const fetchAndCacheUserId = async (): Promise<number | null> => {
  try {
    const response = await apiFetch("/api/auth/me", { method: "GET" });

    if (!response.ok) {
      return null;
    }

    const user = await response.json();
    if (user?.id && typeof window !== "undefined") {
      window.localStorage.setItem("user", JSON.stringify(user));
    }
    return user?.id ?? null;
  } catch {
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

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarDate);
    const firstDay = getFirstDayOfMonth(calendarDate);
    const today = new Date();
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

function CallDashboard() {
  const [summaryData, setSummaryData] = useState<CallReportSummaryResponse[]>(
    [],
  );
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [areasData, setAreasData] = useState<AreaType[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [subareasData, setSubareasData] = useState<Subarea[]>([]);
  const [subareasLoading, setSubareasLoading] = useState(false);

  const [statusOptions, setStatusOptions] = useState<CallStatusResponse[]>([]);
  const [statusesLoading, setStatusesLoading] = useState(false);

  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedSubArea, setSelectedSubArea] = useState<string>("all");
  const [selectedStatusKeys, setSelectedStatusKeys] = useState<string[]>([]);
  const [selectedArrivalType, setSelectedArrivalType] = useState<ArrivalType>("all");
  const [statusDragging, setStatusDragging] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => defaultStartDateDDMMYYYY());
  const [endDate, setEndDate] = useState<string>(() => defaultEndDateDDMMYYYY());
  const [chartGranularity, setChartGranularity] =
    useState<ChartGranularity>("daily");
  const [chartViewMode, setChartViewMode] = useState<"total" | "byStatus">("byStatus");
  const [leaderboardView, setLeaderboardView] = useState<"compact" | "detailed">("compact");
  const [selectedStatusForLeaderboard, setSelectedStatusForLeaderboard] = useState<string | null>(null);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);

  const { showToast } = useToast();

  const statusLabelMap = useMemo(() => {
    const map: Record<string, string> = { ...DEFAULT_STATUS_LABELS };
    statusOptions.forEach(({ key, label }) => {
      map[key] = label;
    });
    return map;
  }, [statusOptions]);

  // Get unique areas from areas data
  const areaOptions = useMemo(() => {
    return areasData.filter((area: AreaType) => area.active).sort((a: AreaType, b: AreaType) => a.name.localeCompare(b.name));
  }, [areasData]);

  // Get unique sub-areas from subareas data
  const subareaOptions = useMemo(() => {
    if (selectedArea === "all") {
      // When no area selected, show all subareas
      return subareasData
        .filter((subarea: Subarea) => subarea.active)
        .sort((a: Subarea, b: Subarea) => a.name.localeCompare(b.name));
    }
    // When area is selected, show only subareas within that area
    return subareasData
      .filter((subarea: Subarea) => {
        return subarea.areaId === Number(selectedArea) && subarea.active;
      })
      .sort((a: Subarea, b: Subarea) => a.name.localeCompare(b.name));
  }, [subareasData, selectedArea]);

  // Filter branches based on selected area and sub-area
  const filteredBranches = useMemo(() => {
    if (selectedSubArea === "all") {
      // When no subarea selected, show all active branches
      return branches.filter((branch: Branch) => branch.active)
        .sort((a: Branch, b: Branch) => a.name.localeCompare(b.name));
    }
    // When subarea is selected, show only branches within that subarea
    return branches.filter((branch: Branch) => {
      if (!branch.active) return false;
      return branch.subareaId === Number(selectedSubArea);
    }).sort((a: Branch, b: Branch) => a.name.localeCompare(b.name));
  }, [branches, selectedSubArea]);

  const loadStatuses = useCallback(async () => {
    setStatusesLoading(true);
    try {
      const response = await apiFetch("/api/calls/statuses", {
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Unable to load statuses");
      }
      const serverStatuses: CallStatusResponse[] = await response.json();
      setStatusOptions(serverStatuses);
    } catch (error) {
      console.error("Failed to fetch statuses", error);
      setStatusOptions([]);
    } finally {
      setStatusesLoading(false);
    }
  }, []);

  const loadAreas = useCallback(async () => {
    setAreasLoading(true);
    try {
      const data = await areaBranchService.getAreas();
      setAreasData(data);
    } catch (error) {
      console.error("Failed to fetch areas", error);
      setAreasData([]);
    } finally {
      setAreasLoading(false);
    }
  }, []);

  const loadSubareas = useCallback(async () => {
    setSubareasLoading(true);
    try {
      const data = await areaBranchService.getSubareas();
      setSubareasData(data);
    } catch (error) {
      console.error("Failed to fetch subareas", error);
      setSubareasData([]);
    } finally {
      setSubareasLoading(false);
    }
  }, []);

  const loadFallbackBranches = useCallback(async () => {
    const response = await apiFetch("/api/calls/branches/active", {
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error("Failed to load fallback branches");
    }

    const allBranches: Branch[] = await response.json();
    const activeBranches = allBranches.filter((branch) => branch.active);
    setBranches(activeBranches);
  }, []);

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const data = await areaBranchService.getBranches();
      setBranches(data);
    } catch (error) {
      console.error("Failed to fetch branches", error);
      await loadFallbackBranches();
    } finally {
      setBranchesLoading(false);
    }
  }, [loadFallbackBranches]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) {
        params.append("startDate", parseDDMMYYYYToInputFormat(startDate));
      }
      if (endDate) {
        params.append("endDate", parseDDMMYYYYToInputFormat(endDate));
      }
      if (selectedBranchId !== "all") {
        params.append("branchIds", selectedBranchId);
      }
      if (selectedArea !== "all") {
        params.append("areaIds", selectedArea);
      }
      if (selectedSubArea !== "all") {
        params.append("subareaIds", selectedSubArea);
      }
      selectedStatusKeys.forEach((key) => params.append("statusKeys", key));

      const query = params.toString();
      const response = await apiFetch(
        `/api/calls/reports/summary${query ? `?${query}` : ""}`,
        {
          headers: buildAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load summary data");
      }

      const summaries: CallReportSummaryResponse[] = await response.json();
      setSummaryData(summaries);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch call report summary", error);
      setSummaryError("Unable to load dashboard data. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  }, [endDate, selectedBranchId, selectedArea, selectedSubArea, selectedStatusKeys, selectedArrivalType, startDate]);

  useEffect(() => {
    loadStatuses();
    loadAreas();
    loadSubareas();
    loadBranches();
  }, [loadStatuses, loadAreas, loadSubareas, loadBranches]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const statusColorMap = useMemo(() => {
    const mapping: Record<string, string> = {};
    statusOptions.forEach((status, index) => {
      mapping[status.key] = STATUS_COLORS[index % STATUS_COLORS.length];
    });
    return mapping;
  }, [statusOptions]);

  const getStatusLabel = useCallback(
    (key: string) => statusLabelMap[key] ?? key,
    [statusLabelMap],
  );

  const statusKeysInData = useMemo(() => {
    const keys = new Set<string>();
    summaryData.forEach((summary) => {
      Object.keys(summary.statusTotals).forEach((statusKey) =>
        keys.add(statusKey),
      );
    });
    return Array.from(keys);
  }, [summaryData]);

  const statusDisplayOrder = useMemo(() => {
    const ordered = statusOptions.map((status) => status.key);
    const seen = new Set(ordered);
    statusKeysInData.forEach((key) => {
      if (!seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    });
    return ordered;
  }, [statusOptions, statusKeysInData]);

  const chartStatusKeys = useMemo(() => {
    if (chartViewMode === "total") {
      return ["total"];
    }
    if (selectedStatusKeys.length > 0) {
      return selectedStatusKeys;
    }
    if (statusKeysInData.length > 0) {
      return statusKeysInData;
    }
    return statusOptions.map((status) => status.key);
  }, [selectedStatusKeys, statusKeysInData, statusOptions, chartViewMode]);

  const statusScrollRef = useRef<HTMLDivElement | null>(null);
  const statusDragState = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });

  const handleStatusWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      event.currentTarget.scrollLeft += event.deltaY;
    },
    [],
  );

  const handleStatusMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!statusScrollRef.current) {
        return;
      }
      statusDragState.current.isDragging = true;
      statusDragState.current.startX =
        event.pageX - statusScrollRef.current.offsetLeft;
      statusDragState.current.scrollLeft = statusScrollRef.current.scrollLeft;
      setStatusDragging(true);
    },
    [],
  );

  const endStatusDrag = useCallback(() => {
    statusDragState.current.isDragging = false;
    setStatusDragging(false);
  }, []);

  const handleStatusMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!statusDragState.current.isDragging || !statusScrollRef.current) {
        return;
      }
      event.preventDefault();
      const x = event.pageX - statusScrollRef.current.offsetLeft;
      const walk = x - statusDragState.current.startX;
      statusScrollRef.current.scrollLeft =
        statusDragState.current.scrollLeft - walk;
    },
    [],
  );

  const classifyArrivalType = (summary: CallReportSummaryResponse): ArrivalType => {
    return summary.type || "new-call";
  };

  const filteredSummaryData = useMemo(() => {
    if (selectedArrivalType === "all") {
      return summaryData;
    }
    return summaryData.filter(summary => classifyArrivalType(summary) === selectedArrivalType);
  }, [summaryData, selectedArrivalType]);

  const totalsByStatus = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredSummaryData.forEach((summary) => {
      Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
        totals[statusKey] = (totals[statusKey] ?? 0) + value;
      });
    });
    return totals;
  }, [filteredSummaryData]);

  const grandTotal = useMemo(() => {
    return Object.values(totalsByStatus).reduce((sum, value) => sum + value, 0);
  }, [totalsByStatus]);

  const distinctBranchCount = useMemo(() => {
    const identifiers = new Set(
      summaryData.map((summary) => summary.branchId ?? summary.branchName),
    );
    return identifiers.size;
  }, [summaryData]);

  const topStatus = useMemo(() => {
    let maxKey = "";
    let maxValue = 0;
    Object.entries(totalsByStatus).forEach(([statusKey, value]) => {
      if (value > maxValue) {
        maxValue = value;
        maxKey = statusKey;
      }
    });
    return maxKey
      ? `${getStatusLabel(maxKey)} • ${maxValue.toLocaleString()}`
      : "—";
  }, [getStatusLabel, totalsByStatus]);

  const dateSeries = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>();
    filteredSummaryData.forEach((summary) => {
      const entry = map.get(summary.calledAt) ?? { date: summary.calledAt };
      Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
        const current =
          typeof entry[statusKey] === "number"
            ? (entry[statusKey] as number)
            : 0;
        entry[statusKey] = current + value;
      });
      map.set(summary.calledAt, entry);
    });
    return Array.from(map.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [filteredSummaryData]);

  const chartSeries = useMemo(() => {
    if (dateSeries.length === 0) {
      return [];
    }

    // Get all possible status keys to ensure consistent data structure
    const allStatusKeys = statusOptions.map((status) => status.key);

    if (chartGranularity === "daily") {
      return dateSeries.map((entry) => {
        const completeEntry: Record<string, any> = {
          ...entry,
          label: String(entry.date),
        };

        if (chartViewMode === "total") {
          // Calculate total for this entry
          let total = 0;
          allStatusKeys.forEach((statusKey) => {
            const value = typeof entry[statusKey] === "number" ? entry[statusKey] : Number(entry[statusKey]) || 0;
            total += value;
          });
          completeEntry.total = total;
        } else {
          // Ensure all status keys exist with zero values if missing
          allStatusKeys.forEach((statusKey) => {
            if (!(statusKey in completeEntry)) {
              completeEntry[statusKey] = 0;
            }
          });
        }

        return completeEntry;
      });
    }

    const grouped = new Map<string, Record<string, string | number>>();

    dateSeries.forEach((entry) => {
      const baseDate = toUTCDate(String(entry.date));
      let groupKey = "";
      let displayLabel = "";

      if (chartGranularity === "weekly") {
        const { year, week } = getISOWeekInfo(baseDate);
        const paddedWeek = String(week).padStart(2, "0");
        groupKey = `${year}-W${paddedWeek}`;
        displayLabel = `Week ${paddedWeek} · ${year}`;
      } else {
        const monthIndex = baseDate.getUTCMonth();
        const paddedMonth = String(monthIndex + 1).padStart(2, "0");
        groupKey = `${baseDate.getUTCFullYear()}-${paddedMonth}`;
        displayLabel = `${baseDate.toLocaleString("en-US", { month: "short" })} ${baseDate.getUTCFullYear()}`;
      }

      const existing = grouped.get(groupKey) ?? {
        label: displayLabel,
        sortKey: groupKey,
      };

      Object.entries(entry).forEach(([key, value]) => {
        if (key === "date" || key === "label" || key === "sortKey") {
          return;
        }
        const numericValue = typeof value === "number" ? value : Number(value);
        const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
        existing[key] =
          (typeof existing[key] === "number" ? (existing[key] as number) : 0) +
          safeValue;
      });

      grouped.set(groupKey, existing);
    });

    // Ensure all grouped entries have all status keys or calculate total
    const result = Array.from(grouped.values()).map((entry) => {
      const completeEntry = { ...entry };

      if (chartViewMode === "total") {
        // Calculate total for this grouped entry
        let total = 0;
        allStatusKeys.forEach((statusKey) => {
          const value = typeof entry[statusKey] === "number" ? entry[statusKey] : Number(entry[statusKey]) || 0;
          total += value;
        });
        completeEntry.total = total;
      } else {
        // Ensure all status keys exist with zero values if missing
        allStatusKeys.forEach((statusKey) => {
          if (!(statusKey in completeEntry)) {
            completeEntry[statusKey] = 0;
          }
        });
      }

      return completeEntry;
    });

    return result.sort((a, b) =>
      String(a.sortKey).localeCompare(String(b.sortKey)),
    );
  }, [chartGranularity, dateSeries, statusOptions, chartViewMode]);

  const branchSeries = useMemo(() => {
    const map = new Map<string, { branch: string; total: number }>();
    filteredSummaryData.forEach((summary) => {
      const branchName = summary.branchName || "Unassigned";
      const total = Object.values(summary.statusTotals).reduce(
        (sum, value) => sum + value,
        0,
      );
      const entry = map.get(branchName) ?? { branch: branchName, total: 0 };
      entry.total += total;
      map.set(branchName, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredSummaryData]);

  const branchStatusSeries = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>();
    filteredSummaryData.forEach((summary) => {
      const branchName = summary.branchName || "Unassigned";
      const entry = map.get(branchName) ?? {
        branch: branchName,
        total: 0,
      };

      Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
        const current =
          typeof entry[statusKey] === "number"
            ? (entry[statusKey] as number)
            : 0;
        entry[statusKey] = current + value;
        entry.total =
          (typeof entry.total === "number" ? (entry.total as number) : 0) +
          value;
      });

      map.set(branchName, entry);
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        (typeof b.total === "number" ? (b.total as number) : 0) -
        (typeof a.total === "number" ? (a.total as number) : 0),
    );
  }, [filteredSummaryData]);

  // Filter-aware composition data for the chart
  const compositionData = useMemo(() => {
    let dataSource: Array<{ name: string;[key: string]: any }> = [];
    let filterLevel = "branch";

    if (selectedBranchId !== "all") {
      // Single branch selected - show data over time
      filterLevel = "date";
      dataSource = dateSeries.map(entry => ({
        name: String(entry.label || entry.date),
        total: 0,
        ...entry
      }));
    } else if (selectedSubArea !== "all") {
      // Sub-area selected - show branches within this sub-area
      filterLevel = "branch";
      dataSource = branchStatusSeries
        .filter(branch => filteredBranches.some(b => b.name === branch.branch))
        .map(branch => ({
          name: String(branch.branch),
          ...branch
        }));
    } else if (selectedArea !== "all") {
      // Area selected - show sub-areas within this area
      filterLevel = "subarea";
      const subareaTotals = new Map<string, Record<string, number>>();

      filteredSummaryData.forEach((summary) => {
        const branch = branches.find(b => b.name === summary.branchName);
        if (branch && branch.subareaId) {
          const subarea = subareasData.find(s => s.id === branch.subareaId);
          if (subarea) {
            const existing = subareaTotals.get(subarea.name) || { total: 0 };
            Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
              existing[statusKey] = (existing[statusKey] || 0) + value;
              existing.total = (existing.total || 0) + value;
            });
            subareaTotals.set(subarea.name, existing);
          }
        }
      });

      dataSource = Array.from(subareaTotals.entries()).map(([name, totals]) => ({
        name,
        ...totals
      }));
    } else {
      // No area filter - show areas
      filterLevel = "area";
      const areaTotals = new Map<string, Record<string, number>>();

      filteredSummaryData.forEach((summary) => {
        const branch = branches.find(b => b.name === summary.branchName);
        if (branch && branch.subareaId) {
          const subarea = subareasData.find(s => s.id === branch.subareaId);
          if (subarea) {
            const area = areasData.find(a => a.id === subarea.areaId);
            if (area) {
              const existing = areaTotals.get(area.name) || { total: 0 };
              Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
                existing[statusKey] = (existing[statusKey] || 0) + value;
                existing.total = (existing.total || 0) + value;
              });
              areaTotals.set(area.name, existing);
            }
          }
        }
      });

      dataSource = Array.from(areaTotals.entries()).map(([name, totals]) => ({
        name,
        ...totals
      }));
    }

    return { data: dataSource, filterLevel };
  }, [branchStatusSeries, selectedBranchId, selectedSubArea, selectedArea, filteredSummaryData, branches, subareasData, areasData, dateSeries, filteredBranches]);

  const statusDistribution = useMemo(
    () =>
      Object.entries(totalsByStatus).map(([statusKey, value]) => ({
        statusKey,
        label: getStatusLabel(statusKey),
        value,
      })),
    [getStatusLabel, totalsByStatus],
  );

  const statusLeaderboard = useMemo(() => {
    const leaderboard: Record<string, Array<{ name: string; value: number; rank: number }>> = {};

    // Determine the current filter level and data source
    let dataSource: Array<{ name: string;[key: string]: any }> = [];
    let filterLevel = "branch";

    if (selectedBranchId !== "all") {
      // Single branch selected - show data over time
      filterLevel = "date";
      dataSource = dateSeries.map(entry => ({
        name: String(entry.label || entry.date),
        ...entry
      }));
    } else if (selectedSubArea !== "all") {
      // Sub-area selected - show branches within this sub-area
      filterLevel = "branch";
      dataSource = branchStatusSeries
        .filter(branch => filteredBranches.some(b => b.name === branch.branch))
        .map(branch => ({
          name: String(branch.branch),
          ...branch
        }));
    } else if (selectedArea !== "all") {
      // Area selected - show sub-areas within this area
      filterLevel = "subarea";
      const subareaTotals = new Map<string, Record<string, number>>();

      filteredSummaryData.forEach((summary) => {
        const branch = branches.find(b => b.name === summary.branchName);
        if (branch && branch.subareaId) {
          const subarea = subareasData.find(s => s.id === branch.subareaId);
          if (subarea) {
            const existing = subareaTotals.get(subarea.name) || {};
            Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
              existing[statusKey] = (existing[statusKey] || 0) + value;
            });
            subareaTotals.set(subarea.name, existing);
          }
        }
      });

      dataSource = Array.from(subareaTotals.entries()).map(([name, totals]) => ({
        name,
        ...totals
      }));
    } else {
      // No area filter - show areas
      filterLevel = "area";
      const areaTotals = new Map<string, Record<string, number>>();

      filteredSummaryData.forEach((summary) => {
        const branch = branches.find(b => b.name === summary.branchName);
        if (branch && branch.subareaId) {
          const subarea = subareasData.find(s => s.id === branch.subareaId);
          if (subarea) {
            const area = areasData.find(a => a.id === subarea.areaId);
            if (area) {
              const existing = areaTotals.get(area.name) || {};
              Object.entries(summary.statusTotals).forEach(([statusKey, value]) => {
                existing[statusKey] = (existing[statusKey] || 0) + value;
              });
              areaTotals.set(area.name, existing);
            }
          }
        }
      });

      dataSource = Array.from(areaTotals.entries()).map(([name, totals]) => ({
        name,
        ...totals
      }));
    }

    // For each status, sort and rank the entities
    statusDisplayOrder.forEach((statusKey) => {
      const rankings = dataSource
        .map((entity) => ({
          name: entity.name,
          value: (entity[statusKey] as number) || 0,
          rank: 0
        }))
        .filter((entity) => entity.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10) // Show top 10
        .map((entity, index) => ({
          ...entity,
          rank: index + 1
        }));

      if (rankings.length > 0) {
        leaderboard[statusKey] = rankings;
      }
    });

    return { leaderboard, filterLevel };
  }, [branchStatusSeries, statusDisplayOrder, selectedBranchId, selectedSubArea, selectedArea, filteredSummaryData, branches, subareasData, areasData, dateSeries, filteredBranches]);

  const detailRows = useMemo(() => {
    return filteredSummaryData
      .map((summary, index) => {
        const total = Object.values(summary.statusTotals).reduce(
          (sum, value) => sum + value,
          0,
        );
        return {
          id: `${summary.calledAt}-${summary.branchId ?? summary.branchName}-${index}`,
          calledAt: summary.calledAt,
          arrivedAt: summary.arrivedAt ?? null,
          branchName: summary.branchName || "Unassigned",
          statusTotals: summary.statusTotals,
          total,
        };
      })
      .sort((a, b) => b.calledAt.localeCompare(a.calledAt));
  }, [filteredSummaryData]);

  const detailAggregates = useMemo(() => {
    const statusTotals: Record<string, number> = {};
    let grand = 0;
    detailRows.forEach((row) => {
      grand += row.total;
      statusDisplayOrder.forEach((key) => {
        const value = row.statusTotals[key] ?? 0;
        statusTotals[key] = (statusTotals[key] ?? 0) + value;
      });
    });
    return { statusTotals, grand };
  }, [detailRows, statusDisplayOrder]);

  const renderStatusPieLabel = useCallback(
    (
      props: PieLabelRenderProps & {
        payload?: { statusKey?: string; name?: string };
      },
    ) => {
      const { cx, cy, index, midAngle, outerRadius, percent, payload } = props;
      if (
        typeof cx !== "number" ||
        typeof cy !== "number" ||
        typeof midAngle !== "number" ||
        typeof outerRadius !== "number" ||
        typeof percent !== "number" ||
        !payload
      ) {
        return null;
      }

      const statusKey = (payload.statusKey ?? payload.name ?? "") as string;

      const RADIAN = Math.PI / 180;
      const baseOffset = percent < 0.07 ? 26 : 20;
      const elbowRadius = outerRadius + baseOffset;
      const horizontalArm = percent < 0.07 ? 70 : 55;
      const sx = cx + (outerRadius + 4) * Math.cos(-midAngle * RADIAN);
      const sy = cy + (outerRadius + 4) * Math.sin(-midAngle * RADIAN);
      const mx = cx + elbowRadius * Math.cos(-midAngle * RADIAN);
      const my = cy + elbowRadius * Math.sin(-midAngle * RADIAN);
      const textAnchor = mx > cx ? "start" : "end";
      const ex = mx + (textAnchor === "start" ? horizontalArm : -horizontalArm);
      const ey = my;
      const textX = ex + (textAnchor === "start" ? 8 : -8);
      const lineColor = "rgba(148,163,184,0.6)";
      const percentLabel = `${(percent * 100).toFixed(1)}%`;
      const primaryLabel = getStatusLabel(statusKey);
      const compactLayout = percent < 0.1;

      return (
        <g key={`label-${payload.statusKey ?? statusKey}-${index}`}>
          <path
            d={`M${sx},${sy} L${mx},${my} L${ex},${ey}`}
            stroke={lineColor}
            strokeWidth={1.2}
            fill="none"
          />
          <circle cx={ex} cy={ey} r={2} fill={lineColor} />
          <text
            x={textX}
            y={ey}
            fill="#f8fafc"
            fontSize={compactLayout ? 11 : 13}
            fontWeight={600}
            textAnchor={textAnchor}
            dominantBaseline="middle"
          >
            <tspan x={textX} dy="0">
              {primaryLabel}
            </tspan>
            <tspan
              x={textX}
              dy="1.2em"
              fill="#cbd5f5"
              fontSize={compactLayout ? 10 : 11}
            >
              {percentLabel}
            </tspan>
          </text>
        </g>
      );
    },
    [getStatusLabel, statusDistribution],
  );

  const handleStatusToggle = useCallback((statusKey: string) => {
    setSelectedStatusKeys((prev) =>
      prev.includes(statusKey)
        ? prev.filter((key) => key !== statusKey)
        : [...prev, statusKey],
    );
  }, []);

  const resetFilters = () => {
    setSelectedBranchId("all");
    setSelectedArea("all");
    setSelectedSubArea("all");
    setSelectedStatusKeys([]);
    setSelectedArrivalType("all");
    setStartDate(defaultStartDateDDMMYYYY());
    setEndDate(defaultEndDateDDMMYYYY());
  };

  const formatNumber = (value?: number) => (value ?? 0).toLocaleString();

  const handleScreenshot = useCallback(async () => {
    // Show loading immediately
    setCapturingScreenshot(true);

    // Small delay to ensure UI updates before heavy processing
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const dashboardElement = document.getElementById("dashboard-content");
      if (!dashboardElement) {
        throw new Error("Dashboard content not found");
      }

      // Create a clone of element to avoid modifying the original
      const clonedElement = dashboardElement.cloneNode(true) as HTMLElement;

      // Position clone off-screen
      clonedElement.style.position = 'absolute';
      clonedElement.style.left = '-9999px';
      clonedElement.style.top = '-9999px';
      clonedElement.style.width = dashboardElement.scrollWidth + 'px';
      clonedElement.style.height = dashboardElement.scrollHeight + 'px';
      clonedElement.style.background = '#0f172a';

      // Add clone to body temporarily
      document.body.appendChild(clonedElement);

      // Simplified text styling for screenshot - only fix critical text elements
      const textElements = clonedElement.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6');
      textElements.forEach((element: Element) => {
        const htmlElement = element as HTMLElement;

        // Only fix text elements that are not part of charts
        if (!htmlElement.closest('.recharts-wrapper, .recharts-surface, svg, canvas')) {
          const computedStyle = window.getComputedStyle(element);
          const color = computedStyle.color;

          // Only fix problematic color functions
          if (color && (color.includes('lab') || color.includes('lch') || color.includes('oklab') || color.includes('oklch'))) {
            htmlElement.style.setProperty('color', '#f8fafc', 'important');
          }
        }
      });

      // Additional color sanitization to prevent html2canvas errors
      const allElements = clonedElement.querySelectorAll('*');
      allElements.forEach((element: Element) => {
        const htmlElement = element as HTMLElement;
        const computedStyle = window.getComputedStyle(element);

        // Check and replace any problematic color functions in computed styles
        const colorProps = ['color', 'background-color', 'border-color', 'outline-color', 'text-decoration-color'];
        colorProps.forEach(prop => {
          const value = computedStyle.getPropertyValue(prop);
          if (value && (value.includes('oklab(') || value.includes('oklch(') || value.includes('lab(') || value.includes('lch('))) {
            // Set appropriate colors based on property type
            if (prop.includes('background')) {
              htmlElement.style.setProperty(prop, '#0f172a', 'important');
            } else if (prop.includes('border')) {
              htmlElement.style.setProperty(prop, '#334155', 'important');
            } else {
              htmlElement.style.setProperty(prop, '#f8fafc', 'important');
            }
          }
        });

        // Also set font size for better readability
        htmlElement.style.setProperty('font-size', '25px', 'important');
        htmlElement.style.setProperty('line-height', '1.5', 'important');
      });

      type Html2CanvasOptions = Parameters<typeof html2canvas>[1];
      const canvas = await html2canvas(clonedElement, {
        backgroundColor: "#0f172a",
        logging: false,
        useCORS: true,
        scale: 2, // Moderate scale to prevent canvas overflow
        width: dashboardElement.scrollWidth,
        height: dashboardElement.scrollHeight,
        allowTaint: true,
        ignoreElements: (element: Element) => {
          // Ignore only truly problematic elements, keep styles for proper layout
          return element.tagName === 'SCRIPT' ||
            element.tagName === 'NOSCRIPT' ||
            element.classList?.contains('animate-blob') ||
            element.id === 'status-leaderboard' ||
            element.closest('#status-leaderboard');
        },
      } as any);

      // Remove the clone
      document.body.removeChild(clonedElement);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        throw new Error("Failed to create image");
      }

      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        showToast("Dashboard screenshot copied to clipboard!", "success");
      } catch (clipboardError) {
        console.warn("Clipboard write failed, downloading instead", clipboardError);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
        link.href = url;
        link.download = `call-dashboard-${timestamp}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Dashboard screenshot downloaded!", "success");
      }
    } catch (error) {
      console.error("Screenshot failed:", error);
      showToast("Failed to capture dashboard screenshot", "error");
    } finally {
      setCapturingScreenshot(false);
    }
  }, [showToast]);

  return (
    <>
      <div className="relative min-h-screen overflow-hidden py-8">
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-orange-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-orange-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>
        <div className="relative z-10 space-y-8 px-4 sm:px-6 lg:px-8">
          <header className="">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">
                  Realtime Insight
                </p>
                <h1 className="mt-1 text-3xl font-semibold text-white">
                  Call Service · Performance Dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Slice millions of call-report rows by branch, date, and
                  outcome to reveal execution trends instantly.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                  <RefreshCw
                    className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""} text-cyan-300`}
                  />
                  {lastUpdated ? (
                    <span>
                      Updated{" "}
                      {lastUpdated.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : (
                    <span>Waiting for fresh data…</span>
                  )}
                </div>
                <button
                  onClick={handleScreenshot}
                  disabled={capturingScreenshot}
                  className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {capturingScreenshot ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle className="opacity-30" cx="12" cy="12" r="10" strokeWidth="4" />
                        <path className="opacity-70" d="M4 12a8 8 0 018-8" strokeWidth="4" strokeLinecap="round" />
                      </svg>
                      Capturing...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Screenshot
                    </>
                  )}
                </button>
              </div>
            </div>
          </header>

          <section className="rounded-2xl border border-white/5 bg-slate-950/60 p-6 shadow-inner shadow-black/30">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
                  Filters
                </p>
                <h2 className="text-xl font-semibold text-white">
                  Focus on the signals that matter
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm text-cyan-300 transition hover:text-white"
                >
                  Reset filters
                </button>
                <button
                  type="button"
                  onClick={fetchSummary}
                  disabled={summaryLoading}
                  className="inline-flex items-center gap-2 rounded-full bg-cyan-500/90 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`}
                  />
                  Refresh data
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Left Column: Hierarchy Filters */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px bg-gradient-to-r from-orange-500 to-cyan-500 flex-1"></div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Location</span>
                  <div className="h-px bg-gradient-to-r from-cyan-500 to-green-500 flex-1"></div>
                </div>

                {/* Hierarchy Level 1: Area */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                    <label className="text-sm font-medium text-slate-300">
                      Area
                    </label>
                  </div>
                  <select
                    value={selectedArea}
                    onChange={(event) => {
                      setSelectedArea(event.target.value);
                      setSelectedSubArea("all"); // Reset sub-area when area changes
                      setSelectedBranchId("all"); // Reset branch when area changes
                    }}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-orange-400 focus:bg-slate-900/50 pl-8"
                    disabled={areasLoading}
                  >
                    <option value="all">All areas</option>
                    {areaOptions.map((area: AreaType) => (
                      <option key={area.id} value={area.id.toString()}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hierarchy Level 2: Sub-Area - Only show when area is selected */}
                {selectedArea !== "all" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-cyan-500"></div>
                      <label className="text-sm font-medium text-slate-300">
                        Sub-Area
                      </label>
                      <span className="text-xs text-slate-500">
                        (within {areaOptions.find(a => a.id.toString() === selectedArea)?.name || 'selected area'})
                      </span>
                    </div>
                    <select
                      value={selectedSubArea}
                      onChange={(event) => {
                        setSelectedSubArea(event.target.value);
                        setSelectedBranchId("all"); // Reset branch when sub-area changes
                      }}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan-400 focus:bg-slate-900/50 pl-8"
                      disabled={subareasLoading}
                    >
                      <option value="all">All sub-areas</option>
                      {subareaOptions.map((subarea: Subarea) => (
                        <option key={subarea.id} value={subarea.id.toString()}>
                          {subarea.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Hierarchy Level 3: Branch - Only show when sub-area is selected */}
                {selectedArea !== "all" && selectedSubArea !== "all" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <label className="text-sm font-medium text-slate-300">
                        Branch
                      </label>
                      <span className="text-xs text-slate-500">
                        (within {subareaOptions.find(s => s.id.toString() === selectedSubArea)?.name || 'selected sub-area'})
                      </span>
                    </div>
                    <select
                      value={selectedBranchId}
                      onChange={(event) => setSelectedBranchId(event.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-green-400 focus:bg-slate-900/50 pl-8"
                      disabled={branchesLoading}
                    >
                      <option value="all">All branches</option>
                      {filteredBranches.map((branch: Branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Right Column: Date and View By Filters */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px bg-gradient-to-r from-blue-500 to-purple-500 flex-1"></div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Filters</span>
                  <div className="h-px bg-gradient-to-r from-purple-500 to-pink-500 flex-1"></div>
                </div>

                {/* Date Range Section */}
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <label className="space-y-2 text-sm text-slate-300">
                      Start date
                      <CustomDateInput
                        value={startDate}
                        onChange={setStartDate}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan-400 focus:bg-slate-900/50"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      End date
                      <CustomDateInput
                        value={endDate}
                        onChange={setEndDate}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan-400 focus:bg-slate-900/50"
                      />
                    </label>
                  </div>
                </div>

                {/* View By Section */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">
                    View By
                  </label>
                  <div className="flex gap-2 flex-nowrap">
                    {(Object.keys(ARRIVAL_TYPE_LABELS) as ArrivalType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedArrivalType(type)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition whitespace-nowrap ${selectedArrivalType === type
                          ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                          : "border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                          }`}
                      >
                        {ARRIVAL_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>


          {summaryError && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-100">
              {summaryError}
            </div>
          )}

          {!summaryError && summaryData.length === 0 && !summaryLoading && (
            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-8 text-center text-slate-300">
              No call report summaries match the selected filters.
            </div>
          )}

          <section id="dashboard-content" className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-300">
                    Status trend
                  </p>
                  <p className="text-xs text-slate-400">
                    {chartViewMode === "total" ? "Total" : "By status"} {GRANULARITY_LABELS[chartGranularity].toLowerCase()} volumes
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
                    <button
                      onClick={() => setChartViewMode("byStatus")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${chartViewMode === "byStatus"
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                    >
                      By Status
                    </button>
                    <button
                      onClick={() => setChartViewMode("total")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${chartViewMode === "total"
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                    >
                      Total
                    </button>
                  </div>
                  {GRANULARITY_ORDER.map((option) => (
                    <button
                      key={option}
                      onClick={() => setChartGranularity(option)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${chartGranularity === option
                        ? "bg-orange-500 text-white shadow-sm"
                        : "border-white/10 bg-white/5 text-white/70 hover:border-white/40"
                        }`}
                    >
                      {GRANULARITY_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 h-120 w-full overflow-x-auto overflow-y-hidden">
                {chartStatusKeys.length === 0 || chartSeries.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No status data for the current filters.
                  </div>
                ) : (
                  <div className="min-w-[900px] h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartSeries}
                        margin={{ top: 20, right: 30, left: 10, bottom: 30 }}
                        key={`bar-chart-${selectedArrivalType}-${selectedBranchId}-${selectedArea}-${selectedSubArea}-${chartSeries.length}`}
                      >
                        <defs>
                          {chartStatusKeys.map((statusKey, index) => {
                            const color = chartViewMode === "total"
                              ? "#f97316" // Orange for total
                              : statusColorMap[statusKey] ??
                              STATUS_COLORS[index % STATUS_COLORS.length];
                            return (
                              <linearGradient
                                key={statusKey}
                                id={`gradient-${statusKey}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                                gradientUnits="userSpaceOnUse"
                              >
                                <stop offset="5%" stopColor={color} stopOpacity={0.9} />
                                <stop offset="95%" stopColor={color} stopOpacity={0.7} />
                              </linearGradient>
                            );
                          })}
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                          height={70}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.95)",
                            borderColor: "rgba(251, 146, 60, 0.3)",
                            borderWidth: 1,
                            borderRadius: 12,
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
                          }}
                          labelStyle={{ color: "#f8fafc", fontWeight: 600 }}
                          formatter={(value, name) => [
                            formatNumber(value as number),
                            getStatusLabel(name as string),
                          ]}
                          labelFormatter={(label) => String(label)}
                        />
                        <Legend
                          wrapperStyle={{ color: "#cbd5f5", paddingTop: "20px" }}
                          formatter={(value, entry) => {
                            if (chartViewMode === "total") {
                              return "Total Calls";
                            }
                            return getStatusLabel(value as string);
                          }}
                          iconType="rect"
                          payload={chartStatusKeys.map((statusKey, index) => ({
                            value: statusKey,
                            color: chartViewMode === "total"
                              ? "#f97316"
                              : statusColorMap[statusKey] ?? STATUS_COLORS[index % STATUS_COLORS.length],
                            type: "rect"
                          }))}
                        />
                        {chartStatusKeys.map((statusKey, index) => {
                          const color = chartViewMode === "total"
                            ? "#f97316" // Orange for total
                            : statusColorMap[statusKey] ??
                            STATUS_COLORS[index % STATUS_COLORS.length];
                          return (
                            <Bar
                              key={statusKey}
                              dataKey={statusKey}
                              fill={`url(#gradient-${statusKey})`}
                              barSize={chartViewMode === "total" ? 50 : 40}
                              radius={[6, 6, 0, 0]}
                              animationBegin={index * 100}
                              animationDuration={1400}
                              animationEasing="ease-out"
                              maxBarSize={70}
                            >
                              <LabelList
                                dataKey={statusKey}
                                position="top"
                                fill="#f8fafc"
                                fontSize={12}
                                fontWeight={600}
                                formatter={(value: any) => formatNumber(value as number)}
                              />
                            </Bar>
                          );
                        })}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-300">
                    Status mix
                  </p>
                  <p className="text-xs text-slate-400">
                    3D pie · total calls across every branch and status
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    Total
                  </p>
                  <p className="text-3xl font-semibold text-white">
                    {grandTotal.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-6 grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-8 h-90">
                  {statusDistribution.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      No status distribution to chart.
                    </div>
                  ) : (
                    <div className="relative h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart
                          margin={{
                            top: 20,
                            right: 20,
                            bottom: 20,
                            left: 20,
                          }}
                        >
                          <defs>
                            <filter
                              id="pieShadow"
                              x="-50%"
                              y="-50%"
                              width="200%"
                              height="200%"
                            >
                              <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                              <feOffset dx="0" dy="4" result="offsetblur" />
                              <feFlood floodColor="#000000" floodOpacity="0.2" />
                              <feComposite in2="offsetblur" operator="in" />
                              <feMerge>
                                <feMergeNode />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                            <filter
                              id="pieGlow"
                              x="-50%"
                              y="-50%"
                              width="200%"
                              height="200%"
                            >
                              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                              <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                            {statusDistribution.map((entry, index) => {
                              const color =
                                statusColorMap[entry.statusKey] ??
                                STATUS_COLORS[index % STATUS_COLORS.length];
                              return (
                                <radialGradient
                                  key={`radial-${entry.statusKey}`}
                                  id={`radial-${entry.statusKey}`}
                                  cx="50%"
                                  cy="40%"
                                  r="60%"
                                  gradientUnits="userSpaceOnUse"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#ffffff"
                                    stopOpacity={0.4}
                                  />
                                  <stop
                                    offset="30%"
                                    stopColor={color}
                                    stopOpacity={0.9}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor={color}
                                    stopOpacity={1}
                                  />
                                </radialGradient>
                              );
                            })}
                          </defs>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "rgba(15, 23, 42, 0.98)",
                              borderColor: "rgba(251, 146, 60, 0.4)",
                              borderWidth: 1.5,
                              borderRadius: 16,
                              backdropFilter: "blur(16px)",
                              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                              padding: "12px 16px"
                            }}
                            labelStyle={{
                              color: "#f8fafc",
                              fontWeight: 700,
                              fontSize: "13px",
                              marginBottom: "4px"
                            }}
                            itemStyle={{
                              color: "#cbd5e1",
                              fontSize: "12px",
                              lineHeight: "1.4"
                            }}
                            formatter={(value: number, name: any, props: any) => {
                              const percentage = grandTotal > 0
                                ? ((value / grandTotal) * 100).toFixed(1)
                                : "0.0";
                              return [
                                `${getStatusLabel(name as string)}`,
                                `${formatNumber(value)} calls (${percentage}%)`
                              ];
                            }}
                          />
                          <Pie
                            key={`pie-${selectedArrivalType}-${selectedBranchId}-${selectedArea}-${selectedSubArea}-${statusDistribution.length}`}
                            data={statusDistribution}
                            dataKey="value"
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={110}
                            animationBegin={300}
                            animationDuration={1400}
                            animationEasing="ease-in-out"
                            startAngle={90}
                            endAngle={-270}
                            paddingAngle={4}
                            cornerRadius={16}
                            stroke="rgba(15,23,42,0.9)"
                            strokeWidth={4}
                            labelLine={false}
                            label={renderStatusPieLabel}
                            filter="url(#pieShadow)"
                          >
                            {statusDistribution.map((entry) => (
                              <Cell
                                key={entry.statusKey}
                                fill={`url(#radial-${entry.statusKey})`}
                              />
                            ))}
                          </Pie>
                          <Pie
                            data={statusDistribution}
                            dataKey="value"
                            innerRadius={60}
                            outerRadius={65}
                            fill="rgba(255,255,255,0.05)"
                            stroke="none"
                            isAnimationActive={false}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                            Total
                          </p>
                          <p className="text-3xl font-semibold text-white drop-shadow-lg">
                            {grandTotal.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="lg:col-span-4 space-y-3 max-w-xs">
                  {statusDistribution.map((entry, index) => {
                    const color =
                      statusColorMap[entry.statusKey] ??
                      STATUS_COLORS[index % STATUS_COLORS.length];
                    return (
                      <div
                        key={`status-legend-${entry.statusKey}`}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ background: color }}
                          />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {getStatusLabel(entry.statusKey)}
                            </p>
                            <p className="text-[11px] text-slate-400 uppercase tracking-[0.25em]">
                              {(grandTotal > 0
                                ? ((entry.value / grandTotal) * 100).toFixed(1)
                                : "0.0") + "%"}
                            </p>
                          </div>
                        </div>
                        <span className="text-base font-semibold text-white">
                          {formatNumber(entry.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-5 space-y-8">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      {compositionData.filterLevel === "area" ? "Area composition" :
                        compositionData.filterLevel === "subarea" ? "Sub-area composition" :
                          compositionData.filterLevel === "branch" ? "Branch composition" :
                            "Daily composition"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Stacked totals per {compositionData.filterLevel === "area" ? "area" :
                        compositionData.filterLevel === "subarea" ? "sub-area" :
                          compositionData.filterLevel === "branch" ? "branch" : "date"} with status breakdown
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                    {compositionData.data.length} {compositionData.filterLevel === "area" ? "areas" :
                      compositionData.filterLevel === "subarea" ? "sub-areas" :
                        compositionData.filterLevel === "branch" ? "branches" : "dates"}
                  </span>
                </div>
                <div className="mt-4 h-96 overflow-x-auto overflow-y-hidden">
                  {compositionData.data.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      No {compositionData.filterLevel} data available.
                    </div>
                  ) : (
                    <div className="min-w-[800px] h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={compositionData.data}
                          margin={{ top: 20, right: 30, left: 10, bottom: 40 }}
                          key={`composition-chart-${selectedArrivalType}-${selectedBranchId}-${selectedArea}-${selectedSubArea}-${compositionData.data.length}`}
                        >
                          <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.9} />
                              <stop offset="95%" stopColor="#fb923c" stopOpacity={0.7} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.06)"
                          />
                          <XAxis
                            dataKey="name"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            interval={0}
                            angle={-25}
                            textAnchor="end"
                            height={80}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                          />
                          <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.15)",
                            }}
                            labelStyle={{
                              color: "#f8fafc",
                              fontSize: 12,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase"
                            }}
                            itemStyle={{
                              color: "#e2e8f0",
                            }}
                            formatter={(value: number, name: any, props: any) => {
                              const data = props.payload;
                              const total = data.total || 0;

                              // Build detailed breakdown
                              const details = [
                                `Total: ${formatNumber(total)}`,
                                ...chartStatusKeys
                                  .filter(key => (data[key] as number) > 0)
                                  .map(key => `${getStatusLabel(key)}: ${formatNumber(data[key] as number)}`)
                              ];

                              return [details.join("\n"), data.name || name];
                            }}
                          />
                          <Legend
                            wrapperStyle={{ color: "#cbd5f5" }}
                            formatter={() => "Total Calls"}
                            iconType="rect"
                            payload={[{
                              value: "total",
                              color: "#f97316",
                              type: "rect"
                            }]}
                          />
                          <Bar
                            dataKey="total"
                            fill="url(#barGradient)"
                            barSize={60}
                            radius={[8, 8, 0, 0]}
                            animationBegin={100}
                            animationDuration={1500}
                            animationEasing="ease-out"
                            maxBarSize={80}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Leaderboard Section */}
              <div id="status-leaderboard" className="mt-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      Status Leaderboard
                    </p>
                    <p className="text-xs text-slate-400">
                      Top performing {statusLeaderboard.filterLevel === "area" ? "areas" :
                        statusLeaderboard.filterLevel === "subarea" ? "sub-areas" :
                          statusLeaderboard.filterLevel === "branch" ? "branches" : "dates"}
                      {" "}for each call status
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border border-white/10 bg-white/5 p-1 overflow-x-auto">
                      <button
                        onClick={() => setSelectedStatusForLeaderboard(null)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${selectedStatusForLeaderboard === null
                          ? "bg-orange-500 text-white shadow-sm"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                          }`}
                      >
                        All Statuses
                      </button>
                      {Object.keys(statusLeaderboard.leaderboard || {}).map((statusKey) => (
                        <button
                          key={statusKey}
                          onClick={() => setSelectedStatusForLeaderboard(statusKey)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${selectedStatusForLeaderboard === statusKey
                            ? "bg-orange-500 text-white shadow-sm"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                            }`}
                        >
                          {getStatusLabel(statusKey)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-orange-400" />
                      <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                        {selectedStatusForLeaderboard ? getStatusLabel(selectedStatusForLeaderboard) : "All Statuses"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  {Object.keys(statusLeaderboard.leaderboard || {}).length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-center text-sm text-slate-400">
                      No status data available for leaderboard.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Rank
                            </th>
                            {Object.entries(statusLeaderboard.leaderboard || {})
                              .filter(([statusKey]) => selectedStatusForLeaderboard === null || selectedStatusForLeaderboard === statusKey)
                              .map(([statusKey]) => {
                                const color = statusColorMap[statusKey] ?? STATUS_COLORS[statusDisplayOrder.indexOf(statusKey) % STATUS_COLORS.length];
                                return (
                                  <th key={statusKey} className="text-center py-3 px-4 text-xs font-medium uppercase tracking-wider">
                                    <div className="flex flex-col items-center gap-2">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="h-2 w-2 rounded-full"
                                          style={{ background: color }}
                                        />
                                        <span style={{ color }}>
                                          {getStatusLabel(statusKey)}
                                        </span>
                                      </div>
                                      <span className="text-xs text-slate-500 font-normal">
                                        ({statusLeaderboard.filterLevel === "area" ? "Area" :
                                          statusLeaderboard.filterLevel === "subarea" ? "Sub-Area" :
                                            statusLeaderboard.filterLevel === "branch" ? "Branch" : "Date"})
                                      </span>
                                    </div>
                                  </th>
                                );
                              })}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // Find the maximum number of rankings across all statuses
                            const maxRankings = Math.max(
                              ...Object.entries(statusLeaderboard.leaderboard || {})
                                .filter(([statusKey]) => selectedStatusForLeaderboard === null || selectedStatusForLeaderboard === statusKey)
                                .map(([, rankings]) => rankings.length)
                            );

                            // Generate rows for each rank position
                            return Array.from({ length: maxRankings }, (_, rankIndex) => {
                              const rank = rankIndex + 1;
                              return (
                                <tr key={rank} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${rank === 1 ? "bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 text-yellow-400" :
                                        rank === 2 ? "bg-gradient-to-br from-gray-400/20 to-gray-500/10 border border-gray-400/30 text-gray-300" :
                                          rank === 3 ? "bg-gradient-to-br from-orange-600/20 to-orange-700/10 border border-orange-600/30 text-orange-400" :
                                            "bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 text-blue-400"
                                        }`}>
                                        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                                      </div>
                                      <span className="text-xs text-slate-400">#{rank}</span>
                                    </div>
                                  </td>
                                  {Object.entries(statusLeaderboard.leaderboard || {})
                                    .filter(([statusKey]) => selectedStatusForLeaderboard === null || selectedStatusForLeaderboard === statusKey)
                                    .map(([statusKey, rankings]) => (
                                      <td key={statusKey} className="py-3 px-4">
                                        {rankings[rankIndex] ? (
                                          <div className="text-center">
                                            <p className="text-sm text-white font-medium truncate mb-1" title={rankings[rankIndex].name}>
                                              {rankings[rankIndex].name}
                                            </p>
                                            <p className="text-sm font-semibold text-white">
                                              {formatNumber(rankings[rankIndex].value)}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                              calls
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="text-center">
                                            <span className="text-sm text-slate-500">-</span>
                                          </div>
                                        )}
                                      </td>
                                    ))}
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/5 bg-slate-950/70 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Detailed call records</p>
                <p className="text-xs text-slate-400">
                  Showing per-branch status totals for each report day. Filters above apply here as well.
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Total Calls</p>
                <p className="text-2xl font-semibold text-white">{formatNumber(detailAggregates.grand)}</p>
              </div>
            </div>

            {summaryLoading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-center text-sm text-slate-400">
                Loading detailed rows…
              </div>
            ) : detailRows.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 p-6 text-center text-slate-300">
                No detailed call reports for the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.25em] text-slate-400">
                        <th className="px-3 py-3">Called At</th>
                        <th className="px-3 py-3">Arrived At</th>
                        <th className="px-3 py-3">Branch</th>
                        {statusDisplayOrder.map((statusKey) => (
                          <th key={`header-${statusKey}`} className="px-3 py-3">
                            {getStatusLabel(statusKey)}
                          </th>
                        ))}
                        <th className="px-3 py-3">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {detailRows.map((row) => (
                        <tr key={row.id} className="hover:bg-white/5 transition">
                          <td className="px-3 py-3 text-white font-semibold">
                            {row.calledAt}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {row.arrivedAt ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-200">
                            {row.branchName}
                          </td>
                          {statusDisplayOrder.map((statusKey) => (
                            <td key={`${row.id}-${statusKey}`} className="px-3 py-3 text-right text-white/80">
                              {formatNumber(row.statusTotals[statusKey] ?? 0)}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right font-semibold text-white">
                            {formatNumber(row.total)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-white/5 font-semibold text-white">
                        <td className="px-3 py-3" colSpan={3}>
                          Grand Total
                        </td>
                        {statusDisplayOrder.map((statusKey) => (
                          <td key={`agg-${statusKey}`} className="px-3 py-3 text-right">
                            {formatNumber(detailAggregates.statusTotals[statusKey] ?? 0)}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right">
                          {formatNumber(detailAggregates.grand)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {summaryLoading && (
            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-6 text-center text-sm text-slate-300">
              Processing millions of rows… preparing visualization.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default CallDashboard;
