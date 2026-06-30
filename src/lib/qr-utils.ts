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

/** Public pay URL for a production table token (UUID in QR). */
export function buildProductionPayUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/pay/${token}`;
}

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
 * Multi-page A4 PDF — one page per demo table.
 * Branded "La Doña Pepa" design: dark-green header, cream background,
 * large QR, two-column menu, orange accents.
 */
export async function generateDemoTableQrPdfPack(
  definitions: DemoTableDefinition[],
): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();   // 210 mm
  const H = pdf.internal.pageSize.getHeight();  // 297 mm

  // Brand palette
  const C = {
    greenDark:   "#14794B",
    greenAccent: "#2fb37e",
    orange:      "#E86A33",
    cream:       "#FFFDF9",
    ink:         "#1B1714",
    muted:       "#6B7280",
    border:      "#E7DDD2",
    white:       "#FFFFFF",
  } as const;

  // Convert hex to [r,g,b] tuple for jsPDF set*Color calls
  function rgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  for (let i = 0; i < definitions.length; i++) {
    if (i > 0) pdf.addPage();
    const def = definitions[i];
    const url = buildDemoPayUrl(def.token);
    const total = def.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

    // ── CREAM BACKGROUND ────────────────────────────────────────────────────
    pdf.setFillColor(...rgb(C.cream));
    pdf.rect(0, 0, W, H, "F");

    // ── HEADER BAND ─────────────────────────────────────────────────────────
    const headerH = 56;
    pdf.setFillColor(...rgb(C.greenDark));
    pdf.rect(0, 0, W, headerH, "F");

    // Thin orange stripe at bottom of header
    pdf.setFillColor(...rgb(C.orange));
    pdf.rect(0, headerH - 2, W, 2, "F");

    // Restaurant name
    pdf.setTextColor(...rgb(C.white));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(26);
    pdf.text(def.restaurant.name, W / 2, 22, { align: "center" });

    // Tagline
    pdf.setTextColor(180, 230, 200);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(def.restaurant.tagline, W / 2, 31, { align: "center" });

    // Mesa badge — orange pill
    const badgeLabel = `MESA  ${def.table.name}`;
    const badgeW = 36;
    const badgeH = 10;
    const badgeX = (W - badgeW) / 2;
    const badgeY = 38;
    pdf.setFillColor(...rgb(C.orange));
    pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 4, 4, "F");
    pdf.setTextColor(...rgb(C.white));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(badgeLabel, W / 2, badgeY + 7, { align: "center" });

    // ── QR CODE ─────────────────────────────────────────────────────────────
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 800,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: C.greenDark, light: C.cream },
    });

    const qrSize = 90;
    const qrX = (W - qrSize) / 2;
    const qrY = headerH + 8;

    // White card behind QR
    pdf.setFillColor(...rgb(C.white));
    pdf.setDrawColor(...rgb(C.border));
    pdf.setLineWidth(0.4);
    pdf.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 5, 5, "FD");

    pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // ── SCAN CTA ────────────────────────────────────────────────────────────
    const afterQrY = qrY + qrSize + 14;
    pdf.setTextColor(...rgb(C.ink));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("Escanea para pagar", W / 2, afterQrY, { align: "center" });

    // Instruction subtitle
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...rgb(C.muted));
    pdf.text("Abre la cámara de tu celular y apunta al código", W / 2, afterQrY + 6, { align: "center" });

    // URL
    pdf.setFont("courier", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...rgb(C.orange));
    pdf.text(url, W / 2, afterQrY + 13, { align: "center" });

    // ── DIVIDER ─────────────────────────────────────────────────────────────
    const divY = afterQrY + 19;
    pdf.setDrawColor(...rgb(C.border));
    pdf.setLineWidth(0.4);
    pdf.line(16, divY, W - 16, divY);

    // ── MENU ITEMS (two columns) ─────────────────────────────────────────────
    const menuStartY = divY + 9;
    pdf.setTextColor(...rgb(C.greenDark));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text("Lo que está en la mesa", 16, menuStartY - 3);

    const col1X = 16;
    const col2X = W / 2 + 4;
    const colW = W / 2 - 20;
    const rowH = 6;

    def.items.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = col === 0 ? col1X : col2X;
      const y = menuStartY + row * rowH;

      const name = `${item.emoji}  ${item.qty > 1 ? `${item.qty}× ` : ""}${item.name}`;
      const price = `$${(item.qty * item.unitPrice).toFixed(2)}`;
      const priceX = col === 0 ? col2X - 4 : W - 16;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...rgb(C.ink));
      pdf.text(name, x, y, { maxWidth: colW });

      pdf.setTextColor(...rgb(C.muted));
      pdf.text(price, priceX, y, { align: "right" });
    });

    const rows = Math.ceil(def.items.length / 2);
    const totalRowY = menuStartY + rows * rowH + 5;

    // Total row
    pdf.setDrawColor(...rgb(C.border));
    pdf.setLineWidth(0.3);
    pdf.line(16, totalRowY - 3, W - 16, totalRowY - 3);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...rgb(C.greenDark));
    pdf.text("Total de la mesa", 16, totalRowY + 2);
    pdf.setFontSize(11);
    pdf.text(`$${total.toFixed(2)}`, W - 16, totalRowY + 2, { align: "right" });

    // ── FOOTER ──────────────────────────────────────────────────────────────
    const footerH = 14;
    const footerY = H - footerH;
    pdf.setFillColor(...rgb(C.greenDark));
    pdf.rect(0, footerY, W, footerH, "F");

    // Left: MesitaQR
    pdf.setTextColor(...rgb(C.white));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("MesitaQR", 16, footerY + 9);

    // Center: website
    pdf.setTextColor(180, 230, 200);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("mesitaqr.com", W / 2, footerY + 9, { align: "center" });

    // Right: tagline
    pdf.setTextColor(180, 230, 200);
    pdf.setFontSize(7.5);
    pdf.text("Paga desde tu celular, sin hacer fila", W - 16, footerY + 9, { align: "right" });
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
