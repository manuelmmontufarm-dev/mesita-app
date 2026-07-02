/**
 * Concurrency invariants against the REAL test database (Supabase via Prisma).
 *
 * These launch genuinely parallel promises (Promise.allSettled over
 * un-awaited calls) — not sequential calls disguised as concurrency.
 *
 * Skipped automatically when DATABASE_URL is unreachable so unit-only runs
 * stay green; the Relay-01 gate runs them for real (10 repeated rounds via
 * `for i in $(seq 10); do npx vitest run tests/integration/concurrency-invariants.test.ts; done`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  joinTableSession,
  claimBillItem,
  GuestSessionConflictError,
  GuestSessionValidationError,
} from "@/modules/guest-session";
import { processPayment } from "@/modules/payments/application/process-payment";
import { PrismaPaymentRepository } from "@/modules/payments/adapters/prisma/payment.repository";
import { PrismaBillRepository } from "@/modules/bills/adapters/prisma/bill.repository";
import { Decimal } from "@prisma/client/runtime/library";

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  // no DB — suite becomes a skip
}
const dbDescribe = dbUp ? describe : describe.skip;

const createdRestaurantIds: string[] = [];

async function makeFixture(opts: {
  items: Array<{ name: string; price: number; quantity: number }>;
  posTotal?: number;
}) {
  const suffix = randomUUID().slice(0, 8);
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `test-conc-${suffix}`,
      status: "ACTIVE",
      paymentsEnabled: true,
    },
  });
  createdRestaurantIds.push(restaurant.id);
  const table = await prisma.table.create({
    data: {
      name: `Mesa ${suffix}`,
      token: randomUUID(),
      restaurantId: restaurant.id,
    },
  });
  const bill = await prisma.bill.create({
    data: {
      tableId: table.id,
      restaurantId: restaurant.id,
      status: "UNPAID",
      ...(opts.posTotal != null
        ? {
            posTotal: new Decimal(opts.posTotal),
            posSubtotal: new Decimal(opts.posTotal),
            posIva: new Decimal(0),
            posPropina: new Decimal(0),
          }
        : {}),
      items: {
        create: opts.items.map((item) => ({
          name: item.name,
          price: new Decimal(item.price),
          quantity: item.quantity,
          restaurantId: restaurant.id,
        })),
      },
    },
    include: { items: true },
  });
  return { restaurant, table, bill };
}

const repos = {
  bill: new PrismaBillRepository(),
  payment: new PrismaPaymentRepository(),
};

function paymentParams(fix: Awaited<ReturnType<typeof makeFixture>>, over: Record<string, unknown>) {
  return {
    billId: fix.bill.id,
    restaurantId: fix.restaurant.id,
    voluntaryTipAmount: 0,
    chargeToken: "stub:4242",
    splitMode: "FULL" as const,
    providerConfig: { provider: "STUB" as const, environment: "SANDBOX" as const },
    checkoutMode: "CONSUMIDOR_FINAL" as const,
    idempotencyKey: randomUUID(),
    amount: 10,
    ...over,
  };
}

beforeAll(() => {
  if (!dbUp) {
    console.warn("[concurrency-invariants] DATABASE unreachable — suite skipped");
  }
});

afterAll(async () => {
  for (const id of createdRestaurantIds) {
    await prisma.restaurant.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

dbDescribe("guest identity under concurrency", () => {
  it("ten concurrent anonymous joins produce ten stable unique guests", async () => {
    const fix = await makeFixture({ items: [{ name: "Plato", price: 4, quantity: 10 }] });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => joinTableSession(fix.table.token))
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(10);

    const guests = await prisma.billGuestSession.findMany({ where: { billId: fix.bill.id } });
    expect(guests).toHaveLength(10);
    expect(new Set(guests.map((g) => g.label)).size).toBe(10);
  }, 60_000);

  it("ten concurrent joins with the SAME clientToken produce exactly one guest", async () => {
    const fix = await makeFixture({ items: [{ name: "Plato", price: 4, quantity: 10 }] });
    const clientToken = `client-${randomUUID()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => joinTableSession(fix.table.token, undefined, clientToken))
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(10);
    const guestIds = new Set(
      fulfilled.map((r) => (r as PromiseFulfilledResult<{ guest: { id: string } }>).value.guest.id)
    );
    expect(guestIds.size).toBe(1); // every retry resolved to the SAME guest

    const guests = await prisma.billGuestSession.findMany({ where: { billId: fix.bill.id } });
    expect(guests).toHaveLength(1);
  }, 60_000);

  it("a reconnect with the same clientToken returns the same guest (never a duplicate)", async () => {
    const fix = await makeFixture({ items: [{ name: "Plato", price: 4, quantity: 10 }] });
    const clientToken = `client-${randomUUID()}`;
    const first = await joinTableSession(fix.table.token, undefined, clientToken);
    // simulate reconnect: no guestSessionId (storage lost), same clientToken
    const second = await joinTableSession(fix.table.token, undefined, clientToken);
    expect(second!.guest.id).toBe(first!.guest.id);
  }, 30_000);
});

dbDescribe("claim races", () => {
  it("twenty claims racing for ONE unit: one owner, nineteen explicit conflicts", async () => {
    const fix = await makeFixture({ items: [{ name: "Único", price: 9, quantity: 1 }] });
    const item = fix.bill.items[0];
    const guests = await Promise.all(
      Array.from({ length: 20 }, () => joinTableSession(fix.table.token))
    );

    const results = await Promise.allSettled(
      guests.map((j) => claimBillItem(fix.table.token, j!.guest.id, item.id, 1))
    );
    const winners = results.filter((r) => r.status === "fulfilled");
    const conflicts = results.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason instanceof GuestSessionConflictError ||
          r.reason instanceof GuestSessionValidationError)
    );
    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(19); // losers get explicit conflicts, never silence

    const active = await prisma.billItemClaim.findMany({
      where: { billItemId: item.id, status: "ACTIVE" },
    });
    expect(active).toHaveLength(1);
    expect(Number(active[0].units)).toBe(1);
  }, 120_000);

  it("fractional claim races never exceed item quantity", async () => {
    const fix = await makeFixture({ items: [{ name: "Compartido", price: 8, quantity: 2 }] });
    const item = fix.bill.items[0];
    const guests = await Promise.all(
      Array.from({ length: 10 }, () => joinTableSession(fix.table.token))
    );

    const results = await Promise.allSettled(
      guests.map((j) => claimBillItem(fix.table.token, j!.guest.id, item.id, 0.5))
    );
    const winners = results.filter((r) => r.status === "fulfilled").length;
    expect(winners).toBeGreaterThanOrEqual(1);
    expect(winners).toBeLessThanOrEqual(4); // 2 units / 0.5 each

    const active = await prisma.billItemClaim.findMany({
      where: { billItemId: item.id, status: { in: ["ACTIVE", "PAID"] } },
    });
    const totalUnits = active.reduce((sum, claim) => sum + Number(claim.units), 0);
    expect(totalUnits).toBeLessThanOrEqual(2);
  }, 120_000);

  it("a lost claim returns an explicit conflict and does not erase the winner", async () => {
    const fix = await makeFixture({ items: [{ name: "Único", price: 9, quantity: 1 }] });
    const item = fix.bill.items[0];
    const [a, b] = await Promise.all([
      joinTableSession(fix.table.token),
      joinTableSession(fix.table.token),
    ]);
    await claimBillItem(fix.table.token, a!.guest.id, item.id, 1);
    await expect(claimBillItem(fix.table.token, b!.guest.id, item.id, 1)).rejects.toThrow(
      /No free units/
    );
    const active = await prisma.billItemClaim.findMany({
      where: { billItemId: item.id, status: "ACTIVE" },
    });
    expect(active).toHaveLength(1);
    expect(active[0].guestSessionId).toBe(a!.guest.id);
  }, 60_000);
});

dbDescribe("payment idempotency and balance caps", () => {
  it("twenty identical payment retries produce exactly ONE completed payment", async () => {
    const fix = await makeFixture({
      items: [{ name: "Cena", price: 8, quantity: 1 }],
      posTotal: 10,
    });
    const idempotencyKey = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        processPayment(paymentParams(fix, { idempotencyKey, amount: 10 }), repos)
      )
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof processPayment>>> =>
        r.status === "fulfilled"
    );
    expect(fulfilled.length).toBe(20); // every retry resolves (winner or alreadyProcessed)
    expect(new Set(fulfilled.map((r) => r.value.paymentId)).size).toBe(1);

    const payments = await prisma.payment.findMany({ where: { billId: fix.bill.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("COMPLETED");
    expect(Number(payments[0].amount)).toBe(10);
  }, 120_000);

  it("two different payments cannot push settled amount above the authoritative balance", async () => {
    const fix = await makeFixture({
      items: [
        { name: "Plato A", price: 4, quantity: 1 },
        { name: "Plato B", price: 4, quantity: 1 },
      ],
      posTotal: 10,
    });
    const [itemA, itemB] = fix.bill.items;

    // Two concurrent BY_ITEM payments of $6 each on a $10 bill: structurally
    // valid (different items) but 6 + 6 > 10 — the balance guard must reject one.
    const results = await Promise.allSettled([
      processPayment(
        paymentParams(fix, {
          amount: 6,
          splitMode: "BY_ITEM",
          selectedItemIds: [itemA.id],
        }),
        repos
      ),
      processPayment(
        paymentParams(fix, {
          amount: 6,
          splitMode: "BY_ITEM",
          selectedItemIds: [itemB.id],
        }),
        repos
      ),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const payments = await prisma.payment.findMany({
      where: { billId: fix.bill.id, status: "COMPLETED" },
    });
    const settled = payments.reduce(
      (sum, p) => sum + Number(p.amount) - Number(p.voluntaryTip ?? 0),
      0
    );
    expect(settled).toBeLessThanOrEqual(10);
  }, 60_000);

  it("a payment exceeding the remaining balance is rejected outright", async () => {
    const fix = await makeFixture({
      items: [{ name: "Cena", price: 8, quantity: 1 }],
      posTotal: 10,
    });
    await expect(
      processPayment(paymentParams(fix, { amount: 10.01 }), repos)
    ).rejects.toThrow(/exceed/i);
    const payments = await prisma.payment.findMany({ where: { billId: fix.bill.id } });
    expect(payments).toHaveLength(0);
  }, 60_000);
});
