"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MarketingServiceGuard } from "@/components/marketing-service/MarketingServiceGuard";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  marketingHierarchyService,
  MarketingArea,
  MarketingBranch,
  MarketingSubArea,
} from "@/services/marketing-service/marketingHierarchyService";
import {
  vipMemberService,
  VipMember,
  VipMemberPayload,
} from "@/services/marketing-service/vipMemberService";
import {
  marketingUserAssignmentService,
  MarketingUserAssignment,
} from "@/services/marketing-service/marketingUserAssignmentService";
import { useQuery } from "@tanstack/react-query";

type FilterValue = number | "all";
type SubAreaSelection = number | "all";

type MemberFormState = {
  name: string;
  phone: string;
  areaId?: number;
  subAreaId: SubAreaSelection;
  branchId?: number;
  memberCreatedAt: string;
  memberDeletedAt?: string;
  createRemark?: string;
  deleteRemark?: string;
};

const today = new Date().toISOString().split("T")[0];

const defaultForm: MemberFormState = {
  name: "",
  phone: "",
  areaId: undefined,
  subAreaId: "all",
  branchId: undefined,
  memberCreatedAt: today,
  memberDeletedAt: "",
  createRemark: "",
  deleteRemark: "",
};

export default function MarketingVipManageUserPage() {
  const { showToast } = useToast();
  const { user, isAuthenticated, isLoading, hasServiceAccess } = useAuth();
  const canAccessMarketing = isAuthenticated && hasServiceAccess("marketing");
  const currentUserId = user?.id ?? null;

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
    staleTime: 5 * 60 * 1000, // 5 minutes (more dynamic data)
  });

  const { data: userAssignments = [], isLoading: assignmentsLoading, error: assignmentsError } = useQuery({
    queryKey: ["marketing-user-assignments", currentUserId],
    queryFn: () => currentUserId ? marketingUserAssignmentService.getUserAssignments() : Promise.resolve([]),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!currentUserId,
  });

  const lookupLoading = areasLoading || subAreasLoading || branchesLoading;

  const [filters, setFilters] = useState<{
    areaId: FilterValue;
    subAreaId: FilterValue;
    branchId: FilterValue;
  }>({
    areaId: "all",
    subAreaId: "all",
    branchId: "all",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const pageSizeOptions = [
    { value: 5, label: "5" },
    { value: 10, label: "10" },
    { value: 50, label: "50" },
    { value: 100, label: "100" },
    { value: 1000, label: "1000" },
  ];

  const [form, setForm] = useState<MemberFormState>(defaultForm);
  const [editingMember, setEditingMember] = useState<VipMember | null>(null);
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [parsedMembers, setParsedMembers] = useState<Array<{ name: string; phone: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [paginatedMembersLoading, setPaginatedMembersLoading] = useState(false);
  const [paginatedMembers, setPaginatedMembers] = useState<VipMember[]>([]);
  const [totalMembersCount, setTotalMembersCount] = useState(0);

  const parsePasteText = (text: string) => {
    const lines = text.trim().split('\n');
    const members: Array<{ name: string; phone: string }> = [];

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        let name = parts[0].trim();
        let phone = parts[1].trim().replace(/\s/g, '');

        // Add 0 prefix if phone doesn't start with 0
        if (phone && !phone.startsWith('0')) {
          phone = '0' + phone;
        }

        if (name && phone) {
          members.push({ name, phone });
        }
      }
    }

    return members;
  };

  const handleBulkCreate = async () => {
    if (!form.branchId) {
      showToast("Please select a branch first", "error");
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let duplicateCount = 0;
    const duplicates: string[] = [];

    for (const member of parsedMembers) {
      // Check for phone number duplicate
      if (checkPhoneDuplicate(member.phone)) {
        duplicateCount++;
        const existingMember = members.find((m) => m.phone.trim().replace(/\s/g, '') === member.phone.trim().replace(/\s/g, ''));
        if (existingMember) {
          duplicates.push(`${member.name} (already exists as ${existingMember.name})`);
        }
        continue; // Skip this member
      }

      try {
        await vipMemberService.createMember({
          name: member.name,
          phone: member.phone.replace(/\s/g, ''),
          branchId: form.branchId,
          memberCreatedAt: form.memberCreatedAt,
          createRemark: form.createRemark,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to create ${member.name}:`, error);
        failCount++;
      }
    }

    // Show results
    if (successCount > 0) {
      showToast(`Successfully created ${successCount} member${successCount > 1 ? 's' : ''}`, "success");
    }
    if (failCount > 0) {
      showToast(`Failed to create ${failCount} member${failCount > 1 ? 's' : ''}`, "error");
    }
    if (duplicateCount > 0) {
      showToast(`Skipped ${duplicateCount} duplicate member${duplicateCount > 1 ? 's' : ''}`, "error");
      console.log('Skipped duplicates:', duplicates);
    }

    setPasteText("");
    setParsedMembers([]);
    setFilters((prev) => ({ ...prev }));
  };


  useEffect(() => {
    if (!canAccessMarketing || isLoading || !currentUserId) {
      return;
    }

    // Apply user assignments to filters if no manual filters are set
    if (userAssignments.length > 0 && filters.areaId === "all" && filters.subAreaId === "all" && filters.branchId === "all") {
      // Extract unique area, subarea, and branch IDs from assignments
      const areaIds = [...new Set(userAssignments.filter(a => a.areaId).map(a => a.areaId!))];
      const subAreaIds = [...new Set(userAssignments.filter(a => a.subAreaId).map(a => a.subAreaId!))];
      const branchIds = [...new Set(userAssignments.filter(a => a.branchId).map(a => a.branchId!))];

      // Set filters based on assignments (prioritize more specific assignments)
      if (branchIds.length > 0) {
        // If user has branch assignments, use them
        if (branchIds.length === 1) {
          setFilters(prev => ({ ...prev, branchId: branchIds[0] }));
        }
        // Set subarea and area based on first branch assignment
        const firstAssignment = userAssignments.find(a => a.branchId);
        if (firstAssignment?.subAreaId) {
          setFilters(prev => ({ ...prev, subAreaId: firstAssignment.subAreaId! }));
        }
        if (firstAssignment?.areaId) {
          setFilters(prev => ({ ...prev, areaId: firstAssignment.areaId! }));
        }
      } else if (subAreaIds.length > 0) {
        // If user has subarea assignments but no branch assignments
        if (subAreaIds.length === 1) {
          setFilters(prev => ({ ...prev, subAreaId: subAreaIds[0] }));
        }
        // Set area based on first subarea assignment
        const firstAssignment = userAssignments.find(a => a.subAreaId);
        if (firstAssignment?.areaId) {
          setFilters(prev => ({ ...prev, areaId: firstAssignment.areaId! }));
        }
      } else if (areaIds.length > 0) {
        // If user only has area assignments
        if (areaIds.length === 1) {
          setFilters(prev => ({ ...prev, areaId: areaIds[0] }));
        }
      }
    }
  }, [canAccessMarketing, isLoading, currentUserId, userAssignments, filters.areaId, filters.subAreaId, filters.branchId]);

  // Load paginated members based on filters
  useEffect(() => {
    if (!canAccessMarketing || isLoading || !currentUserId) {
      return;
    }

    const loadPaginatedMembers = async () => {
      setPaginatedMembersLoading(true);
      try {
        const params: {
          areaId?: number;
          subAreaId?: number;
          branchId?: number;
          page?: number;
          size?: number;
          memberQuery?: string;
        } = {
          page: currentPage,
          size: pageSize,
        };

        if (filters.areaId !== "all") {
          params.areaId = filters.areaId;
        }
        if (filters.subAreaId !== "all") {
          params.subAreaId = filters.subAreaId;
        }
        if (filters.branchId !== "all") {
          params.branchId = filters.branchId;
        }
        if (searchQuery.trim()) {
          params.memberQuery = searchQuery.trim();
        }

        const data = await vipMemberService.listMembers(params);
        setPaginatedMembers(data);
        // Note: You might need to add totalCount to the API response
        setTotalMembersCount(data.length);
        setCurrentPage(1); // Reset to first page when filters change
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Failed to load members",
          "error",
        );
      } finally {
        setPaginatedMembersLoading(false);
      }
    };

    void loadPaginatedMembers();
  }, [canAccessMarketing, isLoading, currentUserId, filters.areaId, filters.subAreaId, filters.branchId, searchQuery, currentPage, pageSize]);

  const filteredSubAreasForForm = useMemo(() => {
    // If no area selected, show all sub areas
    if (!form.areaId) return subAreas;
    return subAreas.filter((subArea) => subArea.areaId === form.areaId);
  }, [form.areaId, subAreas]);

  const filteredBranchesForForm = useMemo(() => {
    // If no area selected, show all branches
    if (!form.areaId) return branches;

    return branches.filter((branch) => {
      if (branch.areaId !== form.areaId) {
        return false;
      }
      if (form.subAreaId && form.subAreaId !== "all") {
        return branch.subAreaId === form.subAreaId;
      }
      return true;
    });
  }, [form.areaId, form.subAreaId, branches]);

  const filterSubAreas = useMemo(() => {
    // If "all areas" selected, show all sub areas
    if (filters.areaId === "all") {
      return subAreas;
    }
    return subAreas.filter((subArea) => subArea.areaId === filters.areaId);
  }, [filters.areaId, subAreas]);

  const filterBranches = useMemo(() => {
    // If "all areas" selected, show all branches
    if (filters.areaId === "all") {
      return branches;
    }
    return branches.filter((branch) => {
      if (branch.areaId !== filters.areaId) {
        return false;
      }
      if (filters.subAreaId === "all") {
        return true;
      }
      return branch.subAreaId === filters.subAreaId;
    });
  }, [branches, filters.areaId, filters.subAreaId]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return members;
    }
    const query = searchQuery.toLowerCase().trim();
    return members.filter((member) =>
      member.name.toLowerCase().includes(query) ||
      member.phone.toLowerCase().includes(query) ||
      member.branchName?.toLowerCase().includes(query) ||
      member.areaName?.toLowerCase().includes(query) ||
      member.subAreaName?.toLowerCase().includes(query)
    );
  }, [members, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredMembers.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedMembersData = filteredMembers.slice(startIndex, endIndex);

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Check if current user can edit/delete a member
  const canEditMember = (member: VipMember) => {
    // Root user can edit all
    if (user?.username === "root") return true;
    // User can edit if they created the member
    return member.createdBy === user?.id;
  };

  useEffect(() => {
    // Only clear branch selection if area is selected and branch is not in filtered list
    if (
      form.areaId &&
      form.branchId &&
      !filteredBranchesForForm.some((branch) => branch.id === form.branchId)
    ) {
      setForm((prev) => ({ ...prev, branchId: undefined }));
    }
  }, [filteredBranchesForForm, form.branchId, form.areaId]);

  const resetForm = (keepLocation = false) => {
    if (keepLocation && form.areaId && form.branchId) {
      // Keep location data for new member creation
      setForm({
        ...defaultForm,
        memberCreatedAt: new Date().toISOString().split("T")[0],
        areaId: form.areaId,
        subAreaId: form.subAreaId,
        branchId: form.branchId,
      });
    } else {
      // Full reset for editing or manual reset
      setForm({
        ...defaultForm,
        memberCreatedAt: new Date().toISOString().split("T")[0],
      });
    }
    setEditingMember(null);
  };

  const handleFilterAreaChange = (value: string) => {
    const nextValue: FilterValue = value === "all" ? "all" : Number(value);
    setFilters({
      areaId: nextValue,
      subAreaId: "all",
      branchId: "all",
    });
  };

  const handleFilterSubAreaChange = (value: string) => {
    const nextValue: FilterValue = value === "all" ? "all" : Number(value);
    setFilters((prev) => ({
      ...prev,
      subAreaId: nextValue,
      branchId: "all",
    }));
  };

  const handleFilterBranchChange = (value: string) => {
    const nextValue: FilterValue = value === "all" ? "all" : Number(value);
    setFilters((prev) => ({
      ...prev,
      branchId: nextValue,
    }));
  };

  const handleFormAreaChange = (value: string) => {
    if (!value) {
      setForm((prev) => ({
        ...prev,
        areaId: undefined,
        subAreaId: "all",
        branchId: undefined,
      }));
      return;
    }
    const nextAreaId = Number(value);
    setForm((prev) => ({
      ...prev,
      areaId: nextAreaId,
      subAreaId: "all",
      branchId: undefined,
    }));
  };

  const handleFormSubAreaChange = (value: string) => {
    const nextValue: SubAreaSelection = value === "all" ? "all" : Number(value);
    setForm((prev) => ({
      ...prev,
      subAreaId: nextValue,
      branchId: undefined,
    }));
  };

  const handleFormBranchChange = (value: string) => {
    if (!value) {
      setForm((prev) => ({ ...prev, branchId: undefined }));
      return;
    }
    setForm((prev) => ({ ...prev, branchId: Number(value) }));
  };

  const checkPhoneDuplicate = (phone: string) => {
    const normalizedPhone = phone.trim().replace(/\s/g, '');
    const existingMember = members.find(member =>
      member.phone.trim().replace(/\s/g, '') === normalizedPhone
    );

    if (existingMember) {
      const branch = branches.find(b => b.id === existingMember.branchId);
      const area = branch ? areas.find(a => a.id === branch.areaId) : null;
      const location = area && branch ? `${area.name} - ${branch.name}` : branch?.name || 'Unknown';
      showToast(`Phone number already exists for ${existingMember.name} at ${location}`, "error");
      return true;
    }
    return false;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // Check if we have quick paste data or single member form data
    const hasSingleMemberData = form.name.trim() && form.phone.trim();

    if (!parsedMembers.length && !hasSingleMemberData) {
      showToast("Please enter member name and phone number, or use quick paste", "error");
      return;
    }

    // For quick paste, validate branch selection
    if (parsedMembers.length > 0 && !form.branchId) {
      showToast("Please select a branch for quick paste members", "error");
      return;
    }

    // For single member, validate individual fields
    if (!parsedMembers.length) {
      if (!form.name.trim()) {
        showToast("Member name is required", "error");
        return;
      }
      if (!form.phone.trim()) {
        showToast("Phone number is required", "error");
        return;
      }

      // Check for phone number duplicates (only for new members, not edits)
      if (!editingMember && checkPhoneDuplicate(form.phone)) {
        return;
      }
    }

    if (!form.branchId) {
      showToast("Please select a branch", "error");
      return;
    }

    // Validate removal date and remark
    if (form.memberDeletedAt && !form.deleteRemark?.trim()) {
      showToast("Removal remark is required when removal date is specified", "error");
      return;
    }
    setFormSubmitting(true);
    try {
      const hasQuickPasteData = parsedMembers.length > 0;
      // If we have quick paste data, use bulk create
      if (hasQuickPasteData) {
        await handleBulkCreate();
        return;
      }

      // Single member creation/editing
      const payload: VipMemberPayload = {
        name: form.name.trim(),
        phone: form.phone.trim().replace(/\s/g, ''),
        branchId: form.branchId,
        memberCreatedAt: form.memberCreatedAt,
        memberDeletedAt: form.memberDeletedAt
          ? form.memberDeletedAt
          : undefined,
        createRemark: form.createRemark?.trim()
          ? form.createRemark.trim()
          : undefined,
        deleteRemark: form.deleteRemark?.trim()
          ? form.deleteRemark.trim()
          : undefined,
      };

      if (editingMember) {
        await vipMemberService.updateMember(editingMember.id, payload);
        showToast("VIP member updated");
        resetForm(false); // Full reset after editing
      } else {
        await vipMemberService.createMember(payload);
        showToast("VIP member created");
        resetForm(true); // Keep location for new member creation
      }
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save member",
        "error",
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEdit = (member: VipMember) => {
    const branch = branches.find((b) => b.id === member.branchId);
    const derivedAreaId = member.areaId ?? branch?.areaId;
    if (!derivedAreaId) {
      showToast("Unable to resolve area for this member", "error");
      return;
    }
    const derivedSubArea: SubAreaSelection =
      member.subAreaId ?? branch?.subAreaId ?? "all";
    setForm({
      name: member.name,
      phone: member.phone.replace(/\s/g, ''),
      areaId: derivedAreaId,
      subAreaId: derivedSubArea ?? "all",
      branchId: member.branchId,
      memberCreatedAt: member.memberCreatedAt,
      memberDeletedAt: member.memberDeletedAt ?? "",
      createRemark: member.createRemark ?? "",
      deleteRemark: member.deleteRemark ?? "",
    });
    setEditingMember(member);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (member: VipMember) => {
    const confirmation = window.confirm(`Delete VIP member "${member.name}"?`);
    if (!confirmation) return;
    try {
      await vipMemberService.deleteMember(member.id);
      showToast("VIP member removed");
      setFilters((prev) => ({ ...prev }));
      if (editingMember?.id === member.id) {
        resetForm();
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to delete member",
        "error",
      );
    }
  };

  const totalActiveMembers = useMemo(
    () => members.filter((member) => !member.memberDeletedAt).length,
    [members],
  );

  const totalArchivedMembers = members.length - totalActiveMembers;

  return (
    <MarketingServiceGuard>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300/70">
            Marketing ◦ VIP members
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Manage VIP member roster
          </h1>
          <p className="text-sm text-slate-300">
            Create, update, or archive members across areas, sub-areas, and
            branches. Data is live with the marketing-service backend.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
                Active
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {totalActiveMembers}
              </p>
              <p className="text-sm text-emerald-100/80">
                Members currently active
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-rose-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-rose-200/80">
                Archived
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {totalArchivedMembers}
              </p>
              <p className="text-sm text-rose-100/80">
                Members removed or inactive
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                  {editingMember ? "Edit member" : "Add new member"}
                </p>
                <h2 className="text-xl font-semibold text-white">
                  {editingMember ? editingMember.name : "Create VIP member"}
                </h2>
              </div>
              {editingMember && (
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-4 py-2 text-xs text-white hover:bg-white/10"
                  onClick={() => resetForm(false)}
                >
                  Cancel edit
                </button>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left Column: Location, Dates, Remarks */}
              <div className="space-y-4">
                <div className="grid gap-3 grid-cols-3">
                  <div className="flex flex-col text-xs text-slate-300">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Area
                    </label>
                    <select
                      value={form.areaId ?? ""}
                      onChange={(event) =>
                        handleFormAreaChange(event.target.value)
                      }
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    >
                      <option value="">All areas</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(
                    <div className="flex flex-col text-xs text-slate-300">
                      <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                        Sub area
                      </label>
                      <select
                        value={form.subAreaId}
                        onChange={(event) =>
                          handleFormSubAreaChange(event.target.value)
                        }
                        className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      >
                        <option value="all">All sub areas</option>
                        {filteredSubAreasForForm.map((subArea) => (
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
                      value={form.branchId ?? ""}
                      onChange={(event) =>
                        handleFormBranchChange(event.target.value)
                      }
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    >
                      <option value="">All branches</option>
                      {filteredBranchesForForm.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Join date
                  </label>
                  <input
                    type="date"
                    value={form.memberCreatedAt}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        memberCreatedAt: event.target.value,
                      }))
                    }
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Removal date (optional)
                  </label>
                  <input
                    type="date"
                    value={form.memberDeletedAt ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        memberDeletedAt: event.target.value,
                      }))
                    }
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Registration remark
                  </label>
                  <textarea
                    rows={3}
                    value={form.createRemark ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        createRemark: event.target.value,
                      }))
                    }
                    className="mt-1 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Removal remark
                  </label>
                  <textarea
                    rows={3}
                    value={form.deleteRemark ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        deleteRemark: event.target.value,
                      }))
                    }
                    className="mt-1 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                  />
                </div>
              </div>

              {/* Right Column: Member Info & Quick Input */}
              <div className="space-y-4">
                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    placeholder="Enter full name"
                  />
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Phone number
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        phone: event.target.value,
                      }))
                    }
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    placeholder="0x-xxx-xxx"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowQuickPaste(!showQuickPaste)}
                    className="mb-2 flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    📋 Quick Paste Multiple Members
                    <span className={`transform transition-transform ${showQuickPaste ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                  </button>

                  {showQuickPaste && (
                    <div className="space-y-2">
                      <textarea
                        value={pasteText}
                        onChange={(e) => {
                          setPasteText(e.target.value);
                          setParsedMembers(parsePasteText(e.target.value));
                        }}
                        rows={8}
                        disabled={!form.branchId}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-3 text-base text-white focus:border-amber-400/60 focus:outline-none font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                        placeholder={form.branchId ? "Paste tab-separated data: Name[TAB]Phone (one per line)\nExample:\nLY ROZA\t87232002\nប្រេងរឹតសរសៃខ្មែរ\t89232373" : "Please select a branch first"}
                      />
                      <p className="text-sm text-slate-500">
                        Phone numbers without 0 prefix will be auto-corrected.
                      </p>
                    </div>
                  )}
                </div>

                {parsedMembers.length > 0 && form.branchId && (
                  <div>
                    <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 overflow-hidden">
                      <div className="bg-amber-500/10 px-4 py-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-amber-300">
                          Preview ({parsedMembers.length} members
                          {(() => {
                            const duplicateCount = parsedMembers.filter(member =>
                              members.some(m => m.phone.trim().replace(/\s/g, '') === member.phone.trim().replace(/\s/g, ''))
                            ).length;
                            return duplicateCount > 0 ? `, ${duplicateCount} duplicates` : '';
                          })()})
                        </h4>
                        <button
                          type="button"
                          onClick={handleBulkCreate}
                          disabled={formSubmitting}
                          className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Create All
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-900/40 text-xs uppercase tracking-[0.2em] text-slate-400 sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium">#</th>
                              <th className="px-4 py-2 text-left font-medium">Name</th>
                              <th className="px-4 py-2 text-left font-medium">Phone</th>
                              <th className="px-4 py-2 text-left font-medium">Branch</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedMembers.map((member, index) => {
                              const selectedBranch = branches.find(b => b.id === form.branchId);
                              const selectedArea = selectedBranch ? areas.find(a => a.id === selectedBranch.areaId) : null;

                              // Check if phone number already exists
                              const existingMember = members.find(m => m.phone.trim().replace(/\s/g, '') === member.phone.trim().replace(/\s/g, ''));
                              const isDuplicate = !!existingMember;

                              return (
                                <tr
                                  key={index}
                                  className={`border-t border-white/5 hover:bg-slate-900/20 ${isDuplicate ? 'bg-rose-500/10' : ''
                                    }`}
                                >
                                  <td className="px-4 py-2 text-slate-400">{index + 1}</td>
                                  <td className="px-4 py-2 text-white font-medium">
                                    {member.name}
                                    {isDuplicate && (
                                      <span className="ml-2 text-xs text-rose-400">(duplicate)</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={isDuplicate ? 'text-rose-300 font-medium' : 'text-slate-300'}>
                                      {member.phone}
                                    </span>
                                    {isDuplicate && existingMember && (
                                      <div className="text-xs text-rose-200 mt-1">
                                        Already exists as {existingMember.name}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-slate-300">
                                    {selectedBranch ? (
                                      <span className="text-xs">
                                        {selectedBranch.name}
                                        {selectedArea && <span className="text-slate-500 ml-1">({selectedArea.name})</span>}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
                                    {isDuplicate && existingMember && (
                                      <div className="text-xs text-rose-200 mt-1">
                                        Current: {existingMember.branchName}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={formSubmitting}
              className="w-full rounded-2xl bg-linear-to-r from-amber-400/80 to-rose-500/80 px-6 py-3 text-center text-sm font-semibold uppercase tracking-[0.35em] text-white shadow-lg shadow-rose-900/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {formSubmitting
                ? "Saving…"
                : editingMember
                  ? "Update member"
                  : "Create member"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
                  Member directory
                </p>
                <h2 className="text-xl font-semibold text-white">
                  VIP Members List
                </h2>
              </div>
              <span className="text-xs text-white/60">
                {paginatedMembersLoading ? "Refreshing…" : `${members.length} records`}
              </span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-amber-200/80 mb-3">
                <span>Filters</span>
                <button
                  className="rounded-full border border-white/10 px-3 py-1 text-[0.6rem] text-white/70 hover:text-white"
                  onClick={() =>
                    setFilters({
                      areaId: "all",
                      subAreaId: "all",
                      branchId: "all",
                    })
                  }
                >
                  Reset
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3 text-xs text-slate-300">
                <div className="flex flex-col">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Area
                  </label>
                  <select
                    className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    value={filters.areaId}
                    onChange={(event) =>
                      handleFilterAreaChange(event.target.value)
                    }
                  >
                    <option value="all">All areas</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>

                {(
                  <div className="flex flex-col">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Sub area
                    </label>
                    <select
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      value={filters.subAreaId}
                      onChange={(event) =>
                        handleFilterSubAreaChange(event.target.value)
                      }
                    >
                      <option value="all">All sub areas</option>
                      {filterSubAreas.map((subArea) => (
                        <option key={subArea.id} value={subArea.id}>
                          {subArea.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(
                  <div className="flex flex-col">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Branch
                    </label>
                    <select
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      value={filters.branchId}
                      onChange={(event) =>
                        handleFilterBranchChange(event.target.value)
                      }
                    >
                      <option value="all">All branches</option>
                      {filterBranches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
                <div className="flex-1 max-w-md">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 block mb-2">
                    Search Members
                  </label>
                  <input
                    type="text"
                    placeholder="Search by name, phone, branch, area..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-amber-400/60 focus:outline-none"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  {filteredMembers.length} of {members.length} members
                </div>
              </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-white/10 bg-slate-900/40">
              <table className="min-w-full divide-y divide-white/5 text-sm text-slate-100">
                <thead className="bg-white/5 text-xs uppercase tracking-[0.25em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">
                      Member
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Timeline
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Created By
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-slate-400"
                        colSpan={5}
                      >
                        {paginatedMembersLoading
                          ? "Loading members…"
                          : searchQuery.trim()
                            ? "No members match your search."
                            : "No members match the current filters."}
                      </td>
                    </tr>
                  ) : (
                    paginatedMembersData.map((member) => (
                      <tr
                        key={member.id}
                        className="border-b border-white/5 last:border-transparent"
                      >
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white">
                            {member.name}
                          </p>
                          <p className="text-xs text-slate-300">
                            {member.phone}
                          </p>
                          {member.createRemark && (
                            <p className="mt-1 text-xs text-amber-200/80">
                              {member.createRemark}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-200">
                          <p>{member.areaName ?? "—"} </p>
                          <p className="text-xs text-slate-400">
                            {member.subAreaName
                              ? `${member.subAreaName} · `
                              : ""}
                            {member.branchName ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-300">
                          <p>
                            Joined{" "}
                            <span className="text-white">
                              {member.memberCreatedAt}
                            </span>
                          </p>
                          {member.memberDeletedAt ? (
                            <p className="text-rose-300">
                              Removed {member.memberDeletedAt}
                            </p>
                          ) : (
                            <p className="text-emerald-300">Active</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-200">
                          <div className="flex flex-col">
                            <span className="font-medium text-white">
                              {member.createdBy ? `User ID: ${member.createdBy}` : "System"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {member.createdBy ? "Created by user" : "Auto-generated"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col gap-2 text-xs">
                            <PermissionGuard
                              permission="member.edit"
                              serviceContext="marketing-service"
                              fallback={
                                <button
                                  type="button"
                                  disabled
                                  className="rounded-full border border-white/20 px-3 py-1 text-slate-500 cursor-not-allowed"
                                >
                                  Edit
                                </button>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => handleEdit(member)}
                                disabled={!canEditMember(member)}
                                className={`rounded-full border px-3 py-1 transition-colors ${canEditMember(member)
                                  ? "border-white/10 text-slate-200 hover:bg-white/10"
                                  : "border-white/20 text-slate-500 cursor-not-allowed"
                                  }`}
                              >
                                Edit
                              </button>
                            </PermissionGuard>
                            <PermissionGuard
                              permission="member.delete"
                              serviceContext="marketing-service"
                              fallback={
                                <button
                                  type="button"
                                  disabled
                                  className="rounded-full border border-white/20 px-3 py-1 text-slate-500 cursor-not-allowed"
                                >
                                  Delete
                                </button>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => handleDelete(member)}
                                disabled={!canEditMember(member)}
                                className={`rounded-full border px-3 py-1 transition-colors ${canEditMember(member)
                                  ? "border-rose-400/40 text-rose-200 hover:bg-rose-500/20"
                                  : "border-white/20 text-slate-500 cursor-not-allowed"
                                  }`}
                              >
                                Delete
                              </button>
                            </PermissionGuard>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Enhanced Pagination Controls */}
              <div className="mt-6 rounded-2xl border border-white/10 bg-linear-to-br from-slate-900/50 to-slate-800/30 p-4 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Records Info & Page Size Selector */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="text-sm">
                      <span className="text-slate-400">Showing</span>
                      <span className="mx-2 font-semibold text-white">
                        {startIndex + 1}-{Math.min(endIndex, members.length)}
                      </span>
                      <span className="text-slate-400">of</span>
                      <span className="mx-1 font-semibold text-white">{members.length}</span>
                      <span className="text-slate-400">members</span>
                    </div>

                    {/* Page Size Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Show:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        className="rounded-lg border border-white/20 bg-slate-900/60 px-3 py-1.5 text-sm text-white focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
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
                        disabled={currentPage === 1}
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
                              className="mx-1 rounded-lg border border-white/20 bg-slate-900/40 px-3 py-2 text-sm text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10"
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
                              className={`mx-1 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${currentPage === pageNum
                                ? "border border-amber-400/60 bg-linear-to-r from-amber-500/20 to-amber-400/20 text-amber-200 shadow-lg shadow-amber-500/20"
                                : "border border-white/20 bg-slate-900/40 text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10"
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
                              className="mx-1 rounded-lg border border-white/20 bg-slate-900/40 px-3 py-2 text-sm text-white transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/10"
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
                        disabled={currentPage === totalPages}
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
                    <span>{members.length} total records</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {lookupLoading && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 text-sm uppercase tracking-[0.4em] text-white">
            Loading marketing hierarchy…
          </div>
        )}
      </div>
    </MarketingServiceGuard>
  );
}
