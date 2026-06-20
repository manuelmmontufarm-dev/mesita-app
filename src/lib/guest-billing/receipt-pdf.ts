import jsPDF from "jspdf";
import type { Receipt } from "@/hooks/useGuestPaymentFlow";
import type { RestaurantConfig } from "@/lib/guest-billing/types";
import { fmt, guestLabel } from "@/lib/guest-billing/split-math";

type Cfg = Pick<RestaurantConfig, "name" | "table" | "tagline" | "city">;

const INK = { r: 27, g: 23, b: 20 } as const;
const MUTED = { r: 107, g: 114, b: 128 } as const;
const PAY = { r: 26, g: 158, b: 98 } as const;
const SEP = { r: 231, g: 221, b: 210 } as const;

function line(pdf: jsPDF, x1: number, y: number, x2: number, weight = 0.2) {
  pdf.setDrawColor(SEP.r, SEP.g, SEP.b);
  pdf.setLineWidth(weight);
  pdf.line(x1, y, x2, y);
}

function row(
  pdf: jsPDF,
  y: number,
  left: string,
  right: string,
  opts?: { bold?: boolean; size?: number; muted?: boolean },
) {
  const w = pdf.internal.pageSize.getWidth();
  const margin = 18;
  const size = opts?.size ?? 11;
  pdf.setFont("helvetica", opts?.bold ? "bold" : "normal");
  pdf.setFontSize(size);
  const color = opts?.muted ? MUTED : INK;
  pdf.setTextColor(color.r, color.g, color.b);
  pdf.text(left, margin, y);
  pdf.text(right, w - margin, y, { align: "right" });
}

export function downloadReceiptPdf(receipt: Receipt, config: Cfg): void {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  // Header band
  pdf.setFillColor(PAY.r, PAY.g, PAY.b);
  pdf.rect(0, 0, pageW, 32, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("MesitaQR", margin, 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text("Comprobante de pago", margin, 23);

  y = 44;
  pdf.setTextColor(INK.r, INK.g, INK.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(config.name, margin, y);
  y += 8;

  const subtitle = [config.tagline, config.city].filter(Boolean).join(" · ");
  if (subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    pdf.text(subtitle, margin, y, { maxWidth: contentW });
    y += 10;
  }

  // Status pill
  pdf.setFillColor(232, 247, 240);
  pdf.roundedRect(margin, y, 58, 9, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(PAY.r, PAY.g, PAY.b);
  pdf.text("PAGO APROBADO", margin + 5, y + 6);
  y += 18;

  // Hero amount
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  pdf.text("Total pagado", margin, y);
  y += 10;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(32);
  pdf.setTextColor(INK.r, INK.g, INK.b);
  pdf.text(fmt(receipt.amount), margin, y);
  y += 12;

  const payer = receipt.name?.trim() || guestLabel(1);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(`Pagado por ${payer}`, margin, y);
  y += 6;
  if (receipt.how) {
    pdf.setFontSize(10);
    pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    pdf.text(receipt.how, margin, y, { maxWidth: contentW });
    y += 8;
  } else {
    y += 4;
  }

  line(pdf, margin, y, pageW - margin);
  y += 10;

  const items = receipt.items ?? [];
  if (items.length > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(INK.r, INK.g, INK.b);
    pdf.text("Detalle", margin, y);
    y += 9;

    for (const it of items) {
      const label = `${it.emoji ? `${it.emoji} ` : ""}${it.name}`.trim();
      row(pdf, y, label, fmt(it.amt), { size: 11 });
      y += 7;
    }
    y += 4;
    line(pdf, margin, y, pageW - margin);
    y += 10;
  }

  const taxRows: Array<[string, string]> = [
    ["Subtotal", fmt(receipt.subtotal)],
  ];
  if (receipt.servicio > 0.001) taxRows.push(["Servicio", fmt(receipt.servicio)]);
  if (receipt.propina > 0.001) taxRows.push(["Propina", fmt(receipt.propina)]);
  taxRows.push([`IVA ${Math.round((receipt.ivaRate || 0.15) * 100)}%`, fmt(receipt.iva)]);

  for (const [k, v] of taxRows) {
    row(pdf, y, k, v, { size: 10, muted: true });
    y += 7;
  }

  y += 2;
  line(pdf, margin, y, pageW - margin, 0.45);
  y += 9;
  row(pdf, y, "Total", fmt(receipt.amount), { bold: true, size: 14 });
  y += 14;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(INK.r, INK.g, INK.b);
  pdf.text("Información", margin, y);
  y += 9;

  const meta: Array<[string, string]> = [
    ["Mesa", String(config.table)],
    ["Fecha", receipt.date || "—"],
    ["Método", receipt.methodLabel || "Tarjeta"],
    ["Referencia", receipt.ref || "—"],
  ];
  for (const [k, v] of meta) {
    row(pdf, y, k, v, { size: 10, muted: k !== "Referencia" });
    y += 7;
  }

  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  pdf.text(
    "Este documento es comprobante de pago vía MesitaQR. La factura electrónica SRI la emite el restaurante.",
    margin,
    y,
    { maxWidth: contentW },
  );
  y += 10;
  pdf.text("Gracias por tu visita · mesitaqr.com", pageW / 2, y, { align: "center" });

  pdf.save(`recibo-${receipt.ref}.pdf`);
}
