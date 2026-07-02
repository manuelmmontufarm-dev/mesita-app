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

vi.mock("@/modules/payments/adapters/resolve", () => ({
  buildProviderConfig: vi.fn().mockReturnValue({ provider: "STUB", environment: "SANDBOX" }),
  resolvePaymentProvider: vi.fn().mockReturnValue("STUB"),
}));

const demoFlags = vi.hoisted(() => ({ isDemo: false }));
vi.mock("@/lib/demo-restaurant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo-restaurant")>();
  return {
    ...actual,
    isDemoTableToken: vi.fn(() => demoFlags.isDemo),
    isDemoRestaurant: vi.fn(() => demoFlags.isDemo),
  };
});

import { Decimal } from "@prisma/client/runtime/library";
import { POST } from "../route";
import { prisma } from "@/lib/db";

const BILL_ID = "bill-00000000-0000-0000-0000-000000000001";
const TABLE_ID = "table-00000000-0000-0000-0000-000000000001";
const RESTAURANT_ID = "rest-00000000-0000-0000-0000-000000000001";
const TABLE_TOKEN = "tok-abc";
const IDEMPOTENCY_KEY = "00000000-0000-0000-0000-000000000001";

const mockRestaurant = {
  id: RESTAURANT_ID,
  paymentsEnabled: false,
  paymentProvider: "STUB",
  paymentPrivateKeyEnc: null,
  paymentPublicKey: null,
  paymentEnvironment: "SANDBOX",
  invoiceMode: "DISABLED",
  posProvider: null,
  posApiKeyEnc: null,
  posEnvironment: "SANDBOX",
  posTableField: null,
  posPaymentMethod: "EF",
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
  posTotal: null,
  invoiceRecipientPaymentId: null,
  items: [mockItem],
  payments: [],
  restaurant: mockRestaurant,
};

function makeRequest(body: object): Request {
  return new Request(`http://localhost/api/bills/${BILL_ID}/pay`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  amount: 12.5,
  paymentToken: "stub:4242",
  tableToken: TABLE_TOKEN,
  idempotencyKey: IDEMPOTENCY_KEY,
  splitMode: "FULL",
  guestData: { email: "test@example.com" },
};

describe("POST /api/bills/[billId]/pay — provider boundary (Relay 01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    demoFlags.isDemo = false;
    vi.mocked(prisma.table.findUnique).mockResolvedValue(mockTable as any);
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(mockBill as any);
  });

  it("demo tenant: STUB accepted (Table 12 experience proceeds past the provider gate)", async () => {
    demoFlags.isDemo = true;
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ billId: BILL_ID }) });
    expect(res.status).not.toBe(503);
  });

  it("real restaurant without payments enabled: explicit 503 unavailable — a stub token is NOT a bypass", async () => {
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ billId: BILL_ID }) });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/no disponibles/i);
  });

  it("real restaurant with payments enabled but STUB provider: explicit 503 (misconfiguration, not fallback)", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      ...mockBill,
      restaurant: { ...mockRestaurant, paymentsEnabled: true, paymentProvider: "STUB" },
    } as any);
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ billId: BILL_ID }) });
    expect(res.status).toBe(503);
  });
});
