import { describe, expect, it } from "vitest";

import type { BillItem } from "../types";
import { expandRepeatedItems } from "../bill-display";

const makeItem = (id: string, name: string, overrides?: Partial<BillItem>): BillItem => ({
  id,
  name,
  qty: 1,
  unitPrice: 5.0,
  ...overrides,
});

describe("expandRepeatedItems", () => {
  it("returns empty array for empty input", () => {
    expect(expandRepeatedItems([])).toEqual([]);
  });

  it("three items with the same name get suffixed labels 1/2/3 and displayIndex 1/2/3", () => {
    const input = [
      makeItem("a1", "Club Verde"),
      makeItem("a2", "Club Verde"),
      makeItem("a3", "Club Verde"),
    ];

    const result = expandRepeatedItems(input);

    expect(result).toHaveLength(3);

    expect(result[0]).toMatchObject({ id: "a1", displayIndex: 1, displayLabel: "Club Verde 1" });
    expect(result[1]).toMatchObject({ id: "a2", displayIndex: 2, displayLabel: "Club Verde 2" });
    expect(result[2]).toMatchObject({ id: "a3", displayIndex: 3, displayLabel: "Club Verde 3" });
  });

  it("mezcla: nombres únicos sin sufijo, duplicados con sufijo en orden de aparición", () => {
    const input = [
      makeItem("loc", "Locro"),
      makeItem("cv1", "Club Verde"),
      makeItem("cv2", "Club Verde"),
      makeItem("cev", "Ceviche"),
      makeItem("cv3", "Club Verde"),
    ];

    const result = expandRepeatedItems(input);

    expect(result).toHaveLength(5);

    expect(result[0]).toMatchObject({ id: "loc", displayIndex: 1, displayLabel: "Locro" });
    expect(result[1]).toMatchObject({ id: "cv1", displayIndex: 2, displayLabel: "Club Verde 1" });
    expect(result[2]).toMatchObject({ id: "cv2", displayIndex: 3, displayLabel: "Club Verde 2" });
    expect(result[3]).toMatchObject({ id: "cev", displayIndex: 4, displayLabel: "Ceviche" });
    expect(result[4]).toMatchObject({ id: "cv3", displayIndex: 5, displayLabel: "Club Verde 3" });
  });

  it("no muta el array de entrada", () => {
    const input = [makeItem("a", "Club Verde"), makeItem("b", "Club Verde")];
    const inputCopy = input.map((item) => ({ ...item }));

    expandRepeatedItems(input);

    // Verificar que los objetos originales no cambiaron
    expect(input[0]).toEqual(inputCopy[0]);
    expect(input[1]).toEqual(inputCopy[1]);
    // Verificar que la referencia del array no cambió
    expect(input).toHaveLength(2);
  });

  it("devuelve un array nuevo (no la misma referencia)", () => {
    const input = [makeItem("a", "Locro")];
    const result = expandRepeatedItems(input);
    expect(result).not.toBe(input);
  });

  it("items con displayIndex/displayLabel preexistentes los sobrescribe", () => {
    const input: BillItem[] = [
      makeItem("a", "Locro", { displayIndex: 99, displayLabel: "viejo" }),
      makeItem("b", "Locro", { displayIndex: 99, displayLabel: "viejo" }),
    ];

    const result = expandRepeatedItems(input);

    expect(result[0]).toMatchObject({ displayIndex: 1, displayLabel: "Locro 1" });
    expect(result[1]).toMatchObject({ displayIndex: 2, displayLabel: "Locro 2" });
  });

  it("preserva los IDs originales sin modificarlos", () => {
    const input = [
      makeItem("id-abc-123", "Club Verde"),
      makeItem("id-def-456", "Club Verde"),
    ];

    const result = expandRepeatedItems(input);

    expect(result[0].id).toBe("id-abc-123");
    expect(result[1].id).toBe("id-def-456");
  });
});
