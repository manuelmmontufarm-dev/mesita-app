import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { PosPort } from "../domain/pos.port";
import type { PosOrderRepository } from "../domain/pos-order.repository";
import { ingestRestaurantOrders } from "./ingest-orders";

/**
 * Active-session synchronization (Phase 4) — sync-if-stale with a Supabase
 * lease so N concurrent readers produce AT MOST ONE upstream fetch per
 * freshness window. Vercel Cron remains a recovery backstop only (Hobby cron
 * is daily — never the live mechanism).
 *
 * Flow per read:
 * 1. Snapshot fresh (lastSuccessAt within freshnessWindowMs) → serve it, no
 *    upstream call.
 * 2. Stale → try to WIN the lease with one atomic conditional UPDATE
 *    (updateMany where lease is free/expired). Exactly one caller wins.
 * 3. Winner pulls + ingests, commits lastSuccessAt, releases the lease.
 *    Losers return immediately with the latest committed snapshot and
 *    explicit staleness metadata — they never wait and never fetch.
 * 4. Upstream failure: keep the last snapshot, record lastError, report
 *    { stale: true, upstreamAvailable: false }. Values are never fabricated.
 */

export interface SyncIfStaleResult {
  /** did THIS call perform the upstream fetch? */
  fetched: boolean;
  /** data is within the freshness window */
  fresh: boolean;
  /** false when the last upstream attempt failed (snapshot may be old) */
  upstreamAvailable: boolean;
  /** timestamp of the last committed snapshot; null = never synced */
  lastSuccessAt: Date | null;
  /** sanitized last error, when upstreamAvailable is false */
  lastError: string | null;
}

export interface SyncIfStaleOptions {
  /** how old a snapshot may be before a read triggers a fetch (default 1500ms) */
  freshnessWindowMs?: number;
  /** how long the winner holds the lease before it is re-electable (default 10s) */
  leaseDurationMs?: number;
}

const DEFAULT_FRESHNESS_MS = 1_500;
const DEFAULT_LEASE_MS = 10_000;

/** Stable per-process fetcher identity (one lambda instance = one owner id). */
const instanceId = `sync-${randomUUID().slice(0, 12)}`;

/**
 * Convenience for read paths: resolve the table token → restaurant, and run
 * sync-if-stale when the restaurant is POS-enabled. Returns null (and stays
 * silent) for non-POS restaurants or config errors — a guest read must never
 * fail because sync plumbing does.
 */
export async function syncForTableToken(
  token: string,
  options: SyncIfStaleOptions = {}
): Promise<SyncIfStaleResult | null> {
  try {
    const table = await prisma.table.findUnique({
      where: { token },
      include: { restaurant: true },
    });
    if (!table || table.restaurant.invoiceMode !== "POS" || !table.restaurant.posProvider) {
      return null;
    }
    // Lazy imports avoid a static cycle (adapters → contract → …)
    const [{ buildPosConfig }, { ContificoAdapter }, { PrismaPosOrderRepository }] =
      await Promise.all([
        import("../adapters/pos-config"),
        import("../adapters/contifico.adapter"),
        import("../adapters/prisma/pos-order.repository"),
      ]);
    const config = buildPosConfig(table.restaurant);
    const adapter = new ContificoAdapter(config);
    return await syncIfStale(
      { id: table.restaurant.id, name: table.restaurant.name },
      adapter,
      new PrismaPosOrderRepository(),
      options
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "POS_SYNC_IF_STALE_FAILED",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      })
    );
    return null;
  }
}

export async function syncIfStale(
  restaurant: { id: string; name: string },
  adapter: Pick<PosPort, "pullOrders">,
  posOrderRepo: PosOrderRepository,
  options: SyncIfStaleOptions = {}
): Promise<SyncIfStaleResult> {
  const freshnessMs = options.freshnessWindowMs ?? DEFAULT_FRESHNESS_MS;
  const leaseMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
  const now = new Date();

  // Lease election FIRST — one atomic conditional UPDATE, one DB round trip
  // on the hot path (round trips dominate propagation latency; see the SLO
  // bench). The freshness check lives INSIDE the atomic claim, so a fetch
  // that committed a moment ago makes this a no-op for everyone.
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const won = await prisma.posSyncState.updateMany({
    where: {
      restaurantId: restaurant.id,
      AND: [
        // lease is free or expired…
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        // …and the snapshot is still stale.
        {
          OR: [
            { lastSuccessAt: null },
            { lastSuccessAt: { lt: new Date(now.getTime() - freshnessMs) } },
          ],
        },
      ],
    },
    data: { leaseOwner: instanceId, leaseUntil, lastSyncAt: now },
  });

  if (won.count !== 1) {
    // Fresh snapshot, someone else's lease, or a missing row — one read
    // distinguishes them. No waiting either way.
    const latest = await prisma.posSyncState.findUnique({
      where: { restaurantId: restaurant.id },
    });
    if (!latest) {
      // First-ever sync for this restaurant: create the row (unique key
      // resolves creation races) and recurse once to run the election.
      await prisma.posSyncState
        .upsert({
          where: { restaurantId: restaurant.id },
          create: { restaurantId: restaurant.id },
          update: {},
        })
        .catch(() => undefined);
      return syncIfStale(restaurant, adapter, posOrderRepo, options);
    }
    return {
      fetched: false,
      fresh:
        latest.lastSuccessAt != null &&
        Date.now() - latest.lastSuccessAt.getTime() < freshnessMs,
      upstreamAvailable: latest.lastError === null,
      lastSuccessAt: latest.lastSuccessAt,
      lastError: latest.lastError,
    };
  }

  // We are the elected fetcher.
  try {
    await ingestRestaurantOrders(restaurant, adapter, posOrderRepo);
    const successAt = new Date();
    await prisma.posSyncState.update({
      where: { restaurantId: restaurant.id },
      data: {
        lastSuccessAt: successAt,
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
      },
    });
    return {
      fetched: true,
      fresh: true,
      upstreamAvailable: true,
      lastSuccessAt: successAt,
      lastError: null,
    };
  } catch (err) {
    // Upstream failed: PRESERVE the last committed snapshot; record the error;
    // release the lease so the next window can retry. Never fabricate values.
    const message = err instanceof Error ? err.message.slice(0, 500) : "sync failed";
    const preserved = await prisma.posSyncState
      .update({
        where: { restaurantId: restaurant.id },
        data: { lastError: message, leaseOwner: null, leaseUntil: null },
        select: { lastSuccessAt: true },
      })
      .catch(() => null);
    return {
      fetched: true,
      fresh: false,
      upstreamAvailable: false,
      lastSuccessAt: preserved?.lastSuccessAt ?? null,
      lastError: message,
    };
  }
}
