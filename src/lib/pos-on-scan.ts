import { prisma } from "@/lib/db";
import { ContificoAdapter } from "@/modules/pos/adapters/contifico.adapter";
import { buildPosConfig } from "@/modules/pos/adapters/pos-config";
import { PrismaPosOrderRepository } from "@/modules/pos/adapters/prisma/pos-order.repository";
import { ingestRestaurantOrders } from "@/modules/pos/application/ingest-orders";

/** Lightweight POS refresh when a guest opens /pay/[token] (Phase 2 on-scan). */
export async function ingestRestaurantOnScan(restaurantId: string): Promise<void> {
  const posOrderRepo = new PrismaPosOrderRepository();
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      status: true,
      invoiceMode: true,
      posProvider: true,
      posApiKeyEnc: true,
      posEnvironment: true,
      posTableField: true,
      posPaymentMethod: true,
    },
  });

  if (!restaurant || restaurant.status !== "ACTIVE" || restaurant.invoiceMode !== "POS") {
    return;
  }

  const config = buildPosConfig(restaurant);
  const adapter = new ContificoAdapter(config);
  await ingestRestaurantOrders(restaurant, adapter, posOrderRepo);
}
