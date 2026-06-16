import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { refundViaKushki, validateRefundRequest } from "@/lib/refund-utils";
import { z } from "zod";

/**
 * POST /api/payments/[paymentId]/refund
 * Process full refund for a completed payment via Kushki API
 * MANAGER+ role required; updates payment and bill status atomically
 */

// Validation schema for refund request
const refundSchema = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1).max(255),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
): Promise<Response> {
  const { paymentId } = await context.params;

  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // Role check: MANAGER or OWNER required per D-07
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = refundSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    const { amount, reason } = validatedData.data;

    // Additional validation using refund-utils helper
    const validation = validateRefundRequest(amount, reason);
    if (!validation.valid) {
      return errorResponse(`Invalid refund request: ${validation.errors.join("; ")}`, 400);
    }

    // Fetch payment with bill relationship
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { bill: true },
    });

    // Verify payment exists
    if (!payment) {
      return errorResponse("Payment not found", 404);
    }

    // Tenant isolation: verify payment belongs to authenticated restaurant
    if (payment.restaurantId !== restaurantId) {
      return errorResponse("Payment not found", 404);
    }

    // Validate payment can be refunded
    // Only COMPLETED payments can be refunded
    if (payment.status !== "COMPLETED") {
      return errorResponse("Payment is not in a refundable state", 400);
    }

    // Prevent double-refunding (bill is already in REFUNDED state)
    if (payment.bill.status === "REFUNDED") {
      return errorResponse("Payment has already been refunded", 409);
    }

    // Validate amount is not greater than original payment
    if (amount > Number(payment.amount)) {
      return errorResponse("Refund amount cannot exceed original payment amount", 400);
    }

    // ── Double-fire guard ────────────────────────────────────────────────────
    // Atomically CLAIM the refund BEFORE calling Kushki: a guarded updateMany
    // flips COMPLETED → REFUNDED only if the payment is still refundable. A
    // concurrent second request (double-click, retry) sees count === 0 → 409,
    // so Kushki can never be called twice for the same payment.
    //
    // Tradeoff: between the claim and the Kushki response the payment reads as
    // REFUNDED even though no money has moved yet. If Kushki fails we compensate
    // by reverting to COMPLETED; if the process crashes mid-flight the payment
    // can be stuck as REFUNDED without a Kushki refund. We prefer that failure
    // mode (visible, ops-recoverable via the Kushki ledger) over the inverse —
    // refunding a guest's card twice.
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
        // CRITICAL: payment is stuck as REFUNDED without a Kushki refund —
        // needs manual reconciliation against the Kushki ledger.
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

    // Call Kushki refund API
    let kushkiResponse;
    try {
      kushkiResponse = await refundViaKushki(
        payment.kushkiTransactionId,
        amount,
        "USD"
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Refund processing failed";
      console.error("Kushki refund error:", errorMsg);
      // Compensate: release the claim so the refund can be retried
      await revertClaim();
      // Return 402 Payment Required to indicate payment gateway issue
      return errorResponse(errorMsg, 402);
    }

    // Check Kushki response status
    if (kushkiResponse.status !== "APPROVED") {
      const declineMsg = `Refund declined: ${kushkiResponse.message || kushkiResponse.status}`;
      console.warn("Kushki refund declined:", declineMsg);
      // Compensate: release the claim so the refund can be retried
      await revertClaim();
      return errorResponse(declineMsg, 402);
    }

    // Kushki refunded — the payment was already marked REFUNDED by the claim;
    // finish by marking the bill.
    try {
      await prisma.bill.update({
        where: { id: payment.billId },
        data: { status: "REFUNDED" },
      });

      // Return success response
      return successResponse(
        {
          paymentId,
          status: "REFUNDED",
          message: "Refund processed successfully",
        },
        200
      );
    } catch (error) {
      // Money already moved at Kushki and the payment row is REFUNDED; only the
      // bill flag failed. Do NOT revert the payment (that would re-enable a
      // second refund). Surface a 500 for ops follow-up.
      console.error("Refund bill-update error:", error);
      return errorResponse("Failed to process refund", 500);
    }
  } catch (error) {
    console.error("Error processing refund:", error);
    return errorResponse("Internal server error", 500);
  }
}
