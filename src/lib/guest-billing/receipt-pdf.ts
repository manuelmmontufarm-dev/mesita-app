import jsPDF from "jspdf";
import type { Receipt } from "@/hooks/useGuestPaymentFlow";
import type { RestaurantConfig } from "@/lib/guest-billing/types";
import { fmt } from "@/lib/guest-billing/split-math";

type Cfg = Pick<RestaurantConfig, "name" | "table" | "tagline" | "city">;

export function downloadReceiptPdf(receipt: Receipt, config: Cfg): void {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const w = pdf.internal.pageSize.getWidth();
  let y = 14;
  const row = (l: string, r: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 11 : 10);
    pdf.text(l, 12, y);
    pdf.text(r, w - 12, y, { align: "right" });
    y += 6;
  };
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(config.name, w / 2, y, { align: "center" });
  y += 8;
  pdf.setFontSize(18);
  pdf.text(fmt(receipt.amount), w / 2, y, { align: "center" });
  y += 10;
  for (const it of receipt.items) row(`${it.emoji ?? ""} ${it.name}`.trim(), fmt(it.amt));
  row("Subtotal", fmt(receipt.subtotal));
  if (receipt.servicio > 0.001) row("Servicio", fmt(receipt.servicio));
  if (receipt.propina > 0.001) row("Propina", fmt(receipt.propina));
  row(`IVA ${Math.round(receipt.ivaRate * 100)}%`, fmt(receipt.iva));
  row("Total", fmt(receipt.amount), true);
  y += 4;
  row("Mesa", config.table);
  row("Fecha", receipt.date);
  row("Ref", receipt.ref);
  pdf.save(`recibo-${receipt.ref}.pdf`);
}
