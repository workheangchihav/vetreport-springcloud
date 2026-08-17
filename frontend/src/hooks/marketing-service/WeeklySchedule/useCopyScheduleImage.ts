import { useState, RefObject } from "react";
import html2canvas from "html2canvas";
import { useToast } from "@/components/ui/Toast";

export type SubmittedSchedule = {
  id?: number;
  userInfo: {
    month: number;
    week: number;
  };
  createdBy: string;
  createdByFullName?: string;
  createdByPhone?: string;
  selectedWeek: number | null;
  currentWeekIndex: number | null;
  weekDetails: {
    id?: number;
    weekNumber: number;
    days: Array<{
      id?: number;
      dayNumber: number;
      dayName: string;
      date: string;
      isDayOff: boolean;
      morningSchedule: string;
      afternoonSchedule: string;
      inMonth: boolean;
    }>;
  } | null;
  timestamp: string;
};

export const useCopyScheduleImage = (
  scheduleRef: RefObject<HTMLDivElement | null>,
  schedule: SubmittedSchedule | null
) => {
  const [copyingImage, setCopyingImage] = useState(false);
  const { showToast } = useToast();

  const copyScheduleAsImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scheduleRef.current) {
      showToast("Schedule content not found", "error");
      return;
    }

    setCopyingImage(true);

    try {
      // Use A4 paper dimensions in pixels at 300 DPI for better width
      const A4_WIDTH = 2480;  // A4 width: 210mm at 300 DPI
      const A4_HEIGHT = 3508; // A4 height: 297mm at 300 DPI
      const PADDING = 48;

      // Create temporary container to capture full content first
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.background = '#ffffff';
      tempContainer.style.padding = '0px';
      tempContainer.style.boxSizing = 'border-box';
      tempContainer.style.fontFamily = '"Hanuman", var(--font-hanuman), -apple-system, sans-serif';
      tempContainer.style.width = 'auto';
      tempContainer.style.height = 'auto';

      // Clone the schedule content
      const clonedContent = scheduleRef.current.cloneNode(true) as HTMLElement;

      // Remove buttons from clone
      const buttons = clonedContent.querySelectorAll('button');
      buttons.forEach(btn => btn.remove());

      // Ensure footer text is visible in the clone
      const footerElements = clonedContent.querySelectorAll('.flex.justify-evenly.items-center.mt-6.text-sm.text-gray-600.font-khmer-os-muol');
      footerElements.forEach(footer => {
        (footer as HTMLElement).style.display = 'flex';
        (footer as HTMLElement).style.visibility = 'visible';
        (footer as HTMLElement).style.opacity = '1';
      });

      // Set cloned content to use natural width
      clonedContent.style.width = 'auto';
      clonedContent.style.maxWidth = 'none';
      clonedContent.style.overflow = 'visible';

      tempContainer.appendChild(clonedContent);
      document.body.appendChild(tempContainer);

      // First capture the full content to get natural dimensions
      const fullCanvas = await html2canvas(tempContainer, {
        backgroundColor: '#ffffff',
        scale: 2, // Increase scale for better resolution
        logging: false,
        useCORS: true,
        allowTaint: true,
        onclone: (clonedDoc: Document) => {
          // Remove only problematic elements, not the content
          const svgs = clonedDoc.querySelectorAll('svg');
          svgs.forEach(svg => svg.remove());

          // Replace lab colors with fallback colors
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el: Element) => {
            const computedStyle = window.getComputedStyle(el);
            const htmlEl = el as HTMLElement;

            if (computedStyle.color?.includes('lab(')) {
              htmlEl.style.color = '#000000';
            }
            if (computedStyle.backgroundColor?.includes('lab(')) {
              htmlEl.style.backgroundColor = '#ffffff';
            }
            if (computedStyle.fill?.includes('lab(')) {
              htmlEl.style.fill = '#000000';
            }
            if (computedStyle.stroke?.includes('lab(')) {
              htmlEl.style.stroke = '#000000';
            }
          });

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
            .bg-slate-800 { background-color: rgb(30, 41, 59) !important; }
            .border-gray-200 { border-color: rgb(229, 231, 235) !important; }
            .border-gray-300 { border-color: rgb(209, 213, 219) !important; }
            .rounded-lg { border-radius: 8px !important; }
            svg, path, circle, rect, polygon, polyline, line {
              display: none !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      } as any);

      // Clean up temporary container
      document.body.removeChild(tempContainer);

      // Create A4-sized canvas for better width and resolution
      const a4Canvas = document.createElement('canvas');
      a4Canvas.width = A4_WIDTH * 2; // High resolution (2x)
      a4Canvas.height = A4_HEIGHT * 2; // High resolution (2x)
      const ctx = a4Canvas.getContext('2d');

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, a4Canvas.width, a4Canvas.height);

      // Calculate scaling to fit A4 dimensions with padding (accounting for 2x resolution)
      const availableWidth = (A4_WIDTH - PADDING * 2) * 2;
      const availableHeight = (A4_HEIGHT - PADDING * 2) * 2;
      const contentWidth = fullCanvas.width;
      const contentHeight = fullCanvas.height;

      // Calculate scale to fit both width and height
      const scaleX = availableWidth / contentWidth;
      const scaleY = availableHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY, 1.5); // Allow up to 1.5x scale for better size

      // Calculate positioned at top with center horizontal alignment
      const scaledWidth = contentWidth * scale;
      const scaledHeight = contentHeight * scale;
      const x = (a4Canvas.width - scaledWidth) / 2; // Center horizontally
      const y = PADDING * 2; // Position at top with padding

      // Draw the scaled content
      ctx.drawImage(fullCanvas, x, y, scaledWidth, scaledHeight);

      // Convert canvas to blob
      a4Canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) {
          throw new Error("Failed to create image");
        }

        try {
          // Copy to clipboard
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          showToast("Schedule copied to clipboard (A4 size)", "success");
        } catch (error) {
          // If clipboard API fails, download the image
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const baseFileName = schedule?.createdByFullName || schedule?.createdBy;
          const safeFileName = baseFileName
            ? baseFileName
              .trim()
              .replace(/\s+/g, '-')
              .replace(/[^a-zA-Z0-9-\u1780-\u17FF\u17B0-\u17FF]/g, '') // Keep Khmer characters
              .toLowerCase()
            : `weekly-schedule-week-${schedule?.selectedWeek || 'unknown'}`;
          a.download = `${safeFileName}-schedule-week-${schedule?.selectedWeek}-A4.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("Schedule downloaded as A4 image", "success");
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error copying schedule as image:', error);
      showToast("Failed to copy schedule as image", "error");
    } finally {
      setCopyingImage(false);
    }
  };

  return { copyingImage, copyScheduleAsImage };
};
