import { describe, expect, it } from "vitest";

import type { DemoFoodItem, DemoTableState } from "@/lib/demo-table-store";
import {
  buildItemIdMigrationMap,
  remapDemoItemReferences,
} from "../remap-item-refs";
import { emojiForPosDish } from "../menu-emoji";

describe("buildItemIdMigrationMap", () => {
  it("maps ids when POS replaces detalle id for same dish", () => {
    const oldItems: DemoFoodItem[] = [
      {
        id: "pos-old",
        posDetalleId: "d-old",
        name: "Cerveza Pilsener",
        note: "",
        emoji: "🍺",
        qty: 1,
        unitPrice: 2.75,
      },
    ];
    const newItems: DemoFoodItem[] = [
      {
        id: "pos-new",
        posDetalleId: "d-new",
        name: "Cerveza Pilsener",
        note: "",
        emoji: "🍺",
        qty: 1,
        unitPrice: 2.75,
      },
    ];
    const map = buildItemIdMigrationMap(oldItems, newItems);
    expect(map.get("pos-old")).toBe("pos-new");
  });
});

describe("remapDemoItemReferences", () => {
  it("moves claims to new item ids", () => {
    const draft: Pick<
      DemoTableState,
      "claims" | "claimShares" | "paidItemIds" | "itemPaidUnits" | "payments"
    > = {
      claims: { "pos-old": "guest-1" },
      claimShares: undefined,
      paidItemIds: [],
      itemPaidUnits: {},
      payments: [],
    };
    const idMap = new Map([["pos-old", "pos-new"]]);
    remapDemoItemReferences(draft, idMap);
    expect(draft.claims).toEqual({ "pos-new": "guest-1" });
  });
});

describe("emojiForPosDish", () => {
  it("resolves drinks and snacks from catalog heuristics", () => {
    expect(emojiForPosDish("Cerveza Pilsener", 2.75)).toBe("🍺");
    expect(emojiForPosDish("Patacones", 3)).toBe("🥔");
    expect(emojiForPosDish("Cola nacional", 1.75)).toBe("🥤");
  });
});
