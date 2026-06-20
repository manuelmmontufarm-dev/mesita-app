import { Redis } from "@upstash/redis";

import {
  guestLabel,
  guestAvatarHue,
  personNumberFromLabel,
} from "@/lib/guest-billing/split-math";

export interface JoinDemoTableOpts {
  guestId?: string;
  /** Stable per-browser id (localStorage) — primary idempotency key. */
  deviceId?: string;
}

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
  /** Stable per-browser identifier — survives nav/refresh/409. Idempotency key. */
  deviceId?: string;
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

/** Bump when default demo seed shape changes — migrated in-place, never wipes guests. */
const DEMO_STATE_VERSION = 4;

export class DemoGuestNotFoundError extends Error {
  constructor(public readonly guestId: string) {
    super(`Demo guest not found: ${guestId}`);
    this.name = "DemoGuestNotFoundError";
  }
}

export interface DemoTableState {
  token: string;
  stateVersion: number;
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
      name: "La Doña Pepa",
      tagline: "Comida casera ecuatoriana",
      city: "Quito",
      ivaRate: 0.15,
      serviceRate: 0.1,
      serviceEnabled: true,
    },
    table: { name: "12" },
    items: DEMO_ITEMS,
    guests: [],
    claims: {},
    paidItemIds: [],
    payments: [],
    nextGuestNumber: 1,
    stateVersion: DEMO_STATE_VERSION,
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

function requireGuest(state: DemoTableState, guestId: string): DemoGuest {
  const guest = state.guests.find((candidate) => candidate.id === guestId);
  if (!guest) throw new DemoGuestNotFoundError(guestId);
  return guest;
}

/** In-place schema upgrade — preserves guests/claims (no surprise table wipe). */
function migrateState(state: DemoTableState): DemoTableState {
  if ((state.stateVersion ?? 1) >= DEMO_STATE_VERSION) return state;

  if (state.resetSeq == null) state.resetSeq = 0;

  for (const guest of state.guests) {
    const ordinal =
      personNumberFromLabel(guest.label) ??
      state.guests.indexOf(guest) + 1;
    guest.hue = guestAvatarHue(ordinal - 1);
    const cleaned = guest.name?.trim();
    if (!cleaned || cleaned.toLowerCase() === "invitado") {
      guest.name = guest.label || guestLabel(ordinal);
    }
  }

  scrubOrphanClaims(state);

  state.stateVersion = DEMO_STATE_VERSION;
  return touch(state);
}

/** Drop claims pointing at guests that no longer exist (prevents phantom Persona N). */
function scrubOrphanClaims(state: DemoTableState): boolean {
  const guestIds = new Set(state.guests.map((g) => g.id));
  let changed = false;
  for (const [itemId, guestId] of Object.entries(state.claims)) {
    if (!guestIds.has(guestId)) {
      delete state.claims[itemId];
      changed = true;
    }
  }
  return changed;
}

function normalizeLoadedState(state: DemoTableState): DemoTableState | null {
  if (!scrubOrphanClaims(state)) return null;
  return touch(state);
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

const MUTATE_MAX_RETRIES = 10;

/** Serialize mutations per table token within this process (avoids interleaved RMW). */
const tokenMutationTail = new Map<string, Promise<unknown>>();

function runSerializedMutation<T>(token: string, work: () => Promise<T>): Promise<T> {
  const prev = tokenMutationTail.get(token) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(work);
  tokenMutationTail.set(
    token,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** Atomic commit: version must still match or the write is rejected (caller retries). */
async function tryCommitDemoState(
  token: string,
  draft: DemoTableState,
  expectedVersion: number,
): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const key = REDIS_KEY(token);
    const remote = await redis.get<DemoTableState>(key);
    if (!remote || remote.version !== expectedVersion) return false;
    await redis.set(key, draft);
    getMemoryStore().set(token, draft);
    return true;
  }
  const mem = getMemoryStore();
  const current = mem.get(token);
  if (!current || current.version !== expectedVersion) return false;
  mem.set(token, draft);
  return true;
}

/** Read-modify-write with version CAS — prevents lost claim updates across lambdas. */
async function mutateDemoState(
  token: string,
  mutator: (state: DemoTableState) => void,
): Promise<DemoTableState> {
  return runSerializedMutation(token, async () => {
    for (let attempt = 0; attempt < MUTATE_MAX_RETRIES; attempt++) {
      let state = await loadState(token);
      if (!state) {
        // Seed via getDemoTableState (direct save) — tryCommit(…, 0) cannot insert.
        await getDemoTableState(token);
        continue;
      }
      if ((state.stateVersion ?? 1) < DEMO_STATE_VERSION) {
        state = migrateState(state);
      }
      const expectedVersion = state.version;
      const draft: DemoTableState = {
        ...state,
        claims: { ...state.claims },
        guests: state.guests.map((g) => ({ ...g })),
        items: [...state.items],
        paidItemIds: [...state.paidItemIds],
        payments: [...state.payments],
      };
      mutator(draft);
      touch(draft);
      if (await tryCommitDemoState(token, draft, expectedVersion)) {
        return draft;
      }
    }
    throw new Error(`Demo table ${token}: concurrent update conflict`);
  });
}

export async function getDemoTableState(token: string): Promise<DemoTableState> {
  const existing = await loadState(token);
  if (existing) {
    if ((existing.stateVersion ?? 1) < DEMO_STATE_VERSION) {
      return saveState(token, migrateState(existing));
    }
    const scrubbed = normalizeLoadedState(existing);
    if (scrubbed) {
      return saveState(token, scrubbed);
    }
    return existing;
  }
  const created = createState(token);
  return saveState(token, created);
}

export async function resetDemoTableState(token: string): Promise<DemoTableState> {
  const prev = await loadState(token);
  const state = createState(token);
  state.resetSeq = (prev?.resetSeq ?? 0) + 1;
  state.version = (prev?.version ?? 0) + 1;
  state.claims = {};
  state.guests = [];
  state.payments = [];
  state.paidItemIds = [];
  state.nextGuestNumber = 1;
  getMemoryStore().set(token, state);
  const redis = getRedis();
  if (redis) {
    await redis.set(REDIS_KEY(token), state);
  }
  return state;
}

/** Derive next Persona N from existing labels — recycles gaps, immune to ghost increments. */
function nextPersonaNumber(state: DemoTableState): number {
  let max = 0;
  for (const g of state.guests) {
    const n = personNumberFromLabel(g.label);
    if (n != null && n > max) max = n;
  }
  return Math.max(max + 1, state.nextGuestNumber);
}

export async function joinDemoTable(
  token: string,
  opts?: JoinDemoTableOpts | string,
): Promise<{ state: DemoTableState; guest: DemoGuest }> {
  const { guestId, deviceId } =
    typeof opts === "string" ? { guestId: opts, deviceId: undefined } : opts ?? {};

  let resolvedGuest: DemoGuest | null = null;
  const state = await mutateDemoState(token, (draft) => {
    const ts = nowIso();

    if (deviceId) {
      const byDevice = draft.guests.find((g) => g.deviceId === deviceId);
      if (byDevice) {
        byDevice.status = byDevice.status === "paid" ? "paid" : "selecting";
        byDevice.updatedAt = ts;
        resolvedGuest = byDevice;
        return;
      }
    }

    if (guestId) {
      const byId = draft.guests.find((g) => g.id === guestId);
      if (byId) {
        if (deviceId && !byId.deviceId) byId.deviceId = deviceId;
        byId.status = byId.status === "paid" ? "paid" : "selecting";
        byId.updatedAt = ts;
        resolvedGuest = byId;
        return;
      }
      if (!deviceId) throw new DemoGuestNotFoundError(guestId);
    }

    const number = nextPersonaNumber(draft);
    draft.nextGuestNumber = number + 1;
    const guest: DemoGuest = {
      id: crypto.randomUUID(),
      label: guestLabel(number),
      name: guestLabel(number),
      hue: guestAvatarHue(number - 1),
      status: "selecting",
      joinedAt: ts,
      updatedAt: ts,
      deviceId,
    };
    draft.guests.unshift(guest);
    resolvedGuest = guest;
  });

  if (!resolvedGuest) throw new Error("joinDemoTable: guest not resolved");
  return { state, guest: resolvedGuest };
}

export async function renameDemoGuest(
  token: string,
  guestId: string,
  name: string,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    const guest = requireGuest(draft, guestId);
    const cleaned = name.trim().slice(0, 10);
    const next = cleaned && cleaned.toLowerCase() !== "invitado" ? cleaned : guest.label;
    guest.name = next || guest.label;
    guest.updatedAt = nowIso();
  });
}

export async function setDemoGuestStatus(
  token: string,
  guestId: string,
  status: DemoGuestStatus,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    const guest = requireGuest(draft, guestId);
    guest.status = status;
    guest.updatedAt = nowIso();
  });
}

export async function claimDemoItem(
  token: string,
  guestId: string,
  itemId: string,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    const guest = requireGuest(draft, guestId);
    if (draft.paidItemIds.includes(itemId)) return;
    const current = draft.claims[itemId];
    if (current === guestId) delete draft.claims[itemId];
    else draft.claims[itemId] = guestId;
    guest.status = "reviewing";
    guest.updatedAt = nowIso();
  });
}

export async function releaseDemoItem(
  token: string,
  guestId: string,
  itemId: string,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    requireGuest(draft, guestId);
    if (draft.claims[itemId] === guestId) {
      delete draft.claims[itemId];
    }
  });
}

export async function recordDemoPayment(
  token: string,
  input: Omit<DemoPayment, "id" | "createdAt" | "ref">,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    const ts = nowIso();
    const payment: DemoPayment = {
      ...input,
      id: crypto.randomUUID(),
      ref: `MQR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: ts,
    };
    draft.payments.unshift(payment);

    if (input.mode === "todo") {
      draft.paidItemIds = draft.items.map((item) => item.id);
    } else if (input.mode === "item") {
      draft.paidItemIds = Array.from(new Set([...draft.paidItemIds, ...input.itemIds]));
    }

    const guest = requireGuest(draft, input.guestId);
    const incoming = input.guestName?.trim();
    if (incoming && incoming.toLowerCase() !== "invitado") {
      const incomingIsAutoLabel = personNumberFromLabel(incoming) != null;
      const existingIsAutoLabel = personNumberFromLabel(guest.name) != null;
      if (!incomingIsAutoLabel || existingIsAutoLabel) {
        guest.name = incoming;
      }
    }
    guest.status = "paid";
    guest.updatedAt = ts;

    if (
      input.mode === "equal" &&
      draft.guests.length > 0 &&
      draft.guests.every((g) => g.status === "paid")
    ) {
      draft.paidItemIds = draft.items.map((item) => item.id);
    }
  });
}

/** Pure helper — only apply snapshots with strictly newer version counters. */
export function shouldApplyDemoVersion(incoming: number, lastApplied: number | undefined): boolean {
  return incoming > (lastApplied ?? 0);
}
