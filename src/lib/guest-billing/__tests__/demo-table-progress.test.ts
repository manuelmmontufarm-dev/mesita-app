import { describe, expect, it } from "vitest";

import { deriveDemoTableProgress } from "../demo-table-progress";
import type { BillItem } from "../types";

const config = {
  ivaRate: 0.15,
  serviceRate: 0.1,
  serviceEnabled: true,
};

const items: BillItem[] = [
  { id: "a", name: "A", qty: 1, unitPrice: 10 },
  { id: "b", name: "B", qty: 1, unitPrice: 10 },
];

describe("deriveDemoTableProgress", () => {
  it("marks table closed when all items are paid (todo)", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: ["a", "b"],
      paidGuestIds: ["g1"],
      guestCount: 2,
      config,
    });
    expect(p.tableClosed).toBe(true);
    expect(p.paidPct).toBe(100);
    expect(p.remainingSub).toBe(0);
  });

  it("uses guest count for equal split before items are marked paid", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: [],
      paidGuestIds: ["g1"],
      guestCount: 2,
      config,
    });
    expect(p.tableClosed).toBe(false);
    expect(p.paidPct).toBe(50);
    expect(p.paidCount).toBe(1);
  });

  it("closes when payments subtotal covers the bill", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: [],
      paidGuestIds: ["g1", "g2"],
      guestCount: 2,
      paymentsSubtotal: 20,
      config,
    });
    expect(p.tableClosed).toBe(true);
    expect(p.paidPct).toBe(100);
  });
});
