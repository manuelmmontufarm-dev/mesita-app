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
  isPosMesitaConfigured,
  listPosDocumentos,
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
  DemoPosReportPayment,
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
    name: "Mesita POS (API Railway)",
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

function docToReport(doc: PosMesitaDocumento): DemoPosReport {
  const mesaName =
    doc.orden?.mesa?.nombre ??
    (doc.descripcion?.match(/Mesa\s+\d+/i)?.[0] ?? "POS");
  const payments: DemoPosReportPayment[] = (doc.cobros ?? []).map((c) => ({
    id: c.id,
    amount: c.monto,
    guestName: c.detalle ?? "Cliente",
    method: c.forma_cobro,
    viaMesita: cobroViaMesita(c),
    ref: c.referencia ?? "",
    createdAt: c.created_at,
  }));
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
  };
}

export async function getReports(): Promise<DemoPosReport[]> {
  const liveReports: DemoPosReport[] = await Promise.all(
    DEMO_TABLE_DEFINITIONS.map(async (def) => {
      const tableName = `Mesa ${def.table.name}`;
      const state = await getDemoTableState(def.token).catch(() => null);
      const { billTotal, paidAmount } = computeDemoDisplayAmount(
        def.items,
        def.restaurant,
        state,
      );

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
      };
    }),
  );

  const hasLivePayments = liveReports.some((r) => r.payments.length > 0);

  let posReports: DemoPosReport[] = [];
  if (isPosMesitaConfigured()) {
    try {
      posReports = (await listPosDocumentos(40))
        .map(docToReport)
        .filter((r) => r.paid > 0 || r.status === "OPEN" || r.status === "PARTIAL");
    } catch (e) {
      console.error("[demo-pos] POS documentos fetch failed:", e);
    }
  }

  const mock = hasLivePayments ? [] : MOCK_REPORTS;

  // Live QR reports override POS docs for same table name; POS adds external history
  const liveNames = new Set(
    liveReports.filter((r) => r.paid > 0).map((r) => r.tableName),
  );
  const posFiltered = posReports.filter(
    (r) => !liveNames.has(r.tableName) || !hasLivePayments,
  );

  return [...liveReports.filter((r) => r.live), ...posFiltered, ...mock].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
