import type { DemoFoodItem } from "@/lib/demo-table-store";

export interface PosOrdenDetalleRow {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  productoId?: string | null;
}

function priceKey(name: string, price: number): string {
  return `${name.trim().toLowerCase()}|${Math.round(price * 100)}`;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emojiForName(_name: string, prev?: DemoFoodItem): string {
  return prev?.emoji ?? "🍽️";
}

/**
 * POS is source of truth: bill items mirror orden detalles.
 * Paid-only rows stay visible if removed from POS after payment.
 */
export function mergePosDetallesIntoItems(
  items: DemoFoodItem[],
  detalles: PosOrdenDetalleRow[],
  opts: {
    paidItemIds?: string[];
    itemPaidUnits?: Record<string, number>;
  } = {},
): { items: DemoFoodItem[]; changed: boolean } {
  const paid = new Set(opts.paidItemIds ?? []);
  const partialPaid = new Set(
    Object.entries(opts.itemPaidUnits ?? {})
      .filter(([, u]) => u > 0)
      .map(([id]) => id),
  );
  const protectedIds = new Set([...paid, ...partialPaid]);

  const prevByDetalle = new Map(
    items.filter((it) => it.posDetalleId).map((it) => [it.posDetalleId!, it]),
  );
  const prevById = new Map(items.map((it) => [it.id, it]));
  const catalogPool = new Map<string, DemoFoodItem[]>();
  for (const it of items) {
    if (it.posDetalleId) continue;
    const k = priceKey(it.name, it.unitPrice);
    if (!catalogPool.has(k)) catalogPool.set(k, []);
    catalogPool.get(k)!.push(it);
  }
  const usedCatalogIds = new Set<string>();

  const next: DemoFoodItem[] = [];
  let changed = detalles.length !== items.filter((i) => i.posDetalleId || !protectedIds.has(i.id)).length;

  for (const row of detalles) {
    const detalleId = row.id;
    const nombre = row.nombre?.trim() || "Ítem";
    const qty = Math.max(0.001, num(row.cantidad));
    const unitPrice = num(row.precio);

    const linked = prevByDetalle.get(detalleId);
    if (linked) {
      const updated = {
        ...linked,
        name: nombre,
        qty,
        unitPrice,
        posDetalleId: detalleId,
      };
      if (
        linked.qty !== qty ||
        linked.unitPrice !== unitPrice ||
        linked.name !== nombre
      ) {
        changed = true;
      }
      next.push(updated);
      usedCatalogIds.add(linked.id);
      continue;
    }

    const key = priceKey(nombre, unitPrice);
    const pool = catalogPool.get(key) ?? [];
    const catalogMatch = pool.find((it) => !usedCatalogIds.has(it.id));
    if (catalogMatch) {
      usedCatalogIds.add(catalogMatch.id);
      next.push({
        ...catalogMatch,
        name: nombre,
        qty,
        unitPrice,
        posDetalleId: detalleId,
      });
      changed = true;
      continue;
    }

    next.push({
      id: `pos-${detalleId}`,
      posDetalleId: detalleId,
      name: nombre,
      note: "",
      emoji: emojiForName(nombre, prevById.get(`pos-${detalleId}`)),
      qty,
      unitPrice,
      posExternalId: row.productoId ?? undefined,
    });
    changed = true;
  }

  for (const it of items) {
    if (!protectedIds.has(it.id)) continue;
    if (next.some((n) => n.id === it.id)) continue;
    next.push({ ...it });
    changed = true;
  }

  const same =
    next.length === items.length &&
    next.every(
      (it, i) =>
        it.id === items[i]?.id &&
        it.qty === items[i]?.qty &&
        it.posDetalleId === items[i]?.posDetalleId,
    );

  return { items: next, changed: changed || !same };
}
