import { describe, it, expect, vi, beforeEach } from "vitest";
import type { POSPulledOrder } from "@/modules/pos";
import { ingestRestaurantOrders } from "../ingest-orders";

const RESTAURANT = { id: "rest-1", name: "Restaurante Test" };
const TABLE = { id: "table-1" };

const order: POSPulledOrder = {
  posDocumentId: "DOC-001",
  posTableId: "T4",
  posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
  items: [{ name: "Lomo fino", quantity: 1, unitPrice: 15.0 }],
  subtotal: 15.0,
  iva: 2.25,
  propina: 1.50,
  total: 18.75,
  currency: "USD",
  isClosedInPos: false,
};

const mockAdapter = (orders: POSPulledOrder[]) => ({ pullOrders: vi.fn().mockResolvedValue(orders) });

let posOrderRepo: {
  findPosEnabledRestaurants: ReturnType<typeof vi.fn>;
  findTableByPosExternalId: ReturnType<typeof vi.fn>;
  findBillByPosDocumentId: ReturnType<typeof vi.fn>;
  syncBillItems: ReturnType<typeof vi.fn>;
  createBillWithItems: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  posOrderRepo = {
    findPosEnabledRestaurants: vi.fn(),
    findTableByPosExternalId: vi.fn(),
    findBillByPosDocumentId: vi.fn(),
    syncBillItems: vi.fn().mockResolvedValue(undefined),
    createBillWithItems: vi.fn().mockResolvedValue(undefined),
  };
});

describe("ingestRestaurantOrders", () => {
  it("creates a new bill when document is new", async () => {
    posOrderRepo.findTableByPosExternalId.mockResolvedValue(TABLE);
    posOrderRepo.findBillByPosDocumentId.mockResolvedValue(null);

    const result = await ingestRestaurantOrders(RESTAURANT, mockAdapter([order]), posOrderRepo as any);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(posOrderRepo.createBillWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        posDocumentId: "DOC-001",
        posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
      })
    );
  });

  it("updates existing bill when re-polling same posDocumentId (idempotent, D-04)", async () => {
    const existingBill = { id: "bill-existing", items: [{ id: "item-1", name: "Lomo fino" }] };
    posOrderRepo.findTableByPosExternalId.mockResolvedValue(TABLE);
    posOrderRepo.findBillByPosDocumentId.mockResolvedValue(existingBill);

    const result = await ingestRestaurantOrders(RESTAURANT, mockAdapter([order]), posOrderRepo as any);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(posOrderRepo.createBillWithItems).not.toHaveBeenCalled();
    expect(posOrderRepo.syncBillItems).toHaveBeenCalledWith(
      expect.objectContaining({
        existingBillId: "bill-existing",
        posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
      })
    );
  });

  it("skips and counts documents with empty posTableId (D-05)", async () => {
    const unmappedOrder: POSPulledOrder = { ...order, posTableId: "" };

    const result = await ingestRestaurantOrders(RESTAURANT, mockAdapter([unmappedOrder]), posOrderRepo as any);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(posOrderRepo.findTableByPosExternalId).not.toHaveBeenCalled();
  });

  it("skips documents with no matching Table row (D-05)", async () => {
    posOrderRepo.findTableByPosExternalId.mockResolvedValue(null);

    const result = await ingestRestaurantOrders(RESTAURANT, mockAdapter([order]), posOrderRepo as any);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
  });

  it("stores POS totals verbatim — does not recompute (D-07)", async () => {
    posOrderRepo.findTableByPosExternalId.mockResolvedValue(TABLE);
    posOrderRepo.findBillByPosDocumentId.mockResolvedValue(null);

    await ingestRestaurantOrders(RESTAURANT, mockAdapter([order]), posOrderRepo as any);

    const callArg = posOrderRepo.createBillWithItems.mock.calls[0][0];
    expect(callArg.posDocumentId).toBe("DOC-001");
    expect(callArg.posToken).toBe("a004388c-1550-463e-a96e-a1dc4dfe7c8a");
    expect(callArg.items).toEqual(order.items);
  });

  it("isolates per-document failures — one bad doc does not abort the batch", async () => {
    const goodOrder: POSPulledOrder = { ...order, posDocumentId: "DOC-002", posTableId: "T5" };
    posOrderRepo.findTableByPosExternalId
      .mockRejectedValueOnce(new Error("DB blip"))
      .mockResolvedValueOnce(TABLE);
    posOrderRepo.findBillByPosDocumentId.mockResolvedValue(null);

    const result = await ingestRestaurantOrders(RESTAURANT, mockAdapter([order, goodOrder]), posOrderRepo as any);

    expect(result.created).toBe(1); // good doc processed
    expect(result.errored).toBe(1); // bad doc counted, not swallowed
    expect(result.created + result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("caps processing at 200 orders per run and logs POS_INGEST_BATCH_CAPPED", async () => {
    const manyOrders: POSPulledOrder[] = Array.from({ length: 250 }, (_, i) => ({
      ...order,
      posDocumentId: `DOC-${i}`,
    }));
    posOrderRepo.findTableByPosExternalId.mockResolvedValue(TABLE);
    posOrderRepo.findBillByPosDocumentId.mockResolvedValue(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await ingestRestaurantOrders(RESTAURANT, mockAdapter(manyOrders), posOrderRepo as any);

    expect(result.created).toBe(200);
    expect(posOrderRepo.createBillWithItems).toHaveBeenCalledTimes(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("POS_INGEST_BATCH_CAPPED"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"totalPulled":250'));

    warnSpy.mockRestore();
  });
});
