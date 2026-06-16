import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    billItem: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { claimBillItemOptimistic, claimBillItemsOptimistic } from "../payment-utils";
import { prisma } from "@/lib/db";

const BILL_ID = "bill-test-001";
const RESTAURANT_ID = "rest-test-001";

import { Decimal } from "@prisma/client/runtime/library";

const mockBillItem = (
  id: string,
  version: number = 1,
  isPaid: boolean = false
) => ({
  id,
  billId: BILL_ID,
  restaurantId: RESTAURANT_ID,
  menuItemId: null,
  name: "Test Item",
  price: new Decimal(10.0),
  quantity: 1,
  version,
  isPaid,
  paidAt: isPaid ? new Date() : null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("claimBillItemOptimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("version match → succeeds and returns success:true", async () => {
    const itemId = "item-1";
    const readVersion = 1;

    vi.mocked(prisma.billItem.updateMany).mockResolvedValue({ count: 1 });

    const result = await claimBillItemOptimistic(itemId, readVersion);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(prisma.billItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: itemId,
        version: readVersion,
      },
      data: {
        isPaid: true,
        paidAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
  });

  it("version mismatch → fails with error message", async () => {
    const itemId = "item-1";
    const readVersion = 1;

    // updateMany returns count 0 when version doesn't match
    vi.mocked(prisma.billItem.updateMany).mockResolvedValue({ count: 0 });

    const result = await claimBillItemOptimistic(itemId, readVersion);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Este ítem ya fue pagado");
  });

  it("already paid item → returns failure with error", async () => {
    const itemId = "item-1";
    const readVersion = 2; // Version is higher because it was already paid

    // updateMany returns count 0 because item has been paid and version incremented
    vi.mocked(prisma.billItem.updateMany).mockResolvedValue({ count: 0 });

    const result = await claimBillItemOptimistic(itemId, readVersion);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Este ítem ya fue pagado");
  });

  it("database error → returns failure with error message", async () => {
    const itemId = "item-1";
    const readVersion = 1;
    const dbError = new Error("Database connection failed");

    vi.mocked(prisma.billItem.updateMany).mockRejectedValue(dbError);

    const result = await claimBillItemOptimistic(itemId, readVersion);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database connection failed");
  });
});

describe("claimBillItemsOptimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all items claimed atomically → succeeds and updates all items", async () => {
    const itemsWithVersions = [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
      { id: "item-3", version: 1 },
    ];

    const mockItems = itemsWithVersions.map(({ id, version }) =>
      mockBillItem(id, version, false)
    );

    vi.mocked(prisma.billItem.findMany).mockResolvedValue(mockItems);
    vi.mocked(prisma.$transaction).mockResolvedValue([
      { ...mockItems[0], isPaid: true },
      { ...mockItems[1], isPaid: true },
      { ...mockItems[2], isPaid: true },
    ]);

    const result = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.failedItemId).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("partial failure → no items updated, returns rollback behavior", async () => {
    const itemsWithVersions = [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
    ];

    const mockItems = [
      mockBillItem("item-1", 1, false),
      mockBillItem("item-2", 2, false), // Version mismatch
    ];

    vi.mocked(prisma.billItem.findMany).mockResolvedValue(mockItems);

    const result = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Version mismatch — item was modified");
    expect(result.failedItemId).toBe("item-2");
    // Transaction should not be called due to version check failure
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("empty array → handled gracefully", async () => {
    const itemsWithVersions: Array<{ id: string; version: number }> = [];

    vi.mocked(prisma.billItem.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);

    const result = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("one item already paid → rejects entire claim", async () => {
    const itemsWithVersions = [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
    ];

    const mockItems = [
      mockBillItem("item-1", 1, false),
      mockBillItem("item-2", 1, true), // Already paid
    ];

    vi.mocked(prisma.billItem.findMany).mockResolvedValue(mockItems);

    const result = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Este ítem ya fue pagado");
    expect(result.failedItemId).toBe("item-2");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("item not found → returns failure", async () => {
    const itemsWithVersions = [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
    ];

    // Only one item returned, but two requested
    vi.mocked(prisma.billItem.findMany).mockResolvedValue([
      mockBillItem("item-1", 1, false),
    ]);

    const result = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result.success).toBe(false);
    expect(result.error).toBe("One or more items not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("database error in transaction → returns failure", async () => {
    const itemsWithVersions = [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
    ];

    const mockItems = itemsWithVersions.map(({ id, version }) =>
      mockBillItem(id, version, false)
    );

    vi.mocked(prisma.billItem.findMany).mockResolvedValue(mockItems);
    const txError = new Error("Transaction failed");
    vi.mocked(prisma.$transaction).mockRejectedValue(txError);

    const result = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Transaction failed");
  });
});

describe("Concurrent scenarios — optimistic locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("two calls with same version → only first wins", async () => {
    const itemId = "item-1";
    const readVersion = 1;

    // First call succeeds (count: 1), second call fails (count: 0)
    vi.mocked(prisma.billItem.updateMany)
      .mockResolvedValueOnce({ count: 1 }) // First claim succeeds
      .mockResolvedValueOnce({ count: 0 }); // Second claim fails due to version increment

    const result1 = await claimBillItemOptimistic(itemId, readVersion);
    const result2 = await claimBillItemOptimistic(itemId, readVersion);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    expect(result2.error).toBe("Este ítem ya fue pagado");
  });

  it("concurrent batch claims with race condition → atomicity preserved", async () => {
    const itemsWithVersions = [
      { id: "item-1", version: 1 },
      { id: "item-2", version: 1 },
    ];

    const mockItems = itemsWithVersions.map(({ id, version }) =>
      mockBillItem(id, version, false)
    );

    // Simulate first concurrent caller starting to claim
    vi.mocked(prisma.billItem.findMany).mockResolvedValueOnce(mockItems);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce([
      { ...mockItems[0], isPaid: true, version: 2 },
      { ...mockItems[1], isPaid: true, version: 2 },
    ]);

    // Simulate second concurrent caller with stale version after first claim succeeded
    vi.mocked(prisma.billItem.findMany).mockResolvedValueOnce([
      mockBillItem("item-1", 2, true), // Already paid
      mockBillItem("item-2", 2, true), // Already paid
    ]);

    const result1 = await claimBillItemsOptimistic(itemsWithVersions);
    const result2 = await claimBillItemsOptimistic(itemsWithVersions);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    // Second caller detects items already paid (isPaid: true takes precedence in checks)
    expect(result2.error).toBe("Este ítem ya fue pagado");
  });
});
