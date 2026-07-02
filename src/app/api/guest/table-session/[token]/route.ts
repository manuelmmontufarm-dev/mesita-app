import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  claimBillItem,
  getTableSessionState,
  joinTableSession,
  releaseBillItemClaim,
  renameGuestSession,
  setGuestSessionStatus,
  GuestSessionConflictError,
  GuestSessionNotFoundError,
  GuestSessionValidationError,
} from "@/modules/guest-session";
import { syncForTableToken } from "@/modules/pos/application/sync-if-stale";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    guestSessionId: z.string().uuid().optional(),
    // Opaque client identity for reconnects — same token + same bill ⇒ same guest
    clientToken: z.string().min(8).max(80).optional(),
  }),
  z.object({
    action: z.literal("rename"),
    guestSessionId: z.string().uuid(),
    displayName: z.string().max(80),
  }),
  z.object({
    action: z.literal("status"),
    guestSessionId: z.string().uuid(),
    status: z.enum(["SELECTING", "REVIEWING", "IN_PAYMENT", "PAID", "LEFT"]),
  }),
  z.object({
    action: z.literal("claim-item"),
    guestSessionId: z.string().uuid(),
    billItemId: z.string().min(1),
    units: z.number().positive().max(100).default(1),
  }),
  z.object({
    action: z.literal("release-item"),
    guestSessionId: z.string().uuid(),
    billItemId: z.string().min(1),
  }),
]);

function mapGuestSessionError(error: unknown): Response {
  if (error instanceof GuestSessionNotFoundError) {
    return errorResponse(error.message, 404);
  }
  if (error instanceof GuestSessionValidationError) {
    return errorResponse(error.message, 400);
  }
  if (error instanceof GuestSessionConflictError) {
    return errorResponse(error.message, 409);
  }
  const prismaCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: string }).code)
      : null;
  if (prismaCode === "P1001" || prismaCode === "P1017") {
    return errorResponse(
      "No pudimos conectar con la base de datos. Revisa DATABASE_URL en Vercel.",
      503
    );
  }
  if (prismaCode === "P2021") {
    return errorResponse(
      "La base de datos necesita migraciones. Ejecuta prisma migrate deploy.",
      503
    );
  }
  console.error("Guest table session error:", error);
  return errorResponse("Internal server error", 500);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  try {
    // ?sync=1 — sync-if-stale (Phase 4): the Supabase lease elects at most one
    // upstream fetcher per freshness window; every other caller reads the
    // latest committed snapshot immediately. Failures surface as explicit
    // staleness metadata — never a fabricated state, never a broken read.
    let posSync: Awaited<ReturnType<typeof syncForTableToken>> = null;
    if (new URL(request.url).searchParams.get("sync") === "1") {
      posSync = await syncForTableToken(token);
    }
    const state = await getTableSessionState(token);
    if (!state) return errorResponse("No active table session", 404);
    return successResponse(
      posSync
        ? {
            ...state,
            posSync: {
              fresh: posSync.fresh,
              upstreamAvailable: posSync.upstreamAvailable,
              lastSuccessAt: posSync.lastSuccessAt,
            },
          }
        : state,
      200
    );
  } catch (error) {
    return mapGuestSessionError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;

  try {
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid table session action", 400);

    const body = parsed.data;
    if (body.action === "join") {
      const joined = await joinTableSession(token, body.guestSessionId, body.clientToken);
      if (!joined) return errorResponse("No active table session", 404);
      return successResponse(joined, 200);
    }
    if (body.action === "rename") {
      return successResponse(
        await renameGuestSession(token, body.guestSessionId, body.displayName),
        200
      );
    }
    if (body.action === "status") {
      return successResponse(
        await setGuestSessionStatus(token, body.guestSessionId, body.status),
        200
      );
    }
    if (body.action === "claim-item") {
      return successResponse(
        await claimBillItem(token, body.guestSessionId, body.billItemId, body.units),
        200
      );
    }
    return successResponse(
      await releaseBillItemClaim(token, body.guestSessionId, body.billItemId),
      200
    );
  } catch (error) {
    return mapGuestSessionError(error);
  }
}
