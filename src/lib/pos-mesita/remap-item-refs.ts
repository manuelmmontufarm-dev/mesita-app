import type { DemoFoodItem, DemoTableState } from "@/lib/demo-table-store";

export function dishKey(name: string, unitPrice: number): string {
  return `${name.trim().toLowerCase()}|${Math.round(unitPrice * 100)}`;
}

/** Map old item ids → new ids when POS sync rewrites detalle ids. */
export function buildItemIdMigrationMap(
  oldItems: DemoFoodItem[],
  newItems: DemoFoodItem[],
): Map<string, string> {
  const map = new Map<string, string>();
  const newById = new Map(newItems.map((i) => [i.id, i]));
  const newByDetalle = new Map(
    newItems
      .filter((i) => i.posDetalleId)
      .map((i) => [i.posDetalleId!, i]),
  );
  const newByDish = new Map<string, DemoFoodItem[]>();
  for (const item of newItems) {
    const key = dishKey(item.name, item.unitPrice);
    if (!newByDish.has(key)) newByDish.set(key, []);
    newByDish.get(key)!.push(item);
  }
  const usedTargetIds = new Set<string>();

  for (const old of oldItems) {
    if (newById.has(old.id)) continue;

    if (old.posDetalleId) {
      const byDetalle = newByDetalle.get(old.posDetalleId);
      if (byDetalle && !usedTargetIds.has(byDetalle.id)) {
        map.set(old.id, byDetalle.id);
        usedTargetIds.add(byDetalle.id);
        continue;
      }
    }

    const pool = newByDish.get(dishKey(old.name, old.unitPrice)) ?? [];
    const match = pool.find((n) => !usedTargetIds.has(n.id));
    if (match) {
      map.set(old.id, match.id);
      usedTargetIds.add(match.id);
    }
  }

  return map;
}

export function remapDemoItemReferences(
  draft: Pick<
    DemoTableState,
    "claims" | "claimShares" | "paidItemIds" | "itemPaidUnits" | "payments"
  >,
  idMap: Map<string, string>,
): boolean {
  if (idMap.size === 0) return false;
  const remap = (id: string) => idMap.get(id) ?? id;
  let changed = false;

  const nextClaims: Record<string, string> = {};
  for (const [itemId, guestId] of Object.entries(draft.claims)) {
    const nextId = remap(itemId);
    if (nextId !== itemId) changed = true;
    if (nextClaims[nextId] && nextClaims[nextId] !== guestId) {
      // collision — keep latest
    }
    nextClaims[nextId] = guestId;
  }
  draft.claims = nextClaims;

  if (draft.claimShares) {
    const nextShares: NonNullable<DemoTableState["claimShares"]> = {};
    for (const [itemId, shares] of Object.entries(draft.claimShares)) {
      const nextId = remap(itemId);
      if (nextId !== itemId) changed = true;
      nextShares[nextId] = shares;
    }
    draft.claimShares = nextShares;
  }

  draft.paidItemIds = Array.from(new Set(draft.paidItemIds.map(remap)));
  if (draft.itemPaidUnits) {
    const nextUnits: Record<string, number> = {};
    for (const [itemId, units] of Object.entries(draft.itemPaidUnits)) {
      const nextId = remap(itemId);
      if (nextId !== itemId) changed = true;
      nextUnits[nextId] = Math.max(nextUnits[nextId] ?? 0, units);
    }
    draft.itemPaidUnits = nextUnits;
  }

  for (const payment of draft.payments) {
    if (!payment.itemIds?.length) continue;
    const nextIds = payment.itemIds.map(remap);
    if (nextIds.some((id, i) => id !== payment.itemIds![i])) {
      payment.itemIds = nextIds;
      changed = true;
    }
  }

  return changed;
}
