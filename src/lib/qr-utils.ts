import QRCode from "qrcode";
import jsPDFDefault, { jsPDF as jsPDFNamed } from "jspdf";

import type { DemoTableDefinition } from "@/lib/demo-table-catalog";
import { DEMO_BASE_URL } from "@/lib/demo-url";

export { CANONICAL_DEMO_PAY_URL, DEMO_PAY_URL } from "@/lib/demo-url";

// jsPDF ships both a CJS default and a named export; under Next.js (webpack)
// the default is callable, under raw Node + tsx only the named one is.
const jsPDF = (typeof jsPDFDefault === "function" ? jsPDFDefault : jsPDFNamed) as typeof jsPDFNamed;

/** MesitaQR brand tokens for printable / shareable QR assets */
export const QR_BRAND = {
  dark: "#14794B",
  light: "#FFFDF9",
  accent: "#2fb37e",
  ink: "#1B1714",
} as const;

/** Build the public `/pay/...` URL for a demo token (`demo` or `demo-{slug}`). */
export function buildDemoPayUrl(token: string): string {
  const base = DEMO_BASE_URL.replace(/\/+$/, "");
  if (token === "demo") return `${base}/pay/demo`;
  const slug = token.replace(/^demo-/, "");
  return `${base}/pay/demo/${slug}`;
}

export interface BrandedQROptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

const defaultBrandedOpts: Required<BrandedQROptions> = {
  width: 720,
  margin: 2,
  errorCorrectionLevel: "H",
};

/**
 * Generate QR code as PNG data URL
 * @param data - The data to encode in the QR code
 * @returns Promise<string> - Data URL string for PNG image
 */
export async function generateQRDataUrl(
  data: string,
  opts?: BrandedQROptions,
): Promise<string> {
  try {
    const merged = { ...defaultBrandedOpts, ...opts };
    const dataUrl = await QRCode.toDataURL(data, {
      width: merged.width,
      margin: merged.margin,
      errorCorrectionLevel: merged.errorCorrectionLevel,
      color: {
        dark: QR_BRAND.dark,
        light: QR_BRAND.light,
      },
    });
    return dataUrl;
  } catch (error) {
    console.error("Error generating QR code data URL:", error);
    throw new Error("Failed to generate QR code");
  }
}

/** Branded MesitaQR data URL — same palette as guest pay screens. */
export async function generateBrandedQRDataUrl(
  data: string,
  opts?: BrandedQROptions,
): Promise<string> {
  return generateQRDataUrl(data, opts);
}

/**
 * Draw Mesita logo mark (2×2 grid) on canvas center — needs error level H.
 */
export function drawMesitaLogoOnCanvas(
  canvas: HTMLCanvasElement,
  logoScale = 0.2,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = canvas.width;
  const logoSize = size * logoScale;
  const pad = logoSize * 0.18;
  const x = (size - logoSize) / 2 - pad;
  const y = (size - logoSize) / 2 - pad;
  const outer = logoSize + pad * 2;
  const r = outer * 0.14;

  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "rgba(27,23,20,0.08)";
  ctx.lineWidth = Math.max(2, size * 0.004);
  ctx.beginPath();
  ctx.roundRect(x, y, outer, outer, r);
  ctx.fill();
  ctx.stroke();

  const cell = logoSize * 0.38;
  const gap = logoSize * 0.12;
  const ox = (size - logoSize) / 2;
  const oy = (size - logoSize) / 2;
  const radius = cell * 0.22;

  const cells: Array<{ cx: number; cy: number; fill: string }> = [
    { cx: ox, cy: oy, fill: QR_BRAND.accent },
    { cx: ox + cell + gap, cy: oy, fill: QR_BRAND.ink },
    { cx: ox, cy: oy + cell + gap, fill: QR_BRAND.ink },
    { cx: ox + cell + gap, cy: oy + cell + gap, fill: QR_BRAND.accent },
  ];

  for (const cellDef of cells) {
    ctx.fillStyle = cellDef.fill;
    ctx.beginPath();
    ctx.roundRect(cellDef.cx, cellDef.cy, cell, cell, radius);
    ctx.fill();
  }
}

/** Client-only: branded QR with centered logo on canvas. */
export async function generateBrandedQRToCanvas(
  canvas: HTMLCanvasElement,
  data: string,
  opts?: BrandedQROptions,
): Promise<void> {
  const merged = { ...defaultBrandedOpts, ...opts };
  await QRCode.toCanvas(canvas, data, {
    width: merged.width,
    margin: merged.margin,
    errorCorrectionLevel: merged.errorCorrectionLevel,
    color: {
      dark: QR_BRAND.dark,
      light: QR_BRAND.light,
    },
  });
  drawMesitaLogoOnCanvas(canvas);
}

/**
 * Generate QR code as PDF file
 * @param data - The data to encode in the QR code
 * @param filename - Filename for the PDF (without extension)
 * @returns Promise<Buffer> - PDF file as Buffer
 */
export async function generateQRPdf(
  data: string,
  filename: string
): Promise<Buffer> {
  try {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(data);

    // Create PDF document
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Add title
    pdf.setFontSize(16);
    pdf.text("QR Code", 105, 20, { align: "center" });

    // Add QR code image (centered, 100mm x 100mm)
    const pageWidth = pdf.internal.pageSize.getWidth();
    const qrSize = 100;
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = 40;

    pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Add filename below QR code
    pdf.setFontSize(10);
    pdf.text(`${filename}`, 105, qrY + qrSize + 15, { align: "center" });

    // Return PDF as buffer
    return Buffer.from(pdf.output("arraybuffer"));
  } catch (error) {
    console.error("Error generating QR code PDF:", error);
    throw new Error("Failed to generate QR code PDF");
  }
}

/**
 * Multi-page A4 PDF — one page per demo table definition.
 * Header → QR → URL → scenario → items → operator notes (bottom).
 */
export async function generateDemoTableQrPdfPack(
  definitions: DemoTableDefinition[],
): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < definitions.length; i++) {
    if (i > 0) pdf.addPage();
    const def = definitions[i];
    const url = buildDemoPayUrl(def.token);

    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(def.restaurant.name, pageWidth / 2, 18, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text(`Mesa ${def.table.name}`, pageWidth / 2, 26, { align: "center" });

    // QR
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: QR_BRAND.dark, light: QR_BRAND.light },
    });
    const qrSize = 100;
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = 34;
    pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // URL (mono-ish)
    pdf.setFont("courier", "normal");
    pdf.setFontSize(10);
    pdf.text(url, pageWidth / 2, qrY + qrSize + 8, { align: "center" });

    // Scenario
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    const scenarioY = qrY + qrSize + 16;
    const wrappedScenario = pdf.splitTextToSize(
      def.scenarioDescription,
      pageWidth - 30,
    );
    pdf.text(wrappedScenario, pageWidth / 2, scenarioY, { align: "center" });

    // Items
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    let cursorY = scenarioY + 6 + wrappedScenario.length * 4;
    pdf.setFont("helvetica", "bold");
    pdf.text("Menú", 20, cursorY);
    cursorY += 5;
    pdf.setFont("helvetica", "normal");
    for (const item of def.items) {
      const line = `${item.qty} × ${item.name} — $${item.unitPrice.toFixed(2)}`;
      pdf.text(line, 22, cursorY);
      cursorY += 4.5;
    }

    // Operator notes (bottom)
    if (def.operatorNotes.length > 0) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9);
      let notesY = pageHeight - 18 - def.operatorNotes.length * 4.5;
      if (notesY < cursorY + 6) notesY = cursorY + 6;
      pdf.setFont("helvetica", "bold");
      pdf.text("Notas para operador:", 20, notesY);
      notesY += 4.5;
      pdf.setFont("helvetica", "italic");
      for (const note of def.operatorNotes) {
        const wrapped = pdf.splitTextToSize(`• ${note}`, pageWidth - 40);
        pdf.text(wrapped, 22, notesY);
        notesY += wrapped.length * 4.5;
      }
    }
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
