import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DailyReport } from "@/types/types";
import { usePortal } from "@/hooks/marketing-service/DailyReports/usePortal";
import { useCopyReportImage } from "@/hooks/marketing-service/DailyReports/useCopyReportImage";
import { useAuth } from "@/contexts/AuthContext";
import { marketingUserAssignmentService, MarketingUserAssignment } from "@/services/marketingUserAssignmentService";
import { marketingUserProfileService, type MarketingUserProfile } from "@/services/marketing-service/marketingUserProfileService";
import { apiService } from "@/services/api";
import { apiFetch } from "@/services/httpClient";

interface ReportViewModalProps {
    report: DailyReport;
    onClose: () => void;
}

const KHMER_MONTHS = [
    "មករា",
    "កុម្ភៈ",
    "មីនា",
    "មេសា",
    "ឧសភា",
    "មិថុនា",
    "កក្កដា",
    "សីហា",
    "កញ្ញា",
    "តុលា",
    "វិច្ឆិកា",
    "ធ្នូ"
];

const getKhmerDateParts = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return { day: "", month: "", year: "" };
    }
    return {
        day: date.getDate(),
        month: KHMER_MONTHS[date.getMonth()] ?? "",
        year: date.getFullYear()
    };
};

const formatDate = (dateString: string) => {
    const { day, month, year } = getKhmerDateParts(dateString);
    if (!month) return dateString;
    return `${day} ${month} ${year}`;
};

const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
};

export const ReportViewModal = ({ report, onClose }: ReportViewModalProps) => {
    const portalRoot = usePortal();
    const reportRef = useRef<HTMLDivElement>(null);
    const { copyingImage, copyReportAsImage } = useCopyReportImage(reportRef, report);
    const { user } = useAuth();
    const { day: footerDay, month: footerMonth, year: footerYear } = getKhmerDateParts(report.reportDate);
    const [userAssignments, setUserAssignments] = useState<MarketingUserAssignment[]>([]);
    const [marketingProfile, setMarketingProfile] = useState<MarketingUserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            // Use report creator's username, not current user's ID
            if (!report.createdBy) return;

            try {
                // First get the user ID from username using the user service
                const userIdResponse = await apiFetch(`/api/users/username/${report.createdBy}/id`, {
                    method: "GET",
                });

                if (!userIdResponse.ok) {
                    console.warn("User not found for username:", report.createdBy);
                    setUserAssignments([]);
                    setMarketingProfile(null);
                    return;
                }

                const userId = await userIdResponse.json();

                // Now get the assignments using the user ID
                const assignments = await marketingUserAssignmentService.getUserAssignments(userId);
                setUserAssignments(assignments);

                // Also fetch the marketing user profile
                try {
                    const profile = await marketingUserProfileService.getUserProfile(userId);
                    setMarketingProfile(profile);
                } catch (profileError) {
                    console.log("No marketing profile found for user:", report.createdBy);
                    setMarketingProfile(null);
                }
            } catch (error) {
                console.error("Failed to fetch report creator data:", error);
                setUserAssignments([]);
                setMarketingProfile(null);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [report.createdBy]);

    const getUserSubAreas = () => {
        const subAreas = userAssignments
            .filter(assignment => assignment.active && assignment.subAreaName)
            .map(assignment => assignment.subAreaName);
        return [...new Set(subAreas)]; // Remove duplicates
    };

    const getUserAreas = () => {
        const areas = userAssignments
            .filter(assignment => assignment.active && assignment.areaName)
            .map(assignment => assignment.areaName);
        return [...new Set(areas)]; // Remove duplicates
    };

    const userSubAreas = getUserSubAreas();
    const userAreas = getUserAreas();
    const displayAreas = userAreas.length > 0 ? userAreas : userSubAreas;

    const handlePrint = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!reportRef.current) return;

        const printWindow = window.open('', '_blank', 'width=1024,height=768');
        if (!printWindow) return;

        const F4_WIDTH = 794;
        const F4_HEIGHT = 1247;
        const PADDING = 48;

        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = `${F4_WIDTH}px`;
        tempContainer.style.height = `${F4_HEIGHT}px`;
        tempContainer.style.background = '#ffffff';
        tempContainer.style.padding = `${PADDING}px`;
        tempContainer.style.boxSizing = 'border-box';
        tempContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        const clonedContent = reportRef.current.cloneNode(true) as HTMLElement;
        clonedContent.querySelectorAll('button').forEach((btn) => btn.remove());
        clonedContent.querySelectorAll('svg').forEach((svg) => svg.remove());
        clonedContent.style.boxShadow = 'none';
        clonedContent.style.borderRadius = '0';
        clonedContent.style.background = '#ffffff';
        clonedContent.style.maxWidth = 'none';

        tempContainer.appendChild(clonedContent);
        document.body.appendChild(tempContainer);

        const headContent = document.head.innerHTML;
        const cleanup = () => {
            if (tempContainer.parentNode) {
                document.body.removeChild(tempContainer);
            }
        };

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    ${headContent}
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            background: #ffffff;
                            display: flex;
                            justify-content: center;
                            font-family: "Hanuman", var(--font-hanuman), -apple-system, sans-serif !important;
                        }
                        * {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .text-gray-900 { color: rgb(17, 24, 39) !important; }
                        .text-gray-700 { color: rgb(55, 65, 81) !important; }
                        .text-gray-600 { color: rgb(75, 85, 99) !important; }
                        .text-blue-500 { color: rgb(59, 130, 246) !important; }
                        .text-orange-500 { color: rgb(249, 115, 22) !important; }
                        .bg-white { background-color: rgb(255, 255, 255) !important; }
                        .border-gray-200 { border-color: rgb(229, 231, 235) !important; }
                        .border-gray-300 { border-color: rgb(209, 213, 219) !important; }
                        .rounded-lg { border-radius: 8px !important; }
                    </style>
                </head>
                <body>
                    ${tempContainer.innerHTML}
                </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
            cleanup();
        };

        printWindow.onbeforeunload = cleanup;
    };

    if (!portalRoot) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-hanuman"
            onClick={onClose}
        >
            <div
                ref={reportRef}
                className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="border-b border-gray-200 p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-4">
                            <img
                                src="/Logo.png"
                                alt="VVB Logo"
                                className="w-15 h-15 object-contain"
                            />
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 font-khmer-os-muol">
                                    របាយការណ៍មន្ត្រីទីផ្សារប្រចាំថ្ងៃ {userSubAreas.join(", ")}
                                </h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={copyReportAsImage}
                                disabled={copyingImage}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Copy report as image"
                            >
                                {copyingImage ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Copying...
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy Image
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                title="Print report"
                            >
                                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7m0 0h2a2 2 0 012 2v4h-4m0 4H6v-4H2v-4a2 2 0 012-2h2m12 0H6" />
                                </svg>
                                Print
                            </button>
                            <button
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                }}
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Daily Plan Section */}
                    <div className="p-7">
                        <div className="space-y-3">
                            {report.items.map((item, index) => (
                                <div key={index}>
                                    <h3 className="font-semibold text-gray-900 font-khmer-os-muol">► {item.name}</h3>
                                    <ul className="mt-2 space-y-1 pl-6">
                                        {item.values.map((value, valueIndex) => (
                                            <li key={valueIndex} className="text-gray-700">
                                                <span className="whitespace-pre-wrap">{value}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                {/* Footer with Signatures */}
                <div className=" border-gray-200 p-6">
                    <div className="grid grid-cols-2 gap-5 items-start">
                        <div />
                        <div className="text-center">
                            <p className="text-sm font-semibold text-black inline-block font-khmer-os-muol">
                                ធ្វើនៅថ្ងៃទី {footerDay} ខែ {footerMonth} ឆ្នាំ {footerYear}
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-black">
                                ហត្ថលេខាសាមីខ្លួន
                            </p>

                            {/* User Signature */}
                            <div className="min-h-20 flex flex-col justify-between mt-2">
                                {marketingProfile?.userSignature ? (
                                    <div className="flex justify-center mb-2">
                                        <img
                                            src={marketingProfile.userSignature}
                                            alt="User Signature"
                                            className="h-20 w-auto object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div className="h-20 flex items-center justify-center">
                                    </div>
                                )}

                                <div className="border-gray-300  ">
                                    <p className="text-sm font-semibold text-black inline-block font-khmer-os-muol">
                                        {report.createdByFullName || report.createdBy}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-black">
                                {marketingProfile?.departmentManager || "ហត្ថលេខាប្រធាននាយកដ្ឋានទីផ្សារ"}
                            </p>
                            <br /><br />
                            <div className="min-h-20 flex flex-col justify-end">
                                <div className="border-gray-300">
                                    <div className="text-sm font-semibold text-black inline-block font-khmer-os-muol">
                                        <div className="mt-2">
                                            <span className="text-xs text-gray-600">
                                                {marketingProfile?.managerName || "លោក សោម តារា"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        portalRoot
    );
};