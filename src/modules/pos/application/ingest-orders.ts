import type { PosPort } from "../domain/pos.port";
import type { PosOrderRepository } from "../domain/pos-order.repository";

export interface IngestResult {
  created: number;
  updated: number;
  skipped: number;
  /** Documents that failed with a per-document error (isolated, batch continued). */
  errored: number;
}

/** Safety cap: never process more than this many POS documents per run. */
const MAX_ORDERS_PER_RUN = 200;

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

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (const order of orders) {
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

    try {
      const table = await posOrderRepo.findTableByPosExternalId(
        restaurant.id,
        order.posTableId
      );

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

      // Upsert bill keyed on posDocumentId (D-04 — idempotent on @unique)
      const existingBill = await posOrderRepo.findBillByPosDocumentId(order.posDocumentId);

      if (existingBill) {
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
