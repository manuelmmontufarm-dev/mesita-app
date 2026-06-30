import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { buildProviderConfig, getPaymentAdapter, resolvePaymentProvider } from "@/modules/payments";
import { isOwnerReadOnly, ownerReadOnlyResponse } from "@/lib/owner-mode";
import { z } from "zod";

const refundSchema = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1).max(255),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
): Promise<Response> {
  const { paymentId } = await context.params;
  if (isOwnerReadOnly()) return ownerReadOnlyResponse();

  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) return authResult;

    const { restaurantId, role } = authResult;
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    const body = await request.json();
    const validatedData = refundSchema.safeParse(body);
    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    const { amount, reason } = validatedData.data;
    if (!reason.trim()) {
      return errorResponse("Invalid refund request: reason is required", 400);
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { bill: true, restaurant: true },
    });

    if (!payment || payment.restaurantId !== restaurantId) {
      return errorResponse("Payment not found", 404);
    }

    if (payment.status !== "COMPLETED") {
      return errorResponse("Payment is not in a refundable state", 400);
    }

    if (payment.bill.status === "REFUNDED") {
      return errorResponse("Payment has already been refunded", 409);
    }

    if (amount > Number(payment.amount)) {
      return errorResponse("Refund amount cannot exceed original payment amount", 400);
    }

    const claim = await prisma.payment.updateMany({
      where: { id: paymentId, restaurantId, status: "COMPLETED" },
      data: { status: "REFUNDED" },
    });
    if (claim.count === 0) {
      return errorResponse("Refund already in progress or payment not refundable", 409);
    }

    const revertClaim = async () => {
      try {
        await prisma.payment.updateMany({
          where: { id: paymentId, restaurantId, status: "REFUNDED" },
          data: { status: "COMPLETED" },
        });
      } catch (revertError) {
        console.error(
          JSON.stringify({
            event: "REFUND_CLAIM_REVERT_FAILED",
            severity: "CRITICAL",
            paymentId,
            error: revertError instanceof Error ? revertError.message : String(revertError),
            ts: new Date().toISOString(),
          })
        );
      }
    };

    const provider = resolvePaymentProvider(payment.restaurant.paymentProvider);
    if (provider !== "STUB") {
      const providerConfig = buildProviderConfig(payment.restaurant);
      const adapter = getPaymentAdapter(provider);
      const refundResult = await adapter.refund(
        { transactionId: payment.providerTransactionId, amount },
        providerConfig
      );
      if (!refundResult.success) {
        await revertClaim();
        return errorResponse(refundResult.message ?? "Refund processing failed", 402);
      }
    }

    try {
      await prisma.bill.update({
        where: { id: payment.billId },
        data: { status: "REFUNDED" },
      });

      return successResponse(
        {
          paymentId,
          status: "REFUNDED",
          message: "Refund processed successfully",
        },
        200
      );
    } catch (error) {
      console.error("Refund bill-update error:", error);
      return errorResponse("Failed to process refund", 500);
    }
  } catch (error) {
    console.error("Error processing refund:", error);
    return errorResponse("Internal server error", 500);
  }
}
