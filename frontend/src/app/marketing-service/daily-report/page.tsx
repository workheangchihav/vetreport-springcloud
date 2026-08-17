"use client";

import { useEffect, useState } from "react";
import { MarketingServiceGuard } from "@/components/marketing-service/MarketingServiceGuard";
import { useToast } from "@/components/ui/Toast";
import { API_BASE_URL } from "@/config/env";
import { useDailyReports } from "@/hooks/marketing-service/DailyReports/useDailyReports";
import { ReportFormModal } from "@/components/marketing-service/DailyReports/ReportFormModal";
import { ReportViewModal } from "@/components/marketing-service/DailyReports/ReportViewModal";
import { ReportsTable } from "@/components/marketing-service/DailyReports/ReportsTable";
import { DailyReport } from "@/types/types";

const DailyReportPage = () => {
    const { showToast } = useToast();
    const [page, setPage] = useState(0);
    const [dateFilter, setDateFilter] = useState("");
    const [size] = useState(20);

    const {
        reports,
        totalElements,
        totalPages,
        loading,
        loadReports,
        createReport,
        updateReport,
        deleteReport
    } = useDailyReports({
        page,
        size,
        startDate: dateFilter || undefined,
        endDate: dateFilter || undefined
    });

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
    const [viewingReport, setViewingReport] = useState<DailyReport | null>(null);

    useEffect(() => {
        loadReports();
    }, []);

    const handleSave = async (data: { reportDate: string; items: any[] }) => {
        try {
            if (editingReport) {
                await updateReport(editingReport.id, data);
                showToast("Report updated successfully");
            } else {
                await createReport(data);
                showToast("Report created successfully");
            }
            setShowCreateForm(false);
            setEditingReport(null);
            await loadReports();
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Failed to save report",
                "error"
            );
        }
    };

    const handleEdit = (report: DailyReport, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingReport(report);
        setShowCreateForm(true);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this report?")) {
            return;
        }

        try {
            await deleteReport(id);
            showToast("Report deleted successfully");
            await loadReports();
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Failed to delete report",
                "error"
            );
        }
    };

    return (
        <MarketingServiceGuard>
            <div className="font-hanuman">
                <div className="space-y-8">
                    <header className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.4em] text-amber-300/70">
                        Marketing · Reports
                    </p>
                    <h1 className="text-3xl font-semibold text-white">
                        Daily Reports
                    </h1>
                    <p className="text-sm text-slate-300">
                        Create and manage daily marketing reports with structured data.
                    </p>
                </header>

                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => {
                                setDateFilter(e.target.value);
                                setPage(0); // Reset to first page on filter change
                            }}
                            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                        />
                        {dateFilter && (
                            <button 
                                onClick={() => {
                                    setDateFilter("");
                                    setPage(0);
                                }}
                                className="text-xs text-slate-400 hover:text-white"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <button
                        className="rounded-2xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 px-6 py-2 text-sm font-semibold text-white hover:from-amber-400 hover:to-orange-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        onClick={() => {
                            setEditingReport(null);
                            setShowCreateForm(true);
                        }}
                        disabled={loading}
                    >
                        Create New Report
                    </button>
                </div>

                <ReportsTable
                    reports={reports}
                    loading={loading}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onView={setViewingReport}
                />

                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-white/10 pt-4">
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

                {showCreateForm && (
                    <ReportFormModal
                        editingReport={editingReport}
                        onSave={handleSave}
                        onClose={() => {
                            setShowCreateForm(false);
                            setEditingReport(null);
                        }}
                        loading={loading}
                    />
                )}

                {viewingReport && (
                    <ReportViewModal
                        report={viewingReport}
                        onClose={() => setViewingReport(null)}
                    />
                )}
            </div>
            </div>
        </MarketingServiceGuard>
    );
};

export default DailyReportPage;