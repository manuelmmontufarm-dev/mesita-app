import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ default: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

vi.mock("@/lib/db", () => ({
  prisma: {
    table: { findUnique: vi.fn() },
    bill: { findUnique: vi.fn() },
    payment: { findUnique: vi.fn(), create: vi.fn() },
    paymentBillItem: { createMany: vi.fn() },
    billGuestSession: { updateMany: vi.fn() },
    billItemClaim: { updateMany: vi.fn() },
    billItem: { updateMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/modules/payments/adapters/kushki/client", () => ({
  buildProviderConfig: vi.fn().mockReturnValue({ kushkiEnvironment: "SANDBOX" }),
  chargeCard: vi.fn(),
  refundPayment: vi.fn(),
}));

import { Decimal } from "@prisma/client/runtime/library";
import { POST } from "../route";
import { prisma } from "@/lib/db";
import { chargeCard, refundPayment } from "@/modules/payments/adapters/kushki/client";

const BILL_ID = "bill-00000000-0000-0000-0000-000000000001";
const TABLE_ID = "table-00000000-0000-0000-0000-000000000001";
const RESTAURANT_ID = "rest-00000000-0000-0000-0000-000000000001";
const TABLE_TOKEN = "tok-abc";
const IDEMPOTENCY_KEY = "00000000-0000-0000-0000-000000000001";

const mockRestaurant = {
  id: RESTAURANT_ID,
  paymentsEnabled: true,
  kushkiPrivateKeyEnc: "enc-key",
  kushkiPublicKey: "pub-key",
  kushkiEnvironment: "SANDBOX",
};

const mockTable = {
  id: TABLE_ID,
  restaurantId: RESTAURANT_ID,
  token: TABLE_TOKEN,
};

const mockItem = {
  id: "10000000-0000-0000-0000-000000000001",
  billId: BILL_ID,
  restaurantId: RESTAURANT_ID,
  price: new Decimal(10),
  quantity: 1,
  isPaid: false,
};

const mockBill = {
  id: BILL_ID,
  tableId: TABLE_ID,
  restaurantId: RESTAURANT_ID,
  status: "UNPAID",
  equalSplitPeople: null,
  equalSharesPaid: 0,
  posDocumentId: null,
  posToken: null,
  invoiceRecipientPaymentId: null,
  items: [mockItem],
  payments: [],
  restaurant: mockRestaurant,
};

const mockPaymentCreated = {
  id: "pay-00000000-0000-0000-0000-000000000001",
  billId: BILL_ID,
  status: "COMPLETED",
};

const mockUpdatedBill = { ...mockBill, status: "FULLY_PAID", closedAt: new Date() };

function makeRequest(body: object): Request {
  return new Request(`http://localhost/api/bills/${BILL_ID}/pay`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  amount: 12.5,
  kushkiToken: "kush-tok",
  tableToken: TABLE_TOKEN,
  idempotencyKey: IDEMPOTENCY_KEY,
  splitMode: "FULL",
  guestData: { email: "test@example.com" },
};

describe("POST /api/bills/[billId]/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.table.findUnique).mockResolvedValue(mockTable as any);
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(mockBill as any);
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);
    vi.mocked(chargeCard).mockResolvedValue({ approved: true, ticketNumber: "TKT-001" });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: { create: vi.fn().mockResolvedValue(mockPaymentCreated) },
        paymentBillItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        billGuestSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        billItemClaim: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        bill: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ ...mockBill, items: [mockItem] }),
          update: vi.fn().mockResolvedValue(mockUpdatedBill),
        },
        billItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([{ ...mockItem, isPaid: true }]),
        },
      };
      return callback(tx);
    });
  });

  it("full split, Kushki approves → bill FULLY_PAID → 200", async () => {
    const res = await POST(makeRequest(validBody), {
      params: Promise.resolve({ billId: BILL_ID }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(chargeCard)).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data.status).toBe("FULLY_PAID");
  });

  it("bill already FULLY_PAID → 400, no charge", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      ...mockBill,
      status: "FULLY_PAID",
    } as any);

    const res = await POST(makeRequest(validBody), {
      params: Promise.resolve({ billId: BILL_ID }),
    });

    expect(res.status).toBe(400);
    expect(vi.mocked(chargeCard)).not.toHaveBeenCalled();
  });

  it("duplicate idempotencyKey → 200, no second Kushki charge", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-existing",
      billId: BILL_ID,
      status: "COMPLETED",
    } as any);

    const res = await POST(makeRequest(validBody), {
      params: Promise.resolve({ billId: BILL_ID }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(chargeCard)).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.message).toBe("Payment already processed");
  });

  it("bill tableId doesn't match table → 404, no charge", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      ...mockBill,
      tableId: "table-different",
    } as any);

    const res = await POST(makeRequest(validBody), {
      params: Promise.resolve({ billId: BILL_ID }),
    });

    expect(res.status).toBe(404);
    expect(vi.mocked(chargeCard)).not.toHaveBeenCalled();
  });

  it("chargeCard returns declined → 402, no DB transaction", async () => {
    vi.mocked(chargeCard).mockResolvedValue({ approved: false, errorText: "Card declined" });

    const res = await POST(makeRequest(validBody), {
      params: Promise.resolve({ billId: BILL_ID }),
    });

    expect(res.status).toBe(402);
    expect(vi.mocked(prisma.$transaction)).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toContain("Card declined");
  });

  it("equal split underpayment → 400, no charge", async () => {
    const res = await POST(
      makeRequest({
        ...validBody,
        amount: 1,
        splitMode: "EQUAL",
        equalSplitPeople: 2,
      }),
      { params: Promise.resolve({ billId: BILL_ID }) }
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(chargeCard)).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toContain("less than selected balance");
  });

  it("by-item underpayment → 400, no charge", async () => {
    const res = await POST(
      makeRequest({
        ...validBody,
        amount: 1,
        splitMode: "BY_ITEM",
        selectedItemIds: [mockItem.id],
      }),
      { params: Promise.resolve({ billId: BILL_ID }) }
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(chargeCard)).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toContain("less than selected balance");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// EQUAL closing share against a POS-authoritative total
// ────────────────────────────────────────────────────────────────────────────
describe("POST /api/bills/[billId]/pay — EQUAL closing share (posTotal)", () => {
  // $50.02 split 4 ways: per-share = money(50.02 / 4) = 12.51, but after three
  // 12.51 payments the exact remainder is 50.02 − 37.53 = 12.49. The client
  // sends the naive per-share (12.51); the server must accept it and charge 12.49.
  const makePosBill = () => ({
    ...mockBill,
    status: "PARTIALLY_PAID",
    equalSplitPeople: 4,
    equalSharesPaid: 3,
    posTotal: new Decimal("50.02"),
    invoiceRecipientPaymentId: "prior-pay-id", // SRI recipient already captured
    payments: [
      { id: "p1", status: "COMPLETED", amount: new Decimal("12.51"), voluntaryTip: null },
      { id: "p2", status: "COMPLETED", amount: new Decimal("12.51"), voluntaryTip: null },
      { id: "p3", status: "COMPLETED", amount: new Decimal("12.51"), voluntaryTip: null },
    ],
  });

  function mockEqualTransaction(updateManyCount: number, posBill: object) {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: { create: vi.fn().mockResolvedValue(mockPaymentCreated) },
        bill: {
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValueOnce({ ...posBill, items: [mockItem] })
            .mockResolvedValueOnce({ ...posBill, equalSharesPaid: 4 }),
          update: vi.fn().mockResolvedValue({ status: "FULLY_PAID" }),
          updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
        },
        billItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([{ ...mockItem, isPaid: true }]),
        },
      };
      return callback(tx);
    });
  }

  it("client sends naive per-share 12.51 → 200, charges exact remainder 12.49", async () => {
    const posBill = makePosBill();
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(posBill as any);
    mockEqualTransaction(1, posBill);

    const res = await POST(
      makeRequest({ ...validBody, amount: 12.51, splitMode: "EQUAL", equalSplitPeople: 4 }),
      { params: Promise.resolve({ billId: BILL_ID }) }
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(chargeCard)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(chargeCard)).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12.49 }),
      expect.anything()
    );
    const body = await res.json();
    expect(body.data.amountCharged).toBe(12.49);
    expect(body.data.status).toBe("FULLY_PAID");
  });

  it("concurrent closing share loses the guarded claim → Kushki charge voided, 500", async () => {
    const posBill = makePosBill();
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(posBill as any);
    // Another guest's tx incremented equalSharesPaid to 4 first → our guarded
    // updateMany matches 0 rows → repository throws → compensation void.
    mockEqualTransaction(0, posBill);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      makeRequest({ ...validBody, amount: 12.49, splitMode: "EQUAL", equalSplitPeople: 4 }),
      { params: Promise.resolve({ billId: BILL_ID }) }
    );

    expect(res.status).toBe(500);
    expect(vi.mocked(refundPayment)).toHaveBeenCalledWith(
      expect.objectContaining({ ticketNumber: "TKT-001", amount: 12.49 }),
      expect.anything()
    );
    errorSpy.mockRestore();
  });
});
