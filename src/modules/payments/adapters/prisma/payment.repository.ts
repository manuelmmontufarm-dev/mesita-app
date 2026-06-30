import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import type { BillItem, BillStatus, Prisma, SplitMode as PrismaSplitMode } from "@prisma/client";
import type {
  PaymentRepository,
  RecordPaymentInput,
  RecordPaymentResult,
} from "../../domain/payment.repository";

export class PrismaPaymentRepository implements PaymentRepository {
  async findByIdempotencyKey(key: string): Promise<{ id: string; billId: string } | null> {
    const payment = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
    return payment ? { id: payment.id, billId: payment.billId } : null;
  }

  async recordPaymentAtomically(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    const {
      paymentId,
      billId,
      restaurantId,
      amount,
      voluntaryTip,
      providerTransactionId,
      idempotencyKey,
      splitMode,
      selectedItemIds,
      requestedSplitPeople,
      guestSessionId,
      guestIdentificacion,
      guestEmail,
      guestNombre,
      guestTipo,
      hasUsableGuestData,
    } = input;

    let thisPaymentIsRecipient = false;

    const updatedBill = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.payment.create({
        data: {
          id: paymentId,
          billId,
          restaurantId,
          amount: new Decimal(amount),
          voluntaryTip: voluntaryTip > 0 ? new Decimal(voluntaryTip) : null,
          providerTransactionId,
          idempotencyKey,
          splitMode: splitMode as PrismaSplitMode,
          guestSessionId,
          equalSplitPeople: requestedSplitPeople ?? null,
          status: "COMPLETED",
          guestIdentificacion,
          guestEmail,
          guestNombre,
          guestTipo,
        },
      });

      const currentBill = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        include: { items: true },
      });
      const recipientExistedBefore = currentBill.invoiceRecipientPaymentId !== null;
      let newStatus: BillStatus = currentBill.status;

      if (splitMode === "BY_ITEM") {
        const ids = selectedItemIds ?? [];
        if (ids.length === 0) {
          throw new Error("No items selected for BY_ITEM payment");
        }
        // Guarded atomic claim — no read-then-update race. The `isPaid: false`
        // predicate makes the claim conditional: if another guest paid one of
        // these items between our snapshot and now, count < ids.length and we
        // throw, which rolls back the tx and triggers process-payment's
        // compensation path (provider void).
        const claimed = await tx.billItem.updateMany({
          where: { id: { in: ids }, billId, restaurantId, isPaid: false },
          data: { isPaid: true, paidAt: new Date() },
        });
        if (claimed.count !== ids.length) {
          throw new Error(
            `Concurrent item payment detected: claimed ${claimed.count}/${ids.length} items`
          );
        }
        await createPaymentItemSnapshots(tx, {
          paymentId,
          items: currentBill.items.filter((item) => ids.includes(item.id)),
        });
        if (guestSessionId) {
          await tx.billItemClaim.updateMany({
            where: {
              billId,
              guestSessionId,
              billItemId: { in: ids },
              status: "ACTIVE",
            },
            data: { status: "PAID" },
          });
        }
      } else if (splitMode === "EQUAL") {
        // Guarded conditional claim — mirrors the BY_ITEM guard above. Two guests
        // paying the closing share concurrently would both read the same prior
        // net total; without this guard both increments would land and the bill
        // would be overpaid. The `equalSharesPaid < totalPeople` + status
        // predicates make the increment conditional: the loser matches 0 rows,
        // we throw, the tx rolls back, and process-payment's compensation path
        // voids the loser's provider charge.
        const totalPeople = currentBill.equalSplitPeople ?? requestedSplitPeople ?? 1;
        const billUpdate: Prisma.BillUpdateManyMutationInput = {
          equalSharesPaid: { increment: 1 },
        };
        if (!currentBill.equalSplitPeople && requestedSplitPeople) {
          billUpdate.equalSplitPeople = requestedSplitPeople;
        }
        const claimed = await tx.bill.updateMany({
          where: {
            id: billId,
            equalSharesPaid: { lt: totalPeople },
            status: { notIn: ["FULLY_PAID", "REFUNDED"] },
          },
          data: billUpdate,
        });
        if (claimed.count !== 1) {
          throw new Error(
            "Concurrent equal-split payment detected: all shares already claimed"
          );
        }
      } else {
        // FULL: same guarded mindset — `isPaid: false` ensures we only flip items
        // that are still unpaid (idempotent against concurrent BY_ITEM claims).
        await tx.billItem.updateMany({
          where: { billId, restaurantId, isPaid: false },
          data: { isPaid: true, paidAt: new Date() },
        });
        await createPaymentItemSnapshots(tx, {
          paymentId,
          items: currentBill.items.filter((item) => !item.isPaid),
        });
        if (guestSessionId) {
          await tx.billItemClaim.updateMany({
            where: { billId, guestSessionId, status: "ACTIVE" },
            data: { status: "PAID" },
          });
        }
      }

      if (guestSessionId) {
        await tx.billGuestSession.updateMany({
          where: { id: guestSessionId, billId },
          data: { status: "PAID", lastSeenAt: new Date() },
        });
      }

      if (splitMode === "EQUAL") {
        const refreshed = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
        const totalPeople = refreshed.equalSplitPeople ?? requestedSplitPeople ?? 1;
        if (refreshed.equalSharesPaid >= totalPeople) {
          newStatus = "FULLY_PAID";
        } else if (newStatus === "UNPAID") {
          newStatus = "PARTIALLY_PAID";
        }
      } else {
        const allItems = await tx.billItem.findMany({ where: { billId } });
        if (allItems.every((i: BillItem) => i.isPaid)) {
          newStatus = "FULLY_PAID";
        } else if (newStatus === "UNPAID") {
          newStatus = "PARTIALLY_PAID";
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const billUpdateData: any = {
        status: newStatus,
        ...(newStatus === "FULLY_PAID" && { closedAt: new Date() }),
      };
      if (!recipientExistedBefore && hasUsableGuestData) {
        billUpdateData.invoiceRecipientPaymentId = paymentId;
        thisPaymentIsRecipient = true;
      }

      return tx.bill.update({
        where: { id: billId },
        data: billUpdateData,
        select: { status: true },
      });
    });

    return {
      billStatus: updatedBill.status as RecordPaymentResult["billStatus"],
      thisPaymentIsRecipient,
    };
  }

  async updatePosRegistration(
    paymentId: string,
    data: { registered: boolean; note?: string | null }
  ): Promise<void> {
    await prisma.payment.update({
      where: { id: paymentId },
      data: data.registered
        ? { posRegisteredAt: new Date(), posRegistrationNote: null }
        : { posRegistrationNote: data.note?.slice(0, 500) ?? null },
    });
  }
}

async function createPaymentItemSnapshots(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    items: Array<Pick<BillItem, "id" | "name" | "quantity" | "price">>;
  }
): Promise<void> {
  if (input.items.length === 0) return;

  await tx.paymentBillItem.createMany({
    data: input.items.map((item) => {
      const unitPrice = new Decimal(item.price);
      const units = new Decimal(item.quantity);
      return {
        paymentId: input.paymentId,
        billItemId: item.id,
        name: item.name,
        units,
        unitPrice,
        amount: unitPrice.mul(units),
      };
    }),
  });
}
