import {
  claimDemoItem,
  DemoGuestNotFoundError,
  getDemoTableState,
  joinDemoTable,
  patchDemoTablePosLinks,
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
import {
  isDemoPosBillingEnabled,
  registerDemoPosInvoice,
  registerDemoPosActivity,
} from "@/lib/demo-pos";
import { registerPaymentInPosMesita } from "@/lib/pos-mesita/client";
import {
  isDemoUxTable,
  syncDemoItemsToPos,
  syncDemoJoinToPos,
} from "@/lib/pos-mesita/sync";
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
    const billingEnabled = await isDemoPosBillingEnabled();

    if (body.action === "join") {
      const before = await getDemoTableState(token).catch(() => null);
      const hadGuests = (before?.guests.length ?? 0) > 0;
      const joined = await joinDemoTable(token, {
        guestId: body.guestId,
        deviceId: body.deviceId,
      });

      const def = resolveDemoTableToken(token);
      if (def) {
        const tableName = `Mesa ${def.table.name}`;
        const isNewGuest = joined.guest.joinedAt === joined.guest.updatedAt;

        if (billingEnabled && isNewGuest && !hadGuests && !isDemoUxTable(def)) {
          try {
            const links = await syncDemoJoinToPos(def, joined.state);
            await patchDemoTablePosLinks(token, links);
            joined.state = { ...joined.state, ...links };
          } catch (err) {
            console.error("[pos-mesita] join sync failed:", err);
          }
        }

        if (isNewGuest) {
          if (!hadGuests) {
            registerDemoPosActivity({
              type: "table_opened",
              tableName,
              tableToken: token,
              guestCount: joined.state.guests.length,
            }).catch(() => {});
          }
          registerDemoPosActivity({
            type: "guest_joined",
            tableName,
            tableToken: token,
            guestName: joined.guest.name,
            guestCount: joined.state.guests.length,
          }).catch(() => {});
        }
      }

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
      const state = await claimDemoItem(token, body.guestId, body.itemId);
      const def = resolveDemoTableToken(token);
      if (def && billingEnabled && !isDemoUxTable(def)) {
        syncDemoItemsToPos(def, state).catch((err) =>
          console.error("[pos-mesita] claim sync failed:", err),
        );
      }
      return successResponse(state, 200);
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
      let posWarning: string | undefined;

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

        registerDemoPosActivity({
          type: "payment",
          tableName: `Mesa ${def.table.name}`,
          tableToken: token,
          guestName: payment.guestName,
          amount: payment.amount,
        }).catch(() => {});

        if (billingEnabled) {
          const posResult = await registerPaymentInPosMesita({
            tableName: `Mesa ${def.table.name}`,
            guestName: payment.guestName,
            amount: payment.amount,
            ref: payment.ref,
            method: payment.method,
            posMesaId: def.posMesaId,
            posOrdenId: state.posOrdenId,
            posDocumentoId: state.posDocumentoId,
            isDemoUx: isDemoUxTable(def),
            items: body.itemIds
              .map((itemId) => {
                const item = def.items.find((i) => i.id === itemId);
                if (!item) return null;
                const qty = body.itemUnits?.[itemId] ?? item.qty;
                return { name: item.name, qty, unitPrice: item.unitPrice };
              })
              .filter((x): x is { name: string; qty: number; unitPrice: number } => x !== null),
          });
          if (!posResult.ok) {
            posWarning = posResult.error ?? "No se pudo registrar en POS";
            console.error("[pos-mesita] sync failed:", posWarning);
          } else if (posResult.ordenId || posResult.documentoId) {
            await patchDemoTablePosLinks(token, {
              posOrdenId: posResult.ordenId ?? state.posOrdenId,
              posDocumentoId: posResult.documentoId ?? state.posDocumentoId,
              posMesaId: def.posMesaId,
            });
          }
        }
      }

      return successResponse({ ...state, posWarning }, 200);
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
