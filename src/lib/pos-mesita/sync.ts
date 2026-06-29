/**
 * Demo table ↔ POS Mesita sync (ordenes, PRE, cobros).
 */
import type { DemoTableDefinition } from "@/lib/demo-table-catalog/definitions";
import type { DemoFoodItem, DemoTableState } from "@/lib/demo-table-store";
import {
  isPosMesitaConfigured,
  todayEcPosDate,
  type PosMesitaDocumento,
} from "./client";

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

function buildDetalles(items: DemoFoodItem[]) {
  return items.map((item) => ({
    nombre: item.name,
    cantidad: item.qty,
    precio: item.unitPrice,
    porcentaje_iva: 15,
    base_gravable: Math.round(item.qty * item.unitPrice * 100) / 100,
    base_cero: 0,
    base_no_gravable: 0,
  }));
}

function totalsFromItems(items: DemoFoodItem[], serviceRate = 0.1, serviceEnabled = true) {
  const subtotal15 = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const sub = Math.round(subtotal15 * 100) / 100;
  const iva = Math.round(sub * 0.15 * 100) / 100;
  const servicio = serviceEnabled ? Math.round(sub * serviceRate * 100) / 100 : 0;
  const total = Math.round((sub + iva + servicio) * 100) / 100;
  return { subtotal_15: sub, iva, servicio, total };
}

export async function openPosOrden(mesaId: string): Promise<OpenOrdenResult> {
  return posFetch<OpenOrdenResult>("/orden/open/", {
    method: "POST",
    json: { mesa_id: mesaId },
  });
}

export async function syncDemoJoinToPos(
  def: DemoTableDefinition,
  state: DemoTableState,
): Promise<Partial<DemoTableState>> {
  if (!isPosMesitaConfigured() || isDemoUxTable(def)) {
    return { posMesaId: def.posMesaId };
  }
  const opened = await openPosOrden(def.posMesaId);
  const ordenId = opened.orden.id;
  const totals = totalsFromItems(
    state.items,
    def.restaurant.serviceRate,
    def.restaurant.serviceEnabled,
  );
  const pre = await posFetch<PosMesitaDocumento>("/documento/", {
    method: "POST",
    json: {
      tipo_documento: "PRE",
      orden_id: ordenId,
      fecha_emision: todayEcPosDate(),
      descripcion: `MesitaQR — Mesa ${def.table.name}`,
      subtotal_15: totals.subtotal_15,
      iva: totals.iva,
      servicio: totals.servicio,
      total: totals.total,
      detalles: buildDetalles(state.items),
    },
  });
  for (const item of state.items) {
    await posFetch(`/orden/${ordenId}/detalle/`, {
      method: "POST",
      json: {
        nombre: item.name,
        cantidad: item.qty,
        precio: item.unitPrice,
        porcentaje_iva: 15,
      },
    }).catch(() => {});
  }
  return {
    posMesaId: def.posMesaId,
    posOrdenId: ordenId,
    posDocumentoId: pre.id,
  };
}

export async function syncDemoItemsToPos(
  def: DemoTableDefinition,
  state: DemoTableState,
): Promise<void> {
  if (!isPosMesitaConfigured() || isDemoUxTable(def) || !state.posOrdenId) return;
  const ordenId = state.posOrdenId;
  const orden = await posFetch<{ detalles?: Array<{ id: string; nombre: string }> }>(
    `/orden/${ordenId}/`,
  );
  const existing = new Set((orden.detalles ?? []).map((d) => d.nombre));
  for (const item of state.items) {
    if (existing.has(item.name)) continue;
    await posFetch(`/orden/${ordenId}/detalle/`, {
      method: "POST",
      json: {
        nombre: item.name,
        cantidad: item.qty,
        precio: item.unitPrice,
        porcentaje_iva: 15,
      },
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
    let documentoId = input.posDocumentoId;

    if (input.posMesaId) {
      if (!ordenId) {
        const opened = await openPosOrden(input.posMesaId);
        ordenId = opened.orden.id;
      }
    }

    const detalles =
      input.items && input.items.length > 0
        ? input.items.map((item) => ({
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
    const iva = Math.round((input.amount - subtotal15) * 100) / 100;

    const cobro = {
      forma_cobro: input.method === "EF" ? "EF" : "TC",
      monto: input.amount,
      referencia: `MESITAQR:${input.ref}`,
      procesador: "MesitaQR",
      detalle: input.guestName,
    };

    if (documentoId) {
      await posFetch(`/documento/${documentoId}/`, {
        method: "PATCH",
        json: { cobro },
      });
      return { ok: true, documentoId, ordenId };
    }

    const doc = await posFetch<PosMesitaDocumento>("/documento/", {
      method: "POST",
      json: {
        tipo_documento: input.isDemoUx ? "FAC" : "PRE",
        orden_id: ordenId ?? undefined,
        fecha_emision: todayEcPosDate(),
        descripcion: `Pago MesitaQR — ${input.tableName} — ${input.guestName}`,
        subtotal_15: subtotal15,
        iva: iva > 0 ? iva : Math.round(subtotal15 * 0.15 * 100) / 100,
        total: input.amount,
        ...(detalles ? { detalles } : {}),
        cobros: [cobro],
      },
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
