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

  async findTablesByPosExternalIds(
    restaurantId: string,
    posExternalIds: string[]
  ): Promise<Array<{ id: string; posExternalId: string | null }>> {
    if (posExternalIds.length === 0) return [];
    return prisma.table.findMany({
      where: { restaurantId, posExternalId: { in: posExternalIds } },
      select: { id: true, posExternalId: true },
    });
  }

  async findBillsByPosDocumentIds(posDocumentIds: string[]): Promise<PosIngestBill[]> {
    if (posDocumentIds.length === 0) return [];
    const bills = await prisma.bill.findMany({
      where: { posDocumentId: { in: posDocumentIds } },
      include: { items: true },
    });
    return bills.map((bill) => ({
      id: bill.id,
      posDocumentId: bill.posDocumentId as string,
      status: bill.status,
      closedAt: bill.closedAt,
      posTotal: bill.posTotal == null ? null : Number(bill.posTotal),
      items: bill.items.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        quantity: i.quantity,
      })),
    }));
  }

  async markBillClosedFromPos(billId: string): Promise<void> {
    // POS is authoritative: the document no longer accepts cobros, so the
    // local bill leaves the active set. Conditional ⇒ idempotent.
    await prisma.bill.updateMany({
      where: { id: billId, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      data: { status: "FULLY_PAID", closedAt: new Date() },
    });
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
    // Single statement (nested create) — atomic without an interactive
    // transaction, and one DB round trip instead of items.length + 1.
    await prisma.bill.create({
      data: {
        tableId,
        restaurantId,
        posDocumentId,
        posToken,
        status: "UNPAID",
        ...posTotalsData(totals),
        items: {
          create: items.map((item) => ({
            restaurantId,
            name: item.name,
            price: new Decimal(item.unitPrice),
            quantity: item.quantity,
          })),
        },
      },
    });
  }
}
