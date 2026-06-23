import type { Receipt } from "@/hooks/useGuestPaymentFlow";

import type { BillItem, MemberId, RestaurantConfig, TablePaymentSummary } from "./types";

const METHOD_LABELS: Record<string, string> = {
  card: "Tarjeta",
  kushki: "Tarjeta",
  datafast: "Datafast",
  diners: "Diners Club",
};

function formatReceiptDate(createdAt?: string): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString("es-EC", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function receiptFromSummary(
  payment: TablePaymentSummary,
  items: readonly BillItem[],
  config: RestaurantConfig,
): Receipt {
  const itemLines = (payment.itemIds ?? []).flatMap((id) => {
    const it = items.find((candidate) => candidate.id === id);
    if (!it) return [];
    return [
      {
        name: it.displayLabel ?? it.name,
        emoji: it.emoji,
        amt: it.qty * it.unitPrice,
      },
    ];
  });

  const subtotal = payment.subtotal ?? payment.amount / 1.25;
  const mode = payment.mode ?? "item";
  const how =
    mode === "equal"
      ? "División en partes iguales"
      : mode === "todo"
        ? "Cuenta completa"
        : itemLines.length > 0
          ? `${itemLines.length} plato${itemLines.length === 1 ? "" : "s"}`
          : "Tu pago";

  return {
    name: payment.guestName,
    amount: payment.amount,
    subtotal,
    iva: payment.iva ?? subtotal * config.ivaRate,
    propina: payment.tip ?? 0,
    servicio: payment.service ?? 0,
    ivaRate: config.ivaRate,
    mode,
    items: itemLines,
    how,
    method: "card",
    methodLabel: METHOD_LABELS[payment.method] ?? payment.method ?? "Tarjeta",
    eInvoice: null,
    ref: payment.ref ?? `PAY-${payment.createdAt ?? payment.guestId}`,
    date: formatReceiptDate(payment.createdAt),
  };
}

/** Merge server payments + local receipts for the receipt drawer (oldest = Pago 1). */
export function mergeDrawerReceipts(
  localReceipts: readonly Receipt[],
  paidSummaries: readonly TablePaymentSummary[],
  youId: MemberId,
  items: readonly BillItem[],
  config: RestaurantConfig,
): Receipt[] {
  const yours = paidSummaries
    .filter((p) => p.guestId === youId)
    .slice()
    .reverse();

  let fromServer = yours.map((p) => receiptFromSummary(p, items, config));

  // Fallback: if guestId mismatch but we have local receipts, use all summaries
  // for this guest's payment refs (single-device demo sessions).
  const usedFallback =
    fromServer.length === 0 && localReceipts.length > 0 && paidSummaries.length > 0;
  if (usedFallback) {
    fromServer = paidSummaries
      .slice()
      .reverse()
      .map((p) => receiptFromSummary(p, items, config));
  }
  const refs = new Set(fromServer.map((r) => r.ref));
  const extras = localReceipts.filter((r) => !refs.has(r.ref));

  // Server payments are authoritative when present — local receipts are a
  // client-side cache that often carries a different ref than recordDemoPayment.
  const merged =
    fromServer.length > 0 ? fromServer : extras.length > 0 ? extras : fromServer;

  return merged;
}
