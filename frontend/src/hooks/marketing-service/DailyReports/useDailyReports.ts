import { useState, useEffect } from "react";
import { DailyReport, CreateReportRequest } from "@/types/types";
import { apiFetch } from "@/services/httpClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const useDailyReports = () => {
    const queryClient = useQueryClient();
    const [reports, setReports] = useState<DailyReport[]>([]);

    // Query for loading reports
    const { data: reportsData = [], isLoading, error, refetch } = useQuery({
        queryKey: ["daily-reports"],
        queryFn: async () => {
            const response = await apiFetch("/api/marketing/daily-reports", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error("Failed to load reports");
            }

            return await response.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    // Update local state when query data changes
    useEffect(() => {
        setReports(reportsData);
    }, [reportsData]);

    // Mutation for creating reports
    const createReportMutation = useMutation({
        mutationFn: async (payload: CreateReportRequest) => {
            const response = await apiFetch("/api/marketing/daily-reports", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error("Failed to create report");
            }

            return await response.json();
        },
        onSuccess: () => {
            // Invalidate and refetch reports
            queryClient.invalidateQueries({ queryKey: ["daily-reports"] });
        },
    });

    // Mutation for updating reports
    const updateReportMutation = useMutation({
        mutationFn: async ({ id, payload }: { id: string; payload: CreateReportRequest }) => {
            const response = await apiFetch(`/api/marketing/daily-reports/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error("Failed to update report");
            }

            return await response.json();
        },
        onSuccess: () => {
            // Invalidate and refetch reports
            queryClient.invalidateQueries({ queryKey: ["daily-reports"] });
        },
    });

    // Mutation for deleting reports
    const deleteReportMutation = useMutation({
        mutationFn: async (id: string) => {
            const response = await apiFetch(`/api/marketing/daily-reports/${id}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error("Failed to delete report");
            }
        },
        onSuccess: () => {
            // Invalidate and refetch reports
            queryClient.invalidateQueries({ queryKey: ["daily-reports"] });
        },
    });

    const loadReports = () => {
        refetch();
    };

    const createReport = async (payload: CreateReportRequest) => {
        return await createReportMutation.mutateAsync(payload);
    };

    const updateReport = async (id: string, payload: CreateReportRequest) => {
        return await updateReportMutation.mutateAsync({ id, payload });
    };

    const deleteReport = async (id: string) => {
        return await deleteReportMutation.mutateAsync(id);
    };

    return {
        reports,
        loading: isLoading,
        loadReports,
        createReport,
        updateReport,
        deleteReport,
    };
};