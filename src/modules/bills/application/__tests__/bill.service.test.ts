import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  calculateRemainingBalance,
  calculateBillBreakdown,
  determineBillStatus,
} from "../bill.service";

const item = (price: number, quantity: number, isPaid = false) => ({
  price,
  quantity,
  isPaid,
});

describe("calculateRemainingBalance", () => {
  it("FULL mode — unpaid items × TAX_MULTIPLIER (1.25), rounded to cents", () => {
    const bill = {
      items: [item(10, 2, false), item(5, 1, true)],
      equalSplitPeople: null,
    };
    // Only unpaid: 10 × 2 = 20. 20 × 1.25 = 25.00
    expect(calculateRemainingBalance(bill, "FULL", 1)).toBe(25.0);
  });

  it("EQUAL mode — total of all items × TAX_MULTIPLIER (1.25) / N, rounded to cents", () => {
    const bill = {
      items: [item(10, 3, false)], // 30 × 1.25 = 37.50 / 3 = 12.50
      equalSplitPeople: null,
    };
    expect(calculateRemainingBalance(bill, "EQUAL", 3)).toBe(12.5);
  });

  it("FULL mode — all items paid returns 0", () => {
    const bill = {
      items: [item(10, 1, true), item(5, 2, true)],
      equalSplitPeople: null,
    };
    expect(calculateRemainingBalance(bill, "FULL", 1)).toBe(0);
  });
});

describe("calculateBillBreakdown", () => {
  it("returns correct subtotal, propina, iva, and total as Decimal", () => {
    const items = [item(10, 2), item(5, 1)]; // subtotal = 25
    const result = calculateBillBreakdown(items);

    // subtotal=25, propina=25×10%=2.5, iva=25×15%=3.75, total=31.25
    expect(result.subtotal.toNumber()).toBe(25);
    expect(result.propina.toNumber()).toBe(2.5);
    expect(result.iva.toNumber()).toBe(3.75);
    expect(result.total.toNumber()).toBe(31.25);
  });

  it("empty items array — all zeros", () => {
    const result = calculateBillBreakdown([]);

    expect(result.subtotal.toNumber()).toBe(0);
    expect(result.propina.toNumber()).toBe(0);
    expect(result.iva.toNumber()).toBe(0);
    expect(result.total.toNumber()).toBe(0);
  });

  it("accepts Decimal prices alongside plain numbers", () => {
    const items = [{ price: new Decimal("10.50"), quantity: 2, isPaid: false }];
    const result = calculateBillBreakdown(items);

    // subtotal=21, propina=21×10%=2.10, iva=21×15%=3.15, total=26.25
    expect(result.subtotal.toNumber()).toBe(21);
    expect(result.total.toNumber()).toBe(26.25);
  });
});

describe("determineBillStatus", () => {
  it("BY_ITEM — all items paid → FULLY_PAID", () => {
    const items = [
      { isPaid: true },
      { isPaid: true },
    ];
    expect(determineBillStatus("UNPAID", items, "BY_ITEM", 0, 1)).toBe("FULLY_PAID");
  });

  it("BY_ITEM — some items unpaid → PARTIALLY_PAID", () => {
    const items = [{ isPaid: true }, { isPaid: false }];
    expect(determineBillStatus("UNPAID", items, "BY_ITEM", 0, 1)).toBe("PARTIALLY_PAID");
  });

  it("EQUAL — shares paid >= total people → FULLY_PAID", () => {
    expect(determineBillStatus("PARTIALLY_PAID", [], "EQUAL", 3, 3)).toBe("FULLY_PAID");
  });

  it("EQUAL — shares paid < total people → PARTIALLY_PAID", () => {
    expect(determineBillStatus("UNPAID", [], "EQUAL", 1, 3)).toBe("PARTIALLY_PAID");
  });
});
