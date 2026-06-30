import {
  claimDemoItem,
  closeDemoTableAfterFullPayment,
  DemoGuestNotFoundError,
  getDemoTableState,
  joinDemoTable,
  patchDemoTablePosLinks,
  recordDemoPayment,
  refreshDemoStateFromPos,
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
  isDemoTableFullyPaid,
  syncDemoJoinToPos,
} from "@/lib/pos-mesita/sync";
import {
  computeServerPayTotals,
  remapPayItemIds,
  resolvePayItemIds,
} from "@/lib/pos-mesita/resolve-pay";
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
  const cached = await getDemoTableState(token);
  try {
    const state = await refreshDemoStateFromPos(token);
    return successResponse(state, 200);
  } catch (err) {
    console.warn("[demo-table] POS refresh failed, serving cache:", err);
    return successResponse(cached, 200);
  }
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

      const refreshed = await refreshDemoStateFromPos(token, { force: true });
      return successResponse({ ...joined, state: refreshed }, 200);
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
      // Claims live in Redis only — POS has no guest-selection state. Pulling
      // POS here remapped item ids and wiped in-flight multi-select claims.
      const state = await claimDemoItem(token, body.guestId, body.itemId);
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
      const stateBeforePay = await refreshDemoStateFromPos(token, { force: true });
      const remappedItemIds = remapPayItemIds(
        stateBeforePay,
        stateBeforePay,
        resolvePayItemIds(
          stateBeforePay,
          body.guestId,
          body.mode as DemoSplitMode,
          body.itemIds,
        ),
      );
      const serverTotals = computeServerPayTotals(
        stateBeforePay,
        body.mode as DemoSplitMode,
        remappedItemIds,
        body.equalPeople,
        body.tip,
      );
      const amount =
        body.amount > 0.009 ? body.amount : serverTotals.amount;
      const subtotal =
        body.subtotal > 0.009 ? body.subtotal : serverTotals.subtotal;

      const state = await recordDemoPayment(token, {
        guestId: body.guestId,
        guestName: body.guestName,
        mode: body.mode as DemoSplitMode,
        amount,
        subtotal,
        iva: body.iva > 0.009 ? body.iva : serverTotals.iva,
        service: body.service > 0.009 ? body.service : serverTotals.service,
        tip: body.tip,
        itemIds: serverTotals.itemIds.length
          ? serverTotals.itemIds
          : remappedItemIds,
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
            posOrdenId: state.posOrdenId ?? stateBeforePay.posOrdenId,
            isDemoUx: isDemoUxTable(def),
            tableFullyPaid: isDemoTableFullyPaid(state),
            items: (serverTotals.itemIds.length ? serverTotals.itemIds : remappedItemIds)
              .map((itemId) => {
                const item = state.items.find((i) => i.id === itemId);
                if (!item) return null;
                const qty = body.itemUnits?.[itemId] ?? item.qty;
                return { name: item.name, qty, unitPrice: item.unitPrice };
              })
              .filter((x): x is { name: string; qty: number; unitPrice: number } => x !== null),
          });
          if (!posResult.ok) {
            posWarning = posResult.error ?? "No se pudo registrar en POS";
            console.error("[pos-mesita] sync failed:", posWarning);
          } else if (posResult.ordenId) {
            await patchDemoTablePosLinks(token, {
              posOrdenId: posResult.ordenId ?? state.posOrdenId,
              posDocumentoId: posResult.documentoId,
              posMesaId: def.posMesaId,
            });
          }
        }

        if (
          billingEnabled &&
          !isDemoUxTable(def) &&
          isDemoTableFullyPaid(state)
        ) {
          await patchDemoTablePosLinks(token, {
            posOrdenId: undefined,
            posDocumentoId: undefined,
          });
          await refreshDemoStateFromPos(token, { force: true });
          await closeDemoTableAfterFullPayment(token);
        }
      }

      const finalState = await getDemoTableState(token);
      return successResponse({ ...finalState, posWarning }, 200);
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
