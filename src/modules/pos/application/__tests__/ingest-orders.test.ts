import { describe, it, expect, vi, beforeEach } from "vitest";
import type { POSPulledOrder } from "@/modules/pos";
import type { PosIngestBill } from "../../domain/pos-order.repository";
import { ingestRestaurantOrders } from "../ingest-orders";

const RESTAURANT = { id: "rest-1", name: "Restaurante Test" };
const TABLE = { id: "table-1", posExternalId: "T4" };

const order: POSPulledOrder = {
  posDocumentId: "DOC-001",
  posTableId: "T4",
  posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
  items: [{ name: "Lomo fino", quantity: 1, unitPrice: 15.0 }],
  subtotal: 15.0,
  iva: 2.25,
  propina: 1.5,
  total: 18.75,
  currency: "USD",
  isClosedInPos: false,
};

/** Existing local bill that exactly mirrors `order` (change detection = no-op). */
const matchingBill: PosIngestBill = {
  id: "bill-existing",
  posDocumentId: "DOC-001",
  status: "UNPAID",
  closedAt: null,
  posTotal: 18.75,
  items: [{ id: "item-1", name: "Lomo fino", price: 15.0, quantity: 1 }],
};

const mockAdapter = (orders: POSPulledOrder[]) => ({
  pullOrders: vi.fn().mockResolvedValue(orders),
});

let posOrderRepo: {
  findPosEnabledRestaurants: ReturnType<typeof vi.fn>;
  findTablesByPosExternalIds: ReturnType<typeof vi.fn>;
  findBillsByPosDocumentIds: ReturnType<typeof vi.fn>;
  syncBillItems: ReturnType<typeof vi.fn>;
  createBillWithItems: ReturnType<typeof vi.fn>;
  markBillClosedFromPos: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  posOrderRepo = {
    findPosEnabledRestaurants: vi.fn(),
    findTablesByPosExternalIds: vi.fn().mockResolvedValue([TABLE]),
    findBillsByPosDocumentIds: vi.fn().mockResolvedValue([]),
    syncBillItems: vi.fn().mockResolvedValue(undefined),
    createBillWithItems: vi.fn().mockResolvedValue(undefined),
    markBillClosedFromPos: vi.fn().mockResolvedValue(undefined),
  };
});

describe("ingestRestaurantOrders", () => {
  it("creates a new bill when document is new", async () => {
    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([order]),
      posOrderRepo as never
    );

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

  it("updates existing bill when the POS document CHANGED (idempotent, D-04/D-06)", async () => {
    const changedOrder: POSPulledOrder = {
      ...order,
      items: [{ name: "Lomo fino", quantity: 2, unitPrice: 15.0 }],
      total: 37.5,
    };
    posOrderRepo.findBillsByPosDocumentIds.mockResolvedValue([matchingBill]);

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([changedOrder]),
      posOrderRepo as never
    );

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

  it("skips UNCHANGED documents with zero writes (perf: O(1) round trips per sync)", async () => {
    posOrderRepo.findBillsByPosDocumentIds.mockResolvedValue([matchingBill]);

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([order]),
      posOrderRepo as never
    );

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(posOrderRepo.syncBillItems).not.toHaveBeenCalled();
    expect(posOrderRepo.createBillWithItems).not.toHaveBeenCalled();
  });

  it("POS-side closure closes the local bill exactly once (C/G/A/F → FULLY_PAID)", async () => {
    const closedOrder: POSPulledOrder = { ...order, isClosedInPos: true };
    posOrderRepo.findBillsByPosDocumentIds.mockResolvedValue([matchingBill]);

    const first = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([closedOrder]),
      posOrderRepo as never
    );
    expect(first.updated).toBe(1);
    expect(posOrderRepo.markBillClosedFromPos).toHaveBeenCalledWith("bill-existing");

    // Second pull: local bill already closed → no-op.
    posOrderRepo.markBillClosedFromPos.mockClear();
    posOrderRepo.findBillsByPosDocumentIds.mockResolvedValue([
      { ...matchingBill, status: "FULLY_PAID", closedAt: new Date() },
    ]);
    const second = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([closedOrder]),
      posOrderRepo as never
    );
    expect(second.skipped).toBe(1);
    expect(posOrderRepo.markBillClosedFromPos).not.toHaveBeenCalled();
  });

  it("never creates local bills for documents that are ALREADY closed in the POS", async () => {
    const closedOrder: POSPulledOrder = { ...order, isClosedInPos: true };

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([closedOrder]),
      posOrderRepo as never
    );

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(posOrderRepo.createBillWithItems).not.toHaveBeenCalled();
    expect(posOrderRepo.markBillClosedFromPos).not.toHaveBeenCalled();
  });

  it("skips and counts documents with empty posTableId (D-05)", async () => {
    const unmappedOrder: POSPulledOrder = { ...order, posTableId: "" };

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([unmappedOrder]),
      posOrderRepo as never
    );

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
  });

  it("skips documents with no matching Table row (D-05)", async () => {
    posOrderRepo.findTablesByPosExternalIds.mockResolvedValue([]);

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([order]),
      posOrderRepo as never
    );

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
  });

  it("batches lookups: ONE bills query + ONE tables query for the whole pull", async () => {
    const orders: POSPulledOrder[] = Array.from({ length: 5 }, (_, i) => ({
      ...order,
      posDocumentId: `DOC-${i}`,
      posTableId: `T${i}`,
    }));
    posOrderRepo.findTablesByPosExternalIds.mockResolvedValue(
      orders.map((o, i) => ({ id: `table-${i}`, posExternalId: o.posTableId }))
    );

    await ingestRestaurantOrders(RESTAURANT, mockAdapter(orders), posOrderRepo as never);

    expect(posOrderRepo.findBillsByPosDocumentIds).toHaveBeenCalledTimes(1);
    expect(posOrderRepo.findTablesByPosExternalIds).toHaveBeenCalledTimes(1);
    expect(posOrderRepo.findTablesByPosExternalIds).toHaveBeenCalledWith(
      RESTAURANT.id,
      orders.map((o) => o.posTableId)
    );
  });

  it("stores POS totals verbatim — does not recompute (D-07)", async () => {
    await ingestRestaurantOrders(RESTAURANT, mockAdapter([order]), posOrderRepo as never);

    const callArg = posOrderRepo.createBillWithItems.mock.calls[0][0];
    expect(callArg.posDocumentId).toBe("DOC-001");
    expect(callArg.posToken).toBe("a004388c-1550-463e-a96e-a1dc4dfe7c8a");
    expect(callArg.items).toEqual(order.items);
    expect(callArg.totals).toEqual({ subtotal: 15.0, iva: 2.25, propina: 1.5, total: 18.75 });
  });

  it("isolates per-document failures — one bad doc does not abort the batch", async () => {
    const goodOrder: POSPulledOrder = { ...order, posDocumentId: "DOC-002", posTableId: "T4" };
    posOrderRepo.createBillWithItems
      .mockRejectedValueOnce(new Error("DB blip"))
      .mockResolvedValueOnce(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter([order, goodOrder]),
      posOrderRepo as never
    );

    expect(result.created).toBe(1); // good doc processed
    expect(result.errored).toBe(1); // bad doc counted, not swallowed
    errorSpy.mockRestore();
  });

  it("caps processing at 200 orders per run and logs POS_INGEST_BATCH_CAPPED", async () => {
    const manyOrders: POSPulledOrder[] = Array.from({ length: 250 }, (_, i) => ({
      ...order,
      posDocumentId: `DOC-${i}`,
    }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await ingestRestaurantOrders(
      RESTAURANT,
      mockAdapter(manyOrders),
      posOrderRepo as never
    );

    expect(result.created).toBe(200);
    expect(posOrderRepo.createBillWithItems).toHaveBeenCalledTimes(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("POS_INGEST_BATCH_CAPPED"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"totalPulled":250'));

    warnSpy.mockRestore();
  });
});
