"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TooltipProps } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MarketingServiceGuard } from "@/components/marketing-service/MarketingServiceGuard";
import {
  marketingHierarchyService,
  MarketingArea,
  MarketingBranch,
  MarketingSubArea,
} from "@/services/marketing-service/marketingHierarchyService";
import {
  goodsShipmentService,
  MarketingGoodsShipmentRecord,
  GoodsDashboardStatsResponse,
  GroupedGoodsShipmentResponse,
  PaginatedGroupedGoodsShipmentResponse,
} from "@/services/marketing-service/goodsShipmentService";
import {
  vipMemberService,
  VipMember,
} from "@/services/marketing-service/vipMemberService";
import { useQuery } from "@tanstack/react-query";

const STATUS_META = {
  shipping: { label: "Shipping", color: "#facc15" },
  arrived: { label: "Arrived", color: "#fb923c" },
  completed: { label: "Completed", color: "#34d399" },
} as const;

type StatusKey = keyof typeof STATUS_META;
const STATUS_KEYS: StatusKey[] = ["shipping", "arrived", "completed"];
const GOODS_TYPE_COLORS = {
  ALL: "#f97316",
  COD: "#22d3ee",
} as const;

const BAR_COLORS = {
  base: "#f97316",
  highlight: "#34d399",
};

const TOOLTIP_STYLES = {
  content: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
  },
  label: {
    color: "#f8fafc",
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
  },
  item: {
    color: "#e2e8f0",
  },
};

const TREND_VIEW_OPTIONS = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
] as const;

type TrendView = (typeof TREND_VIEW_OPTIONS)[number]["key"];

type GoodsTypeLabel = keyof typeof GOODS_TYPE_COLORS;
type SplitDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type TotalsLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  payload?: {
    total?: number;
  };
  segment?: StatusKey;
};

const SegmentPercentLabel = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value = 0,
  payload,
  segment,
}: TotalsLabelProps) => {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (!payload?.total || !segment || !numericValue) {
    return null;
  }
  const percent = Math.round((numericValue / payload.total) * 100);
  const numericHeight = typeof height === "string" ? Number(height) : height;
  const numericX = typeof x === "string" ? Number(x) : x;
  const numericWidth = typeof width === "string" ? Number(width) : width;
  const numericY = typeof y === "string" ? Number(y) : y;
  if (percent < 8 || numericHeight < 18) {
    return null;
  }
  return (
    <text
      x={numericX + numericWidth / 2}
      y={numericY + numericHeight / 2 + 4}
      textAnchor="middle"
      fill="#0f172a"
      fontSize={11}
      fontWeight={700}
      pointerEvents="none"
    >
      {percent}%
    </text>
  );
};

const TotalsTopLabel = ({
  x = 0,
  y = 0,
  width = 0,
  value = 0,
}: TotalsLabelProps) => {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (!numericValue) {
    return null;
  }
  const numericX = typeof x === "string" ? Number(x) : x;
  const numericWidth = typeof width === "string" ? Number(width) : width;
  const numericY = typeof y === "string" ? Number(y) : y;
  return (
    <text
      x={numericX + numericWidth / 2}
      y={numericY - 8}
      textAnchor="middle"
      fill="#fefce8"
      fontSize={12}
      fontWeight={600}
      pointerEvents="none"
    >
      {numericValue.toLocaleString()} goods
    </text>
  );
};

const TotalsTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<number, string>) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const data = payload[0].payload as {
    total: number;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-xs text-slate-200 shadow-lg shadow-slate-900/40 backdrop-blur">
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="text-xs text-amber-300">
        Total: {data.total.toLocaleString()} goods
      </p>
    </div>
  );
};

type MemberShipmentSummary = {
  memberId: number;
  memberName: string;
  phone?: string | null;
  branchId: number;
  branchName: string;
  areaId?: number;
  areaName?: string;
  subAreaId?: number | null;
  subAreaName?: string | null;
  totalGoods: number;
  lastDate: string;
  records?: Array<{
    sendDate: string;
    totalGoods: number;
  }>;
};

const compareIsoDatesDesc = (a: string, b: string) =>
  a === b ? 0 : a > b ? -1 : 1;
const getCreatedAtTime = (value?: string) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
};

const getTodayIsoDate = () => new Date().toISOString().split("T")[0];
const getDaysAgoIsoDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

const parseIsoDate = (value: string) => new Date(`${value}T00:00:00`);

const getIsoWeekNumber = (date: Date) => {
  const temp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

export default function GoodsDashboardPage() {
  const [selectedAreaId, setSelectedAreaId] = useState<number | "all">("all");
  const [selectedSubAreaId, setSelectedSubAreaId] = useState<number | "all">(
    "all",
  );
  const [selectedBranchId, setSelectedBranchId] = useState<number | "all">(
    "all",
  );
  const [selectedMemberId, setSelectedMemberId] = useState<number | "all">(
    "all",
  );
  const [highlightedMemberId, setHighlightedMemberId] = useState<number | null>(null);
  const [shipmentViewMode, setShipmentViewMode] = useState<
    "goods-type" | "goods-status"
  >("goods-type");
  const [startDate, setStartDate] = useState(getDaysAgoIsoDate(14));
  const [endDate, setEndDate] = useState(getTodayIsoDate());
  const [trendView, setTrendView] = useState<TrendView>("day");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting state
  const [sortBy, setSortBy] = useState("totalgoods");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // React Query hooks for data fetching
  const { data: areas = [], isLoading: areasLoading, error: areasError } = useQuery({
    queryKey: ["marketing-areas"],
    queryFn: () => marketingHierarchyService.listAreas(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: subAreas = [], isLoading: subAreasLoading, error: subAreasError } = useQuery({
    queryKey: ["marketing-subareas"],
    queryFn: () => marketingHierarchyService.listSubAreas(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: branches = [], isLoading: branchesLoading, error: branchesError } = useQuery({
    queryKey: ["marketing-branches"],
    queryFn: () => marketingHierarchyService.listBranches(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: members = [], isLoading: membersLoading, error: membersError } = useQuery({
    queryKey: ["vip-members"],
    queryFn: () => vipMemberService.listMembers(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: dashboardStats, isLoading: dashboardStatsLoading, error: dashboardStatsError } = useQuery({
    queryKey: ["dashboard-stats", selectedAreaId, selectedSubAreaId, selectedBranchId, selectedMemberId, startDate, endDate],
    queryFn: () => {
      const params: any = { startDate, endDate };
      if (selectedAreaId !== "all") params.areaId = selectedAreaId;
      if (selectedSubAreaId !== "all") params.subAreaId = selectedSubAreaId;
      if (selectedBranchId !== "all") params.branchId = selectedBranchId;
      if (selectedMemberId !== "all") params.memberId = selectedMemberId;
      return goodsShipmentService.getDashboardStats(params);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: shipmentsResponse, isLoading: shipmentsLoading, error: shipmentsError } = useQuery({
    queryKey: ["shipments", selectedAreaId, selectedSubAreaId, selectedBranchId, selectedMemberId, startDate, endDate, currentPage, pageSize, searchQuery, sortBy, sortOrder],
    queryFn: () => {
      const params: any = {
        myOnly: false,
        startDate,
        endDate,
        page: currentPage,
        size: pageSize,
        sortBy,
        sortOrder,
      };
      if (selectedAreaId !== "all") params.areaId = selectedAreaId;
      if (selectedSubAreaId !== "all") params.subAreaId = selectedSubAreaId;
      if (selectedBranchId !== "all") params.branchId = selectedBranchId;
      if (selectedMemberId !== "all") params.memberId = selectedMemberId;
      if (searchQuery.trim()) params.memberQuery = searchQuery.trim();
      return goodsShipmentService.listRecentGroupedPaginated(params);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const groupedShipments = shipmentsResponse?.data || [];
  const totalRecords = shipmentsResponse?.totalCount || 0;
  const isPaginating = shipmentsLoading;

  const hierarchyLoading = areasLoading || subAreasLoading || branchesLoading;
  const error = areasError?.message || subAreasError?.message || branchesError?.message || membersError?.message || dashboardStatsError?.message || shipmentsError?.message || null;
  const filtersDisabled = hierarchyLoading || membersLoading;

  const pageSizeOptions = [
    { value: 5, label: "5" },
    { value: 10, label: "10" },
    { value: 50, label: "50" },
    { value: 100, label: "100" },
    { value: 1000, label: "1000" },
  ];

  const handleStartDateChange = (value: string) => {
    if (!value) {
      return;
    }
    setStartDate(value);
    if (value > endDate) {
      setEndDate(value);
    }
  };

  const handleEndDateChange = (value: string) => {
    if (!value) {
      return;
    }
    setEndDate(value < startDate ? startDate : value);
  };

  const applyRecentRange = (days: number) => {
    setEndDate(getTodayIsoDate());
    setStartDate(getDaysAgoIsoDate(days));
  };

  const availableSubAreas = useMemo(() => {
    if (selectedAreaId === "all") {
      return subAreas;
    }
    return subAreas.filter((subArea) => subArea.areaId === selectedAreaId);
  }, [subAreas, selectedAreaId]);

  const availableBranches = useMemo(() => {
    return branches.filter((branch) => {
      if (selectedAreaId !== "all" && branch.areaId !== selectedAreaId) {
        return false;
      }
      if (
        selectedSubAreaId !== "all" &&
        (branch.subAreaId ?? null) !== selectedSubAreaId
      ) {
        return false;
      }
      return true;
    });
  }, [branches, selectedAreaId, selectedSubAreaId]);

  const availableMembers = useMemo(() => {
    return members.filter((member) => {
      if (selectedAreaId !== "all" && member.areaId !== selectedAreaId) {
        return false;
      }
      if (
        selectedSubAreaId !== "all" &&
        member.subAreaId !== selectedSubAreaId
      ) {
        return false;
      }
      if (selectedBranchId !== "all" && member.branchId !== selectedBranchId) {
        return false;
      }
      return true;
    });
  }, [members, selectedAreaId, selectedSubAreaId, selectedBranchId]);

  const resolvedMember = useMemo(() => {
    if (selectedMemberId === "all") {
      return null;
    }
    return (
      availableMembers.find((member) => member.id === selectedMemberId) ?? null
    );
  }, [availableMembers, selectedMemberId]);

  useEffect(() => {
    if (
      selectedMemberId !== "all" &&
      !availableMembers.some((member) => member.id === selectedMemberId)
    ) {
      setSelectedMemberId("all");
    }
  }, [availableMembers, selectedMemberId]);

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );
  const areaMap = useMemo(
    () => new Map(areas.map((area) => [area.id, area])),
    [areas],
  );
  const subAreaMap = useMemo(
    () => new Map(subAreas.map((subArea) => [subArea.id, subArea])),
    [subAreas],
  );

  const memberSummaries = useMemo(() => {
    return groupedShipments.map((groupedShipment) => {
      const memberInfo = memberMap.get(groupedShipment.memberId);
      const branch = branchMap.get(groupedShipment.branchId);
      const areaId = branch?.areaId ?? memberInfo?.areaId ?? undefined;
      const subAreaId = branch?.subAreaId ?? memberInfo?.subAreaId ?? null;
      const area = areaId ? areaMap.get(areaId) : undefined;
      const subArea = subAreaId ? subAreaMap.get(subAreaId) : undefined;

      // Calculate total goods and find last date
      const totalGoods = groupedShipment.records?.reduce((sum, record) => sum + record.totalGoods, 0);
      const lastDate = groupedShipment.records
        ?.map((record) => record.sendDate)
        ?.sort()
        ?.pop() || "";

      return {
        memberId: groupedShipment.memberId,
        memberName: groupedShipment.memberName,
        phone: groupedShipment.memberPhone,
        branchId: groupedShipment.branchId,
        branchName: groupedShipment.branchName,
        areaId,
        areaName: area?.name ?? memberInfo?.areaName ?? "Unassigned area",
        subAreaId,
        subAreaName: subArea?.name ?? (subAreaId ? "Unassigned sub-area" : null),
        totalGoods,
        lastDate,
        records: groupedShipment.records, // Keep the records for calendar view
      };
    });
  }, [groupedShipments, memberMap, branchMap, areaMap, subAreaMap]);

  const filteredSummaries = useMemo(() => {
    let summaries = memberSummaries;
    if (selectedAreaId !== "all") {
      summaries = summaries.filter(
        (summary) => summary.areaId === selectedAreaId,
      );
    }
    if (selectedSubAreaId !== "all") {
      summaries = summaries.filter(
        (summary) => summary.subAreaId === selectedSubAreaId,
      );
    }
    if (selectedBranchId !== "all") {
      summaries = summaries.filter(
        (summary) => summary.branchId === selectedBranchId,
      );
    }
    if (resolvedMember) {
      summaries = summaries.filter(
        (summary) => summary.memberId === resolvedMember.id,
      );
    }
    return summaries;
  }, [
    memberSummaries,
    selectedAreaId,
    selectedSubAreaId,
    selectedBranchId,
    resolvedMember,
  ]);

  const displayedMemberCount = filteredSummaries.length;

  const chartData = useMemo(() => {
    if (!dashboardStats || dashboardStats.statusMetrics.length === 0) {
      return [];
    }

    return dashboardStats.statusMetrics.map(metric => ({
      metric: metric.metric,
      TOTAL: metric.total,
      shipping: metric.shipping,
      arrived: metric.arrived,
      completed: metric.completed,
    }));
  }, [dashboardStats]);

  const goodsTypeTotals = useMemo(() => {
    if (!dashboardStats) {
      return { TOTAL: 0 };
    }
    return { TOTAL: dashboardStats.summaryStats.totalGoods };
  }, [dashboardStats]);

  const goodsTypeChartData = useMemo(
    () =>
      [{
        key: "TOTAL",
        label: "Total Goods",
        value: goodsTypeTotals.TOTAL,
        color: GOODS_TYPE_COLORS.ALL,
      }],
    [goodsTypeTotals],
  );

  const goodsTypeDonutData = useMemo(() => {
    const total = goodsTypeTotals.TOTAL;

    return [
      {
        key: "total",
        label: "Total Goods",
        value: total,
        color: GOODS_TYPE_COLORS.ALL,
      },
    ];
  }, [goodsTypeTotals]);

  const statusTotalsData = useMemo(
    () =>
      chartData.map((row) => ({
        key: "total",
        label: row.metric,
        value: row.TOTAL,
        color: GOODS_TYPE_COLORS.ALL,
      })),
    [chartData],
  );

  const comparativeData: SplitDatum[] = useMemo(
    () =>
      shipmentViewMode === "goods-type" ? goodsTypeDonutData : statusTotalsData,
    [shipmentViewMode, goodsTypeDonutData, statusTotalsData],
  );

  const statusComparisonData = useMemo(
    () =>
      chartData.map((row) => ({
        metric: row.metric,
        totalGoods: row.TOTAL,
      })),
    [chartData],
  );

  const totalsChartData = useMemo(() => {
    if (!dashboardStats || dashboardStats.hierarchyTotals.length === 0) {
      return [];
    }

    return dashboardStats.hierarchyTotals.map(total => ({
      key: total.key,
      label: total.label,
      total: total.total,
      highlight: total.highlight,
    }));
  }, [dashboardStats]);

  // Helper function to generate complete date range for daily view only
  const generateDailyDateRange = (start: string, end: string) => {
    const startDate = parseIsoDate(start);
    const endDate = parseIsoDate(end);
    const dates: string[] = [];

    // Generate dates EXACTLY from start to end, no extra dates
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // Use local date methods to avoid timezone issues
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  };

  const dailyGoodsTrend = useMemo(() => {
    // Generate complete date range based on filter for daily view
    const dateRange = generateDailyDateRange(startDate, endDate);

    // Debug: Log the generated date range
    console.log('=== DAILY GOODS TREND DEBUG ===');
    console.log('Filter dates:', startDate, 'to', endDate);
    console.log('Generated date range:', dateRange);
    console.log('Number of days in range:', dateRange.length);

    if (!dashboardStats || dashboardStats.dailyTrends.length === 0) {
      // No backend data - show all dates with 0
      console.log('No backend data, showing all dates with 0');
      return dateRange.map(date => ({
        date,
        label: formatDate(date),
        total: 0,
      }));
    }

    // Debug: Log backend data
    console.log('Backend daily trends count:', dashboardStats.dailyTrends.length);
    console.log('Backend daily trends:', dashboardStats.dailyTrends);

    // Create a map of existing backend data, but ONLY include dates within filter range
    const dataMap = new Map();
    dashboardStats.dailyTrends.forEach(trend => {
      // Only include backend data if it's within our filter range
      if (trend.date >= startDate && trend.date <= endDate) {
        dataMap.set(trend.date, trend.totalGoods);
        console.log('✓ Including backend data for date:', trend.date, 'value:', trend.totalGoods);
      } else {
        console.log('✗ Excluding backend data for date outside filter:', trend.date);
      }
    });

    // Generate complete date range and fill missing dates with 0
    const result = dateRange.map(date => ({
      date,
      label: formatDate(date),
      total: dataMap.get(date) || 0,
    }));

    console.log('Final result count:', result.length);
    console.log('Final result:', result);
    console.log('=== END DEBUG ===');
    return result;
  }, [dashboardStats, startDate, endDate]);

  const weeklyGoodsTrend = useMemo(() => {
    if (!dashboardStats || dashboardStats.weeklyTrends.length === 0) {
      return [];
    }

    // Only show weeks that the backend returns, no extra weeks
    return dashboardStats.weeklyTrends.map(trend => ({
      date: trend.label,
      label: trend.label,
      total: trend.totalGoods,
    }));
  }, [dashboardStats]);

  const monthlyGoodsTrend = useMemo(() => {
    if (!dashboardStats || dashboardStats.monthlyTrends.length === 0) {
      return [];
    }

    // Only show months that the backend returns, no extra months
    return dashboardStats.monthlyTrends.map(trend => ({
      date: trend.label,
      label: trend.label,
      total: trend.totalGoods,
    }));
  }, [dashboardStats]);

  const trendData = useMemo(() => {
    switch (trendView) {
      case "day":
        return dailyGoodsTrend;
      case "week":
        return weeklyGoodsTrend;
      case "month":
        return monthlyGoodsTrend;
      default:
        return dailyGoodsTrend;
    }
  }, [trendView, dailyGoodsTrend, weeklyGoodsTrend, monthlyGoodsTrend]);

  // Calculate total days for calendar display
  const calendarDays = useMemo(() => {
    const startDateObj = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDateObj = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    // If no filters, default to current month
    if (!startDate && !endDate) {
      startDateObj.setDate(1);
      endDateObj = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    }

    return Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  // Prepare calendar data from grouped shipments
  const calendarData = useMemo(() => {
    // Calculate date range based on filters
    const startDateObj = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDateObj = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    // If no filters, default to current month
    if (!startDate && !endDate) {
      startDateObj.setDate(1);
      endDateObj = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    }

    const totalDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const calendarRows = filteredSummaries.map((member) => {
      const dailyData: Record<string, number> = {};

      // Initialize all days in the range with 0 using full date string as key
      for (let day = 0; day < totalDays; day++) {
        const currentDate = new Date(startDateObj);
        currentDate.setDate(startDateObj.getDate() + day);
        const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        dailyData[dateKey] = 0;
      }

      // Fill in actual shipment data
      member.records?.forEach((record) => {
        const date = new Date(record.sendDate);
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        // Only include records within the filtered date range
        if (date >= startDateObj && date <= endDateObj) {
          dailyData[dateKey] = (dailyData[dateKey] || 0) + record.totalGoods;
        }
      });

      return {
        memberId: member.memberId,
        memberName: member.memberName,
        phone: member.phone,
        branchName: member.branchName,
        dailyData,
        totalGoods: member.totalGoods,
      };
    });

    return calendarRows;
  }, [filteredSummaries, startDate, endDate]);

  // Filter calendar data based on search query (for display only)
  const filteredCalendarData = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedShipments;
    }

    const query = searchQuery.toLowerCase();
    return groupedShipments.filter((row) =>
      row.memberName.toLowerCase().includes(query) ||
      (row.memberPhone && row.memberPhone.toLowerCase().includes(query))
    );
  }, [groupedShipments, searchQuery]);

  // Transform grouped shipments to calendar format
  const calendarDisplayData = useMemo(() => {
    // Calculate date range based on filters
    const startDateObj = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let endDateObj = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    // If no filters, default to current month
    if (!startDate && !endDate) {
      startDateObj.setDate(1);
      endDateObj = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    }

    const totalDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return filteredCalendarData.map((groupedShipment) => {
      const dailyData: Record<string, number> = {};

      // Initialize all days in the range with 0 using full date string as key
      for (let day = 0; day < totalDays; day++) {
        const currentDate = new Date(startDateObj);
        currentDate.setDate(startDateObj.getDate() + day);
        const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        dailyData[dateKey] = 0;
      }

      // Fill in actual shipment data
      groupedShipment.records?.forEach((record) => {
        const recordDate = new Date(record.sendDate);
        const dateKey = recordDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        // Only include records within the filtered date range
        if (recordDate >= startDateObj && recordDate <= endDateObj) {
          dailyData[dateKey] = (dailyData[dateKey] || 0) + record.totalGoods;
        }
      });

      return {
        memberId: groupedShipment.memberId,
        memberName: groupedShipment.memberName,
        phone: groupedShipment.memberPhone,
        branchName: groupedShipment.branchName,
        dailyData,
        totalGoods: groupedShipment.totalGoods || 0, // Use totalGoods from backend
        rank: groupedShipment.rank, // Add rank from backend
      };
    });
  }, [filteredCalendarData, startDate, endDate]);

  // Calculate pagination info (based on backend response)
  const totalPages = Math.ceil(totalRecords / pageSize);
  const startIndex = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalRecords);

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAreaId, selectedSubAreaId, selectedBranchId, selectedMemberId, startDate, endDate]);

  const handleAreaChange = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedAreaId(next);
    setSelectedSubAreaId("all");
    setSelectedBranchId("all");
    setSelectedMemberId("all");
  };

  const handleSubAreaChange = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedSubAreaId(next);
    setSelectedBranchId("all");
    setSelectedMemberId("all");
  };

  const handleBranchChange = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedBranchId(next);
    setSelectedMemberId("all");
  };

  const handleMemberChange = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedMemberId(next);
  };

  const handleChartClick = (clickedData: any) => {
    const key = clickedData.key || '';
    const label = clickedData.label || '';

    if (key.startsWith('area-')) {
      // Clicked on an area - select this area
      const areaId = Number(key.replace('area-', ''));
      setSelectedAreaId(areaId);
      setSelectedSubAreaId('all');
      setSelectedBranchId('all');
      setSelectedMemberId('all');
      setHighlightedMemberId(null);
    } else if (key.startsWith('sub-')) {
      // Clicked on a sub-area - select this sub-area
      const subAreaId = key === 'sub-none' ? 'all' : Number(key.replace('sub-', ''));
      setSelectedSubAreaId(subAreaId);
      setSelectedBranchId('all');
      setSelectedMemberId('all');
      setHighlightedMemberId(null);
    } else if (key.startsWith('branch-')) {
      // Clicked on a branch - select this branch
      const branchId = Number(key.replace('branch-', ''));
      setSelectedBranchId(branchId);
      setSelectedMemberId('all');
      setHighlightedMemberId(null);
    } else if (key.startsWith('member-')) {
      // Clicked on a member - highlight this member
      const memberId = Number(key.replace('member-', ''));
      setSelectedMemberId(memberId);
      setHighlightedMemberId(memberId);
    }
  };

  return (
    <MarketingServiceGuard>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300/70">
            Marketing ◦ VIP logistics
          </p>
          <h1 className="text-3xl font-semibold text-white">
            VIP member shipments
          </h1>
          <p className="text-sm text-slate-300">
            Filter by area → branch → member to understand how premium
            deliveries are performing for ALL vs COD goods.
          </p>
        </header>

        {error && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-200/80">
                <span>Locations</span>
                <button
                  className="rounded-full border border-white/10 px-3 py-1 text-[0.6rem] text-white/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setSelectedAreaId("all");
                    setSelectedSubAreaId("all");
                    setSelectedBranchId("all");
                    setSelectedMemberId("all");
                  }}
                  disabled={filtersDisabled}
                >
                  Reset
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Area
                  </label>
                  <select
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    value={selectedAreaId}
                    onChange={(event) => handleAreaChange(event.target.value)}
                    disabled={filtersDisabled}
                  >
                    <option value="all">All areas</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>

                {availableSubAreas.length > 0 && (
                  <div className="flex flex-col text-xs text-slate-300">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Sub area
                    </label>
                    <select
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      value={selectedSubAreaId}
                      onChange={(event) =>
                        handleSubAreaChange(event.target.value)
                      }
                      disabled={filtersDisabled}
                    >
                      <option value="all">All sub areas</option>
                      {availableSubAreas.map((subArea) => (
                        <option key={subArea.id} value={subArea.id}>
                          {subArea.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Branch
                  </label>
                  <select
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    value={selectedBranchId}
                    onChange={(event) => handleBranchChange(event.target.value)}
                    disabled={filtersDisabled}
                  >
                    <option value="all">All branches</option>
                    {availableBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Member
                  </label>
                  <select
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    value={selectedMemberId}
                    onChange={(event) => handleMemberChange(event.target.value)}
                    disabled={filtersDisabled}
                  >
                    <option value="all">All members</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-white lg:w-80">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-200/80">
                <span>Date range</span>
                <div className="flex gap-2">
                  {[7, 14, 30].map((days) => (
                    <button
                      key={days}
                      className="rounded-full border border-white/10 px-3 py-1 text-[0.6rem] text-white/70 hover:text-white"
                      onClick={() => applyRecentRange(days)}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 space-y-3 text-xs">
                <div className="flex flex-col">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Start date
                  </label>
                  <input
                    type="date"
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    value={startDate}
                    max={endDate}
                    onChange={(event) =>
                      handleStartDateChange(event.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    End date
                  </label>
                  <input
                    type="date"
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    value={endDate}
                    min={startDate}
                    max={getTodayIsoDate()}
                    onChange={(event) =>
                      handleEndDateChange(event.target.value)
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:text-white"
                    onClick={() => {
                      setStartDate(getTodayIsoDate());
                      setEndDate(getTodayIsoDate());
                    }}
                  >
                    Today
                  </button>
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:text-white"
                    onClick={() => {
                      setStartDate(getDaysAgoIsoDate(90));
                      setEndDate(getTodayIsoDate());
                    }}
                  >
                    90d
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                Totals overview
              </p>
              <h2 className="text-xl font-semibold text-white">
                Goods volume by location hierarchy
              </h2>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-right text-sm text-slate-300">
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">
                Total goods shown
              </p>
              <p className="text-2xl font-semibold text-white">
                {goodsTypeTotals.TOTAL.toLocaleString()}
              </p>
            </div>
          </div>
          <div className={`mt-2 h-96 w-full ${totalsChartData.length > 8 ? 'overflow-x-auto scrollbar-hide' : ''}`}>
            {totalsChartData.length === 0 && !dashboardStatsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {dashboardStatsLoading ? "Loading chart data..." : "No total goods data to display."}
              </div>
            ) : dashboardStatsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Loading chart data...
              </div>
            ) : (
              <div style={{
                minWidth: totalsChartData.length > 8 ? Math.max(800, totalsChartData.length * 100) : '100%',
                height: '100%'
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={totalsChartData}
                    margin={{ top: 24, left: 16, right: 16, bottom: totalsChartData.length > 8 ? 60 : 8 }}
                    onClick={(data) => {
                      if (data && data.activePayload && data.activePayload.length > 0) {
                        const clickedData = data.activePayload[0].payload as any;
                        handleChartClick(clickedData);
                      }
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#475569"
                      opacity={0.2}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="#94a3b8"
                      interval={0}
                      angle={totalsChartData.length > 5 ? -20 : 0}
                      height={totalsChartData.length > 8 ? 70 : (totalsChartData.length > 5 ? 70 : 40)}
                      tickMargin={12}
                    />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      content={<TotalsTooltip />}
                    />
                    <Bar
                      dataKey="total"
                      barSize={totalsChartData.length > 8 ? 64 : 48}
                      name="Total Goods"
                      radius={[12, 12, 0, 0]}
                    >
                      {totalsChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.highlight ? BAR_COLORS.highlight : BAR_COLORS.base}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                      <LabelList
                        dataKey="total"
                        content={(props) => <TotalsTopLabel {...props} />}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {trendData.length > 0 && (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                  Trend
                </p>
                <h2 className="text-xl font-semibold text-white">
                  Total goods per {trendView === "day" ? "day" : trendView === "week" ? "week" : "month"}
                </h2>
                <p className="text-sm text-slate-300">
                  Visualize how combined COD and non-COD goods fluctuate inside
                  your selected date range.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-slate-900/60 p-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                {TREND_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    className={`rounded-full px-4 py-1 ${trendView === option.key
                      ? "bg-amber-400/30 text-white"
                      : "text-slate-400 hover:text-white"
                      }`}
                    onClick={() => setTrendView(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 16, left: 8, right: 16, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#475569"
                    opacity={0.2}
                  />
                  <XAxis dataKey="label" stroke="#94a3b8" tickMargin={12} />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip
                    cursor={{ stroke: "#f97316", strokeWidth: 2 }}
                    contentStyle={TOOLTIP_STYLES.content}
                    labelStyle={TOOLTIP_STYLES.label}
                    itemStyle={TOOLTIP_STYLES.item}
                    formatter={(value: number) => [
                      `${value.toLocaleString()} goods`,
                      "Total goods",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#fb923c"
                    strokeWidth={3}
                    dot={{ stroke: "#fed7aa", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                  Shipment log
                </p>
                <h2 className="text-xl font-semibold text-white">
                  VIP member manifest
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                {(shipmentsLoading || dashboardStatsLoading) && <span>Refreshing…</span>}
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
                  {isPaginating ? "Loading..." : `${startIndex}-${endIndex} of ${totalRecords} rows`}
                </span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex-1 max-w-md">
                <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 block mb-2">
                  Search Shipments
                </label>
                <input
                  type="text"
                  placeholder="Search by member, phone, date, or goods..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1); // Reset to first page when searching
                  }}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-amber-400/60 focus:outline-none"
                />
              </div>

              {/* Sorting Controls */}
              <div className="flex gap-3">
                <div>
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 block mb-2">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setCurrentPage(1); // Reset to first page when sorting
                    }}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                  >
                    <option value="totalgoods">Total Goods</option>
                    <option value="membername">Member Name</option>
                    <option value="branchname">Branch Name</option>
                  </select>
                </div>

                <div>
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 block mb-2">
                    Order
                  </label>
                  <select
                    value={sortOrder}
                    onChange={(e) => {
                      setSortOrder(e.target.value as "asc" | "desc");
                      setCurrentPage(1); // Reset to first page when sorting
                    }}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            {/* Calendar Header */}
            <div className="min-w-full text-left text-sm text-slate-200">
              <div className="flex gap-2 pb-3 border-b border-white/10 min-w-max">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400 w-[80px] flex-shrink-0">Rank</div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400 w-[120px] flex-shrink-0">N0</div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400 w-[200px] flex-shrink-0">Member Name</div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400 w-[150px] flex-shrink-0">Phone</div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400 w-[120px] flex-shrink-0">Branch</div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400 w-[100px] flex-shrink-0 text-right">Total Goods</div>
                {Array.from({ length: calendarDays }, (_, i) => {
                  const currentDate = new Date(startDate ? startDate : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                  currentDate.setDate(currentDate.getDate() + i);
                  return (
                    <div key={`header-${i}`} className="text-xs uppercase tracking-[0.3em] text-slate-400 text-center w-[40px] flex-shrink-0">
                      {currentDate.getDate()}
                    </div>
                  );
                })}
              </div>

              {/* Calendar Body - Members as rows */}
              <div className="mt-2">
                {calendarDisplayData.length === 0 && !shipmentsLoading ? (
                  <div className="py-6 text-center text-slate-400">
                    {searchQuery.trim()
                      ? "No shipments match your search."
                      : "No shipment details for the current filters."}
                  </div>
                ) : (
                  calendarDisplayData.map((member) => (
                    <div key={member.memberId} className="flex gap-2 py-3 border-b border-white/5 hover:bg-white/5 transition-colors min-w-max">
                      {/* Rank Column */}
                      <div className="flex items-center text-xs text-slate-300 w-20 shrink-0">
                        {member.rank ? (
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${member.rank <= 3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-700/30 text-slate-300'
                            }`}>
                            {member.rank}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </div>

                      {/* N0 (Member Number) */}
                      <div className="flex items-center text-xs text-slate-300 w-[120px] shrink-0">
                        #{member.memberId}
                      </div>

                      {/* Member Name */}
                      <div className="flex items-center w-[200px] shrink-0">
                        <div className="font-medium text-white">{member.memberName}</div>
                      </div>

                      {/* Phone Number */}
                      <div className="flex items-center text-xs text-slate-300 w-[150px] shrink-0">
                        {member.phone || '—'}
                      </div>

                      {/* Branch Name */}
                      <div className="flex items-center text-xs text-slate-300 w-[120px] shrink-0">
                        {member.branchName}
                      </div>

                      {/* Total Goods */}
                      <div className="flex items-center justify-end text-xs text-slate-300 w-25 shrink-0">
                        <span className="font-mono font-semibold text-white">
                          {member.totalGoods?.toLocaleString() || '0'}
                        </span>
                      </div>

                      {/* Daily Goods Columns */}
                      {Array.from({ length: calendarDays }, (_, i) => {
                        const currentDate = new Date(startDate ? startDate : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                        currentDate.setDate(currentDate.getDate() + i);
                        const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                        const goods = member.dailyData[dateKey] || 0;
                        return (
                          <div key={`${member.memberId}-${dateKey}-${i}`} className="flex items-center justify-center w-[40px] flex-shrink-0">
                            {goods > 0 ? (
                              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-1 py-1 text-xs font-medium text-amber-300 text-center w-full">
                                {goods}
                              </div>
                            ) : (
                              <div className="w-full h-6 flex items-center justify-center text-xs text-slate-600">
                                —
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Enhanced Pagination Controls */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-linear-to-br from-slate-900/50 to-slate-800/30 p-4 backdrop-blur-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Records Info & Page Size Selector */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="text-sm">
                  <span className="text-slate-400">Showing</span>
                  <span className="mx-2 font-semibold text-white">
                    {startIndex}-{endIndex}
                  </span>
                  <span className="text-slate-400">of</span>
                  <span className="mx-1 font-semibold text-white">{totalRecords}</span>
                  <span className="text-slate-400">shipments</span>
                </div>

                {/* Page Size Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    disabled={isPaginating}
                    className="rounded-lg border border-white/20 bg-slate-900/60 px-3 py-1.5 text-sm text-white focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:opacity-50"
                  >
                    {pageSizeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">per page</span>
                </div>
              </div>

              {/* Page Navigation */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1 || isPaginating}
                    className="group relative rounded-xl border border-white/20 bg-slate-900/40 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Previous
                    </span>
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center">
                    {currentPage > 3 && totalPages > 5 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCurrentPage(1)}
                          disabled={isPaginating}
                          className="mx-1 rounded-lg border border-white/20 bg-slate-900/40 px-3 py-2 text-sm text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-40"
                        >
                          1
                        </button>
                        {currentPage > 4 && (
                          <span className="mx-1 text-slate-500">...</span>
                        )}
                      </>
                    )}

                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          disabled={isPaginating}
                          className={`mx-1 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${currentPage === pageNum
                            ? "border border-amber-400/60 bg-linear-to-r from-amber-500/20 to-amber-400/20 text-amber-200 shadow-lg shadow-amber-500/20"
                            : "border border-white/20 bg-slate-900/40 text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-40"
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {currentPage < totalPages - 2 && totalPages > 5 && (
                      <>
                        {currentPage < totalPages - 3 && (
                          <span className="mx-1 text-slate-500">...</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={isPaginating}
                          className="mx-1 rounded-lg border border-white/20 bg-slate-900/40 px-3 py-2 text-sm text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-40"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Next Button */}
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || isPaginating}
                    className="group relative rounded-xl border border-white/20 bg-slate-900/40 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2">
                      Next
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Additional Info */}
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Page {currentPage} of {totalPages}</span>
                <span>{totalRecords} total records</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingServiceGuard>
  );
}
