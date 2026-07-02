import { prisma } from "@/lib/db";
import { ensureDemoTableReady } from "./ensure-demo-table";
import { calculateBillBreakdown } from "@/modules/bills";
import { money, toNumberSafe } from "@/lib/money";
import { guestLabel } from "@/lib/guest-billing/split-math";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  BillItemClaimStatus,
  GuestSessionStatus,
  PaymentStatus,
} from "@prisma/client";

export class GuestSessionNotFoundError extends Error {
  name = "GuestSessionNotFoundError";
}

export class GuestSessionConflictError extends Error {
  name = "GuestSessionConflictError";
}

export class GuestSessionValidationError extends Error {
  name = "GuestSessionValidationError";
}

function toNumber(value: unknown): number {
  return toNumberSafe(value as number | Decimal | { toNumber(): number } | null | undefined);
}

function guestHue(ordinal: number): number {
  return (ordinal * 53 + 24) % 360;
}

function labelFor(ordinal: number): string {
  return guestLabel(ordinal);
}

async function findActiveBillByToken(token: string) {
  await ensureDemoTableReady(token);

  const table = await prisma.table.findUnique({
    where: { token },
    include: {
      restaurant: true,
      bills: {
        where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          items: { orderBy: { createdAt: "asc" } },
          guestSessions: { orderBy: { joinedAt: "asc" } },
          itemClaims: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
          },
          payments: {
            where: { status: "COMPLETED" },
            orderBy: { createdAt: "asc" },
            include: { paymentItems: true, guestSession: true },
          },
        },
      },
    },
  });

  if (!table || table.bills.length === 0) return null;
  return { table, restaurant: table.restaurant, bill: table.bills[0] };
}

export type ActiveTableSession = NonNullable<Awaited<ReturnType<typeof getTableSessionState>>>;

export async function getTableSessionState(token: string) {
  const active = await findActiveBillByToken(token);
  if (!active) return null;

  const { table, restaurant, bill } = active;
  const breakdown =
    bill.posTotal != null
      ? {
          subtotal: bill.posSubtotal ?? new Decimal(0),
          propina: bill.posPropina ?? new Decimal(0),
          iva: bill.posIva ?? new Decimal(0),
          total: bill.posTotal,
        }
      : calculateBillBreakdown(bill.items);

  const paidTowardsBill = bill.payments.reduce(
    (sum, payment) => sum + toNumber(payment.amount) - toNumber(payment.voluntaryTip),
    0
  );
  const authoritativeTotal =
    bill.posTotal != null ? toNumber(bill.posTotal) : Number(breakdown.total);
  const remainingBalance = Math.max(0, money(authoritativeTotal - paidTowardsBill));

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      logo: restaurant.logo,
      address: restaurant.address,
    },
    table: {
      id: table.id,
      name: table.name,
      token: table.token,
    },
    bill: {
      id: bill.id,
      status: bill.status,
      splitMode: bill.splitMode,
      equalSplitPeople: bill.equalSplitPeople,
      equalSharesPaid: bill.equalSharesPaid,
      updatedAt: bill.updatedAt,
      breakdown: {
        subtotal: Number(breakdown.subtotal),
        propina: Number(breakdown.propina),
        iva: Number(breakdown.iva),
        total: Number(breakdown.total),
      },
      remainingBalance,
    },
    items: bill.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity,
      isPaid: item.isPaid,
      paidAt: item.paidAt,
      version: item.version,
    })),
    guests: bill.guestSessions.map((guest) => ({
      id: guest.id,
      label: guest.label,
      displayName: guest.displayName,
      colorHue: guest.colorHue,
      status: guest.status,
      joinedAt: guest.joinedAt,
      lastSeenAt: guest.lastSeenAt,
      updatedAt: guest.updatedAt,
    })),
    claims: bill.itemClaims.map((claim) => ({
      id: claim.id,
      billItemId: claim.billItemId,
      guestSessionId: claim.guestSessionId,
      units: Number(claim.units),
      status: claim.status,
      updatedAt: claim.updatedAt,
    })),
    payments: bill.payments.map((payment) => ({
      id: payment.id,
      guestSessionId: payment.guestSessionId,
      guestDisplayName:
        payment.guestSession?.displayName ??
        payment.guestNombre ??
        payment.guestEmail ??
        guestLabel(1),
      amount: Number(payment.amount),
      voluntaryTip: payment.voluntaryTip != null ? Number(payment.voluntaryTip) : null,
      splitMode: payment.splitMode,
      equalSplitPeople: payment.equalSplitPeople,
      status: payment.status as PaymentStatus,
      createdAt: payment.createdAt,
      items: payment.paymentItems.map((item) => ({
        id: item.id,
        billItemId: item.billItemId,
        name: item.name,
        units: Number(item.units),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      })),
    })),
    version: [
      bill.updatedAt,
      ...bill.items.map((item) => item.updatedAt),
      ...bill.guestSessions.map((guest) => guest.updatedAt),
      ...bill.itemClaims.map((claim) => claim.updatedAt),
      ...bill.payments.map((payment) => payment.updatedAt),
    ]
      .map((date) => date.getTime())
      .sort((a, b) => b - a)[0],
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    if (String((error as { code: unknown }).code) === "P2002") return true;
  }
  return (
    error instanceof Error && /Unique constraint|UniqueConstraint|P2002/i.test(error.message)
  );
}

/**
 * Join (or rejoin) the active bill on a table.
 *
 * Identity rules (invariant: a reconnect NEVER mints a duplicate guest):
 * 1. `clientToken` (opaque, minted client-side, survives reloads) is the
 *    primary identity: same token + same bill ⇒ the same guest, enforced by
 *    the (billId, clientToken) unique constraint even under concurrent joins.
 * 2. `guestSessionId` remains supported for clients that kept their id.
 * 3. Otherwise a new guest is created with the next free label; label
 *    collisions under concurrency are resolved by the (billId, label) unique
 *    constraint + retry.
 */
export async function joinTableSession(
  token: string,
  guestSessionId?: string,
  clientToken?: string
) {
  const active = await findActiveBillByToken(token);
  if (!active) return null;
  const billId = active.bill.id;
  const normalizedClientToken = clientToken?.trim() || undefined;

  if (normalizedClientToken) {
    const byClient = await prisma.billGuestSession.findUnique({
      where: { billId_clientToken: { billId, clientToken: normalizedClientToken } },
    });
    if (byClient) {
      const guest = await prisma.billGuestSession.update({
        where: { id: byClient.id },
        data: { lastSeenAt: new Date() },
      });
      return { state: await getTableSessionState(token), guest };
    }
  }

  if (guestSessionId) {
    const existing = await prisma.billGuestSession.findFirst({
      where: { id: guestSessionId, billId },
    });
    if (existing) {
      const guest = await prisma.billGuestSession.update({
        where: { id: existing.id },
        // Adopt the client identity on legacy sessions that predate clientToken
        data: {
          lastSeenAt: new Date(),
          ...(normalizedClientToken && !existing.clientToken
            ? { clientToken: normalizedClientToken }
            : {}),
        },
      });
      return { state: await getTableSessionState(token), guest };
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      // Serialize label allocation per bill: lock the bill row, then
      // count + insert atomically. Concurrent joiners queue on the lock and
      // each sees the previous joiner's row — no label-collision storms.
      // (Schema-qualified: raw SQL through the Supabase transaction pooler
      // does not inherit Prisma's search_path.)
      const guest = await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "public"."bills" WHERE id = ${billId} FOR UPDATE`;
          const count = await tx.billGuestSession.count({ where: { billId } });
          const ordinal = count + 1;
          const label = labelFor(ordinal);
          return tx.billGuestSession.create({
            data: {
              billId,
              label,
              displayName: label,
              colorHue: guestHue(ordinal),
              clientToken: normalizedClientToken ?? null,
            },
          });
        },
        { maxWait: 30_000, timeout: 60_000 }
      );
      return { state: await getTableSessionState(token), guest };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // (billId, clientToken) collision ⇒ a concurrent join with OUR token
      // won the race — return that guest instead of retrying labels.
      if (normalizedClientToken) {
        const winner = await prisma.billGuestSession.findUnique({
          where: { billId_clientToken: { billId, clientToken: normalizedClientToken } },
        });
        if (winner) {
          return { state: await getTableSessionState(token), guest: winner };
        }
      }
      // Otherwise it was a label collision — loop and try the next ordinal.
    }
  }

  throw new GuestSessionConflictError("Could not allocate guest label");
}

async function requireGuestForToken(token: string, guestSessionId: string) {
  const active = await findActiveBillByToken(token);
  if (!active) throw new GuestSessionNotFoundError("Active bill not found");

  const guest = await prisma.billGuestSession.findFirst({
    where: { id: guestSessionId, billId: active.bill.id },
  });
  if (!guest) throw new GuestSessionNotFoundError("Guest session not found");
  return { active, guest };
}

export async function renameGuestSession(
  token: string,
  guestSessionId: string,
  displayName: string
) {
  const { guest } = await requireGuestForToken(token, guestSessionId);
  const nextName = displayName.trim().slice(0, 40) || guest.label;
  await prisma.billGuestSession.update({
    where: { id: guest.id },
    data: { displayName: nextName, lastSeenAt: new Date() },
  });
  return getTableSessionState(token);
}

export async function setGuestSessionStatus(
  token: string,
  guestSessionId: string,
  status: GuestSessionStatus
) {
  const { guest } = await requireGuestForToken(token, guestSessionId);
  await prisma.billGuestSession.update({
    where: { id: guest.id },
    data: { status, lastSeenAt: new Date() },
  });
  return getTableSessionState(token);
}

/**
 * Claim units of a bill item — transactionally safe.
 *
 * The pre-relay implementation was a read-check-write OUTSIDE any transaction:
 * two guests racing for the last unit both passed the check and both created a
 * claim (over-claim). Now the bill-item row is locked (SELECT … FOR UPDATE)
 * inside a transaction, so validation and write are atomic. Invariants:
 * - sum of ACTIVE + PAID units never exceeds item quantity;
 * - a lost race surfaces as an explicit 409 conflict, never a silent erase;
 * - one claim row per (billItemId, guestSessionId) — DB unique constraint.
 */
export async function claimBillItem(
  token: string,
  guestSessionId: string,
  billItemId: string,
  units: number
) {
  if (units <= 0) {
    throw new GuestSessionValidationError("Claim units must be greater than zero");
  }

  const { active, guest } = await requireGuestForToken(token, guestSessionId);
  const billId = active.bill.id;

  await prisma.$transaction(async (tx) => {
    // Serialize all claim mutations for this item. (Schema-qualified: raw SQL
    // through the Supabase transaction pooler does not inherit search_path.)
    await tx.$queryRaw`SELECT id FROM "public"."bill_items" WHERE id = ${billItemId} FOR UPDATE`;

    const billItem = await tx.billItem.findFirst({
      where: { id: billItemId, billId },
    });
    if (!billItem || billItem.isPaid) {
      throw new GuestSessionValidationError("Bill item is not claimable");
    }

    // ACTIVE + PAID units both consume capacity; only RELEASED frees it.
    const claims = await tx.billItemClaim.findMany({
      where: { billItemId, status: { in: ["ACTIVE", "PAID"] } },
    });
    const mine = claims.find((claim) => claim.guestSessionId === guest.id);
    if (mine?.status === "PAID") {
      throw new GuestSessionValidationError("Claim already paid");
    }
    const othersUnits = claims
      .filter((claim) => claim.guestSessionId !== guest.id)
      .reduce((sum, claim) => sum + Number(claim.units), 0);
    if (othersUnits + units > billItem.quantity) {
      throw new GuestSessionConflictError("No free units remain for this item");
    }

    if (mine) {
      await tx.billItemClaim.update({
        where: { id: mine.id },
        data: { units: new Decimal(units), status: "ACTIVE" as BillItemClaimStatus },
      });
    } else {
      await tx.billItemClaim.create({
        data: {
          billId,
          billItemId,
          guestSessionId: guest.id,
          units: new Decimal(units),
        },
      });
    }

    await tx.billGuestSession.update({
      where: { id: guest.id },
      data: { status: "REVIEWING", lastSeenAt: new Date() },
    });
  }, {
    // Claims on a hot item queue on the FOR UPDATE lock — losers must reach
    // the guard (explicit conflict), not die on a transaction timeout.
    maxWait: 30_000,
    timeout: 60_000,
  });

  return getTableSessionState(token);
}

export async function releaseBillItemClaim(
  token: string,
  guestSessionId: string,
  billItemId: string
) {
  const { guest } = await requireGuestForToken(token, guestSessionId);
  await prisma.billItemClaim.updateMany({
    where: { billItemId, guestSessionId: guest.id, status: "ACTIVE" },
    data: { status: "RELEASED" },
  });
  return getTableSessionState(token);
}
