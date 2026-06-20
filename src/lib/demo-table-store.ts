import { Redis } from "@upstash/redis";

import { guestLabel } from "@/lib/guest-billing/split-math";

/** Vercel-safe demo table state — persisted in Upstash when configured. */

export type DemoSplitMode = "item" | "equal" | "todo";
export type DemoGuestStatus = "selecting" | "reviewing" | "in_payment" | "paid";

export interface DemoFoodItem {
  id: string;
  name: string;
  note: string;
  emoji: string;
  qty: number;
  unitPrice: number;
  posExternalId?: string;
}

export interface DemoGuest {
  id: string;
  label: string;
  name: string;
  hue: number;
  status: DemoGuestStatus;
  joinedAt: string;
  updatedAt: string;
}

export interface DemoPayment {
  id: string;
  guestId: string;
  guestName: string;
  mode: DemoSplitMode;
  amount: number;
  subtotal: number;
  iva: number;
  service: number;
  tip: number;
  itemIds: string[];
  equalPeople?: number;
  method: string;
  ref: string;
  createdAt: string;
}

export interface DemoTableState {
  token: string;
  restaurant: {
    name: string;
    tagline: string;
    city: string;
    ivaRate: number;
    serviceRate: number;
    serviceEnabled: boolean;
  };
  table: {
    name: string;
  };
  items: DemoFoodItem[];
  guests: DemoGuest[];
  claims: Record<string, string>;
  paidItemIds: string[];
  payments: DemoPayment[];
  nextGuestNumber: number;
  resetSeq: number;
  version: number;
  updatedAt: string;
}

type DemoStore = Map<string, DemoTableState>;

const DEMO_ITEMS: DemoFoodItem[] = [
  { id: "locro", name: "Locro de papa", note: "", emoji: "🥣", qty: 1, unitPrice: 4.5 },
  { id: "seco", name: "Seco de chivo", note: "", emoji: "🍖", qty: 1, unitPrice: 8.9 },
  { id: "encebollado", name: "Encebollado", note: "", emoji: "🐟", qty: 1, unitPrice: 6 },
  { id: "ceviche", name: "Ceviche de camarón", note: "", emoji: "🦐", qty: 1, unitPrice: 9.5 },
  { id: "jugo-1", name: "Jugo de naranjilla", note: "", emoji: "🧃", qty: 1, unitPrice: 2.5 },
  { id: "jugo-2", name: "Jugo de naranjilla", note: "", emoji: "🧃", qty: 1, unitPrice: 2.5 },
  { id: "club-1", name: "Club Verde", note: "", emoji: "🍺", qty: 1, unitPrice: 2.75 },
  { id: "club-2", name: "Club Verde", note: "", emoji: "🍺", qty: 1, unitPrice: 2.75 },
];

const REDIS_KEY = (token: string) => `mesita:demo:table:${token}`;

function getMemoryStore(): DemoStore {
  const globalStore = globalThis as typeof globalThis & {
    __mesitaDemoTables?: DemoStore;
  };
  if (!globalStore.__mesitaDemoTables) {
    globalStore.__mesitaDemoTables = new Map();
  }
  return globalStore.__mesitaDemoTables;
}

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return Redis.fromEnv();
}

function nowIso(): string {
  return new Date().toISOString();
}

function createState(token: string): DemoTableState {
  const ts = nowIso();
  return {
    token,
    restaurant: {
      name: "Mesita Demo",
      tagline: "Comida ecuatoriana",
      city: "Quito",
      ivaRate: 0.15,
      serviceRate: 0.1,
      serviceEnabled: true,
    },
    table: { name: "12" },
    items: DEMO_ITEMS,
    guests: [],
    claims: {},
    paidItemIds: ["locro"],
    payments: [
      {
        id: "pay-seed-locro",
        guestId: "seed-system",
        guestName: "Persona 1",
        mode: "item",
        amount: 5.63,
        subtotal: 4.5,
        iva: 0.68,
        service: 0.45,
        tip: 0,
        itemIds: ["locro"],
        method: "Demo",
        ref: "MQR-DEMO-LOCRO",
        createdAt: ts,
      },
    ],
    nextGuestNumber: 1,
    resetSeq: 0,
    version: 1,
    updatedAt: ts,
  };
}

function touch(state: DemoTableState): DemoTableState {
  state.version += 1;
  state.updatedAt = nowIso();
  return state;
}

async function loadState(token: string): Promise<DemoTableState | null> {
  const redis = getRedis();
  if (redis) {
    const remote = await redis.get<DemoTableState>(REDIS_KEY(token));
    if (remote) {
      getMemoryStore().set(token, remote);
      return remote;
    }
  }
  return getMemoryStore().get(token) ?? null;
}

async function saveState(token: string, state: DemoTableState): Promise<DemoTableState> {
  getMemoryStore().set(token, state);
  const redis = getRedis();
  if (redis) {
    await redis.set(REDIS_KEY(token), state);
  }
  return state;
}

export async function getDemoTableState(token: string): Promise<DemoTableState> {
  const existing = await loadState(token);
  if (existing) return existing;
  const created = createState(token);
  return saveState(token, created);
}

export async function resetDemoTableState(token: string): Promise<DemoTableState> {
  const prev = await loadState(token);
  const state = createState(token);
  state.resetSeq = (prev?.resetSeq ?? 0) + 1;
  state.version = (prev?.version ?? 0) + 1;
  return saveState(token, state);
}

export async function joinDemoTable(
  token: string,
  guestId?: string,
): Promise<{ state: DemoTableState; guest: DemoGuest }> {
  const state = await getDemoTableState(token);
  if (guestId) {
    const existing = state.guests.find((guest) => guest.id === guestId);
    if (existing) {
      existing.status = existing.status === "paid" ? "paid" : "selecting";
      existing.updatedAt = nowIso();
      return { state: await saveState(token, touch(state)), guest: existing };
    }
  }

  const ts = nowIso();
  const number = state.nextGuestNumber;
  state.nextGuestNumber += 1;
  const guest: DemoGuest = {
    id: crypto.randomUUID(),
    label: guestLabel(number),
    name: guestLabel(number),
    hue: (number * 53 + 24) % 360,
    status: "selecting",
    joinedAt: ts,
    updatedAt: ts,
  };
  state.guests.unshift(guest);
  return { state: await saveState(token, touch(state)), guest };
}

export async function renameDemoGuest(
  token: string,
  guestId: string,
  name: string,
): Promise<DemoTableState> {
  const state = await getDemoTableState(token);
  const guest = state.guests.find((candidate) => candidate.id === guestId);
  if (!guest) return state;
  const cleaned = name.trim().slice(0, 10);
  guest.name = cleaned || guest.label;
  guest.updatedAt = nowIso();
  return saveState(token, touch(state));
}

export async function setDemoGuestStatus(
  token: string,
  guestId: string,
  status: DemoGuestStatus,
): Promise<DemoTableState> {
  const state = await getDemoTableState(token);
  const guest = state.guests.find((candidate) => candidate.id === guestId);
  if (!guest) return state;
  guest.status = status;
  guest.updatedAt = nowIso();
  return saveState(token, touch(state));
}

export async function claimDemoItem(
  token: string,
  guestId: string,
  itemId: string,
): Promise<DemoTableState> {
  const state = await getDemoTableState(token);
  if (state.paidItemIds.includes(itemId)) return state;
  const current = state.claims[itemId];
  if (current === guestId) delete state.claims[itemId];
  else state.claims[itemId] = guestId;
  const guest = state.guests.find((candidate) => candidate.id === guestId);
  if (guest) {
    guest.status = "reviewing";
    guest.updatedAt = nowIso();
  }
  return saveState(token, touch(state));
}

export async function releaseDemoItem(
  token: string,
  guestId: string,
  itemId: string,
): Promise<DemoTableState> {
  const state = await getDemoTableState(token);
  if (state.claims[itemId] === guestId) {
    delete state.claims[itemId];
  }
  return saveState(token, touch(state));
}

export async function recordDemoPayment(
  token: string,
  input: Omit<DemoPayment, "id" | "createdAt" | "ref">,
): Promise<DemoTableState> {
  const state = await getDemoTableState(token);
  const ts = nowIso();
  const payment: DemoPayment = {
    ...input,
    id: crypto.randomUUID(),
    ref: `MQR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: ts,
  };
  state.payments.unshift(payment);

  if (input.mode === "todo") {
    state.paidItemIds = state.items.map((item) => item.id);
  } else if (input.mode === "item") {
    state.paidItemIds = Array.from(new Set([...state.paidItemIds, ...input.itemIds]));
  }

  const guest = state.guests.find((candidate) => candidate.id === input.guestId);
  if (guest) {
    guest.name = input.guestName || guest.name;
    guest.status = "paid";
    guest.updatedAt = ts;
  }

  if (input.mode === "equal" && state.guests.length > 0 && state.guests.every((g) => g.status === "paid")) {
    state.paidItemIds = state.items.map((item) => item.id);
  }

  return saveState(token, touch(state));
}
