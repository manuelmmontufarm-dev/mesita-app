import { Redis } from "@upstash/redis";

import {
  guestLabel,
  guestAvatarHue,
  personNumberFromLabel,
} from "@/lib/guest-billing/split-math";
import { resolveDemoTableToken } from "@/lib/demo-table-catalog";

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
  /** POS orden_detalles id when synced from Mesita POS. */
  posDetalleId?: string;
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
  /** Units settled per item in this payment (BY_ITEM partial shares). */
  itemUnits?: Record<string, number>;
  equalPeople?: number;
  method: string;
  ref: string;
  createdAt: string;
}

/** Bump when default demo seed shape changes — migrated in-place, never wipes guests. */
const DEMO_STATE_VERSION = 7;

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
  /** Multi-guest fractional shares per item (synced across devices). */
  claimShares?: Record<string, Record<string, number>>;
  paidItemIds: string[];
  /** Cumulative units paid toward each item (supports partial BY_ITEM). */
  itemPaidUnits: Record<string, number>;
  payments: DemoPayment[];
  nextGuestNumber: number;
  resetSeq: number;
  version: number;
  updatedAt: string;
  /** Linked POS orden (tenant_demo). */
  posOrdenId?: string;
  posDocumentoId?: string;
  posMesaId?: string;
}

type DemoStore = Map<string, DemoTableState>;

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

let _redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = null;
    return null;
  }
  _redis = Redis.fromEnv();
  return _redis;
}
/** TTL for demo state in Redis — 7 days. Keeps Redis from growing unbounded. */
const REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

function nowIso(): string {
  return new Date().toISOString();
}

function isPosMirroredTable(def: ReturnType<typeof resolveDemoTableToken>): boolean {
  if (!def) return false;
  return def.token !== "demo" && def.table.name !== "12";
}

function createState(token: string): DemoTableState {
  const ts = nowIso();
  const def =
    resolveDemoTableToken(token) ?? resolveDemoTableToken("demo");
  const restaurant = def?.restaurant ?? {
    name: "La Doña Pepa",
    tagline: "Comida casera ecuatoriana",
    city: "Quito",
    ivaRate: 0.15,
    serviceRate: 0.1,
    serviceEnabled: true,
  };
  const tableName = def?.table.name ?? "12";
  const mirrorPos =
    isPosMirroredTable(def) && Boolean(process.env.POS_MESITA_API_KEY?.trim());
  const items = mirrorPos
    ? []
    : def?.items
      ? def.items.map((it) => ({ ...it }))
      : [];
  const seed = mirrorPos ? undefined : def?.seed;
  return {
    token,
    restaurant: { ...restaurant },
    table: { name: tableName },
    items,
    guests: [],
    claims: { ...(seed?.claims ?? {}) },
    claimShares: {},
    paidItemIds: [...(seed?.paidItemIds ?? [])],
    itemPaidUnits: { ...(seed?.itemPaidUnits ?? {}) },
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

  if (!state.itemPaidUnits) state.itemPaidUnits = {};
  if (!state.claimShares) state.claimShares = {};

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
  if (state.claimShares) {
    for (const [itemId, unitsMap] of Object.entries(state.claimShares)) {
      const clean: Record<string, number> = {};
      for (const [gid, u] of Object.entries(unitsMap)) {
        if (guestIds.has(gid) && u > 0.001) clean[gid] = u;
      }
      if (Object.keys(clean).length < 2) {
        delete state.claimShares[itemId];
        changed = true;
      } else if (Object.keys(clean).length !== Object.keys(unitsMap).length) {
        state.claimShares[itemId] = clean;
        changed = true;
      }
    }
  }
  return changed;
}

function normalizeLoadedState(state: DemoTableState): DemoTableState | null {
  let changed = scrubOrphanClaims(state);
  if (!state.itemPaidUnits || typeof state.itemPaidUnits !== "object") {
    state.itemPaidUnits = {};
    changed = true;
  }
  if (!changed) return null;
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
    await redis.set(REDIS_KEY(token), state, { ex: REDIS_TTL_SECONDS });
  }
  return state;
}

const MUTATE_MAX_RETRIES = 25;

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
    await redis.set(key, draft, { ex: REDIS_TTL_SECONDS });
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
        await getDemoTableState(token);
        state = await loadState(token);
        if (!state) continue;
      }
      if ((state.stateVersion ?? 1) < DEMO_STATE_VERSION) {
        state = migrateState(state);
      }
      if (!state.itemPaidUnits || typeof state.itemPaidUnits !== "object") {
        state.itemPaidUnits = {};
      }
      const expectedVersion = state.version;
      const draft: DemoTableState = {
        ...state,
        claims: { ...state.claims },
        claimShares: state.claimShares
          ? Object.fromEntries(
              Object.entries(state.claimShares).map(([id, m]) => [id, { ...m }]),
            )
          : {},
        guests: state.guests.map((g) => ({ ...g })),
        items: [...state.items],
        paidItemIds: [...state.paidItemIds],
        itemPaidUnits: { ...(state.itemPaidUnits ?? {}) },
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
  // createState now seeds from the catalog (preserves mesa-2 partial payments,
  // empty for the rest). Reset bumps resetSeq + version so SSE clients re-sync.
  const state = createState(token);
  state.resetSeq = (prev?.resetSeq ?? 0) + 1;
  state.version = (prev?.version ?? 0) + 1;
  state.guests = [];
  state.payments = [];
  state.nextGuestNumber = 1;
  getMemoryStore().set(token, state);
  const redis = getRedis();
  if (redis) {
    await redis.set(REDIS_KEY(token), state, { ex: REDIS_TTL_SECONDS });
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

  await getDemoTableState(token);

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

export async function patchDemoTablePosLinks(
  token: string,
  links: Partial<Pick<DemoTableState, "posOrdenId" | "posDocumentoId" | "posMesaId">>,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    Object.assign(draft, links);
  });
}

export async function refreshDemoStateFromPos(
  token: string,
  opts: { force?: boolean } = {},
): Promise<DemoTableState> {
  const def = resolveDemoTableToken(token);
  if (!def) return getDemoTableState(token);

  const { isDemoUxTable, pullPosOrdenIntoDemoState } = await import("@/lib/pos-mesita/sync");
  const { isPosMesitaConfigured } = await import("@/lib/pos-mesita/client");

  if (isDemoUxTable(def) || !isPosMesitaConfigured()) {
    return getDemoTableState(token);
  }

  const current = await getDemoTableState(token);
  const pulled = await pullPosOrdenIntoDemoState(token, def, current, opts);
  if (!pulled.changed) return current;

  return mutateDemoState(token, (draft) => {
    draft.items = pulled.state.items.map((it) => ({ ...it }));
    draft.posOrdenId = pulled.state.posOrdenId ?? draft.posOrdenId;
    draft.posMesaId = def.posMesaId;
  });
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
    if (current === guestId) {
      delete draft.claims[itemId];
    } else {
      draft.claims[itemId] = guestId;
    }
    if (draft.claimShares) delete draft.claimShares[itemId];
    guest.status = "reviewing";
    guest.updatedAt = nowIso();
  });
}

export async function splitDemoItem(
  token: string,
  guestId: string,
  itemId: string,
  unitsMap: Record<string, number>,
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    const guest = requireGuest(draft, guestId);
    if (draft.paidItemIds.includes(itemId)) return;
    const clean: Record<string, number> = {};
    for (const [id, u] of Object.entries(unitsMap)) {
      if (u > 0.001) requireGuest(draft, id);
      if (u > 0.001) clean[id] = Math.round(u * 100) / 100;
    }
    const claimants = Object.keys(clean);
    if (claimants.length < 2) {
      const only = claimants[0];
      if (only) draft.claims[itemId] = only;
      else delete draft.claims[itemId];
      if (draft.claimShares) delete draft.claimShares[itemId];
    } else {
      if (!draft.claimShares) draft.claimShares = {};
      draft.claimShares[itemId] = clean;
      delete draft.claims[itemId];
    }
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
    if (draft.claimShares?.[itemId]) {
      const map = { ...draft.claimShares[itemId] };
      delete map[guestId];
      if (Object.keys(map).filter((id) => (map[id] ?? 0) > 0.001).length < 2) {
        delete draft.claimShares[itemId];
      } else {
        draft.claimShares[itemId] = map;
      }
    }
  });
}

export async function recordDemoPayment(
  token: string,
  input: Omit<DemoPayment, "id" | "createdAt" | "ref"> & { ref?: string },
): Promise<DemoTableState> {
  return mutateDemoState(token, (draft) => {
    const ts = nowIso();
    const payment: DemoPayment = {
      ...input,
      id: crypto.randomUUID(),
      ref:
        input.ref ??
        `MQR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: ts,
    };
    draft.payments.unshift(payment);

    if (!draft.itemPaidUnits) draft.itemPaidUnits = {};

    const billSub = draft.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const paymentsSub = draft.payments.reduce((s, p) => s + p.subtotal, 0);

    if (input.mode === "todo") {
      draft.paidItemIds = draft.items.map((item) => item.id);
      for (const item of draft.items) {
        draft.itemPaidUnits[item.id] = item.qty;
      }
    } else if (input.mode === "item") {
      const unitsMap = input.itemUnits ?? {};
      for (const itemId of input.itemIds) {
        const item = draft.items.find((candidate) => candidate.id === itemId);
        if (!item) continue;
        const units = unitsMap[itemId] ?? item.qty;
        draft.itemPaidUnits[itemId] =
          Math.round(((draft.itemPaidUnits[itemId] ?? 0) + units) * 100) / 100;
        if (draft.itemPaidUnits[itemId] >= item.qty - 0.001) {
          draft.paidItemIds = Array.from(new Set([...draft.paidItemIds, itemId]));
        }
      }
      for (const [itemId, units] of Object.entries(unitsMap)) {
        if (input.itemIds.includes(itemId)) continue;
        const item = draft.items.find((candidate) => candidate.id === itemId);
        if (!item) continue;
        draft.itemPaidUnits[itemId] =
          Math.round(((draft.itemPaidUnits[itemId] ?? 0) + units) * 100) / 100;
        if (draft.itemPaidUnits[itemId] >= item.qty - 0.001) {
          draft.paidItemIds = Array.from(new Set([...draft.paidItemIds, itemId]));
        }
      }
    } else if (input.mode === "equal") {
      const equalPeople = input.equalPeople ?? 2;
      const equalSharesPaid = draft.payments.filter((p) => p.mode === "equal").length;
      if (equalSharesPaid >= equalPeople || paymentsSub >= billSub - 0.02) {
        draft.paidItemIds = draft.items.map((item) => item.id);
      }
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

    const tableClosed =
      draft.items.every((it) => draft.paidItemIds.includes(it.id)) ||
      paymentsSub >= billSub - 0.02;
    guest.status = tableClosed ? "paid" : "reviewing";
    guest.updatedAt = ts;
  });
}

/** Pure helper — only apply snapshots with strictly newer version counters. */
export function shouldApplyDemoVersion(incoming: number, lastApplied: number | undefined): boolean {
  return incoming > (lastApplied ?? 0);
}
