/**
 * Lease-election invariants for sync-if-stale (Phase 4) against the real
 * test database. Proves request coalescing: N concurrent readers → at most
 * one upstream fetch per freshness window.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { syncIfStale } from "@/modules/pos/application/sync-if-stale";
import type { PosOrderRepository } from "@/modules/pos/domain/pos-order.repository";

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  // no DB — suite becomes a skip
}
const dbDescribe = dbUp ? describe : describe.skip;

const createdRestaurantIds: string[] = [];

async function makeRestaurant() {
  const restaurant = await prisma.restaurant.create({
    data: { name: `test-lease-${randomUUID().slice(0, 8)}`, status: "ACTIVE" },
  });
  createdRestaurantIds.push(restaurant.id);
  return restaurant;
}

/** Adapter double that counts pulls; repo methods are never reached (0 orders). */
function countingAdapter(opts: { failing?: boolean; delayMs?: number } = {}) {
  let pulls = 0;
  return {
    adapter: {
      pullOrders: async () => {
        pulls += 1;
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (opts.failing) throw new Error("simulated upstream failure");
        return [];
      },
    },
    getPulls: () => pulls,
  };
}

const noopRepo = {
  findPosEnabledRestaurants: async () => [],
  findTablesByPosExternalIds: async () => [],
  findBillsByPosDocumentIds: async () => [],
  createBillWithItems: async () => undefined,
  syncBillItems: async () => undefined,
  markBillClosedFromPos: async () => undefined,
} as unknown as PosOrderRepository;

afterAll(async () => {
  for (const id of createdRestaurantIds) {
    await prisma.posSyncState.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
    await prisma.restaurant.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

dbDescribe("sync-if-stale lease election", () => {
  it("ten concurrent stale reads elect exactly ONE upstream fetcher", async () => {
    const restaurant = await makeRestaurant();
    const { adapter, getPulls } = countingAdapter({ delayMs: 300 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        syncIfStale(restaurant, adapter, noopRepo, { freshnessWindowMs: 5_000 })
      )
    );

    expect(getPulls()).toBe(1); // coalescing: 10 readers, 1 upstream call
    expect(results.filter((r) => r.fetched)).toHaveLength(1);
    // losers returned immediately with snapshot metadata, they did not fetch
    expect(results.filter((r) => !r.fetched)).toHaveLength(9);
  }, 60_000);

  it("a fresh snapshot serves reads with zero upstream calls", async () => {
    const restaurant = await makeRestaurant();
    const { adapter, getPulls } = countingAdapter();

    await syncIfStale(restaurant, adapter, noopRepo, { freshnessWindowMs: 30_000 });
    expect(getPulls()).toBe(1);

    const again = await Promise.all(
      Array.from({ length: 5 }, () =>
        syncIfStale(restaurant, adapter, noopRepo, { freshnessWindowMs: 30_000 })
      )
    );
    expect(getPulls()).toBe(1); // still one — snapshot fresh
    expect(again.every((r) => r.fresh && !r.fetched)).toBe(true);
  }, 60_000);

  it("upstream failure preserves the last snapshot and reports explicit unavailability", async () => {
    const restaurant = await makeRestaurant();

    // First: a successful sync commits a snapshot.
    const ok = countingAdapter();
    const first = await syncIfStale(restaurant, ok.adapter, noopRepo, { freshnessWindowMs: 1 });
    expect(first.upstreamAvailable).toBe(true);
    const committedAt = first.lastSuccessAt;

    // Then: upstream dies; a later stale read must NOT fabricate freshness.
    await new Promise((r) => setTimeout(r, 10));
    const bad = countingAdapter({ failing: true });
    const failed = await syncIfStale(restaurant, bad.adapter, noopRepo, { freshnessWindowMs: 1 });
    expect(failed.upstreamAvailable).toBe(false);
    expect(failed.fresh).toBe(false);
    expect(failed.lastError).toMatch(/failure|failed/i);
    // last committed snapshot timestamp preserved
    expect(failed.lastSuccessAt?.getTime()).toBe(committedAt?.getTime());

    // Lease released — the NEXT window can retry and recover.
    const recovered = await syncIfStale(restaurant, ok.adapter, noopRepo, { freshnessWindowMs: 1 });
    expect(recovered.upstreamAvailable).toBe(true);
    expect(recovered.lastError).toBeNull();
  }, 60_000);
});
