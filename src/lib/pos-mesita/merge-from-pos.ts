import type { DemoFoodItem } from "@/lib/demo-table-store";
import { emojiForPosDish } from "./menu-emoji";

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

/**
 * POS is source of truth: bill items mirror orden detalles.
 * Stable ids + emojis survive detalle add/remove/replace.
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
  const prevByDish = new Map<string, DemoFoodItem[]>();
  for (const it of items) {
    const k = priceKey(it.name, it.unitPrice);
    if (!prevByDish.has(k)) prevByDish.set(k, []);
    prevByDish.get(k)!.push(it);
  }
  const usedPrevIds = new Set<string>();

  const next: DemoFoodItem[] = [];
  let changed = detalles.length !== items.filter((i) => i.posDetalleId || !protectedIds.has(i.id)).length;

  for (const row of detalles) {
    const detalleId = row.id;
    const nombre = row.nombre?.trim() || "Ítem";
    const qty = Math.max(0.001, num(row.cantidad));
    const unitPrice = num(row.precio);
    const dishK = priceKey(nombre, unitPrice);

    const linked = prevByDetalle.get(detalleId);
    if (linked) {
      const emoji = linked.emoji || emojiForPosDish(nombre, unitPrice);
      const updated = {
        ...linked,
        name: nombre,
        qty,
        unitPrice,
        posDetalleId: detalleId,
        emoji,
      };
      if (
        linked.qty !== qty ||
        linked.unitPrice !== unitPrice ||
        linked.name !== nombre ||
        linked.emoji !== emoji
      ) {
        changed = true;
      }
      next.push(updated);
      usedPrevIds.add(linked.id);
      continue;
    }

    const dishPool = (prevByDish.get(dishK) ?? []).filter((it) => !usedPrevIds.has(it.id));
    const dishMatch = dishPool[0];
    if (dishMatch) {
      usedPrevIds.add(dishMatch.id);
      next.push({
        ...dishMatch,
        name: nombre,
        qty,
        unitPrice,
        posDetalleId: detalleId,
        emoji: dishMatch.emoji || emojiForPosDish(nombre, unitPrice),
      });
      changed = true;
      continue;
    }

    next.push({
      id: `pos-${detalleId}`,
      posDetalleId: detalleId,
      name: nombre,
      note: "",
      emoji: emojiForPosDish(nombre, unitPrice),
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
        it.posDetalleId === items[i]?.posDetalleId &&
        it.emoji === items[i]?.emoji,
    );

  return { items: next, changed: changed || !same };
}
