import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  PosOrderRepository,
  PosIngestBill,
  PosEnabledRestaurant,
  CreateBillInput,
  SyncBillItemsInput,
  PosDocumentTotals,
} from "../../domain/pos-order.repository";

/**
 * Map POS-authoritative totals to the Bill columns (D-07). The POS amounts are
 * mirrored verbatim — `.toFixed(2)` only normalizes the float→Decimal string.
 */
function posTotalsData(totals: PosDocumentTotals | undefined) {
  if (!totals) return {};
  return {
    posSubtotal: new Decimal(totals.subtotal.toFixed(2)),
    posIva: new Decimal(totals.iva.toFixed(2)),
    posPropina: new Decimal(totals.propina.toFixed(2)),
    posTotal: new Decimal(totals.total.toFixed(2)),
  };
}

export class PrismaPosOrderRepository implements PosOrderRepository {
  async findPosEnabledRestaurants(): Promise<PosEnabledRestaurant[]> {
    return prisma.restaurant.findMany({
      where: { invoiceMode: "POS", posApiKeyEnc: { not: null }, posProvider: { not: null } },
      select: {
        id: true,
        name: true,
        invoiceMode: true,
        posProvider: true,
        posApiKeyEnc: true,
        posEnvironment: true,
        posTableField: true,
      },
    });
  }

  async findTableByPosExternalId(
    restaurantId: string,
    posExternalId: string
  ): Promise<{ id: string } | null> {
    return prisma.table.findFirst({
      where: { restaurantId, posExternalId },
      select: { id: true },
    });
  }

  async findBillByPosDocumentId(posDocumentId: string): Promise<PosIngestBill | null> {
    const bill = await prisma.bill.findUnique({
      where: { posDocumentId },
      include: { items: true },
    });
    if (!bill) return null;
    return {
      id: bill.id,
      items: bill.items.map((i) => ({ id: i.id, name: i.name })),
    };
  }

  async syncBillItems(input: SyncBillItemsInput): Promise<void> {
    const { existingBillId, restaurantId, posToken, existingItems, items, totals } = input;
    await prisma.$transaction(async (tx) => {
      await tx.bill.update({
        where: { id: existingBillId },
        data: {
          posToken,
          ...posTotalsData(totals),
        },
      });

      for (const item of items) {
        const existing = existingItems.find((i) => i.name === item.name);
        await tx.billItem.upsert({
          where: { id: existing?.id ?? "" },
          create: {
            billId: existingBillId,
            restaurantId,
            name: item.name,
            price: new Decimal(item.unitPrice),
            quantity: item.quantity,
          },
          update: {
            quantity: item.quantity,
            price: new Decimal(item.unitPrice),
          },
        });
      }
    });
  }

  async createBillWithItems(input: CreateBillInput): Promise<void> {
    const { tableId, restaurantId, posDocumentId, posToken, items, totals } = input;
    await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.create({
        data: {
          tableId,
          restaurantId,
          posDocumentId,
          posToken,
          status: "UNPAID",
          ...posTotalsData(totals),
        },
      });
      for (const item of items) {
        await tx.billItem.create({
          data: {
            billId: bill.id,
            restaurantId,
            name: item.name,
            price: new Decimal(item.unitPrice),
            quantity: item.quantity,
          },
        });
      }
    });
  }
}
