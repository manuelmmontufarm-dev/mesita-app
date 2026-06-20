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

  it("paidPct reflects partial item units when items not fully marked paid", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: [],
      paidGuestIds: ["g1", "g2"],
      guestCount: 2,
      itemPaidUnits: { a: 1, b: 0.5 },
      paymentCount: 2,
      paymentsSubtotal: 15,
      config,
    });
    expect(p.paidPct).toBe(75);
    expect(p.paidCount).toBe(2);
    expect(p.tableClosed).toBe(false);
  });

  it("paymentCount drives paidCount not guest headcount", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: ["a"],
      paidGuestIds: ["g1"],
      guestCount: 2,
      paymentCount: 2,
      config,
    });
    expect(p.paidCount).toBe(2);
  });

  it("paidPct is 50 when half the subtotal is paid via items", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: ["a"],
      paidGuestIds: ["g1"],
      guestCount: 2,
      config,
    });
    expect(p.tableClosed).toBe(false);
    expect(p.paidPct).toBe(50);
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

  it("does not close when sole guest paid one item but bill remains open", () => {
    const p = deriveDemoTableProgress({
      items,
      paidItemIds: ["a"],
      paidGuestIds: ["g1"],
      guestCount: 1,
      config,
    });
    expect(p.tableClosed).toBe(false);
    expect(p.remainingSub).toBeGreaterThan(0);
  });
});
