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
  const payments = [...state.payments];
  let changed = false;

  for (const doc of documentos) {
    for (const cobro of doc.cobros ?? []) {
      const ref = cobroRef(cobro);
      const amount = num(cobro.monto);
      if (amount <= 0.009) continue;
      if (ref && knownRefs.has(ref)) continue;

      const viaMesita = cobroViaMesita(cobro);
      const guestName = cobro.detalle?.trim() || (viaMesita ? "MesitaQR" : "Caja");
      const subtotal = num(doc.subtotal_15) > 0
        ? num(doc.subtotal_15)
        : amount / 1.25;

      payments.unshift({
        id: cobro.id || `pos-cobro-${ref || doc.id}`,
        guestId: `pos-${cobro.id || ref || doc.id}`,
        guestName,
        mode: "todo",
        amount,
        subtotal: Math.round(subtotal * 100) / 100,
        iva: num(doc.iva),
        service: num(doc.servicio),
        tip: 0,
        itemIds: [],
        method: cobro.forma_cobro === "EF" ? "Efectivo" : "Tarjeta",
        ref: ref || `POS-${doc.id}`,
        createdAt: cobro.created_at || doc.created_at || new Date().toISOString(),
      });
      if (ref) knownRefs.add(ref);
      changed = true;
    }
  }

  payments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const paidItemIds = [...state.paidItemIds];
  const itemPaidUnits = { ...state.itemPaidUnits };
  const billSub = state.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const paidSub = payments.reduce((s, p) => s + p.subtotal, 0);

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
  }

  return {
    payments,
    paidItemIds,
    itemPaidUnits,
    changed: changed || payments.length !== state.payments.length,
  };
}
