import { prisma } from "@/lib/db";
import { calculateBillBreakdown } from "@/modules/bills";
import { money, toNumberSafe } from "@/lib/money";
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
  return `P${ordinal}`;
}

async function findActiveBillByToken(token: string) {
  const table = await prisma.table.findUnique({
    where: { token },
    include: {
      restaurant: true,
      bills: {
        where: { status: { not: "REFUNDED" } },
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
        "Invitado",
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

export async function joinTableSession(token: string, guestSessionId?: string) {
  const active = await findActiveBillByToken(token);
  if (!active) return null;
  const billId = active.bill.id;

  if (guestSessionId) {
    const existing = await prisma.billGuestSession.findFirst({
      where: { id: guestSessionId, billId },
    });
    if (existing) {
      const guest = await prisma.billGuestSession.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return { state: await getTableSessionState(token), guest };
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const count = await prisma.billGuestSession.count({ where: { billId } });
    const ordinal = count + 1 + attempt;
    const label = labelFor(ordinal);
    try {
      const guest = await prisma.billGuestSession.create({
        data: {
          billId,
          label,
          displayName: label,
          colorHue: guestHue(ordinal),
        },
      });
      return { state: await getTableSessionState(token), guest };
    } catch (error) {
      if (
        error instanceof Error &&
        !/Unique constraint|UniqueConstraint|P2002/i.test(error.message)
      ) {
        throw error;
      }
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
  const billItem = active.bill.items.find((item) => item.id === billItemId);
  if (!billItem || billItem.isPaid) {
    throw new GuestSessionValidationError("Bill item is not claimable");
  }

  const claims = await prisma.billItemClaim.findMany({
    where: { billItemId, status: "ACTIVE" },
  });
  const existing = claims.find((claim) => claim.guestSessionId === guest.id);

  if (existing) {
    await prisma.billItemClaim.update({
      where: { id: existing.id },
      data: { units: new Decimal(units), status: "ACTIVE" as BillItemClaimStatus },
    });
  } else {
    const claimedUnits = claims.reduce((sum, claim) => sum + Number(claim.units), 0);
    if (claimedUnits + units > billItem.quantity) {
      throw new GuestSessionValidationError("No free units remain for this item");
    }
    await prisma.billItemClaim.create({
      data: {
        billId: active.bill.id,
        billItemId,
        guestSessionId: guest.id,
        units: new Decimal(units),
      },
    });
  }

  await prisma.billGuestSession.update({
    where: { id: guest.id },
    data: { status: "REVIEWING", lastSeenAt: new Date() },
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
