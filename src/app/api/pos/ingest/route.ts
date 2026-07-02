import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildPosConfig } from "@/modules/pos/adapters/pos-config";
import { ContificoAdapter } from "@/modules/pos/adapters/contifico.adapter";
import { ingestRestaurantOrders } from "@/modules/pos/application/ingest-orders";
import { PrismaPosOrderRepository } from "@/modules/pos/adapters/prisma/pos-order.repository";

function cronAuthOk(authHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const provided = Buffer.from(authHeader);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Vercel Cron — recovery backstop only (live sync is the Phase 4 lease path). */
export async function GET(request: NextRequest) {
  if (!cronAuthOk(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posOrderRepo = new PrismaPosOrderRepository();
  const restaurants = await posOrderRepo.findPosEnabledRestaurants();

  const results: Array<{ restaurantId: string; result?: object; error?: string }> = [];

  for (const restaurant of restaurants) {
    try {
      const config = buildPosConfig(restaurant);
      const adapter = new ContificoAdapter(config);
      const result = await ingestRestaurantOrders(restaurant, adapter, posOrderRepo);
      results.push({ restaurantId: restaurant.id, result });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "POS_INGEST_RESTAURANT_ERROR",
          restaurantId: restaurant.id,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
      results.push({
        restaurantId: restaurant.id,
        error: err instanceof Error ? err.message : "Ingestion failed",
      });
    }
  }

  return NextResponse.json({ success: true, perRestaurant: results });
}
