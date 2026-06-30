import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../adapters/resolve", () => ({
  getPaymentAdapter: vi.fn(() => ({
    charge: vi.fn(),
    refund: vi.fn(),
  })),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: (s: string) => s,
}));

// Mock the Contifico adapter so process-payment tests don't open the network.
const confirmPaymentSpy = vi.fn();
const getOrderStatusSpy = vi.fn();
vi.mock("@/modules/pos/adapters/contifico.adapter", () => ({
  ContificoAdapter: class {
    confirmPayment = confirmPaymentSpy;
    getOrderStatus = getOrderStatusSpy;
  },
}));

vi.mock("uuid", () => ({ v4: () => "00000000-0000-0000-0000-000000000099" }));

import { processPayment } from "../process-payment";
import { getPaymentAdapter } from "../../adapters/resolve";

const BILL_ID = "bill-00000000-0000-0000-0000-000000000001";
const RESTAURANT_ID = "rest-00000000-0000-0000-0000-000000000001";
const IDEMPOTENCY_KEY = "00000000-0000-0000-0000-000000000001";
const PAYMENT_ID = "00000000-0000-0000-0000-000000000099";
const POS_DOC_ID = "DOC-XYZ";

const mockProviderConfig = {
  provider: "STUB" as const,
  environment: "SANDBOX" as const,
};

const mockItem = (id: string, isPaid = false, price = 10) => ({
  id,
  price,
  quantity: 1,
  isPaid,
});

const baseParams = {
  billId: BILL_ID,
  restaurantId: RESTAURANT_ID,
  amount: 12.2,
  voluntaryTipAmount: 0,
  chargeToken: "stub:4242",
  splitMode: "FULL" as const,
  providerConfig: mockProviderConfig,
  checkoutMode: "CONSUMIDOR_FINAL" as const,
  guestData: { email: "guest@example.com" },
  idempotencyKey: IDEMPOTENCY_KEY,
};

const posRestaurant = {
  invoiceMode: "POS",
  posProvider: "CONTIFICO",
  posApiKeyEnc: "encrypted-key",
  posEnvironment: "SANDBOX",
  posTableField: "descripcion_adicional",
  posPaymentMethod: "EF",
};

let billRepo: { findSnapshot: ReturnType<typeof vi.fn>; findPosInfo: ReturnType<typeof vi.fn> };
let paymentRepo: { findByIdempotencyKey: ReturnType<typeof vi.fn>; recordPaymentAtomically: ReturnType<typeof vi.fn> };

function setupRecordPayment(billStatus: string, thisPaymentIsRecipient = false) {
  paymentRepo.recordPaymentAtomically.mockResolvedValue({ billStatus, thisPaymentIsRecipient });
}

// Returns the current repo mocks — read at call time so beforeEach reassignment is picked up.
const repos = () => ({ bill: billRepo, payment: paymentRepo } as any);

let mockChargeFn: ReturnType<typeof vi.fn>;
let mockRefundFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  billRepo = { findSnapshot: vi.fn(), findPosInfo: vi.fn() };
  paymentRepo = { findByIdempotencyKey: vi.fn(), recordPaymentAtomically: vi.fn(), updatePosRegistration: vi.fn() };
  billRepo.findSnapshot.mockResolvedValue(null);
  billRepo.findPosInfo.mockResolvedValue(null);
  paymentRepo.findByIdempotencyKey.mockResolvedValue(null);
  paymentRepo.recordPaymentAtomically.mockResolvedValue({ billStatus: "FULLY_PAID", thisPaymentIsRecipient: false });
  mockChargeFn = vi.fn().mockResolvedValue({ approved: true, transactionId: "TKT-001" });
  mockRefundFn = vi.fn().mockResolvedValue({ success: true });
  vi.mocked(getPaymentAdapter).mockReturnValue({
    charge: mockChargeFn,
    refund: mockRefundFn,
  } as any);
  confirmPaymentSpy.mockResolvedValue({ success: true });
  getOrderStatusSpy.mockResolvedValue({ exists: true, isClosedInPos: false });
});

describe("processPayment", () => {
  it("FULL split, provider approves → FULLY_PAID, returns paymentId", async () => {
    setupRecordPayment("FULLY_PAID");

    const result = await processPayment(baseParams, repos());

    expect(mockChargeFn).toHaveBeenCalledWith(
      { chargeToken: "stub:4242", amount: 12.2, voluntaryTip: 0 },
      mockProviderConfig
    );
    expect(result.alreadyProcessed).toBe(false);
    expect(result.billStatus).toBe("FULLY_PAID");
    expect(result.paymentId).toBe(PAYMENT_ID);
  });

  it("duplicate idempotencyKey → alreadyProcessed:true, mockChargeFn not called", async () => {
    paymentRepo.findByIdempotencyKey.mockResolvedValue({ id: "existing-pay-id", billId: BILL_ID });

    const result = await processPayment(baseParams, repos());

    expect(result.alreadyProcessed).toBe(true);
    expect(result.paymentId).toBe("existing-pay-id");
    expect(mockChargeFn).not.toHaveBeenCalled();
    expect(paymentRepo.recordPaymentAtomically).not.toHaveBeenCalled();
  });

  it("provider declined → throws PaymentDeclinedError, no DB transaction", async () => {
    mockChargeFn.mockResolvedValue({
      approved: false,
      errorText: "Insufficient funds",
    });

    await expect(processPayment(baseParams, repos())).rejects.toThrow(
      "Payment declined: Insufficient funds"
    );
    expect(paymentRepo.recordPaymentAtomically).not.toHaveBeenCalled();
  });

  it("mockChargeFn throws → re-throws error, no DB transaction", async () => {
    mockChargeFn.mockRejectedValue(new Error("Network timeout"));

    await expect(processPayment(baseParams, repos())).rejects.toThrow("Network timeout");
    expect(paymentRepo.recordPaymentAtomically).not.toHaveBeenCalled();
  });

  it("DB transaction fails → stub token skips compensation refund, error re-thrown", async () => {
    const dbError = new Error("Constraint violation");
    paymentRepo.recordPaymentAtomically.mockRejectedValue(dbError);

    await expect(processPayment(baseParams, repos())).rejects.toThrow("Constraint violation");
    expect(mockRefundFn).not.toHaveBeenCalled();
  });

  it("BY_ITEM split with one item remaining unpaid → PARTIALLY_PAID", async () => {
    setupRecordPayment("PARTIALLY_PAID");

    const result = await processPayment(
      { ...baseParams, splitMode: "BY_ITEM", selectedItemIds: ["item-1"] },
      repos()
    );

    expect(result.billStatus).toBe("PARTIALLY_PAID");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Gap #3: freshness pre-check
// ────────────────────────────────────────────────────────────────────────────
describe("processPayment — Gap #3 (freshness pre-check)", () => {
  it("isClosedInPos:true and no prior MesaQR payment → throws BillAlreadyClosedError, no card charge", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    getOrderStatusSpy.mockResolvedValue({ exists: true, isClosedInPos: true });

    await expect(
      processPayment({ ...baseParams, posRestaurant }, repos())
    ).rejects.toThrow(/mesero/);
    expect(mockChargeFn).not.toHaveBeenCalled();
  });

  it("isClosedInPos:true but a prior COMPLETED payment exists → proceeds (Contífico flipped PRE→FAC after our prior split)", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10)],
      payments: [{ id: "prior-pay", status: "COMPLETED" }],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    getOrderStatusSpy.mockResolvedValue({ exists: true, isClosedInPos: true });
    setupRecordPayment("FULLY_PAID");

    const result = await processPayment({ ...baseParams, posRestaurant }, repos());
    expect(result.billStatus).toBe("FULLY_PAID");
    expect(mockChargeFn).toHaveBeenCalled();
  });

  it("exists:false → throws BillUnavailableError, no card charge", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    getOrderStatusSpy.mockResolvedValue({ exists: false, isClosedInPos: false });

    await expect(
      processPayment({ ...baseParams, posRestaurant }, repos())
    ).rejects.toThrow(/POS/);
    expect(mockChargeFn).not.toHaveBeenCalled();
  });

  it("getOrderStatus throws → fail-open, provider still charged", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    getOrderStatusSpy.mockRejectedValue(new Error("POS getOrderStatus failed: timeout"));
    setupRecordPayment("FULLY_PAID");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processPayment({ ...baseParams, posRestaurant }, repos());
    expect(result.billStatus).toBe("FULLY_PAID");
    expect(mockChargeFn).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/POS_PRECHECK_FAILED_FAIL_OPEN/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SRI $50 rule
// ────────────────────────────────────────────────────────────────────────────
describe("processPayment — SRI $50 rule", () => {
  it("bill.total > 50, last split, no recipient, CONSUMIDOR_FINAL → throws InvoiceDataRequiredError (422), no card charge", async () => {
    // 50 * 1.25 = 62.50 (> 50). Single unpaid item, FULL split → closes the bill.
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 50)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });

    await expect(
      processPayment({
        ...baseParams,
        amount: 62.5,
        posRestaurant,
        guestData: { email: "guest@example.com" }, // no identificacion → CONSUMIDOR_FINAL
      }, repos())
    ).rejects.toThrow(/ley ecuatoriana/);
    expect(mockChargeFn).not.toHaveBeenCalled();
  });

  it("bill.total > 50, last split with valid guestData → recordPaymentAtomically receives hasUsableGuestData:true", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 50)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    paymentRepo.recordPaymentAtomically.mockResolvedValue({ billStatus: "FULLY_PAID", thisPaymentIsRecipient: true });

    const result = await processPayment({
      ...baseParams,
      amount: 62.5,
      posRestaurant,
      guestData: {
        identificacion: "0102030405", // 10 digits → CEDULA
        email: "guest@example.com",
        nombre: "Real Guest",
      },
    }, repos());

    expect(result.billStatus).toBe("FULLY_PAID");
    expect(paymentRepo.recordPaymentAtomically).toHaveBeenCalledWith(
      expect.objectContaining({ hasUsableGuestData: true, paymentId: PAYMENT_ID })
    );
  });

  it("bill.total ≤ 50 with all CONSUMIDOR_FINAL → proceeds, no error", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10)], // 10 * 1.25 = 12.50 ≤ 50
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    setupRecordPayment("FULLY_PAID");

    const result = await processPayment({
      ...baseParams,
      amount: 12.5,
      posRestaurant,
      guestData: { email: "guest@example.com" }, // CF
    }, repos());
    expect(result.billStatus).toBe("FULLY_PAID");
  });

  it("bill.total > 50, last split CF but recipient already exists → proceeds", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 50)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: "prior-pay-id",
    });
    setupRecordPayment("FULLY_PAID");

    const result = await processPayment({
      ...baseParams,
      amount: 62.5,
      posRestaurant,
      guestData: { email: "guest@example.com" }, // CF — but recipient already exists
    }, repos());
    expect(result.billStatus).toBe("FULLY_PAID");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Option B: per-split partial cobros
// ────────────────────────────────────────────────────────────────────────────
describe("processPayment — Option B partial cobros", () => {
  it("calls adapter.confirmPayment with the PARTIAL split amount (not bill.total)", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10), mockItem("item-2", false, 10)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    billRepo.findPosInfo.mockResolvedValue({ posDocumentId: POS_DOC_ID, posToken: null });
    setupRecordPayment("PARTIALLY_PAID");

    const result = await processPayment(
      { ...baseParams, amount: 12.2, posRestaurant },
      repos()
    );

    expect(result.billStatus).toBe("PARTIALLY_PAID");
    expect(confirmPaymentSpy).toHaveBeenCalledTimes(1);
    expect(confirmPaymentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        posDocumentId: POS_DOC_ID,
        amount: 12.2,
        paymentReference: PAYMENT_ID,
      })
    );
  });

  it("passes guestData only when THIS payment becomes the recipient", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 50)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    billRepo.findPosInfo.mockResolvedValue({ posDocumentId: POS_DOC_ID, posToken: null });
    paymentRepo.recordPaymentAtomically.mockResolvedValue({ billStatus: "FULLY_PAID", thisPaymentIsRecipient: true });

    await processPayment({
      ...baseParams,
      amount: 62.5,
      posRestaurant,
      guestData: {
        identificacion: "0102030405",
        email: "guest@example.com",
        nombre: "Real Guest",
      },
    }, repos());

    expect(confirmPaymentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guestData: expect.objectContaining({
          tipo: "CEDULA",
          identificacion: "0102030405",
          email: "guest@example.com",
        }),
      })
    );
  });

  it("does NOT pass guestData when a prior recipient already exists (avoid re-PUT)", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 50)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: "prior-pay-id",
    });
    billRepo.findPosInfo.mockResolvedValue({ posDocumentId: POS_DOC_ID, posToken: null });
    paymentRepo.recordPaymentAtomically.mockResolvedValue({ billStatus: "FULLY_PAID", thisPaymentIsRecipient: false });

    await processPayment({
      ...baseParams,
      amount: 61.0,
      posRestaurant,
      guestData: {
        identificacion: "0102030405",
        email: "another@example.com",
      },
    }, repos());

    expect(confirmPaymentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ posDocumentId: POS_DOC_ID })
    );
    const passed = confirmPaymentSpy.mock.calls[0][0];
    expect(passed.guestData).toBeUndefined();
  });

  it("adapter.confirmPayment failure → logs POS_COBRO_FAILED, does NOT void provider charge, still returns success", async () => {
    billRepo.findSnapshot.mockResolvedValue({
      id: BILL_ID,
      posDocumentId: POS_DOC_ID,
      items: [mockItem("item-1", false, 10)],
      payments: [],
      equalSplitPeople: null,
      equalSharesPaid: 0,
      invoiceRecipientPaymentId: null,
    });
    billRepo.findPosInfo.mockResolvedValue({ posDocumentId: POS_DOC_ID, posToken: null });
    setupRecordPayment("FULLY_PAID");
    confirmPaymentSpy.mockResolvedValue({ success: false, errorMessage: "POS connection error" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processPayment({ ...baseParams, posRestaurant }, repos());
    expect(result.billStatus).toBe("FULLY_PAID");
    expect(mockRefundFn).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/POS_COBRO_FAILED/);
  });
});
