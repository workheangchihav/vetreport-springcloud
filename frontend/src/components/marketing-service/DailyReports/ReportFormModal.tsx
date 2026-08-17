import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface ReportItem {
    name: string;
    values: string[];
}

interface DailyReport {
    reportDate: string;
    items: ReportItem[];
}

interface ReportFormModalProps {
    editingReport: DailyReport | null;
    onSave: (data: { reportDate: string; items: ReportItem[] }) => Promise<void>;
    onClose: () => void;
    loading: boolean;
}

export const ReportFormModal = ({ editingReport, onSave, onClose, loading }: ReportFormModalProps) => {
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const [reportDate, setReportDate] = useState(yesterday.toISOString().split('T')[0]);
    const [reportItems, setReportItems] = useState<ReportItem[]>([
        { name: "ផែនការប្រចាំថ្ងៃ", values: [""] },
        { name: "លិទ្ធផលការងារសម្រេចបានប្រចាំថ្ងៃ", values: [""] },
        { name: "លិទ្ធផលការងារមិនទាន់បានសម្រេច", values: [""] },
        { name: "ព័តមានអំពីដៃគូប្រកួតប្រជែង", values: [""] }
    ]);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    useEffect(() => {
        if (editingReport) {
            setReportDate(editingReport.reportDate);
            setReportItems(editingReport.items.length > 0 ? editingReport.items : [
                { name: "ផែនការប្រចាំថ្ងៃ", values: [""] },
                { name: "លិទ្ធផលការងារសម្រេចបានប្រចាំថ្ងៃ", values: [""] },
                { name: "លិទ្ធផលការងារមិនទាន់បានសម្រេច", values: [""] },
                { name: "ព័តមានអំពីដៃគូប្រកួតប្រជែង", values: [""] }
            ]);
        } else {
            // For new reports, default to yesterday
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            setReportDate(yesterday.toISOString().split('T')[0]);
            setReportItems([
                { name: "ផែនការប្រចាំថ្ងៃ", values: [""] },
                { name: "លិទ្ធផលការងារសម្រេចបានប្រចាំថ្ងៃ", values: [""] },
                { name: "លិទ្ធផលការងារមិនទាន់បានសម្រេច", values: [""] },
                { name: "ព័តមានអំពីដៃគូប្រកួតប្រជែង", values: [""] }
            ]);
        }
    }, [editingReport]);

    const addReportItem = () => {
        setReportItems([...reportItems, { name: "", values: [""] }]);
    };

    const removeReportItem = (index: number) => {
        setReportItems(reportItems.filter((_, i) => i !== index));
    };

    const updateItemName = (index: number, name: string) => {
        const updated = [...reportItems];
        updated[index].name = name;
        setReportItems(updated);
    };

    const addValueToItem = (itemIndex: number) => {
        const updated = [...reportItems];
        updated[itemIndex].values.push("");
        setReportItems(updated);
    };

    const updateItemValue = (itemIndex: number, valueIndex: number, value: string) => {
        const updated = [...reportItems];
        updated[itemIndex].values[valueIndex] = value;
        setReportItems(updated);
    };

    const removeValueFromItem = (itemIndex: number, valueIndex: number) => {
        const updated = [...reportItems];
        updated[itemIndex].values = updated[itemIndex].values.filter((_, i) => i !== valueIndex);
        setReportItems(updated);
    };

    const handleSave = async () => {
        const validItems = reportItems.filter(item =>
            item.name.trim() &&
            item.values.some(v => v.trim() && v.trim() !== "•")
        );

        const itemsWithFilteredValues = validItems.map(item => ({
            ...item,
            values: item.values.filter(v => v.trim() && v.trim() !== "•")
        }));

        if (itemsWithFilteredValues.length === 0) {
            return;
        }

        await onSave({ reportDate, items: itemsWithFilteredValues });
    };

    const scrollbarStyles = `
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.5);
            border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(71, 85, 105, 0.8);
            border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.9);
        }
        .custom-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(71, 85, 105, 0.8) rgba(15, 23, 42, 0.5);
        }
    `;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 bg-black/70 backdrop-blur-md font-hanuman">
            <style>{scrollbarStyles}</style>
            <div className="mx-4 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-8 shadow-2xl custom-scrollbar">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold text-white bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                        {editingReport ? "Edit Report" : "Create New Report"}
                    </h2>
                    <button
                        className="rounded-full border border-white/20 bg-slate-800/80 p-2.5 text-slate-300 hover:border-red-400/50 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 hover:scale-110"
                        onClick={onClose}
                        disabled={loading}
                        title="Close form"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-8">
                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-3">
                            Report Date
                        </label>
                        <input
                            type="date"
                            className="w-full rounded-xl border border-white/20 bg-slate-800/50 px-4 py-3 text-white focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            value={reportDate}
                            onChange={(e) => setReportDate(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-sm font-medium text-slate-300">
                                Report Items
                            </label>
                            <button
                                className="rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:border-amber-400/50 hover:from-amber-500/30 hover:to-orange-500/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105"
                                onClick={addReportItem}
                                disabled={loading}
                            >
                                + Add Item
                            </button>
                        </div>

                        <div className="space-y-5">
                            {reportItems.map((item, itemIndex) => (
                                <div key={itemIndex} className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-5 shadow-lg hover:border-white/20 transition-all">
                                    <div className="flex items-center gap-3 mb-4">
                                        <input
                                            type="text"
                                            placeholder="Item name (e.g., Daily work achievements)"
                                            className="flex-1 rounded-xl border border-white/20 bg-slate-900/60 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                            value={item.name}
                                            onChange={(e) => updateItemName(itemIndex, e.target.value)}
                                            disabled={loading}
                                        />
                                        <button
                                            className="rounded-full border border-red-400/30 bg-red-500/10 p-2.5 text-red-400 hover:border-red-400/50 hover:bg-red-500/20 hover:scale-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
                                            onClick={() => removeReportItem(itemIndex)}
                                            disabled={loading || reportItems.length === 1}
                                            title="Remove item"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                                                Values
                                            </label>
                                            <button
                                                className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:border-blue-400/50 hover:bg-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
                                                onClick={() => addValueToItem(itemIndex)}
                                                disabled={loading}
                                            >
                                                + Add Value
                                            </button>
                                        </div>

                                        {item.values.map((value, valueIndex) => {
                                            const fieldId = `item-${itemIndex}-value-${valueIndex}`;
                                            const isFocused = focusedField === fieldId;

                                            return (
                                                <div key={valueIndex} className="flex items-start gap-3">
                                                    <textarea
                                                        placeholder="Enter value (supports multiple lines)"
                                                        className={`flex-1 rounded-lg border bg-slate-900/60 px-4 text-base text-white placeholder:text-slate-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none transition-all duration-300 ease-in-out ${isFocused
                                                            ? 'border-amber-400/60 ring-2 ring-amber-400/20 min-h-32 py-3'
                                                            : 'border-white/20 min-h-10 hover:border-white/30 py-2'
                                                            }`}
                                                        value={value}
                                                        onChange={(e) => updateItemValue(itemIndex, valueIndex, e.target.value)}
                                                        onFocus={() => setFocusedField(fieldId)}
                                                        onBlur={() => setFocusedField(null)}
                                                        disabled={loading}
                                                        rows={isFocused ? 5 : 1}
                                                    />
                                                    <button
                                                        className="rounded-full border border-red-400/30 bg-red-500/10 p-2 text-red-400 hover:border-red-400/50 hover:bg-red-500/20 hover:scale-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mt-1"
                                                        onClick={() => removeValueFromItem(itemIndex, valueIndex)}
                                                        disabled={loading || item.values.length === 1}
                                                        title="Remove value"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-white/10">
                        <button
                            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3.5 text-base font-semibold text-white hover:from-amber-400 hover:to-orange-400 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
                            onClick={handleSave}
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </span>
                            ) : (
                                editingReport ? "Update Report" : "Create Report"
                            )}
                        </button>
                        <button
                            className="rounded-xl border border-white/20 bg-slate-800/60 px-8 py-3.5 text-base font-semibold text-slate-300 hover:border-white/40 hover:bg-slate-700/60 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};