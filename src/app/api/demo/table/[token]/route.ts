import {
  claimDemoItem,
  getDemoTableState,
  joinDemoTable,
  recordDemoPayment,
  renameDemoGuest,
  resetDemoTableState,
  setDemoGuestStatus,
  type DemoGuestStatus,
  type DemoSplitMode,
} from "@/lib/demo-table-store";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    guestId: z.string().optional(),
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
    equalPeople: z.number().int().min(1).optional(),
    method: z.string().min(1),
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
  return successResponse(getDemoTableState(token), 200);
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
      const joined = joinDemoTable(token, body.guestId);
      return successResponse(joined, 200);
    }
    if (body.action === "rename") {
      return successResponse(renameDemoGuest(token, body.guestId, body.name), 200);
    }
    if (body.action === "status") {
      return successResponse(
        setDemoGuestStatus(token, body.guestId, body.status as DemoGuestStatus),
        200
      );
    }
    if (body.action === "claim") {
      return successResponse(claimDemoItem(token, body.guestId, body.itemId), 200);
    }
    if (body.action === "pay") {
      return successResponse(
        recordDemoPayment(token, {
          guestId: body.guestId,
          guestName: body.guestName,
          mode: body.mode as DemoSplitMode,
          amount: body.amount,
          subtotal: body.subtotal,
          iva: body.iva,
          service: body.service,
          tip: body.tip,
          itemIds: body.itemIds,
          equalPeople: body.equalPeople,
          method: body.method,
        }),
        200
      );
    }

    return successResponse(resetDemoTableState(token), 200);
  } catch (error) {
    console.error("Demo table action failed:", error);
    return errorResponse("Internal server error", 500);
  }
}
