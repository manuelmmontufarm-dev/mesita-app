import type { DemoSplitMode, DemoTableState } from "@/lib/demo-table-store";
import { buildItemIdMigrationMap } from "./remap-item-refs";

function lineSubtotal(item: { qty: number; unitPrice: number }): number {
  return Math.round(item.qty * item.unitPrice * 100) / 100;
}

function taxOnSubtotal(
  subtotal: number,
  restaurant: DemoTableState["restaurant"],
): { iva: number; service: number } {
  const iva = Math.round(subtotal * restaurant.ivaRate * 100) / 100;
  const service = restaurant.serviceEnabled
    ? Math.round(subtotal * restaurant.serviceRate * 100) / 100
    : 0;
  return { iva, service };
}

/** Resolve stale client item ids after a POS pull (claims keep working). */
export function resolvePayItemIds(
  state: DemoTableState,
  guestId: string,
  mode: DemoSplitMode,
  itemIds: string[],
): string[] {
  const known = new Set(state.items.map((i) => i.id));
  const fromClient = itemIds.filter((id) => known.has(id));
  if (fromClient.length > 0) return fromClient;

  if (mode === "todo") {
    return state.items
      .filter((item) => !state.paidItemIds.includes(item.id))
      .map((item) => item.id);
  }

  if (mode === "item") {
    return Object.entries(state.claims)
      .filter(([, owner]) => owner === guestId)
      .map(([id]) => id)
      .filter((id) => known.has(id) && !state.paidItemIds.includes(id));
  }

  return fromClient;
}

export function computeServerPayTotals(
  state: DemoTableState,
  mode: DemoSplitMode,
  itemIds: string[],
  equalPeople?: number,
  tip = 0,
): {
  subtotal: number;
  iva: number;
  service: number;
  amount: number;
  itemIds: string[];
} {
  const ids = resolvePayItemIds(state, "", mode, itemIds);
  const paidSub = state.payments.reduce((s, p) => s + p.subtotal, 0);
  const billSub = state.items.reduce((s, it) => s + lineSubtotal(it), 0);
  const remainingSub = Math.max(0, billSub - paidSub);

  let subtotal = 0;
  if (mode === "todo") {
    subtotal = remainingSub;
  } else if (mode === "equal") {
    subtotal = remainingSub / Math.max(1, equalPeople ?? 2);
  } else {
    subtotal = state.items
      .filter((item) => ids.includes(item.id))
      .reduce((s, item) => s + lineSubtotal(item), 0);
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const { iva, service } = taxOnSubtotal(subtotal, state.restaurant);
  const amount = Math.round((subtotal + iva + service + tip) * 100) / 100;

  return {
    subtotal,
    iva,
    service,
    amount,
    itemIds: mode === "todo"
      ? state.items.filter((i) => !state.paidItemIds.includes(i.id)).map((i) => i.id)
      : ids,
  };
}

/** Remap pay item ids when client payload predates the latest POS merge. */
export function remapPayItemIds(
  before: DemoTableState,
  after: DemoTableState,
  itemIds: string[],
): string[] {
  const idMap = buildItemIdMigrationMap(before.items, after.items);
  if (idMap.size === 0) return itemIds;
  return itemIds.map((id) => idMap.get(id) ?? id);
}
