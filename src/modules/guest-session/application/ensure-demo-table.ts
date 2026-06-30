import { randomUUID } from "crypto";

import {
  DEMO_BILL_ID,
  DEMO_RESTAURANT_ID,
  DEMO_TABLE_ID,
  DEMO_TABLE_TOKEN,
  isDemoTableToken,
} from "@/lib/demo-restaurant";
import { prisma } from "@/lib/db";
import { BillStatus, PaymentStatus, SplitMode } from "@prisma/client";

const DEMO_RESTAURANT_NAME = "Mesita Demo";

const DEMO_MENU = [
  { id: "demo-item-locro", name: "Locro de papa", price: 4.5, quantity: 1, paid: true },
  { id: "demo-item-seco", name: "Seco de chivo", price: 8.9, quantity: 1, paid: false },
  { id: "demo-item-encebollado", name: "Encebollado", price: 6, quantity: 1, paid: false },
  { id: "demo-item-ceviche", name: "Ceviche de camarón", price: 9.5, quantity: 1, paid: false },
  { id: "demo-item-jugo", name: "Jugo de naranjilla", price: 2.5, quantity: 2, paid: false },
  { id: "demo-item-club", name: "Club Verde", price: 2.75, quantity: 2, paid: false },
] as const;

/**
 * Idempotently ensures `/pay/demo` has an open bill with the Ecuadorian demo menu.
 * Safe to call on every guest-session request — no-ops when an active demo bill exists.
 */
export async function ensureDemoTableReady(token: string): Promise<void> {
  if (!isDemoTableToken(token)) return;

  const existing = await prisma.table.findUnique({
    where: { token: DEMO_TABLE_TOKEN },
    include: {
      bills: {
        where: { status: { in: [BillStatus.UNPAID, BillStatus.PARTIALLY_PAID] } },
        take: 1,
      },
    },
  });

  if (existing?.bills.length) return;

  await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.upsert({
      where: { name: DEMO_RESTAURANT_NAME },
      create: {
        id: DEMO_RESTAURANT_ID,
        name: DEMO_RESTAURANT_NAME,
        status: "ACTIVE",
        paymentsEnabled: true,
        invoiceMode: "DISABLED",
      },
      update: {
        paymentsEnabled: true,
        invoiceMode: "DISABLED",
      },
    });

    await tx.table.upsert({
      where: { token: DEMO_TABLE_TOKEN },
      create: {
        id: DEMO_TABLE_ID,
        name: "12",
        token: DEMO_TABLE_TOKEN,
        restaurantId: restaurant.id,
      },
      update: {
        name: "12",
        restaurantId: restaurant.id,
      },
    });

    const stale = await tx.bill.findUnique({ where: { id: DEMO_BILL_ID } });
    if (stale) {
      await tx.billGuestSession.deleteMany({ where: { billId: DEMO_BILL_ID } });
      await tx.billItemClaim.deleteMany({ where: { billId: DEMO_BILL_ID } });
      await tx.payment.deleteMany({ where: { billId: DEMO_BILL_ID } });
      await tx.billItem.deleteMany({ where: { billId: DEMO_BILL_ID } });
      await tx.bill.delete({ where: { id: DEMO_BILL_ID } });
    }

    const now = new Date();
    const paidAt = new Date(now.getTime() - 3 * 60_000);

    await tx.bill.create({
      data: {
        id: DEMO_BILL_ID,
        tableId: DEMO_TABLE_ID,
        restaurantId: restaurant.id,
        status: BillStatus.PARTIALLY_PAID,
        createdAt: now,
        items: {
          create: DEMO_MENU.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            isPaid: item.paid,
            paidAt: item.paid ? paidAt : null,
            restaurantId: restaurant.id,
          })),
        },
      },
    });

    await tx.payment.create({
      data: {
        id: randomUUID(),
        billId: DEMO_BILL_ID,
        restaurantId: restaurant.id,
        amount: 5.63,
        status: PaymentStatus.COMPLETED,
        providerTransactionId: "DEMO-LOCRO",
        idempotencyKey: randomUUID(),
        splitMode: SplitMode.BY_ITEM,
        createdAt: paidAt,
        paymentItems: {
          create: [
            {
              id: randomUUID(),
              billItemId: "demo-item-locro",
              name: "Locro de papa",
              units: 1,
              unitPrice: 4.5,
              amount: 4.5,
            },
          ],
        },
      },
    });
  });
}
