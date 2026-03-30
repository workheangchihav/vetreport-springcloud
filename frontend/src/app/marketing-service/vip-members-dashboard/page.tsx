"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
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
  vipMemberService,
  VipMember,
} from "@/services/marketing-service/vipMemberService";

type FilterValue = number | "all";

type ChartSegment = {
  key: string;
  label: string;
  members: number;
  highlight?: boolean;
};

type EnrichedMember = {
  member: VipMember;
  areaId?: number;
  areaName?: string;
  subAreaId?: number | null;
  subAreaName?: string | null;
  branchId: number;
  branchName?: string;
  joinedDate: string | null;
  removedDate: string | null;
};

const PAGE_SIZE = 50;

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

const BAR_COLORS = {
  base: "#f97316",
  highlight: "#34d399",
};

const TREND_VIEW_OPTIONS = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
] as const;

type TrendView = (typeof TREND_VIEW_OPTIONS)[number]["key"];

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const buildDateRange = (start: string, end: string) => {
  const days: string[] = [];
  const cursor = parseDate(start);
  const last = parseDate(end);

  while (cursor <= last) {
    days.push(toISODate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
};

const normalizeDateString = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value.length > 10 ? value.slice(0, 10) : value;
};

const flattenMembers = (
  members: VipMember[],
  maps: {
    areaMap: Map<number, MarketingArea>;
    subAreaMap: Map<number, MarketingSubArea>;
    branchMap: Map<number, MarketingBranch>;
  },
): EnrichedMember[] => {
  if (members.length === 0) {
    return [];
  }

  return members.map((member) => {
    const branch = maps.branchMap.get(member.branchId);
    const resolvedAreaId = member.areaId ?? branch?.areaId;
    const resolvedSubAreaId = member.subAreaId ?? branch?.subAreaId ?? null;
    const areaName =
      member.areaName ??
      (resolvedAreaId ? maps.areaMap.get(resolvedAreaId)?.name : undefined);
    const subAreaName =
      member.subAreaName ??
      (resolvedSubAreaId
        ? (maps.subAreaMap.get(resolvedSubAreaId)?.name ?? null)
        : null);
    const branchName = member.branchName ?? branch?.name;

    const joinedDate =
      normalizeDateString(member.memberCreatedAt) ??
      normalizeDateString(member.createdAt) ??
      null;
    const removedDate = normalizeDateString(member.memberDeletedAt);

    return {
      member,
      areaId: resolvedAreaId,
      areaName,
      subAreaId: resolvedSubAreaId ?? null,
      subAreaName,
      branchId: member.branchId,
      branchName,
      joinedDate,
      removedDate,
    };
  });
};

const getEarliestCreatedAt = (members: EnrichedMember[]) => {
  const joinedDates = members
    .map((entry) => entry.joinedDate)
    .filter((value): value is string => !!value);
  if (joinedDates.length === 0) {
    return new Date().toISOString().split("T")[0];
  }
  return joinedDates.reduce(
    (earliest, current) => (current < earliest ? current : earliest),
    joinedDates[0],
  );
};

const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

const getWeekNumber = (date: Date) => {
  const temp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

function VIPMembersDashboardPage() {
  const [areas, setAreas] = useState<MarketingArea[]>([]);
  const [subAreas, setSubAreas] = useState<MarketingSubArea[]>([]);
  const [branches, setBranches] = useState<MarketingBranch[]>([]);
  const [rawMembers, setRawMembers] = useState<VipMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  // Infinite scroll states for active members
  const [activeMembersPage, setActiveMembersPage] = useState(0);
  const [activeMembersData, setActiveMembersData] = useState<EnrichedMember[]>([]);
  const [activeMembersLoading, setActiveMembersLoading] = useState(false);
  const [activeMembersHasMore, setActiveMembersHasMore] = useState(true);

  // Infinite scroll states for removed members
  const [removedMembersPage, setRemovedMembersPage] = useState(0);
  const [removedMembersData, setRemovedMembersData] = useState<EnrichedMember[]>([]);
  const [removedMembersLoading, setRemovedMembersLoading] = useState(false);
  const [removedMembersHasMore, setRemovedMembersHasMore] = useState(true);

  // Refs for scroll detection
  const activeTableRef = useRef<HTMLDivElement>(null);
  const removedTableRef = useRef<HTMLDivElement>(null);

  const [selectedAreaId, setSelectedAreaId] = useState<FilterValue>("all");
  const [selectedSubAreaId, setSelectedSubAreaId] =
    useState<FilterValue>("all");
  const [selectedBranchId, setSelectedBranchId] = useState<FilterValue>("all");

  // Default to 2-week range: from 2 weeks ago to today
  const getDefaultDateRange = () => {
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);

    return {
      start: twoWeeksAgo.toISOString().split("T")[0],
      end: today.toISOString().split("T")[0],
    };
  };

  const defaultDates = getDefaultDateRange();
  const [startDate, setStartDate] = useState(() => defaultDates.start);
  const [endDate, setEndDate] = useState(() => defaultDates.end);
  const [trendView, setTrendView] = useState<TrendView>("day");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [areaData, subAreaData, branchData, memberData] = await Promise.all(
        [
          marketingHierarchyService.listAreas(),
          marketingHierarchyService.listSubAreas(),
          marketingHierarchyService.listBranches(),
          vipMemberService.listMembers(),
        ],
      );
      setAreas(areaData);
      setSubAreas(subAreaData);
      setBranches(branchData);
      setRawMembers(memberData);
      setChartLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VIP data");
      setChartLoading(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const areaMap = useMemo(
    () => new Map(areas.map((area) => [area.id, area])),
    [areas],
  );
  const subAreaMap = useMemo(
    () => new Map(subAreas.map((sub) => [sub.id, sub])),
    [subAreas],
  );
  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );

  const allMembers = useMemo(
    () => flattenMembers(rawMembers, { areaMap, subAreaMap, branchMap }),
    [rawMembers, areaMap, subAreaMap, branchMap],
  );

  // Remove the initial date override logic to keep our 2-week default

  const selectedArea = useMemo(
    () =>
      selectedAreaId === "all" ? null : (areaMap.get(selectedAreaId) ?? null),
    [selectedAreaId, areaMap],
  );

  const availableSubAreas = useMemo(() => {
    if (selectedAreaId === "all") {
      return subAreas;
    }
    return subAreas.filter((subArea) => subArea.areaId === selectedAreaId);
  }, [selectedAreaId, subAreas]);

  const selectedAreaSubAreas = useMemo(() => {
    if (!selectedArea) {
      return [];
    }
    return subAreas.filter((subArea) => subArea.areaId === selectedArea.id);
  }, [selectedArea, subAreas]);

  const availableBranches = useMemo(() => {
    return branches.filter((branch: MarketingBranch) => {
      if (selectedAreaId !== "all" && branch.areaId !== selectedAreaId) {
        return false;
      }
      if (selectedSubAreaId !== "all") {
        return (branch.subAreaId ?? null) === selectedSubAreaId;
      }
      return true;
    });
  }, [branches, selectedAreaId, selectedSubAreaId]);

  useEffect(() => {
    if (selectedSubAreaId === "all") {
      return;
    }
    const exists = availableSubAreas.some(
      (subArea) => subArea.id === selectedSubAreaId,
    );
    if (!exists) {
      setSelectedSubAreaId("all");
    }
  }, [availableSubAreas, selectedSubAreaId]);

  useEffect(() => {
    if (selectedBranchId === "all") {
      return;
    }
    const exists = availableBranches.some(
      (branch) => branch.id === selectedBranchId,
    );
    if (!exists) {
      setSelectedBranchId("all");
    }
  }, [availableBranches, selectedBranchId]);

  const normalizedBranchId =
    selectedBranchId === "all" ? null : selectedBranchId;

  const filteredMembers = useMemo(() => {
    const normalizedStart = startDate;
    const normalizedEnd = endDate < startDate ? startDate : endDate;
    if (normalizedEnd !== endDate) {
      setEndDate(normalizedEnd);
    }

    return allMembers.filter(({ joinedDate, removedDate }) => {
      // Show all members (including those who joined before the date range)
      // Only filter out removed members
      if (removedDate) {
        return false;
      }

      // Don't filter by joined date to show all members
      // The date range should be used for trends/charts, not for filtering the member list
      return true;
    });
  }, [allMembers]); // Remove startDate and endDate dependencies

  const { areaCounts, subAreaCounts, branchCounts } = useMemo(() => {
    const areaMap = new Map<number, number>();
    const subAreaMap = new Map<number, number>();
    const branchMap = new Map<number, number>();

    filteredMembers.forEach(({ areaId, subAreaId, branchId }) => {
      if (typeof areaId === "number") {
        areaMap.set(areaId, (areaMap.get(areaId) ?? 0) + 1);
      }
      if (typeof subAreaId === "number") {
        subAreaMap.set(subAreaId, (subAreaMap.get(subAreaId) ?? 0) + 1);
      }
      branchMap.set(branchId, (branchMap.get(branchId) ?? 0) + 1);
    });

    return {
      areaCounts: areaMap,
      subAreaCounts: subAreaMap,
      branchCounts: branchMap,
    };
  }, [filteredMembers]);

  const chartSegments: ChartSegment[] = useMemo(() => {
    let segments: ChartSegment[];

    if (selectedAreaId === "all") {
      segments = areas.map((area) => ({
        key: `area-${area.id}`,
        label: area.name,
        members: areaCounts.get(area.id) ?? 0,
      }));
    } else if (!selectedArea) {
      segments = [];
    } else {
      const areaSubAreas = selectedAreaSubAreas;
      const areaBranches = branches.filter(
        (branch) => branch.areaId === selectedArea.id,
      );

      if (areaSubAreas.length > 0) {
        if (normalizedBranchId !== null || selectedSubAreaId !== "all") {
          const branchList = areaBranches.filter((branch) => {
            if (selectedSubAreaId === "all") {
              return true;
            }
            return (branch.subAreaId ?? null) === selectedSubAreaId;
          });
          segments = branchList.map((branch) => ({
            key: `branch-${branch.id}`,
            label: branch.name,
            members: branchCounts.get(branch.id) ?? 0,
            highlight: branch.id === normalizedBranchId,
          }));
        } else {
          segments = areaSubAreas.map((subArea) => ({
            key: `sub-${subArea.id}`,
            label: subArea.name,
            members: subAreaCounts.get(subArea.id) ?? 0,
          }));
        }
      } else {
        segments = areaBranches.map((branch) => ({
          key: `branch-${branch.id}`,
          label: branch.name,
          members: branchCounts.get(branch.id) ?? 0,
          highlight: branch.id === normalizedBranchId,
        }));
      }
    }

    return segments.sort((a, b) => {
      if (b.members !== a.members) {
        return b.members - a.members;
      }
      return a.label.localeCompare(b.label);
    });
  }, [
    selectedAreaId,
    selectedArea,
    selectedSubAreaId,
    normalizedBranchId,
    areaCounts,
    subAreaCounts,
    branchCounts,
    areas,
    subAreas,
    branches,
  ]);

  const totalMembers = filteredMembers.length;

  const resolvedBranch = useMemo(
    () =>
      normalizedBranchId === null
        ? null
        : (availableBranches.find(
          (branch) => branch.id === normalizedBranchId,
        ) ?? null),
    [availableBranches, normalizedBranchId],
  );

  const resolvedSubAreaName = useMemo(() => {
    if (selectedSubAreaId === "all") {
      return null;
    }
    return (
      availableSubAreas.find((sub) => sub.id === selectedSubAreaId)?.name ??
      null
    );
  }, [availableSubAreas, selectedSubAreaId]);

  const summaryTitle = useMemo(() => {
    if (selectedAreaId === "all") {
      return "Member distribution across areas";
    }
    if (selectedArea && selectedAreaSubAreas.length > 0) {
      if (selectedSubAreaId === "all") {
        return `Sub-area membership in ${selectedArea.name}`;
      }
      return `Branch membership in ${resolvedSubAreaName ?? "selected sub-area"}`;
    }
    return `Branch membership in ${selectedArea?.name ?? "selected area"}`;
  }, [
    selectedAreaId,
    selectedArea,
    selectedAreaSubAreas.length,
    selectedSubAreaId,
    resolvedSubAreaName,
  ]);

  const chartTotal = useMemo(
    () => chartSegments.reduce((sum, segment) => sum + segment.members, 0),
    [chartSegments],
  );

  const timelineData = useMemo(() => {
    const timelineDates = buildDateRange(startDate, endDate);
    if (timelineDates.length === 0) {
      return [];
    }

    // Use all members instead of filtering by date range for timeline
    const allMembersForTimeline = allMembers.filter((entry) => {
      const { areaId, subAreaId, branchId } = entry;

      // Apply area/subarea/branch filters but not date filters
      if (selectedAreaId !== "all" && areaId !== selectedAreaId) {
        return false;
      }

      const areaHasSubAreas = selectedArea
        ? selectedAreaSubAreas.length > 0
        : false;
      if (selectedSubAreaId !== "all") {
        if (selectedAreaId === "all") {
          if (subAreaId !== selectedSubAreaId) {
            return false;
          }
        } else if (areaHasSubAreas && subAreaId !== selectedSubAreaId) {
          return false;
        }
      }

      if (normalizedBranchId !== null && branchId !== normalizedBranchId) {
        return false;
      }

      return true;
    });

    const baselineIds = new Set<number>();
    allMembersForTimeline.forEach(({ member, joinedDate, removedDate }) => {
      if (!joinedDate) {
        return;
      }
      const createdBeforeStart = joinedDate < startDate;
      const activeAtStart = !removedDate || removedDate >= startDate;
      if (createdBeforeStart && activeAtStart) {
        baselineIds.add(member.id);
      }
    });

    const additionsByDay = new Map<string, number[]>();
    const removalsByDay = new Map<string, number[]>();

    allMembersForTimeline.forEach(({ member, joinedDate, removedDate }) => {
      if (joinedDate && joinedDate >= startDate && joinedDate <= endDate) {
        if (!additionsByDay.has(joinedDate)) {
          additionsByDay.set(joinedDate, []);
        }
        additionsByDay.get(joinedDate)!.push(member.id);
      }
      if (removedDate && removedDate >= startDate && removedDate <= endDate) {
        if (!removalsByDay.has(removedDate)) {
          removalsByDay.set(removedDate, []);
        }
        removalsByDay.get(removedDate)!.push(member.id);
      }
    });

    const activityLine = timelineDates.map((date, index) => {
      if (index === 0) {
        return { date, total: baselineIds.size };
      }
      return { date, total: 0 };
    });

    const activeSet = new Set<number>(baselineIds);
    activityLine.forEach((point) => {
      additionsByDay.get(point.date)?.forEach((id) => activeSet.add(id));
      removalsByDay.get(point.date)?.forEach((id) => activeSet.delete(id));
      point.total = activeSet.size;
    });

    if (trendView === "day") {
      return activityLine.map((entry) => ({
        key: entry.date,
        label: new Date(entry.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        count: entry.total,
      }));
    }

    if (trendView === "week") {
      const weekBuckets = new Map<
        string,
        {
          key: string;
          label: string;
          count: number;
        }
      >();
      activityLine.forEach((entry) => {
        const date = new Date(entry.date);
        const week = getWeekNumber(date).toString().padStart(2, "0");
        const key = `${date.getUTCFullYear()}-W${week}`;
        if (
          !weekBuckets.has(key) ||
          entry.total > weekBuckets.get(key)!.count
        ) {
          weekBuckets.set(key, {
            key,
            label: `Week ${week} (${date.getUTCFullYear()})`,
            count: entry.total,
          });
        }
      });
      return Array.from(weekBuckets.values()).sort((a, b) =>
        a.key > b.key ? 1 : -1,
      );
    }

    const monthBuckets = new Map<
      string,
      {
        key: string;
        label: string;
        count: number;
      }
    >();
    activityLine.forEach((entry) => {
      const date = new Date(entry.date);
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (
        !monthBuckets.has(monthKey) ||
        entry.total > monthBuckets.get(monthKey)!.count
      ) {
        monthBuckets.set(monthKey, {
          key: monthKey,
          label: formatMonthLabel(date),
          count: entry.total,
        });
      }
    });
    return Array.from(monthBuckets.values()).sort((a, b) =>
      a.key > b.key ? 1 : -1,
    );
  }, [allMembers, startDate, endDate, trendView, selectedAreaId, selectedArea, selectedAreaSubAreas, selectedSubAreaId, normalizedBranchId]);

  const memberDetails = useMemo(() => {
    return allMembers
      .filter((entry) => {
        const { joinedDate, areaId, subAreaId, branchId, removedDate } = entry;

        // Only filter out removed members
        if (removedDate) {
          return false;
        }

        // Apply area/subarea/branch filters but not date filters
        if (selectedAreaId !== "all" && areaId !== selectedAreaId) {
          return false;
        }

        const areaHasSubAreas = selectedArea
          ? selectedAreaSubAreas.length > 0
          : false;
        if (selectedSubAreaId !== "all") {
          if (selectedAreaId === "all") {
            if (subAreaId !== selectedSubAreaId) {
              return false;
            }
          } else if (areaHasSubAreas && subAreaId !== selectedSubAreaId) {
            return false;
          }
        }

        if (normalizedBranchId !== null && branchId !== normalizedBranchId) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aDate = a.joinedDate ?? "";
        const bDate = b.joinedDate ?? "";
        return bDate.localeCompare(aDate); // Sort by newest first
      });
  }, [allMembers, selectedAreaId, selectedArea, selectedAreaSubAreas, selectedSubAreaId, normalizedBranchId]);

  const activeMembers = useMemo(
    () => memberDetails.filter(({ removedDate }) => !removedDate),
    [memberDetails],
  );

  const removedMembers = useMemo(
    () => memberDetails.filter(({ removedDate }) => !!removedDate),
    [memberDetails],
  );

  const handleAreaChange = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedAreaId(next);
    setSelectedSubAreaId("all");
    setSelectedBranchId("all");
  };

  const handleSubAreaChange = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedSubAreaId(next);
    setSelectedBranchId("all");
  };

  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value === "all" ? "all" : Number(value));
  };

  const handleStartDateChange = (value: string) => {
    if (!value) return;
    setStartDate(value);
    if (value > endDate) {
      setEndDate(value);
    }
  };

  const handleEndDateChange = (value: string) => {
    if (!value) return;
    setEndDate(value < startDate ? startDate : value);
  };

  // Get current filters for API calls
  const getCurrentFilters = useCallback(() => {
    const filters: any = {};
    if (selectedAreaId !== "all") filters.areaId = selectedAreaId;
    if (selectedSubAreaId !== "all") filters.subAreaId = selectedSubAreaId;
    if (normalizedBranchId !== null) filters.branchId = normalizedBranchId;
    // Remove date filters for individual VIP records - show all members
    return filters;
  }, [selectedAreaId, selectedSubAreaId, normalizedBranchId]); // Remove date dependencies

  // Load active members with pagination
  const loadActiveMembers = useCallback(async (page: number, reset: boolean = false) => {
    if (activeMembersLoading || (!activeMembersHasMore && !reset)) return;

    setActiveMembersLoading(true);
    try {
      const filters = getCurrentFilters();
      const paginatedResponse = await vipMemberService.listActiveMembersPaginated(page, PAGE_SIZE, filters);
      const enriched = flattenMembers(paginatedResponse.data, { areaMap, subAreaMap, branchMap });

      if (reset) {
        setActiveMembersData(enriched);
        setActiveMembersPage(0);
      } else {
        setActiveMembersData(prev => [...prev, ...enriched]);
      }

      // Update hasMore based on total count from backend
      setActiveMembersHasMore((page + 1) * PAGE_SIZE < paginatedResponse.totalCount);
      setActiveMembersPage(page);
    } catch (err) {
      console.error('Failed to load active members:', err);
    } finally {
      setActiveMembersLoading(false);
    }
  }, [activeMembersLoading, activeMembersHasMore, getCurrentFilters, areaMap, subAreaMap, branchMap]);

  // Load removed members with pagination
  const loadRemovedMembers = useCallback(async (page: number, reset: boolean = false) => {
    if (removedMembersLoading || (!removedMembersHasMore && !reset)) return;

    setRemovedMembersLoading(true);
    try {
      const filters = getCurrentFilters();
      const paginatedResponse = await vipMemberService.listRemovedMembersPaginated(page, PAGE_SIZE, filters);
      const enriched = flattenMembers(paginatedResponse.data, { areaMap, subAreaMap, branchMap });

      if (reset) {
        setRemovedMembersData(enriched);
        setRemovedMembersPage(0);
      } else {
        setRemovedMembersData(prev => [...prev, ...enriched]);
      }

      // Update hasMore based on total count from backend
      setRemovedMembersHasMore((page + 1) * PAGE_SIZE < paginatedResponse.totalCount);
      setRemovedMembersPage(page);
    } catch (err) {
      console.error('Failed to load removed members:', err);
    } finally {
      setRemovedMembersLoading(false);
    }
  }, [removedMembersLoading, removedMembersHasMore, getCurrentFilters, areaMap, subAreaMap, branchMap]);

  // Reset pagination when filters change
  const resetMemberData = useCallback(() => {
    setActiveMembersData([]);
    setRemovedMembersData([]);
    setActiveMembersPage(0);
    setRemovedMembersPage(0);
    setActiveMembersHasMore(true);
    setRemovedMembersHasMore(true);
  }, []);

  // Scroll detection handlers
  const handleActiveScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 100) {
      if (activeMembersHasMore && !activeMembersLoading) {
        loadActiveMembers(activeMembersPage + 1);
      }
    }
  }, [activeMembersPage, activeMembersHasMore, activeMembersLoading, loadActiveMembers]);

  const handleRemovedScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 100) {
      if (removedMembersHasMore && !removedMembersLoading) {
        loadRemovedMembers(removedMembersPage + 1);
      }
    }
  }, [removedMembersPage, removedMembersHasMore, removedMembersLoading, loadRemovedMembers]);

  // Load initial data when filters change
  useEffect(() => {
    resetMemberData();
    loadActiveMembers(0, true);
    loadRemovedMembers(0, true);
  }, [getCurrentFilters, resetMemberData]);

  return (
    <MarketingServiceGuard>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300/70">
            Marketing ◦ VIP network
          </p>
          <h1 className="text-3xl font-semibold text-white">
            VIP member footprint
          </h1>
          <p className="text-sm text-slate-300">
            Explore how VIP members are distributed across areas, sub-areas, and
            branches to understand where growth is concentrated.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-200/80">
                <span>Locations</span>
                <button
                  className="rounded-full border border-white/10 px-3 py-1 text-[0.6rem] text-white/70 hover:text-white"
                  onClick={() => {
                    setSelectedAreaId("all");
                    setSelectedSubAreaId("all");
                    setSelectedBranchId("all");
                  }}
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

                {availableBranches.length > 0 && (
                  <div className="flex flex-col text-xs text-slate-300 md:col-span-2">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Branch
                    </label>
                    <select
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      value={selectedBranchId}
                      onChange={(event) =>
                        handleBranchChange(event.target.value)
                      }
                    >
                      <option value="all">All branches</option>
                      {availableBranches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-white lg:w-72">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-200/80">
                <span>Date range</span>
                <button
                  className="rounded-full border border-white/10 px-3 py-1 text-[0.6rem] text-white/70 hover:text-white"
                  onClick={() => {
                    const earliest = getEarliestCreatedAt(allMembers);
                    setStartDate(earliest);
                    setEndDate(new Date().toISOString().split("T")[0]);
                  }}
                >
                  Today
                </button>
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
                    onChange={(event) =>
                      handleEndDateChange(event.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                Members overview
              </p>
              <h2 className="text-xl font-semibold text-white">
                {summaryTitle}
              </h2>
              <p className="text-sm text-slate-300">
                {selectedAreaId === "all"
                  ? `Total VIP members: ${totalMembers}`
                  : resolvedBranch
                    ? `${branchCounts.get(resolvedBranch.id) ?? 0} member(s) enrolled in ${resolvedBranch.name}`
                    : `${chartTotal} member(s) within current focus`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-right text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Total members shown
              </p>
              <p className="text-2xl font-semibold text-white">
                {chartTotal.toLocaleString()}
              </p>
            </div>
          </div>

          <div className={`mt-6 h-96 w-full ${chartSegments.length > 8 ? 'overflow-x-auto scrollbar-hide' : ''}`}>
            {chartLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Loading chart data...
              </div>
            ) : chartSegments.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No members in the selected segment.
              </div>
            ) : (
              <div style={{
                minWidth: chartSegments.length > 8 ? Math.max(800, chartSegments.length * 100) : '100%',
                height: '100%'
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartSegments}
                    margin={{ top: 24, left: 16, right: 16, bottom: chartSegments.length > 8 ? 60 : 8 }}
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
                      angle={chartSegments.length > 5 ? -20 : 0}
                      height={chartSegments.length > 8 ? 70 : (chartSegments.length > 5 ? 70 : 40)}
                      tickMargin={12}
                    />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={TOOLTIP_STYLES.content}
                      labelStyle={TOOLTIP_STYLES.label}
                      itemStyle={TOOLTIP_STYLES.item}
                      formatter={(value: number, name) => [
                        `${value.toLocaleString()} member(s)`,
                        name ?? "Members",
                      ]}
                    />
                    <Bar dataKey="members" radius={[12, 12, 0, 0]} barSize={chartSegments.length > 8 ? 64 : 48}>
                      {chartSegments.map((segment) => (
                        <Cell
                          key={segment.key}
                          fill={
                            segment.highlight
                              ? BAR_COLORS.highlight
                              : BAR_COLORS.base
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="members"
                        position="top"
                        fill="#f1f5f9"
                        fontSize={12}
                        formatter={(value: number) => value.toLocaleString()}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                Momentum
              </p>
              <h2 className="text-xl font-semibold text-white">
                New VIPs over time
              </h2>
              <p className="text-sm text-slate-300">
                Visualize how many members registered in the selected period.
                Deleted members are excluded automatically.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-900/60 p-1 text-xs uppercase tracking-[0.2em] text-slate-400">
              {TREND_VIEW_OPTIONS.map((view) => (
                <button
                  key={view.key}
                  className={`rounded-full px-4 py-1 ${trendView === view.key
                    ? "bg-amber-400/20 text-white"
                    : "text-slate-400 hover:text-white"
                    }`}
                  onClick={() => setTrendView(view.key)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 h-72 w-full">
            {timelineData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No members in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={timelineData}
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
                      `${value.toLocaleString()} total member(s)`,
                      "Total Members",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#fb923c"
                    strokeWidth={3}
                    dot={{ stroke: "#fed7aa", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                Member details
              </p>
              <h2 className="text-xl font-semibold text-white">
                Individual VIP records
              </h2>
              <p className="text-sm text-slate-300">
                {activeMembersData.length === 0 && removedMembersData.length === 0
                  ? "No members match the current filters."
                  : `${activeMembersData.length + removedMembersData.length} of ${chartTotal} member${chartTotal === 1 ? "" : "s"} shown with their registration and removal remarks.`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-right text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Active filters
              </p>
              <p className="text-white">
                {selectedAreaId === "all"
                  ? "All areas"
                  : (selectedArea?.name ?? "Custom")}{" "}
                ·{" "}
                {selectedSubAreaId === "all"
                  ? "All sub areas"
                  : (resolvedSubAreaName ?? "N/A")}{" "}
                ·{" "}
                {normalizedBranchId === null
                  ? "All branches"
                  : (resolvedBranch?.name ?? "Custom")}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-6">
            <div className="max-h-112 overflow-auto rounded-2xl border border-emerald-400/40 bg-emerald-950/20 shadow-inner shadow-emerald-900/30 ring-1 ring-emerald-400/30"
              onScroll={handleActiveScroll}
              ref={activeTableRef}>
              <div className="flex items-center justify-between border-b border-emerald-400/30 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
                    Active members
                  </p>
                  <p className="text-sm text-emerald-100/80">
                    {activeMembersData.length === 0
                      ? "No active members"
                      : `${activeMembersData.length} active member${activeMembersData.length === 1 ? "" : "s"}${activeMembersHasMore ? ' (scrolling for more)' : ''}`}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                  {activeMembersLoading ? 'Loading...' : 'Live'}
                </span>
              </div>
              <table className="min-w-full divide-y divide-emerald-400/15 text-sm">
                <thead className="sticky top-0 z-10 bg-emerald-950/90 backdrop-blur text-xs uppercase tracking-[0.3em] text-emerald-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Phone</th>
                    <th className="px-4 py-3 text-left font-medium">Area</th>
                    <th className="px-4 py-3 text-left font-medium">Branch</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Registration Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeMembersData.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-emerald-200/70"
                        colSpan={5}
                      >
                        No active members for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    activeMembersData.map((entry, index) => (
                      <tr
                        key={`${entry.member.id}-active-${index}`}
                        className={
                          index % 2 === 0
                            ? "bg-emerald-400/5"
                            : "bg-emerald-400/10"
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">
                            {entry.member.name}
                          </p>
                          <p className="text-xs text-emerald-100/70">
                            Joined {entry.joinedDate ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-emerald-50/90">
                          {entry.member.phone}
                        </td>
                        <td className="px-4 py-3 text-emerald-50/90">
                          {entry.areaName}
                        </td>
                        <td className="px-4 py-3 text-emerald-50/90">
                          {entry.branchName}
                        </td>
                        <td className="px-4 py-3 text-emerald-50/90">
                          {entry.member.createRemark ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                  {activeMembersLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-center text-emerald-200/70">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400"></div>
                          <span>Loading more members...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="max-h-112 overflow-auto rounded-2xl border border-rose-400/40 bg-rose-950/20 shadow-inner shadow-rose-900/30 ring-1 ring-rose-400/30"
              onScroll={handleRemovedScroll}
              ref={removedTableRef}>
              <div className="flex items-center justify-between border-b border-rose-400/30 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-rose-300/80">
                    Removed members
                  </p>
                  <p className="text-sm text-rose-100/80">
                    {removedMembersData.length === 0
                      ? "No removed members"
                      : `${removedMembersData.length} removed member${removedMembersData.length === 1 ? "" : "s"}${removedMembersHasMore ? ' (scrolling for more)' : ''}`}
                  </p>
                </div>
                <span className="rounded-full bg-rose-400/20 px-3 py-1 text-xs font-semibold text-rose-100">
                  {removedMembersLoading ? 'Loading...' : 'Archived'}
                </span>
              </div>
              <table className="min-w-full divide-y divide-rose-400/15 text-sm">
                <thead className="sticky top-0 z-10 bg-rose-950/90 backdrop-blur text-xs uppercase tracking-[0.3em] text-rose-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Phone</th>
                    <th className="px-4 py-3 text-left font-medium">Area</th>
                    <th className="px-4 py-3 text-left font-medium">Branch</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Removed Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {removedMembersData.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-rose-200/70"
                        colSpan={5}
                      >
                        No removed members for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    removedMembersData.map((entry, index) => (
                      <tr
                        key={`${entry.member.id}-removed-${index}`}
                        className={
                          index % 2 === 0 ? "bg-rose-400/5" : "bg-rose-400/10"
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">
                            {entry.member.name}
                          </p>
                          <p className="text-xs text-rose-100/70">
                            Joined {entry.joinedDate ?? "—"} · Removed{" "}
                            {entry.removedDate ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-rose-50/90">
                          {entry.member.phone}
                        </td>
                        <td className="px-4 py-3 text-rose-50/90">
                          {entry.areaName}
                        </td>
                        <td className="px-4 py-3 text-rose-50/90">
                          {entry.branchName}
                        </td>
                        <td className="px-4 py-3 text-rose-50/90">
                          {entry.member.deleteRemark ?? "Removed without note"}
                        </td>
                      </tr>
                    ))
                  )}
                  {removedMembersLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-center text-rose-200/70">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-400"></div>
                          <span>Loading more members...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </MarketingServiceGuard>
  );
}

export default VIPMembersDashboardPage;
