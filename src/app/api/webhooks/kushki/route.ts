import { prisma } from "@/lib/db";
import crypto from "crypto";

const KUSHKI_WEBHOOK_SUCCESS = { code: "00", message: "OK" };
const KUSHKI_WEBHOOK_ERROR   = { code: "01", message: "Error" };

// POST /api/webhooks/kushki
// Receives Kushki async notification events (secondary confirmation).
// Primary payment confirmation happens synchronously in the pay route.
// This handler handles async updates (e.g. delayed approvals, chargebacks).
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  // SECURITY: KUSHKI_WEBHOOK_SECRET must be set — fail loudly if missing.
  // An unconfigured secret would allow any caller to fake payment events.
  const webhookSecret = process.env.KUSHKI_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Kushki webhook] KUSHKI_WEBHOOK_SECRET is not configured");
    return Response.json(KUSHKI_WEBHOOK_ERROR, { status: 500 });
  }

  const signature = request.headers.get("x-kushki-signature") ?? "";
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  // Use same-length buffers to avoid timingSafeEqual throwing on length mismatch.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn("[Kushki webhook] Invalid signature");
    return Response.json(KUSHKI_WEBHOOK_ERROR, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json(KUSHKI_WEBHOOK_ERROR, { status: 400 });
  }

  const ticketNumber      = body.ticketNumber ?? body.ticket_number;
  const transactionStatus = body.transactionStatus ?? body.transaction_status;

  if (!ticketNumber) {
    return Response.json(KUSHKI_WEBHOOK_SUCCESS); // ignore events without ticketNumber
  }

  // DB errors must NOT be swallowed: return 500 so Kushki retries the event.
  try {
    const payment = await prisma.payment.findFirst({
      where: { kushkiTransactionId: String(ticketNumber) },
    });

    if (!payment) {
      console.log("[Kushki webhook] Unknown ticket:", ticketNumber);
      return Response.json(KUSHKI_WEBHOOK_SUCCESS);
    }

    // Already processed — log and acknowledge
    if (payment.status === "FAILED") {
      console.log("[Kushki webhook] Duplicate — payment already", payment.status);
      return Response.json(KUSHKI_WEBHOOK_SUCCESS);
    }

    // Handle async FAILED status from Kushki
    if (transactionStatus && transactionStatus !== "APPROVAL") {
      await prisma.payment.update({
        where: { id: payment.id },
        data:  { status: "FAILED" },
      });
    }

    console.log("[Kushki webhook] Event processed for ticket:", ticketNumber);
    return Response.json(KUSHKI_WEBHOOK_SUCCESS);
  } catch (err) {
    console.error("[Kushki webhook] DB error — returning 500 so Kushki retries:", err);
    return Response.json(KUSHKI_WEBHOOK_ERROR, { status: 500 });
  }
}
