import type { DemoPayment, DemoTableState } from "@/lib/demo-table-store";
import type { PosMesitaDocumento } from "./client";
import { cobroViaMesita } from "./client";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function cobroRef(cobro: PosMesitaDocumento["cobros"][number]): string {
  return (cobro.referencia ?? "").trim();
}

/**
 * Food subtotal credited by a single cobro — never the full document subtotal.
 * Using doc.subtotal_15 per cobro inflated paid totals (e.g. 25637% paid).
 */
export function cobroFoodSubtotal(
  cobro: PosMesitaDocumento["cobros"][number],
  doc: PosMesitaDocumento,
): number {
  const amount = num(cobro.monto);
  if (amount <= 0.009) return 0;

  const docTotal = num(doc.total);
  const docSub = num(doc.subtotal_15);
  if (docTotal > 0.009 && docSub > 0.009) {
    const ratio = Math.min(1, amount / docTotal);
    return Math.round(ratio * docSub * 100) / 100;
  }

  return Math.round((amount / 1.25) * 100) / 100;
}

function isCancelledDocument(doc: PosMesitaDocumento): boolean {
  const st = (doc.estado ?? "").toUpperCase();
  return st === "X" || st === "A";
}

/** Merge POS documento cobros into demo payments (Mesita + caja). */
export function mergePosCobrosIntoPayments(
  state: DemoTableState,
  documentos: PosMesitaDocumento[],
): {
  payments: DemoPayment[];
  paidItemIds: string[];
  itemPaidUnits: Record<string, number>;
  changed: boolean;
} {
  const knownRefs = new Set(state.payments.map((p) => p.ref).filter(Boolean));
  const knownCobroIds = new Set(
    state.payments
      .map((p) => p.id)
      .filter((id) => id.startsWith("pos-cobro-")),
  );
  const payments = [...state.payments];
  let changed = false;

  for (const doc of documentos) {
    if (isCancelledDocument(doc)) continue;

    for (const cobro of doc.cobros ?? []) {
      const ref = cobroRef(cobro);
      const amount = num(cobro.monto);
      if (amount <= 0.009) continue;

      const cobroId = cobro.id || `pos-cobro-${ref || doc.id}`;
      if (ref && knownRefs.has(ref)) continue;
      if (cobro.id && knownCobroIds.has(cobroId)) continue;

      const viaMesita = cobroViaMesita(cobro);
      const guestName = cobro.detalle?.trim() || (viaMesita ? "MesitaQR" : "Caja");
      const subtotal = cobroFoodSubtotal(cobro, doc);

      payments.unshift({
        id: cobroId,
        guestId: `pos-${cobro.id || ref || doc.id}`,
        guestName,
        mode: "todo",
        amount,
        subtotal,
        iva: num(doc.iva),
        service: num(doc.servicio),
        tip: 0,
        itemIds: [],
        method: cobro.forma_cobro === "EF" ? "Efectivo" : "Tarjeta",
        ref: ref || `POS-${doc.id}`,
        createdAt: cobro.created_at || doc.created_at || new Date().toISOString(),
      });
      if (ref) knownRefs.add(ref);
      if (cobro.id) knownCobroIds.add(cobroId);
      changed = true;
    }
  }

  payments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const itemPaidUnits = { ...state.itemPaidUnits };
  const billSub = state.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const paidSub = Math.min(
    billSub > 0 ? billSub : Infinity,
    payments.reduce((s, p) => s + p.subtotal, 0),
  );

  // Reconcile paid flags from payment totals — never trust stale paidItemIds alone.
  let paidItemIds = state.items
    .filter((it) => {
      const units = itemPaidUnits[it.id] ?? 0;
      return units >= it.qty - 0.001;
    })
    .map((it) => it.id);

  if (
    billSub > 0 &&
    paidSub >= billSub - 0.05 &&
    state.items.length > 0
  ) {
    for (const item of state.items) {
      if (!paidItemIds.includes(item.id)) {
        paidItemIds.push(item.id);
        itemPaidUnits[item.id] = item.qty;
        changed = true;
      }
    }
  } else if (paidSub < billSub - 0.05 && paidItemIds.length > 0) {
    // Payments no longer cover the bill (new POS items) — drop stale full-paid flags.
    const nextPaid: string[] = [];
    for (const item of state.items) {
      const units = itemPaidUnits[item.id] ?? 0;
      if (units >= item.qty - 0.001) nextPaid.push(item.id);
    }
    if (nextPaid.length !== paidItemIds.length) {
      paidItemIds = nextPaid;
      changed = true;
    }
  }

  return {
    payments,
    paidItemIds,
    itemPaidUnits,
    changed: changed || payments.length !== state.payments.length,
  };
}
