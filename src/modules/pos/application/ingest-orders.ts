import type { PosPort, POSPulledOrder } from "../domain/pos.port";
import type { PosIngestBill, PosOrderRepository } from "../domain/pos-order.repository";

export interface IngestResult {
  created: number;
  updated: number;
  skipped: number;
  /** Documents that failed with a per-document error (isolated, batch continued). */
  errored: number;
}

/** Safety cap: never process more than this many POS documents per run. */
const MAX_ORDERS_PER_RUN = 200;

function centsOf(n: number): number {
  return Math.round(n * 100);
}

/**
 * Change detection — POS documents are re-listed on every pull, but most are
 * unchanged. Skipping identical documents keeps each sync at O(1) DB round
 * trips instead of O(docs), which is what the 2 s propagation SLO needs.
 */
function billMatchesOrder(bill: PosIngestBill, order: POSPulledOrder): boolean {
  if (bill.posTotal === null || centsOf(bill.posTotal) !== centsOf(order.total)) return false;
  if (bill.items.length !== order.items.length) return false;
  const byName = new Map(bill.items.map((i) => [i.name, i]));
  for (const item of order.items) {
    const existing = byName.get(item.name);
    if (!existing) return false;
    if (existing.quantity !== item.quantity) return false;
    if (centsOf(existing.price) !== centsOf(item.unitPrice)) return false;
  }
  return true;
}

function isLocallyClosed(bill: PosIngestBill): boolean {
  return bill.status === "FULLY_PAID" || bill.status === "REFUNDED";
}

export async function ingestRestaurantOrders(
  restaurant: { id: string; name: string },
  adapter: Pick<PosPort, "pullOrders">,
  posOrderRepo: PosOrderRepository
): Promise<IngestResult> {
  const pulledOrders = await adapter.pullOrders();

  let orders = pulledOrders;
  if (pulledOrders.length > MAX_ORDERS_PER_RUN) {
    console.warn(
      JSON.stringify({
        event: "POS_INGEST_BATCH_CAPPED",
        totalPulled: pulledOrders.length,
        processed: MAX_ORDERS_PER_RUN,
        restaurantId: restaurant.id,
        ts: new Date().toISOString(),
      })
    );
    orders = pulledOrders.slice(0, MAX_ORDERS_PER_RUN);
  }

  // Batch lookups: ONE round trip for all bills + ONE for all tables (run in
  // parallel), instead of per-document queries. Round trips dominate the
  // propagation latency budget.
  const tableIds = [...new Set(orders.map((o) => o.posTableId).filter(Boolean))];
  const [bills, tables] = await Promise.all([
    posOrderRepo.findBillsByPosDocumentIds(orders.map((o) => o.posDocumentId)),
    posOrderRepo.findTablesByPosExternalIds(restaurant.id, tableIds),
  ]);
  const billsByDocId = new Map(bills.map((b) => [b.posDocumentId, b]));
  const tablesByExternalId = new Map(tables.map((t) => [t.posExternalId ?? "", t]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (const order of orders) {
    try {
      const existingBill = billsByDocId.get(order.posDocumentId);

      // POS-side closure (estado C/G/A/F): reflect once, then no-op forever.
      if (order.isClosedInPos) {
        if (!existingBill) {
          // Never create local bills for documents that are already closed.
          skipped++;
          continue;
        }
        if (isLocallyClosed(existingBill)) {
          skipped++;
          continue;
        }
        await posOrderRepo.markBillClosedFromPos(existingBill.id);
        updated++;
        continue;
      }

      // Unmapped document: no table identifier — skip + log (D-05/D-11)
      if (!order.posTableId) {
        console.warn(
          JSON.stringify({
            event: "POS_DOC_UNMAPPED",
            reason: "empty posTableId",
            posDocumentId: order.posDocumentId,
            restaurantId: restaurant.id,
            ts: new Date().toISOString(),
          })
        );
        skipped++;
        continue;
      }

      const table = tablesByExternalId.get(order.posTableId);
      if (!table) {
        console.warn(
          JSON.stringify({
            event: "POS_DOC_UNMAPPED",
            reason: "no table found for posExternalId",
            posDocumentId: order.posDocumentId,
            posTableId: order.posTableId,
            restaurantId: restaurant.id,
            ts: new Date().toISOString(),
          })
        );
        skipped++;
        continue;
      }

      if (existingBill) {
        // Unchanged document ⇒ zero writes.
        if (billMatchesOrder(existingBill, order)) {
          skipped++;
          continue;
        }
        // Update: sync items + totals to match POS (D-06)
        await posOrderRepo.syncBillItems({
          existingBillId: existingBill.id,
          restaurantId: restaurant.id,
          posToken: order.posToken,
          existingItems: existingBill.items,
          items: order.items,
          // POS-authoritative totals mirrored verbatim (D-07) — never recomputed.
          totals: {
            subtotal: order.subtotal,
            iva: order.iva,
            propina: order.propina,
            total: order.total,
          },
        });
        updated++;
      } else {
        // Create new bill from POS document (D-04)
        await posOrderRepo.createBillWithItems({
          tableId: table.id,
          restaurantId: restaurant.id,
          posDocumentId: order.posDocumentId,
          posToken: order.posToken,
          items: order.items,
          // POS-authoritative totals mirrored verbatim (D-07) — never recomputed.
          totals: {
            subtotal: order.subtotal,
            iva: order.iva,
            propina: order.propina,
            total: order.total,
          },
        });
        created++;
      }
    } catch (err) {
      // Per-document failure isolation — do not abort the batch (D-05)
      errored++;
      console.error(
        JSON.stringify({
          event: "POS_INGEST_DOC_ERROR",
          posDocumentId: order.posDocumentId,
          restaurantId: restaurant.id,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    }
  }

  return { created, updated, skipped, errored };
}
