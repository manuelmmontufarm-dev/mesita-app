import type { BillItem, ItemId, SplitMode } from "./types";

/** Guest name that paid each item (item split mode), oldest payment wins. */
export function buildItemPayerNames(
  payments: readonly {
    guestName: string;
    mode?: SplitMode;
    itemIds?: readonly ItemId[];
  }[],
): Record<ItemId, string> {
  const map: Record<ItemId, string> = {};
  for (let i = payments.length - 1; i >= 0; i--) {
    const p = payments[i];
    if (p.mode !== "item" || !p.itemIds?.length) continue;
    for (const id of p.itemIds) {
      if (!(id in map)) map[id] = p.guestName;
    }
  }
  return map;
}

export function dockAmountLabel(mode: SplitMode): string {
  return mode === "todo" ? "Total mesa" : "Tu parte";
}

export function payButtonLabel(
  mode: SplitMode,
  formattedTotal: string,
  opts?: { again?: boolean },
): string {
  const again = opts?.again ?? false;
  if (mode === "todo") {
    return again
      ? `Pagar todo otra vez · ${formattedTotal}`
      : `Pagar todo · ${formattedTotal}`;
  }
  return again
    ? `Pagar otra vez · ${formattedTotal}`
    : `Pagar tu parte · ${formattedTotal}`;
}

export function dockPayButtonLabel(
  mode: SplitMode,
  formattedTotal: string,
  opts?: { again?: boolean; compact?: boolean },
): string {
  const again = opts?.again ?? false;
  const compact = opts?.compact ?? false;
  if (compact) {
    if (again) return "Pagar otra vez";
    return mode === "todo" ? "Pagar todo" : "Pagar";
  }
  return payButtonLabel(mode, formattedTotal, { again });
}

/** Dock CTA when the table still owes but nothing is selected yet. */
export function payAgainSelectLabel(mode: SplitMode): string {
  if (mode === "item") return "Pagar otra vez — elige platos";
  if (mode === "equal") return "Pagar otra vez — tu parte";
  return "Pagar otra vez";
}

export function backToBillLabel(remainingTotal: number, tableClosed: boolean): string {
  if (tableClosed || remainingTotal <= 0.01) return "Ver mesa";
  return "Volver a pagar";
}

export function billYourPartLabel(mode: SplitMode): string {
  return mode === "todo" ? "Total mesa" : "Tu parte";
}

/**
 * Asigna displayIndex (1..N) y displayLabel a cada item.
 *
 * - Si un nombre aparece más de una vez en la lista, todos sus duplicados
 *   reciben sufijo numérico en orden de aparición: "Club Verde 1", "Club Verde 2", …
 * - Si el nombre aparece una sola vez, displayLabel es igual al nombre original.
 * - No muta el array ni los objetos de entrada.
 * - Los IDs originales se preservan sin cambios.
 */
export function expandRepeatedItems(items: readonly BillItem[]): BillItem[] {
  // Contar cuántas veces aparece cada nombre
  const nameCount = new Map<string, number>();
  for (const item of items) {
    nameCount.set(item.name, (nameCount.get(item.name) ?? 0) + 1);
  }

  // Llevar conteo de apariciones por nombre para asignar sufijo secuencial
  const nameSeen = new Map<string, number>();

  return items.map((item, index) => {
    const count = nameCount.get(item.name) ?? 1;
    const occurrence = (nameSeen.get(item.name) ?? 0) + 1;
    nameSeen.set(item.name, occurrence);

    const displayLabel =
      count > 1 ? `${item.name} ${occurrence}` : item.name;

    return {
      ...item,
      displayIndex: index + 1,
      displayLabel,
    };
  });
}
