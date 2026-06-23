import { describe, expect, it } from "vitest";

import type { Receipt } from "@/hooks/useGuestPaymentFlow";

import { mergeDrawerReceipts } from "../drawer-receipts";
import type { RestaurantConfig, TablePaymentSummary } from "../types";

const config: RestaurantConfig = {
  name: "Test",
  table: "Mesa 1",
  currency: "USD",
  ivaRate: 0.15,
  serviceRate: 0.1,
  serviceEnabled: true,
  tipPresets: [10, 15, 20],
  defaultTip: 10,
};

const items = [
  { id: "a", name: "Locro", qty: 1, unitPrice: 4.5, emoji: "🥣" },
  { id: "b", name: "Seco", qty: 1, unitPrice: 8.9, emoji: "🍖" },
];

describe("mergeDrawerReceipts", () => {
  it("lists all server payments for you as Pago 1, Pago 2 (oldest first)", () => {
    const summaries: TablePaymentSummary[] = [
      {
        guestId: "you",
        guestName: "Ana",
        amount: 10,
        method: "card",
        mode: "item",
        subtotal: 8,
        ref: "MQR-2",
        createdAt: "2026-06-20T12:00:00.000Z",
        itemIds: ["b"],
      },
      {
        guestId: "you",
        guestName: "Ana",
        amount: 5,
        method: "card",
        mode: "item",
        subtotal: 4.5,
        ref: "MQR-1",
        createdAt: "2026-06-20T11:00:00.000Z",
        itemIds: ["a"],
      },
    ];

    const merged = mergeDrawerReceipts([], summaries, "you", items, config);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.ref).toBe("MQR-1");
    expect(merged[1]?.ref).toBe("MQR-2");
  });

  it("dedupes local receipts already on server by ref", () => {
    const local: Receipt[] = [
      {
        name: "Ana",
        amount: 5,
        subtotal: 4.5,
        iva: 0.68,
        propina: 0,
        servicio: 0.45,
        ivaRate: 0.15,
        mode: "item",
        items: [],
        how: "1 plato",
        method: "card",
        methodLabel: "Tarjeta",
        eInvoice: null,
        ref: "MQR-1",
        date: "2026-06-20",
      },
    ];
    const summaries: TablePaymentSummary[] = [
      {
        guestId: "you",
        guestName: "Ana",
        amount: 5,
        method: "card",
        ref: "MQR-1",
        subtotal: 4.5,
        itemIds: ["a"],
      },
    ];

    expect(mergeDrawerReceipts(local, summaries, "you", items, config)).toHaveLength(1);
  });

  it("does not double-count when local refs differ from server refs", () => {
    const local: Receipt[] = [
      {
        name: "Ana",
        amount: 18.76,
        subtotal: 15,
        iva: 2,
        propina: 0,
        servicio: 1,
        ivaRate: 0.15,
        mode: "item",
        items: [],
        how: "1 plato",
        method: "card",
        methodLabel: "Tarjeta",
        eInvoice: null,
        ref: "MQR-LOCAL-1",
        date: "2026-06-20",
      },
      {
        name: "Ana",
        amount: 36.4,
        subtotal: 30,
        iva: 4,
        propina: 0,
        servicio: 2,
        ivaRate: 0.15,
        mode: "todo",
        items: [],
        how: "todo",
        method: "card",
        methodLabel: "Tarjeta",
        eInvoice: null,
        ref: "MQR-LOCAL-2",
        date: "2026-06-20",
      },
    ];
    const summaries: TablePaymentSummary[] = [
      {
        guestId: "you",
        guestName: "Ana",
        amount: 18.76,
        method: "card",
        ref: "MQR-SERVER-1",
        subtotal: 15,
        mode: "item",
      },
      {
        guestId: "you",
        guestName: "Ana",
        amount: 36.4,
        method: "card",
        ref: "MQR-SERVER-2",
        subtotal: 30,
        mode: "todo",
      },
    ];

    const merged = mergeDrawerReceipts(local, summaries, "you", items, config);
    expect(merged).toHaveLength(2);
    expect(merged.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(55.16, 2);
    expect(merged.map((r) => r.ref).sort()).toEqual(["MQR-SERVER-1", "MQR-SERVER-2"]);
  });
});
