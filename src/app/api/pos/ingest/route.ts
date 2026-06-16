import { NextRequest, NextResponse } from "next/server";
import { buildPosConfig } from "@/modules/pos/adapters/pos-config";
import { ContificoAdapter } from "@/modules/pos/adapters/contifico.adapter";
import { ingestRestaurantOrders } from "@/modules/pos/application/ingest-orders";
import { PrismaPosOrderRepository } from "@/modules/pos/adapters/prisma/pos-order.repository";

/** Vercel Cron — polls open POS orders for every POS-enabled restaurant (D-03, D-12). */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
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
