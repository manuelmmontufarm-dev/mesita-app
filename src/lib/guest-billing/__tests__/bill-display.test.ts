import { describe, expect, it } from "vitest";

import type { BillItem } from "../types";
import { expandRepeatedItems, buildItemPayerNames, payButtonLabel, backToBillLabel } from "../bill-display";
import { equalShareSubtotal } from "../split-math";

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

describe("buildItemPayerNames", () => {
  it("maps item ids to the first payer name", () => {
    const map = buildItemPayerNames([
      { guestName: "María", mode: "item", itemIds: ["loc"] },
      { guestName: "Pedro", mode: "item", itemIds: ["cev"] },
    ]);
    expect(map).toEqual({ loc: "María", cev: "Pedro" });
  });

  it("ignores equal and todo payments", () => {
    const map = buildItemPayerNames([
      { guestName: "Ana", mode: "equal", itemIds: ["loc"] },
      { guestName: "Luis", mode: "todo", itemIds: ["cev"] },
    ]);
    expect(map).toEqual({});
  });
});

describe("payButtonLabel", () => {
  it("uses Pagar todo in todo mode", () => {
    expect(payButtonLabel("todo", "$50.00")).toBe("Pagar todo · $50.00");
  });

  it("uses again variant when requested", () => {
    expect(payButtonLabel("item", "$12.00", { again: true })).toBe(
      "Pagar otra vez · $12.00",
    );
  });

  it("uses Pagar tu parte in item and equal modes", () => {
    expect(payButtonLabel("item", "$12.00")).toBe("Pagar tu parte · $12.00");
    expect(payButtonLabel("equal", "$12.00")).toBe("Pagar tu parte · $12.00");
  });
});

describe("backToBillLabel", () => {
  it("shows Volver a pagar when balance remains", () => {
    expect(backToBillLabel(20, false)).toBe("Volver a pagar");
  });

  it("shows Ver mesa when table is closed", () => {
    expect(backToBillLabel(0, true)).toBe("Ver mesa");
  });
});

describe("equalShareSubtotal", () => {
  it("splits full bill by people and caps by remaining", () => {
    expect(equalShareSubtotal(100, 4, 100)).toBe(25);
    expect(equalShareSubtotal(100, 4, 30)).toBe(25);
    expect(equalShareSubtotal(100, 4, 10)).toBe(10);
  });
});
