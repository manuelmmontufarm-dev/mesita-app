import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  PosPort,
  PosCapabilities,
  POSPulledOrder,
  POSConfirmPaymentParams,
} from "@/modules/pos";

const mockCapabilities: PosCapabilities = {
  supportsWebhooks: false,
  supportsPolling: true,
  supportsPartialPayments: true,
  supportsCloseBill: false,
  supportsMenuSync: false,
};

const sampleOrder: POSPulledOrder = {
  posDocumentId: "DOC-001",
  posTableId: "T4",
  posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
  items: [{ name: "Lomo fino", quantity: 1, unitPrice: 15.00 }],
  subtotal: 15.00,
  iva: 2.25,
  propina: 1.50,
  total: 18.75,
  currency: "USD",
  isClosedInPos: false,
};

const completeAdapter: PosPort = {
  capabilities: () => mockCapabilities,
  pullOrders: async () => [sampleOrder],
  confirmPayment: async (_params: POSConfirmPaymentParams) => ({
    success: true,
    posFacturaId: "FAC-001",
  }),
};

// @ts-expect-error — missing required methods must be rejected at compile time
const missingPullOrders: PosPort = {
  capabilities: () => mockCapabilities,
  confirmPayment: async () => ({ success: true }),
};

describe("PosPort interface", () => {
  it("accepts a complete implementation", () => {
    expectTypeOf(completeAdapter.capabilities).toBeFunction();
    expectTypeOf(completeAdapter.pullOrders).toBeFunction();
    expectTypeOf(completeAdapter.confirmPayment).toBeFunction();
  });

  it("capabilities() returns PosCapabilities shape", () => {
    const caps = completeAdapter.capabilities();
    expect(typeof caps.supportsWebhooks).toBe("boolean");
    expect(typeof caps.supportsPolling).toBe("boolean");
    expect(typeof caps.supportsPartialPayments).toBe("boolean");
    expect(typeof caps.supportsCloseBill).toBe("boolean");
    expect(typeof caps.supportsMenuSync).toBe("boolean");
  });

  it("pullOrders resolves to POSPulledOrder array", async () => {
    const orders = await completeAdapter.pullOrders();
    expect(Array.isArray(orders)).toBe(true);
    expect(orders[0].posDocumentId).toBe("DOC-001");
    expect(orders[0].propina).toBe(1.50);
    expect(orders[0].currency).toBe("USD");
  });

  it("confirmPayment resolves to POSConfirmPaymentResult shape", async () => {
    const result = await completeAdapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 18.75,
      paymentReference: "pay-xyz",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    expect(result.success).toBe(true);
    expect(result.posFacturaId).toBe("FAC-001");
  });

  it("ping is optional", () => {
    const hasPing = typeof completeAdapter.ping === "function";
    expect(hasPing).toBe(false);
  });
});
