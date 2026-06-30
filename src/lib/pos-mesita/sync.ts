/**
 * Demo table ↔ POS Mesita sync (ordenes, PRE, cobros).
 */
import type { DemoTableDefinition } from "@/lib/demo-table-catalog/definitions";
import type { DemoFoodItem, DemoTableState } from "@/lib/demo-table-store";
import { closeDemoTableAfterFullPayment } from "@/lib/demo-table-store";
import {
  findActivePosOrdenForMesa,
  getPosOrden,
  isPosMesitaConfigured,
  todayEcPosDate,
  type PosMesitaDocumento,
} from "./client";
import { mergePosDetallesIntoItems } from "./merge-from-pos";

const POS_PULL_MIN_MS = 100;
const lastPosPullAt = new Map<string, number>();

interface OpenOrdenResult {
  orden: { id: string };
  totales?: { total: number };
  created?: boolean;
}

async function posFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const key = process.env.POS_MESITA_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("POS_MESITA_API_KEY not configured");
  const base = (process.env.POS_MESITA_API_URL ?? "https://mesita-pos.vercel.app/sistema/api/v1").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${key}`,
      Accept: "application/json",
      ...(init?.json ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string>),
    },
    body: init?.json ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POS ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function isDemoUxTable(def: DemoTableDefinition): boolean {
  return def.token === "demo" || def.table.name === "12";
}

export async function openPosOrden(mesaId: string): Promise<OpenOrdenResult> {
  return posFetch<OpenOrdenResult>("/orden/open/", {
    method: "POST",
    json: { mesa_id: mesaId },
  });
}

function unpaidItemsForPos(state: DemoTableState): DemoFoodItem[] {
  return state.items.flatMap((item) => {
    const paidUnits = state.itemPaidUnits?.[item.id] ?? 0;
    const fullyPaid =
      state.paidItemIds.includes(item.id) && paidUnits >= item.qty - 0.001;
    if (fullyPaid) return [];
    const remaining = Math.max(0, item.qty - paidUnits);
    if (remaining <= 0.001) return [];
    return [{ ...item, qty: remaining }];
  });
}

/** Replace POS orden líneas with current unpaid app items (no PRE). */
export async function reconcilePosOrdenFromApp(
  ordenId: string,
  state: DemoTableState,
): Promise<void> {
  const orden = await posFetch<{
    detalles?: Array<{ id: string }>;
  }>(`/orden/${ordenId}/`);

  const deletes: Promise<unknown>[] = [];
  for (const d of orden.detalles ?? []) {
    deletes.push(
      posFetch(`/orden/${ordenId}/detalle/${d.id}/`, { method: "DELETE" }).catch(
        () => {},
      ),
    );
  }
  await Promise.all(deletes);

  const adds = unpaidItemsForPos(state).map((item) =>
    posFetch(`/orden/${ordenId}/detalle/`, {
      method: "POST",
      json: {
        nombre: item.name,
        cantidad: item.qty,
        precio: item.unitPrice,
        porcentaje_iva: 15,
      },
    }).catch(() => {}),
  );
  await Promise.all(adds);
}

export async function syncDemoJoinToPos(
  def: DemoTableDefinition,
  _state: DemoTableState,
  _opts: { freshOrden?: boolean } = {},
): Promise<Partial<DemoTableState>> {
  if (!isPosMesitaConfigured() || isDemoUxTable(def)) {
    return { posMesaId: def.posMesaId };
  }

  // POS is source of truth — link to the active orden or open an empty one.
  // Never push catalog seed items into the POS precuenta.
  let orden = await findActivePosOrdenForMesa(def.posMesaId).catch(() => null);
  let ordenId = orden?.id;

  if (!ordenId) {
    const opened = await openPosOrden(def.posMesaId);
    ordenId = opened.orden.id;
  }

  return {
    posMesaId: def.posMesaId,
    posOrdenId: ordenId,
    posDocumentoId: undefined,
  };
}

export async function syncDemoItemsToPos(
  _def: DemoTableDefinition,
  _state: DemoTableState,
): Promise<void> {
  // POS is source of truth — app pulls orden; no push on claim.
}

export function isDemoTableFullyPaid(state: DemoTableState): boolean {
  const billSub = state.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const paidSub = state.payments.reduce((s, p) => s + p.subtotal, 0);
  if (state.items.length === 0) {
    return state.payments.length > 0 && paidSub > 0.009;
  }
  return (
    state.items.every((it) => state.paidItemIds.includes(it.id)) ||
    paidSub >= billSub - 0.02
  );
}

export async function finalizePosAfterMesitaPayment(input: {
  mesaId: string;
  ordenId?: string;
  documentoId?: string;
  tableFullyPaid: boolean;
  guestName: string;
  amount: number;
}): Promise<void> {
  if (input.documentoId) {
    await posFetch(`/documento/${input.documentoId}/`, {
      method: "PATCH",
      json: {
        estado: input.tableFullyPaid ? "C" : "P",
      },
    }).catch(() => {});
  }

  if (input.tableFullyPaid) {
    await releasePosMesaAfterFullPayment(input.mesaId, input.ordenId);
  }
}

/** Close orden + libera mesa so the POS UI returns to the floor plan. */
export async function releasePosMesaAfterFullPayment(
  mesaId: string,
  ordenId?: string,
): Promise<void> {
  if (ordenId) {
    await posFetch(`/orden/${ordenId}/`, {
      method: "PATCH",
      json: { estado: "C" },
    }).catch(() => {});
  }

  await posFetch(`/mesa/${mesaId}/`, {
    method: "PATCH",
    json: { estado: "L" },
  }).catch(() => {});

  // Some POS builds keep the editor open until the active orden is cleared.
  const active = ordenId
    ? null
    : await findActivePosOrdenForMesa(mesaId).catch(() => null);
  const closeId = ordenId ?? active?.id;
  if (closeId) {
    await posFetch(`/orden/${closeId}/`, {
      method: "PATCH",
      json: { estado: "C" },
    }).catch(() => {});
  }
}

export async function registerPaymentInPosMesita(input: {
  tableName: string;
  guestName: string;
  amount: number;
  ref: string;
  method?: string;
  items?: Array<{ name: string; qty: number; unitPrice: number }>;
  posMesaId?: string;
  posOrdenId?: string;
  posDocumentoId?: string;
  isDemoUx?: boolean;
  tableFullyPaid?: boolean;
}): Promise<{
  ok: boolean;
  documentoId?: string;
  ordenId?: string;
  error?: string;
}> {
  if (!isPosMesitaConfigured()) {
    return { ok: false, error: "POS_MESITA_API_KEY not configured" };
  }

  try {
    let ordenId = input.posOrdenId;

    if (input.posMesaId && !ordenId) {
      const opened = await openPosOrden(input.posMesaId);
      ordenId = opened.orden.id;
    }

    const payItems = input.items ?? [];
    const detalles =
      payItems.length > 0
        ? payItems.map((item) => ({
            nombre: item.name,
            cantidad: item.qty,
            precio: item.unitPrice,
            porcentaje_iva: 15,
            base_gravable: Math.round(item.qty * item.unitPrice * 100) / 100,
            base_cero: 0,
            base_no_gravable: 0,
          }))
        : undefined;

    const subtotalFromItems = detalles
      ? detalles.reduce((s, d) => s + d.cantidad * d.precio, 0)
      : input.amount / 1.15;
    const subtotal15 = Math.round(subtotalFromItems * 100) / 100;
    const iva = Math.round(subtotal15 * 0.15 * 100) / 100;
    const servicio = 0;
    const docTotal =
      input.amount > 0.009
        ? input.amount
        : Math.round((subtotal15 + iva + servicio) * 100) / 100;

    const cobro = {
      forma_cobro: input.method === "EF" ? "EF" : "TC",
      monto: docTotal,
      referencia: `MESITAQR:${input.ref}`,
      procesador: "MesitaQR",
      detalle: input.guestName,
    };

    const doc = await posFetch<PosMesitaDocumento>("/documento/", {
      method: "POST",
      json: {
        tipo_documento: input.tableFullyPaid ? "FAC" : input.isDemoUx ? "FAC" : "PRE",
        orden_id: ordenId ?? undefined,
        fecha_emision: todayEcPosDate(),
        descripcion: `Pago MesitaQR — ${input.tableName} — ${input.guestName}`,
        subtotal_15: subtotal15,
        iva,
        servicio,
        total: docTotal,
        estado: input.tableFullyPaid ? "C" : "P",
        ...(detalles ? { detalles } : {}),
        cobros: [cobro],
      },
    });

    if (input.posMesaId) {
      await posFetch(`/mesa/${input.posMesaId}/`, {
        method: "PATCH",
        json: { estado: input.tableFullyPaid ? "L" : "P" },
      }).catch(() => {});
    }

    await finalizePosAfterMesitaPayment({
      mesaId: input.posMesaId ?? "",
      ordenId,
      documentoId: doc.id,
      tableFullyPaid: Boolean(input.tableFullyPaid),
      guestName: input.guestName,
      amount: input.amount,
    });

    return { ok: true, documentoId: doc.id, ordenId };
  } catch (e) {
    console.error("[pos-mesita] register payment failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function resetDemoPosMesa(_def: DemoTableDefinition, state: DemoTableState): Promise<void> {
  if (!isPosMesitaConfigured() || !state.posOrdenId) return;
  try {
    await posFetch(`/orden/${state.posOrdenId}/`, {
      method: "PATCH",
      json: { estado: "C" },
    });
  } catch (_) { /* ignore */ }
}

function shouldPullPosNow(token: string, force: boolean): boolean {
  if (force) return true;
  const now = Date.now();
  const last = lastPosPullAt.get(token) ?? 0;
  if (now - last < POS_PULL_MIN_MS) return false;
  lastPosPullAt.set(token, now);
  return true;
}

function isActivePosOrden(orden: { estado?: string }): boolean {
  const st = (orden.estado ?? "A").toUpperCase();
  return st === "A" || st === "P";
}

function resetSessionForClosedOrden(): Partial<DemoTableState> {
  return {
    items: [],
    claims: {},
    claimShares: undefined,
    paidItemIds: [],
    itemPaidUnits: {},
    payments: [],
    posOrdenId: undefined,
    posDocumentoId: undefined,
  };
}

/**
 * Pull POS cobros/documentos linked to the active orden.
 */
export async function pullPosPaymentsIntoDemoState(
  state: DemoTableState,
  ordenId?: string,
): Promise<{ state: DemoTableState; changed: boolean }> {
  if (!ordenId || !isPosMesitaConfigured()) {
    return { state, changed: false };
  }

  const { listPosDocumentosForOrden } = await import("./client");
  const { mergePosCobrosIntoPayments } = await import("./pull-pos-payments");

  const docs = await listPosDocumentosForOrden(ordenId).catch(() => []);
  if (!docs.length) return { state, changed: false };

  const merged = mergePosCobrosIntoPayments(state, docs);
  if (!merged.changed) return { state, changed: false };

  return {
    state: {
      ...state,
      payments: merged.payments,
      paidItemIds: merged.paidItemIds,
      itemPaidUnits: merged.itemPaidUnits,
    },
    changed: true,
  };
}

/**
 * Pull active POS orden líneas into demo Redis state (mesas 1–4 only).
 */
export async function pullPosOrdenIntoDemoState(
  token: string,
  def: DemoTableDefinition,
  state: DemoTableState,
  opts: { force?: boolean } = {},
): Promise<{ state: DemoTableState; changed: boolean; posOrdenId?: string }> {
  if (isDemoUxTable(def) || !isPosMesitaConfigured()) {
    return { state, changed: false };
  }
  if (!shouldPullPosNow(token, Boolean(opts.force))) {
    return { state, changed: false, posOrdenId: state.posOrdenId };
  }

  let ordenId = state.posOrdenId;
  let orden = ordenId ? await getPosOrden(ordenId).catch(() => null) : null;

  if (orden && !isActivePosOrden(orden)) {
    orden = null;
    ordenId = undefined;
  }

  if (!orden) {
    orden = await findActivePosOrdenForMesa(def.posMesaId).catch(() => null);
    ordenId = orden?.id;
  }

  if (orden && !isActivePosOrden(orden)) {
    orden = null;
    ordenId = undefined;
  }

  const hadLinkedOrden = Boolean(state.posOrdenId);
  const ordenClosed = hadLinkedOrden && !ordenId;
  const billSub = state.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const paidSub = state.payments.reduce((s, p) => s + p.subtotal, 0);
  const fullyPaidSession =
    ordenClosed &&
    state.items.length > 0 &&
    (state.paidItemIds.length >= state.items.length ||
      paidSub >= billSub - 0.05);

  if (!orden || !ordenId) {
    const merged = mergePosDetallesIntoItems(state.items, [], {
      paidItemIds: state.paidItemIds,
      itemPaidUnits: state.itemPaidUnits,
    });
    const cleared =
      merged.changed ||
      state.posOrdenId != null ||
      state.items.some((it) => !state.paidItemIds.includes(it.id));

    if (!cleared && !ordenClosed) return { state, changed: false };

    if (ordenClosed && fullyPaidSession) {
      await closeDemoTableAfterFullPayment(token).catch(() => undefined);
      return {
        state: {
          ...state,
          items: [],
          claims: {},
          claimShares: undefined,
          paidItemIds: [],
          itemPaidUnits: {},
          payments: [],
          posOrdenId: undefined,
          posDocumentoId: undefined,
        },
        changed: true,
      };
    }

    const reset = ordenClosed ? resetSessionForClosedOrden() : {};

    return {
      state: {
        ...state,
        ...reset,
        items: ordenClosed ? [] : merged.items,
        posOrdenId: undefined,
        posMesaId: def.posMesaId,
      },
      changed: true,
    };
  }

  const detalles = (orden.detalles ?? []).filter((d) => d.nombre);
  const merged = mergePosDetallesIntoItems(state.items, detalles, {
    paidItemIds: state.paidItemIds,
    itemPaidUnits: state.itemPaidUnits,
  });

  const linksChanged =
    state.posOrdenId !== ordenId ||
    state.posMesaId !== def.posMesaId;

  if (!merged.changed && !linksChanged) {
    return { state, changed: false, posOrdenId: ordenId };
  }

  const next: DemoTableState = {
    ...state,
    items: merged.items,
    posOrdenId: ordenId,
    posMesaId: def.posMesaId,
  };

  return { state: next, changed: true, posOrdenId: ordenId };
}
