import { Redis } from "@upstash/redis";

import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import {
  computeDemoDisplayAmount,
} from "@/lib/demo-bill-math";
import { getDemoTableState } from "@/lib/demo-table-store";
import { DEMO_BASE_URL } from "@/lib/demo-url";
import {
  checkPosMesitaHealth,
  cobroViaMesita,
  extractMesaName,
  isoToPosDate,
  isPosMesitaConfigured,
  listPosDocumentos,
  listPosProductos,
  todayEcPosDate,
  type PosMesitaDocumento,
} from "@/lib/pos-mesita/client";
import { buildSeedMenu, SEED_DEMO_TABLES } from "./seed";
import type {
  DemoPosActivity,
  DemoPosConfig,
  DemoPosExtraTable,
  DemoPosInvoice,
  DemoPosMenuItem,
  DemoPosQrTable,
  DemoPosReport,
  DemoPosReportConsumption,
  DemoPosReportDocument,
  DemoPosReportPayment,
  DemoPosReportsPayload,
  DemoPosSettings,
  DemoPosTableRow,
} from "./types";

const CONFIG_KEY = "mesita:demo-pos:config";
const INVOICES_KEY = "mesita:demo-pos:invoices";
const ACTIVITY_KEY = "mesita:demo-pos:activity";
const MAX_INVOICES = 200;
const MAX_ACTIVITY = 80;

type Memory = {
  config: DemoPosConfig | null;
  invoices: DemoPosInvoice[];
  activities: DemoPosActivity[];
};

function mem(): Memory {
  const g = globalThis as typeof globalThis & { __mesitaDemoPos?: Memory };
  if (!g.__mesitaDemoPos) g.__mesitaDemoPos = { config: null, invoices: [], activities: [] };
  return g.__mesitaDemoPos;
}

function redis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return Redis.fromEnv();
}

function defaultSettings(): DemoPosSettings {
  return {
    restaurant: {
      name: "La Doña Pepa",
      nombreComercial: "La Doña Pepa",
      city: "Quito",
      ruc: "1790123456001",
      direccion: "Av. República del Salvador, Quito",
      email: "contacto@ladonapepa.ec",
      phone: "02-234-5678",
    },
    posMesita: {
      enabled: true,
      environment: "SANDBOX",
      syncMenu: true,
      syncTables: true,
      syncBilling: true,
    },
    payments: {
      enabled: true,
      environment: "SANDBOX",
    },
    fiscal: {
      establecimientoCodigo: "001",
      puntoEmisionCodigo: "001",
      regimen: "GENERAL",
      obligadoContabilidad: false,
    },
  };
}

function defaultConfig(): DemoPosConfig {
  const seed = buildSeedMenu();
  return {
    ...seed,
    extraTables: SEED_DEMO_TABLES.map((t) => ({ ...t })),
    settings: defaultSettings(),
    updatedAt: new Date().toISOString(),
  };
}

async function readConfig(): Promise<DemoPosConfig> {
  const r = redis();
  if (r) {
    const raw = await r.get<DemoPosConfig>(CONFIG_KEY);
    if (raw) {
      if (!raw.settings) raw.settings = defaultSettings();
      return raw;
    }
    const seeded = defaultConfig();
    await r.set(CONFIG_KEY, seeded);
    return seeded;
  }
  if (!mem().config) mem().config = defaultConfig();
  if (!mem().config!.settings) mem().config!.settings = defaultSettings();
  return mem().config!;
}

async function writeConfig(config: DemoPosConfig): Promise<DemoPosConfig> {
  config.updatedAt = new Date().toISOString();
  const r = redis();
  if (r) await r.set(CONFIG_KEY, config);
  else mem().config = config;
  return config;
}

async function mutateConfig(
  fn: (draft: DemoPosConfig) => void,
): Promise<DemoPosConfig> {
  const draft = structuredClone(await readConfig());
  fn(draft);
  return writeConfig(draft);
}

export function demoPayUrl(slug: string): string {
  const base = DEMO_BASE_URL;
  return slug === "default" ? `${base}/pay/demo` : `${base}/pay/demo/${slug}`;
}

export function listQrTables(): DemoPosQrTable[] {
  return DEMO_TABLE_DEFINITIONS.map((def) => ({
    slug: def.slug,
    token: def.token,
    name: `Mesa ${def.table.name}`,
    payUrl: demoPayUrl(def.slug),
    posExternalId: `T-${def.table.name.padStart(3, "0")}`,
    live: true as const,
    scenarioDescription: def.scenarioDescription,
  }));
}

function tableStatus(
  hasGuests: boolean,
  hasPayments: boolean,
  allPaid: boolean,
): "open" | "paying" | "closed" {
  if (allPaid) return "closed";
  if (hasPayments) return "paying";
  if (hasGuests) return "open";
  return "closed";
}

export async function listAllTables(): Promise<DemoPosTableRow[]> {
  const config = await readConfig();
  const qrRows: DemoPosTableRow[] = await Promise.all(
    DEMO_TABLE_DEFINITIONS.map(async (def, i) => {
      const qr = listQrTables()[i];
      const restaurant = def.restaurant;
      const state = await getDemoTableState(def.token).catch(() => null);
      const amounts = computeDemoDisplayAmount(def.items, restaurant, state);

      if (!state) {
        return {
          id: def.token,
          name: qr.name,
          token: def.token,
          slug: def.slug,
          payUrl: qr.payUrl,
          posExternalId: qr.posExternalId,
          live: true,
          kind: "qr",
          status: "closed",
          guestCount: 0,
          total: amounts.displayAmount,
          billTotal: amounts.billTotal,
          paidAmount: 0,
        };
      }
      const allPaid =
        state.paidItemIds.length >= state.items.length && state.items.length > 0;
      const display = computeDemoDisplayAmount(state.items, state.restaurant, state);
      return {
        id: def.token,
        name: qr.name,
        token: def.token,
        slug: def.slug,
        payUrl: qr.payUrl,
        posExternalId: qr.posExternalId,
        live: true,
        kind: "qr",
        status: tableStatus(
          state.guests.length > 0,
          state.payments.length > 0,
          allPaid,
        ),
        guestCount: state.guests.length,
        total: display.displayAmount,
        billTotal: display.billTotal,
        paidAmount: display.paidAmount,
      };
    }),
  );

  const demoRows: DemoPosTableRow[] = config.extraTables.map((t, idx) => ({
    id: t.id,
    name: t.name,
    posExternalId: t.posExternalId,
    live: false,
    kind: t.id.startsWith("demo-mesa-") ? "demo" : "custom",
    status: (["open", "paying", "closed"] as const)[idx % 3],
    guestCount: idx % 3 === 0 ? 2 + (idx % 3) : 0,
    total: 28.5 + idx * 12.4,
    billTotal: 28.5 + idx * 12.4,
    paidAmount: 0,
  }));

  return [...qrRows, ...demoRows];
}

export async function getMenu(): Promise<DemoPosConfig> {
  return readConfig();
}

export async function createMenuItem(input: {
  name: string;
  emoji?: string;
  price: number;
  categoryId: string;
}): Promise<DemoPosMenuItem> {
  const item: DemoPosMenuItem = {
    id: `menu-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    emoji: input.emoji?.trim() || "🍽️",
    price: Math.round(input.price * 100) / 100,
    categoryId: input.categoryId,
    available: true,
    posSku: `SKU-${Date.now().toString(36)}`,
  };
  await mutateConfig((d) => {
    d.menuItems.push(item);
  });
  return item;
}

export async function updateMenuItem(
  id: string,
  patch: Partial<Pick<DemoPosMenuItem, "name" | "emoji" | "price" | "categoryId" | "available">>,
): Promise<DemoPosMenuItem | null> {
  let updated: DemoPosMenuItem | null = null;
  await mutateConfig((d) => {
    const idx = d.menuItems.findIndex((m) => m.id === id);
    if (idx < 0) return;
    d.menuItems[idx] = { ...d.menuItems[idx], ...patch };
    updated = d.menuItems[idx];
  });
  return updated;
}

export async function deleteMenuItem(id: string): Promise<boolean> {
  let removed = false;
  await mutateConfig((d) => {
    const before = d.menuItems.length;
    d.menuItems = d.menuItems.filter((m) => m.id !== id);
    removed = d.menuItems.length < before;
  });
  return removed;
}

export async function createCategory(name: string): Promise<void> {
  await mutateConfig((d) => {
    d.categories.push({
      id: `cat-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      order: d.categories.length,
    });
  });
}

export async function createExtraTable(input: {
  name: string;
  posExternalId?: string;
}): Promise<DemoPosExtraTable> {
  const table: DemoPosExtraTable = {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    posExternalId: input.posExternalId?.trim() || null,
    createdAt: new Date().toISOString(),
  };
  await mutateConfig((d) => {
    d.extraTables.push(table);
  });
  return table;
}

export async function updateExtraTable(
  id: string,
  patch: Partial<Pick<DemoPosExtraTable, "name" | "posExternalId">>,
): Promise<DemoPosExtraTable | null> {
  let updated: DemoPosExtraTable | null = null;
  await mutateConfig((d) => {
    const idx = d.extraTables.findIndex((t) => t.id === id);
    if (idx < 0) return;
    d.extraTables[idx] = { ...d.extraTables[idx], ...patch };
    updated = d.extraTables[idx];
  });
  return updated;
}

export async function deleteExtraTable(id: string): Promise<boolean> {
  if (id.startsWith("demo-mesa-")) return false;
  let removed = false;
  await mutateConfig((d) => {
    const before = d.extraTables.length;
    d.extraTables = d.extraTables.filter((t) => t.id !== id);
    removed = d.extraTables.length < before;
  });
  return removed;
}

export async function registerDemoPosInvoice(
  input: Omit<DemoPosInvoice, "id" | "source">,
): Promise<DemoPosInvoice> {
  const invoice: DemoPosInvoice = {
    ...input,
    id: crypto.randomUUID(),
    source: "app",
  };

  const r = redis();
  if (r) {
    const raw = (await r.get<DemoPosInvoice[]>(INVOICES_KEY)) ?? [];
    const next = [invoice, ...raw].slice(0, MAX_INVOICES);
    await r.set(INVOICES_KEY, next);
  } else {
    mem().invoices = [invoice, ...mem().invoices].slice(0, MAX_INVOICES);
  }
  return invoice;
}

export async function listInvoices(limit = 50): Promise<DemoPosInvoice[]> {
  const r = redis();
  if (r) {
    const raw = (await r.get<DemoPosInvoice[]>(INVOICES_KEY)) ?? [];
    return raw.slice(0, limit);
  }
  return mem().invoices.slice(0, limit);
}

async function readActivities(): Promise<DemoPosActivity[]> {
  const r = redis();
  if (r) return (await r.get<DemoPosActivity[]>(ACTIVITY_KEY)) ?? [];
  return mem().activities;
}

async function writeActivities(items: DemoPosActivity[]): Promise<void> {
  const trimmed = items.slice(0, MAX_ACTIVITY);
  const r = redis();
  if (r) await r.set(ACTIVITY_KEY, trimmed);
  else mem().activities = trimmed;
}

export async function registerDemoPosActivity(
  input: Omit<DemoPosActivity, "id" | "createdAt">,
): Promise<DemoPosActivity> {
  const event: DemoPosActivity = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const prev = await readActivities();
  await writeActivities([event, ...prev]);
  return event;
}

export async function listActivities(limit = 20): Promise<DemoPosActivity[]> {
  return (await readActivities()).slice(0, limit);
}

export async function getDemoSettings(): Promise<DemoPosSettings> {
  return (await readConfig()).settings;
}

export async function updateDemoSettings(
  patch: Partial<{
    restaurant: Partial<DemoPosSettings["restaurant"]>;
    posMesita: Partial<DemoPosSettings["posMesita"]>;
    payments: Partial<DemoPosSettings["payments"]>;
    fiscal: Partial<DemoPosSettings["fiscal"]>;
  }>,
): Promise<DemoPosSettings> {
  let updated: DemoPosSettings = defaultSettings();
  await mutateConfig((d) => {
    if (!d.settings) d.settings = defaultSettings();
    if (patch.restaurant) d.settings.restaurant = { ...d.settings.restaurant, ...patch.restaurant };
    if (patch.posMesita) d.settings.posMesita = { ...d.settings.posMesita, ...patch.posMesita };
    if (patch.payments) d.settings.payments = { ...d.settings.payments, ...patch.payments };
    if (patch.fiscal) d.settings.fiscal = { ...d.settings.fiscal, ...patch.fiscal };
    updated = d.settings;
  });
  return updated;
}

export async function getDemoPosConfigStatus() {
  const base = DEMO_BASE_URL;
  const posHealth = await checkPosMesitaHealth();
  const settings = await getDemoSettings();

  return {
    provider: "mesita-pos-demo",
      name: "POS Mesita Demo",
    enabled: settings.posMesita.enabled,
    apiConfigured: true,
    environment: settings.posMesita.environment,
    baseUrl: `${base}/api/demo-pos`,
    settings,
    posMesita: {
      name: "POS Mesita Demo",
      url: posHealth.baseUrl,
      connected: posHealth.ok,
      configured: posHealth.configured,
      error: posHealth.error ?? null,
      ...settings.posMesita,
    },
    payments: {
      name: "Botón de pago Mesita",
      enabled: settings.payments.enabled,
      environment: settings.payments.environment,
    },
    endpoints: {
      menu: "GET /api/demo-pos?view=menu",
      tables: "GET /api/demo-pos?view=tables",
      reports: "GET /api/demo-pos?view=reports",
      billing: "POST /api/demo/table/[token] (pay → POS)",
      posDocumentos: "GET /documento/ (POS Mesita Railway)",
    },
    sync: {
      menu: settings.posMesita.syncMenu ? "bidirectional" : "off",
      tables: settings.posMesita.syncTables ? "bidirectional" : "off",
      billing: settings.posMesita.syncBilling ? "app → POS Mesita → dashboard" : "off",
    },
    lastSyncAt: new Date().toISOString(),
    restaurant: settings.restaurant,
  };
}

const MOCK_REPORTS: DemoPosReport[] = [
  {
    id: "mock-bill-5",
    tableName: "Mesa 5",
    tableToken: "demo-mesa-5",
    status: "PAID",
    total: 42.8,
    paid: 42.8,
    mesitaPaid: 0,
    posOnlyPaid: 42.8,
    paidViaMesita: false,
    live: false,
    posDocumentId: "PRE-2026-0042",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 86_000_000).toISOString(),
    payments: [{
      id: "mock-p-5",
      amount: 42.8,
      guestName: "Caja POS",
      method: "EF",
      viaMesita: false,
      ref: "POS-0042",
      createdAt: new Date(Date.now() - 86_000_000).toISOString(),
    }],
    consumptions: [],
    documents: [],
  },
  {
    id: "mock-bill-6",
    tableName: "Mesa 6",
    tableToken: "demo-mesa-6",
    status: "PARTIAL",
    total: 67.5,
    paid: 34.2,
    mesitaPaid: 34.2,
    posOnlyPaid: 0,
    paidViaMesita: true,
    live: false,
    posDocumentId: "PRE-2026-0043",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date(Date.now() - 1_800_000).toISOString(),
    payments: [{
      id: "mock-p-6",
      amount: 34.2,
      guestName: "Ana",
      method: "TC",
      viaMesita: true,
      ref: "MQR-20260628-4521",
      createdAt: new Date(Date.now() - 1_800_000).toISOString(),
    }],
    consumptions: [],
    documents: [],
  },
];

function billStatus(
  total: number,
  paid: number,
  hasGuests: boolean,
): DemoPosReport["status"] {
  if (paid <= 0 && hasGuests) return "OPEN";
  if (paid >= total - 0.05) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "CLOSED";
}

function docDetallesToConsumptions(
  doc: PosMesitaDocumento,
  productNames: Map<string, string>,
): DemoPosReportConsumption[] {
  return (doc.detalles ?? []).map((d) => ({
    id: d.id,
    name: d.producto_id
      ? (productNames.get(d.producto_id) ?? `Producto ${d.producto_id.slice(0, 6)}`)
      : "Consumo",
    qty: d.cantidad,
    unitPrice: d.precio,
    total: Math.round(d.cantidad * d.precio * 100) / 100,
    documentId: doc.id,
    documentType: doc.tipo_documento,
    fecha: doc.fecha_emision,
  }));
}

function docToDocumentSummary(
  doc: PosMesitaDocumento,
  productNames: Map<string, string>,
): DemoPosReportDocument {
  const payments: DemoPosReportPayment[] = (doc.cobros ?? []).map((c) => ({
    id: c.id,
    amount: c.monto,
    guestName: c.detalle ?? "Cliente",
    method: c.forma_cobro,
    viaMesita: cobroViaMesita(c),
    ref: c.referencia ?? "",
    createdAt: c.created_at,
  }));
  return {
    id: doc.id,
    tipo: doc.tipo_documento,
    estado: doc.estado,
    descripcion: doc.descripcion,
    fecha: doc.fecha_emision,
    total: doc.total,
    consumptions: docDetallesToConsumptions(doc, productNames),
    payments,
  };
}

function docToReport(
  doc: PosMesitaDocumento,
  productNames: Map<string, string>,
): DemoPosReport {
  const mesaName = extractMesaName(doc);
  const document = docToDocumentSummary(doc, productNames);
  const payments = document.payments;
  const consumptions = document.consumptions;
  const mesitaPaid = payments
    .filter((p) => p.viaMesita)
    .reduce((s, p) => s + p.amount, 0);
  const posOnlyPaid = payments
    .filter((p) => !p.viaMesita)
    .reduce((s, p) => s + p.amount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const total = doc.total;

  let status: DemoPosReport["status"] = "CLOSED";
  if (doc.estado === "P") status = paid > 0 ? "PARTIAL" : "OPEN";
  else if (doc.estado === "C" || doc.estado === "F") status = paid >= total - 0.05 ? "PAID" : "PARTIAL";

  return {
    id: `pos-${doc.id}`,
    tableName: mesaName,
    tableToken: doc.orden?.mesa?.id ?? doc.id,
    status,
    total,
    paid,
    mesitaPaid,
    posOnlyPaid,
    paidViaMesita: mesitaPaid > 0,
    live: false,
    posDocumentId: doc.id,
    createdAt: doc.created_at,
    updatedAt: doc.created_at,
    payments,
    consumptions,
    documents: [document],
  };
}

function mergeReportsByMesa(reports: DemoPosReport[]): DemoPosReport[] {
  const byMesa = new Map<string, DemoPosReport>();

  for (const r of reports) {
    const key = r.tableName.toLowerCase();
    const existing = byMesa.get(key);
    if (!existing) {
      byMesa.set(key, { ...r, documents: [...r.documents], consumptions: [...r.consumptions], payments: [...r.payments] });
      continue;
    }
    existing.total = Math.max(existing.total, r.total);
    existing.paid += r.paid;
    existing.mesitaPaid += r.mesitaPaid;
    existing.posOnlyPaid += r.posOnlyPaid;
    existing.paidViaMesita = existing.paidViaMesita || r.paidViaMesita;
    existing.live = existing.live || r.live;
    if (new Date(r.updatedAt) > new Date(existing.updatedAt)) {
      existing.updatedAt = r.updatedAt;
      existing.status = r.status;
    }
    existing.payments.push(...r.payments);
    existing.consumptions.push(...r.consumptions);
    existing.documents.push(...r.documents);
    if (!existing.posDocumentId && r.posDocumentId) {
      existing.posDocumentId = r.posDocumentId;
    }
  }

  return [...byMesa.values()].map((r) => ({
    ...r,
    payments: [...r.payments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    consumptions: [...r.consumptions].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.documentId.localeCompare(a.documentId),
    ),
    documents: [...r.documents].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id),
    ),
  }));
}

function matchesSearch(report: DemoPosReport, q: string): boolean {
  const needle = q.toLowerCase();
  if (report.tableName.toLowerCase().includes(needle)) return true;
  if (report.posDocumentId?.toLowerCase().includes(needle)) return true;
  if (report.payments.some((p) => p.guestName.toLowerCase().includes(needle) || p.ref.toLowerCase().includes(needle))) {
    return true;
  }
  if (report.consumptions.some((c) => c.name.toLowerCase().includes(needle))) return true;
  if (report.documents.some((d) => (d.descripcion ?? "").toLowerCase().includes(needle))) return true;
  return false;
}

export async function getReports(opts?: {
  date?: string;
  q?: string;
  includeHistory?: boolean;
}): Promise<DemoPosReportsPayload> {
  const posDate = opts?.date ? isoToPosDate(opts.date) : todayEcPosDate();
  const search = opts?.q?.trim() ?? "";
  const includeHistory = opts?.includeHistory ?? Boolean(search);

  let posConnected = false;
  let posError: string | null = null;
  let productNames = new Map<string, string>();

  const liveReports: DemoPosReport[] = await Promise.all(
    DEMO_TABLE_DEFINITIONS.map(async (def) => {
      const tableName = `Mesa ${def.table.name}`;
      const state = await getDemoTableState(def.token).catch(() => null);
      const { billTotal, paidAmount } = computeDemoDisplayAmount(
        def.items,
        def.restaurant,
        state,
      );

      const liveConsumptions: DemoPosReportConsumption[] = def.items.map((item) => ({
        id: `live-${item.id}`,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        total: Math.round(item.qty * item.unitPrice * 100) / 100,
        documentId: `PRE-2026-${def.table.name.padStart(4, "0")}`,
        documentType: "PRE",
        fecha: posDate,
      }));

      if (!state) {
        return {
          id: `bill-${def.token}`,
          tableName,
          tableToken: def.token,
          status: "CLOSED" as const,
          total: billTotal,
          paid: 0,
          mesitaPaid: 0,
          posOnlyPaid: 0,
          paidViaMesita: false,
          live: true,
          posDocumentId: `PRE-2026-${def.table.name.padStart(4, "0")}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          payments: [],
          consumptions: liveConsumptions,
          documents: [],
        };
      }

      const payments: DemoPosReportPayment[] = state.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        guestName: p.guestName,
        method: p.method,
        viaMesita: true,
        ref: p.ref,
        createdAt: p.createdAt,
      }));

      return {
        id: `bill-${def.token}`,
        tableName,
        tableToken: def.token,
        status: billStatus(billTotal, paidAmount, state.guests.length > 0),
        total: billTotal,
        paid: paidAmount,
        mesitaPaid: paidAmount,
        posOnlyPaid: 0,
        paidViaMesita: paidAmount > 0,
        live: true,
        posDocumentId: `PRE-2026-${def.table.name.padStart(4, "0")}`,
        createdAt: state.guests[0]?.joinedAt ?? state.updatedAt,
        updatedAt: state.updatedAt,
        payments,
        consumptions: liveConsumptions,
        documents: payments.length > 0 ? [{
          id: `live-doc-${def.token}`,
          tipo: "FAC",
          estado: paidAmount >= billTotal - 0.05 ? "C" : "P",
          descripcion: `Cuenta QR ${tableName}`,
          fecha: posDate,
          total: billTotal,
          consumptions: liveConsumptions,
          payments,
        }] : [],
      };
    }),
  );

  const hasLivePayments = liveReports.some((r) => r.payments.length > 0);

  let posReports: DemoPosReport[] = [];
  if (isPosMesitaConfigured()) {
    try {
      const health = await checkPosMesitaHealth();
      posConnected = health.ok;
      if (!health.ok) posError = health.error ?? "Error de conexión";

      if (health.ok) {
        try {
          const productos = await listPosProductos();
          productNames = new Map(productos.map((p) => [p.id, p.nombre]));
        } catch {
          /* product names optional */
        }

        const limit = includeHistory ? 100 : 50;
        const docs = await listPosDocumentos({
          limit,
          fechaEmision: includeHistory ? undefined : posDate,
          page: 1,
        });
        posReports = docs
          .map((d) => docToReport(d, productNames))
          .filter((r) => r.paid > 0 || r.status === "OPEN" || r.status === "PARTIAL" || r.consumptions.length > 0);
      }
    } catch (e) {
      posError = e instanceof Error ? e.message : "Error de conexión";
      console.error("[demo-pos] POS documentos fetch failed:", e);
    }
  } else {
    posError = "POS_MESITA_API_KEY no configurada en Vercel";
  }

  const mock = hasLivePayments ? [] : MOCK_REPORTS.map((m) => ({
    ...m,
    consumptions: [],
    documents: m.payments.length > 0 ? [{
      id: m.posDocumentId ?? m.id,
      tipo: "FAC",
      estado: m.status === "PAID" ? "C" : "P",
      descripcion: m.tableName,
      fecha: posDate,
      total: m.total,
      consumptions: [],
      payments: m.payments,
    }] : [],
  }));

  const liveNames = new Set(
    liveReports.filter((r) => r.paid > 0).map((r) => r.tableName.toLowerCase()),
  );
  const posFiltered = posReports.filter(
    (r) => !liveNames.has(r.tableName.toLowerCase()) || !hasLivePayments,
  );

  let merged = mergeReportsByMesa([
    ...liveReports.filter((r) => r.live),
    ...posFiltered,
    ...mock,
  ]);

  if (search) {
    merged = merged.filter((r) => matchesSearch(r, search));
  }

  merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    date: posDate,
    posConnected,
    posError,
    reports: merged,
  };
}
