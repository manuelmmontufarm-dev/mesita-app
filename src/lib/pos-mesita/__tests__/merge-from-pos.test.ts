import { describe, expect, it } from "vitest";

import { mergePosDetallesIntoItems } from "../merge-from-pos";
import type { DemoFoodItem } from "@/lib/demo-table-store";

const seed: DemoFoodItem[] = [
  { id: "bolon", name: "Bolón de verde", note: "", emoji: "🥟", qty: 1, unitPrice: 4.25 },
  { id: "churrasco", name: "Churrasco", note: "", emoji: "🥩", qty: 1, unitPrice: 9.5 },
  { id: "fritada", name: "Fritada", note: "", emoji: "🍖", qty: 1, unitPrice: 8.5 },
];

describe("mergePosDetallesIntoItems", () => {
  it("drops catalog rows not present in POS (POS authoritative)", () => {
    const { items } = mergePosDetallesIntoItems(seed, [
      { id: "d-1", nombre: "Churrasco", cantidad: 1, precio: 9.5 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Churrasco");
    expect(items[0].id).toBe("churrasco");
  });

  it("reflects POS removals", () => {
    const withPos: DemoFoodItem[] = [
      {
        id: "pos-d-1",
        posDetalleId: "d-1",
        name: "Llapingachos",
        note: "",
        emoji: "🥔",
        qty: 1,
        unitPrice: 6.75,
      },
    ];
    const { items } = mergePosDetallesIntoItems(withPos, []);
    expect(items).toHaveLength(0);
  });

  it("keeps paid rows removed from POS", () => {
    const withPos: DemoFoodItem[] = [
      {
        id: "pos-d-x",
        posDetalleId: "d-x",
        name: "Humita",
        note: "",
        emoji: "🌽",
        qty: 1,
        unitPrice: 3.25,
      },
    ];
    const { items } = mergePosDetallesIntoItems(withPos, [], {
      paidItemIds: ["pos-d-x"],
    });
    expect(items.some((i) => i.id === "pos-d-x")).toBe(true);
  });
});
