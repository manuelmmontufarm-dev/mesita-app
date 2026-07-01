/**
 * Demo table ↔ POS Mesita sync (ordenes, PRE, cobros).
 */
import type { DemoTableDefinition } from "@/lib/demo-table-catalog/definitions";
import type { DemoFoodItem, DemoTableState } from "@/lib/demo-table-store";
import {
  markDemoTableClosed,
  startFreshDemoSession,
} from "@/lib/demo-table-store";
import {
  findActivePosOrdenForMesa,
  getPosMesaSession,
  isPosMesitaConfigured,
  todayEcPosDate,
  type PosMesitaDocumento,
} from "./client";
import { mergePosDetallesIntoItems } from "./merge-from-pos";

// Throttle del pull POS por mesa. Bajado 1500→800ms: el cuello de botella medido
// en POS→app era este throttle (bench: p50 ~2.2s). 800ms protege el POS API
// (1 llamada/mesa) y reduce POS→app a ~1.2-1.3s. force:true (join/pay) lo salta.
const POS_PULL_MIN_MS = 800;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Token ${key}`,
        Accept: "application/json",
        ...(init?.json ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string>),
      },
      body: init?.json ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`POS timeout: ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
  await posFetch(`/mesa/${mesaId}/reset-demo/`, { method: "POST" }).catch(async () => {
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
  });
}

export async function registerPaymentInPosMesita(input: {
  tableName: string;
  guestName: string;
  amount: number;
  subtotal?: number;
  iva?: number;
  servicio?: number;
  propina?: number;
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

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const propina = round2(Math.max(0, input.propina ?? 0));

    // Prefer the authoritative breakdown from the payment (subtotal/iva/service);
    // fall back to deriving from items or the tip-excluded amount.
    const subtotalFromItems = detalles
      ? detalles.reduce((s, d) => s + d.cantidad * d.precio, 0)
      : undefined;
    const subtotal15 = round2(
      input.subtotal ?? subtotalFromItems ?? Math.max(0, input.amount - propina) / 1.15,
    );
    const iva = round2(input.iva ?? subtotal15 * 0.15);
    const servicio = round2(input.servicio ?? 0);

    // The document total is the BILL (subtotal + iva + servicio) and excludes the
    // tip. The tip travels on the cobro as `propina` — this mirrors Contifico and
    // makes the POS "cuenta cerrada" reconcile (total == sum of cobro montos).
    const docTotal = round2(subtotal15 + iva + servicio);

    const cobro = {
      forma_cobro: input.method === "EF" ? "EF" : "TC",
      monto: docTotal,
      propina,
      referencia: `MESITAQR:${input.ref}`,
      procesador: "MesitaQR",
      detalle: input.guestName,
    };

    let documentoId = input.posDocumentoId;

    if (!documentoId && ordenId) {
      const listed = await posFetch<{ results: PosMesitaDocumento[] }>(
        `/documento/?orden_id=${encodeURIComponent(ordenId)}&tipo_documento=PRE&estado=P&result_size=5`,
      );
      documentoId = listed.results?.[0]?.id;
    }

    if (documentoId) {
      await posFetch<PosMesitaDocumento>(`/documento/${documentoId}/`, {
        method: "PATCH",
        json: {
          cobro,
          ...(input.tableFullyPaid ? { estado: "C" } : {}),
        },
      });
    } else {
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
      documentoId = doc.id;
    }

    if (input.tableFullyPaid && input.posMesaId) {
      await releasePosMesaAfterFullPayment(input.posMesaId, ordenId);
    } else if (input.posMesaId) {
      await posFetch(`/mesa/${input.posMesaId}/`, {
        method: "PATCH",
        json: { estado: "P" },
      }).catch(() => {});
    }

    return { ok: true, documentoId, ordenId };
  } catch (e) {
    console.error("[pos-mesita] register payment failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function resetDemoPosMesa(def: DemoTableDefinition): Promise<void> {
  if (!isPosMesitaConfigured() || !def.posMesaId) return;
  try {
    await posFetch(`/mesa/${def.posMesaId}/reset-demo/`, { method: "POST" });
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
 * Pull mesa session snapshot into demo Redis (mesas 1–4 only).
 * One POS API call — fast enough for guest polling on Vercel.
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

  let session;
  try {
    session = await getPosMesaSession(def.posMesaId);
  } catch (e) {
    console.warn("[pos-mesita] session pull failed:", e instanceof Error ? e.message : e);
    return { state, changed: false, posOrdenId: state.posOrdenId };
  }

  const ordenId = session.orden?.id;

  // Mesa cerrada (pagada): no re-sincronizar para preservar la pantalla de éxito/confeti.
  // Si el POS reabrió con una orden NUEVA, arranca una sesión limpia (mesa vacía).
  if (state.sessionPhase === "closed") {
    const reopened = Boolean(ordenId && ordenId !== state.posOrdenId);
    if (reopened) {
      const fresh = await startFreshDemoSession(token);
      return { state: fresh, changed: true, posOrdenId: undefined };
    }
    return { state, changed: false, posOrdenId: state.posOrdenId };
  }

  const hadLinkedOrden = Boolean(state.posOrdenId);
  const ordenClosed = hadLinkedOrden && !ordenId;
  const mesaLibre = session.mesa?.estado === "L";
  const billSub = state.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const paidSub = state.payments.reduce((s, p) => s + p.subtotal, 0);
  const fullyPaidSession =
    (ordenClosed || mesaLibre) &&
    state.items.length > 0 &&
    (state.paidItemIds.length >= state.items.length ||
      paidSub >= billSub - 0.05);

  if (!session.orden || !ordenId) {
    if (ordenClosed && fullyPaidSession) {
      // Pago total detectado: marca cerrada CONSERVANDO items/guests/payments
      // para que los comensales presentes vean confeti. No vacía la mesa.
      const closed = await markDemoTableClosed(token).catch(() => undefined);
      return {
        state: closed ?? { ...state },
        changed: true,
        posOrdenId: state.posOrdenId,
      };
    }

    const merged = mergePosDetallesIntoItems(state.items, [], {
      paidItemIds: state.paidItemIds,
      itemPaidUnits: state.itemPaidUnits,
    });
    const cleared =
      merged.changed ||
      state.posOrdenId != null ||
      (mesaLibre && state.items.length > 0);

    if (!cleared && !ordenClosed) {
      return { state, changed: false, posOrdenId: state.posOrdenId };
    }

    const reset = ordenClosed || mesaLibre ? resetSessionForClosedOrden() : {};

    return {
      state: {
        ...state,
        ...reset,
        items: mesaLibre || ordenClosed ? [] : merged.items,
        posOrdenId: undefined,
        posMesaId: def.posMesaId,
      },
      changed: true,
    };
  }

  const detalles = (session.orden.detalles ?? [])
    .filter((d) => d.nombre)
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      cantidad: Number(d.cantidad),
      precio: Number(d.precio),
      productoId: d.producto_id ?? null,
    }));

  const merged = mergePosDetallesIntoItems(state.items, detalles, {
    paidItemIds: state.paidItemIds,
    itemPaidUnits: state.itemPaidUnits,
  });

  let next: DemoTableState = {
    ...state,
    items: merged.items,
    posOrdenId: ordenId,
    posMesaId: def.posMesaId,
    posDocumentoId: session.documento?.id,
  };

  let paymentsChanged = false;
  if (session.cobros?.length) {
    const { mergePosCobrosIntoPayments } = await import("./pull-pos-payments");
    const syntheticDoc: PosMesitaDocumento = {
      id: session.documento?.id ?? `session-${ordenId}`,
      tipo_documento: "PRE",
      estado: "P",
      descripcion: null,
      total: session.totales.total,
      subtotal_15: session.totales.subtotal,
      iva: session.totales.iva,
      servicio: session.totales.servicio,
      fecha_emision: todayEcPosDate(),
      cobros: session.cobros,
      created_at: new Date().toISOString(),
    };
    const paidMerged = mergePosCobrosIntoPayments(next, [syntheticDoc]);
    if (paidMerged.changed) {
      next = {
        ...next,
        payments: paidMerged.payments,
        paidItemIds: paidMerged.paidItemIds,
        itemPaidUnits: paidMerged.itemPaidUnits,
      };
      paymentsChanged = true;
    }
  }

  const linksChanged =
    state.posOrdenId !== ordenId ||
    state.posMesaId !== def.posMesaId ||
    state.posDocumentoId !== session.documento?.id;

  if (!merged.changed && !linksChanged && !paymentsChanged) {
    return { state, changed: false, posOrdenId: ordenId };
  }

  return { state: next, changed: true, posOrdenId: ordenId };
}
