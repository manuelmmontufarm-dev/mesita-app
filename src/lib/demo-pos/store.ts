import { Redis } from "@upstash/redis";

import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import { getDemoTableState } from "@/lib/demo-table-store";
import { DEMO_BASE_URL } from "@/lib/demo-url";
import { buildSeedMenu, SEED_DEMO_TABLES } from "./seed";
import type {
  DemoPosConfig,
  DemoPosExtraTable,
  DemoPosInvoice,
  DemoPosMenuItem,
  DemoPosQrTable,
  DemoPosTableRow,
} from "./types";

const CONFIG_KEY = "mesita:demo-pos:config";
const INVOICES_KEY = "mesita:demo-pos:invoices";
const MAX_INVOICES = 200;

type Memory = { config: DemoPosConfig | null; invoices: DemoPosInvoice[] };

function mem(): Memory {
  const g = globalThis as typeof globalThis & { __mesitaDemoPos?: Memory };
  if (!g.__mesitaDemoPos) g.__mesitaDemoPos = { config: null, invoices: [] };
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
