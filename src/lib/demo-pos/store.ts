import { Redis } from "@upstash/redis";

import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import { getDemoTableState } from "@/lib/demo-table-store";
import { DEMO_BASE_URL } from "@/lib/demo-url";
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

function defaultConfig(): DemoPosConfig {
  const seed = buildSeedMenu();
  return {
    ...seed,
    extraTables: SEED_DEMO_TABLES.map((t) => ({ ...t })),
    updatedAt: new Date().toISOString(),
  };
}

async function readConfig(): Promise<DemoPosConfig> {
  const r = redis();
  if (r) {
    const raw = await r.get<DemoPosConfig>(CONFIG_KEY);
    if (raw) return raw;
    const seeded = defaultConfig();
    await r.set(CONFIG_KEY, seeded);
    return seeded;
  }
  if (!mem().config) mem().config = defaultConfig();
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
      const tableTotal = def.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      const state = await getDemoTableState(def.token).catch(() => null);
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
          total: tableTotal,
        };
      }
      const allPaid =
        state.paidItemIds.length >= state.items.length && state.items.length > 0;
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
        total: tableTotal,
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

export function getDemoPosConfigStatus() {
  const base = DEMO_BASE_URL;
  return {
    provider: "mesita-pos-demo",
    name: "Mesita POS (Demo API)",
    enabled: true,
    apiConfigured: true,
    environment: "DEMO",
    baseUrl: `${base}/api/demo-pos`,
    endpoints: {
      menu: "GET /api/demo-pos?view=menu",
      tables: "GET /api/demo-pos?view=tables",
      reports: "GET /api/demo-pos?view=reports",
      billing: "POST /api/demo/table/[token] (pay → POS)",
    },
    sync: {
      menu: "bidirectional",
      tables: "bidirectional",
      billing: "app → POS → dashboard",
    },
    lastSyncAt: new Date().toISOString(),
    restaurant: {
      name: "La Doña Pepa",
      city: "Quito",
      ruc: "1790123456001",
    },
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

export async function getReports(): Promise<DemoPosReport[]> {
  const liveReports: DemoPosReport[] = await Promise.all(
    DEMO_TABLE_DEFINITIONS.map(async (def) => {
      const tableName = `Mesa ${def.table.name}`;
      const total = def.items.reduce((s, it) => s + it.qty * it.unitPrice, 0) * 1.25;
      const state = await getDemoTableState(def.token).catch(() => null);
      if (!state) {
        return {
          id: `bill-${def.token}`,
          tableName,
          tableToken: def.token,
          status: "CLOSED" as const,
          total: Math.round(total * 100) / 100,
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

      const mesitaPaid = payments.reduce((s, p) => s + p.amount, 0);
      const roundedTotal = Math.round(total * 100) / 100;

      return {
        id: `bill-${def.token}`,
        tableName,
        tableToken: def.token,
        status: billStatus(roundedTotal, mesitaPaid, state.guests.length > 0),
        total: roundedTotal,
        paid: Math.round(mesitaPaid * 100) / 100,
        mesitaPaid: Math.round(mesitaPaid * 100) / 100,
        posOnlyPaid: 0,
        paidViaMesita: mesitaPaid > 0,
        live: true,
        posDocumentId: `PRE-2026-${def.table.name.padStart(4, "0")}`,
        createdAt: state.guests[0]?.joinedAt ?? state.updatedAt,
        updatedAt: state.updatedAt,
        payments,
      };
    }),
  );

  const hasLivePayments = liveReports.some((r) => r.payments.length > 0);
  const mock = hasLivePayments ? [] : MOCK_REPORTS;

  return [...liveReports, ...mock].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
