import QRCode from "qrcode";
import jsPDF from "jspdf";

/** MesitaQR brand tokens for printable / shareable QR assets */
export const QR_BRAND = {
  dark: "#14794B",
  light: "#FFFDF9",
  accent: "#2fb37e",
  ink: "#1B1714",
} as const;

export const DEMO_PAY_URL =
  process.env.NEXT_PUBLIC_DEMO_PAY_URL ?? "https://mesita-demo.vercel.app/pay/demo";

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
