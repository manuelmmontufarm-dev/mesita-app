import {
  claimDemoItem,
  DemoGuestNotFoundError,
  getDemoTableState,
  joinDemoTable,
  recordDemoPayment,
  releaseDemoItem,
  renameDemoGuest,
  resetDemoTableState,
  setDemoGuestStatus,
  splitDemoItem,
  type DemoGuestStatus,
  type DemoSplitMode,
} from "@/lib/demo-table-store";
import { resolveDemoTableToken } from "@/lib/demo-table-catalog";
import { registerDemoPosInvoice } from "@/lib/demo-pos";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    guestId: z.string().optional(),
    deviceId: z.string().optional(),
  }),
  z.object({
    action: z.literal("rename"),
    guestId: z.string(),
    name: z.string(),
  }),
  z.object({
    action: z.literal("status"),
    guestId: z.string(),
    status: z.enum(["selecting", "reviewing", "in_payment", "paid"]),
  }),
  z.object({
    action: z.literal("claim"),
    guestId: z.string(),
    itemId: z.string(),
  }),
  z.object({
    action: z.literal("release"),
    guestId: z.string(),
    itemId: z.string(),
  }),
  z.object({
    action: z.literal("split"),
    guestId: z.string(),
    itemId: z.string(),
    units: z.record(z.string(), z.number()),
  }),
  z.object({
    action: z.literal("pay"),
    guestId: z.string(),
    guestName: z.string(),
    mode: z.enum(["item", "equal", "todo"]),
    amount: z.number().min(0),
    subtotal: z.number().min(0),
    iva: z.number().min(0),
    service: z.number().min(0),
    tip: z.number().min(0),
    itemIds: z.array(z.string()),
    itemUnits: z.record(z.string(), z.number()).optional(),
    equalPeople: z.number().int().min(1).optional(),
    method: z.string().min(1),
    ref: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("reset"),
  }),
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  return successResponse(await getDemoTableState(token), 200);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;

  try {
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid demo action", 400);

    const body = parsed.data;
    if (body.action === "join") {
      const joined = await joinDemoTable(token, {
        guestId: body.guestId,
        deviceId: body.deviceId,
      });
      return successResponse(joined, 200);
    }
    if (body.action === "rename") {
      return successResponse(await renameDemoGuest(token, body.guestId, body.name), 200);
    }
    if (body.action === "status") {
      return successResponse(
        await setDemoGuestStatus(token, body.guestId, body.status as DemoGuestStatus),
        200
      );
    }
    if (body.action === "claim") {
      return successResponse(await claimDemoItem(token, body.guestId, body.itemId), 200);
    }
    if (body.action === "release") {
      return successResponse(await releaseDemoItem(token, body.guestId, body.itemId), 200);
    }
    if (body.action === "split") {
      return successResponse(
        await splitDemoItem(token, body.guestId, body.itemId, body.units),
        200,
      );
    }
    if (body.action === "pay") {
      const state = await recordDemoPayment(token, {
        guestId: body.guestId,
        guestName: body.guestName,
        mode: body.mode as DemoSplitMode,
        amount: body.amount,
        subtotal: body.subtotal,
        iva: body.iva,
        service: body.service,
        tip: body.tip,
        itemIds: body.itemIds,
        itemUnits: body.itemUnits,
        equalPeople: body.equalPeople,
        method: body.method,
        ref: body.ref,
      });

      const def = resolveDemoTableToken(token);
      const payment = state.payments[0];
      if (def && payment) {
        registerDemoPosInvoice({
          tableToken: token,
          tableName: `Mesa ${def.table.name}`,
          guestName: payment.guestName,
          amount: payment.amount,
          subtotal: payment.subtotal,
          iva: payment.iva,
          service: payment.service,
          tip: payment.tip,
          method: payment.method,
          ref: payment.ref,
          mode: payment.mode,
          createdAt: payment.createdAt,
        }).catch((err) => console.error("[demo-pos] invoice register failed:", err));
      }

      return successResponse(state, 200);
    }

    return successResponse(await resetDemoTableState(token), 200);
  } catch (error) {
    if (error instanceof DemoGuestNotFoundError) {
      return errorResponse("Guest session expired — rejoin the table", 409);
    }
    console.error("Demo table action failed:", error);
    return errorResponse("Internal server error", 500);
  }
}
