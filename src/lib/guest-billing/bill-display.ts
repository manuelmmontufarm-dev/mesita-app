import type { BillItem } from "./types";

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
