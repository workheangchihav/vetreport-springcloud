import { useState, RefObject } from "react";
import html2canvas from "html2canvas";
import { useToast } from "@/components/ui/Toast";
import { DailyReport } from "@/types/types";

export const useCopyReportImage = (
    reportRef: RefObject<HTMLDivElement | null>,
    report: DailyReport | null
) => {
    const [copyingImage, setCopyingImage] = useState(false);
    const { showToast } = useToast();

    const copyReportAsImage = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!reportRef.current) {
            showToast("Report content not found", "error");
            return;
        }

        setCopyingImage(true);

        try {
            // F4 paper dimensions in pixels at 96 DPI
            const F4_WIDTH = 794;
            const F4_HEIGHT = 1247;
            const PADDING = 48;

            // Create temporary container with F4 dimensions
            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.top = '-9999px';
            tempContainer.style.width = F4_WIDTH + 'px';
            tempContainer.style.height = F4_HEIGHT + 'px';
            tempContainer.style.background = '#ffffff';
            tempContainer.style.padding = PADDING + 'px';
            tempContainer.style.boxSizing = 'border-box';
            tempContainer.style.fontFamily = '"Hanuman", var(--font-hanuman), -apple-system, sans-serif';

            // Clone the report content
            const clonedContent = reportRef.current.cloneNode(true) as HTMLElement;

            // Remove buttons from clone
            const buttons = clonedContent.querySelectorAll('button');
            buttons.forEach(btn => btn.remove());

            tempContainer.appendChild(clonedContent);
            document.body.appendChild(tempContainer);

            // Use html2canvas with F4 dimensions
            const canvas = await html2canvas(tempContainer, {
                backgroundColor: '#ffffff',
                width: F4_WIDTH,
                height: F4_HEIGHT,
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: F4_WIDTH,
                windowHeight: F4_HEIGHT,
                ignoreElements: (element: Element) => {
                    return element.tagName === 'svg' || element.tagName === 'SVG';
                },
                onclone: (clonedDoc: Document) => {
                    // Remove SVG elements
                    const svgs = clonedDoc.querySelectorAll('svg');
                    svgs.forEach(svg => svg.remove());

                    // Inject CSS for proper styling
                    const style = clonedDoc.createElement('style');
                    style.textContent = `
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
                    `;
                    clonedDoc.head.appendChild(style);
                }
            } as any);

            // Clean up temporary container
            document.body.removeChild(tempContainer);

            // Convert canvas to blob
            canvas.toBlob(async (blob: Blob | null) => {
                if (!blob) {
                    throw new Error("Failed to create image");
                }

                try {
                    // Copy to clipboard
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    showToast("Report copied to clipboard (F4 size)", "success");
                } catch (error) {
                    // If clipboard API fails, download the image
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const baseFileName = report?.createdByFullName || report?.createdBy;
                    const safeFileName = baseFileName
                        ? baseFileName
                            .trim()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-zA-Z0-9-\u1780-\u17FF\u17B0-\u17FF]/g, '') // Keep Khmer characters
                            .toLowerCase()
                        : `daily-report-${report?.reportDate || 'unknown'}`;
                    a.download = `${safeFileName}-report-${report?.reportDate}-F4.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast("Report downloaded as F4 image", "success");
                }
            }, 'image/png');
        } catch (error) {
            console.error('Error copying report as image:', error);
            showToast("Failed to copy report as image", "error");
        } finally {
            setCopyingImage(false);
        }
    };

    return { copyingImage, copyReportAsImage };
};