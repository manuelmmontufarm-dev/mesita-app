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
  version: number;
  updatedAt: string;
}

type DemoStore = Map<string, DemoTableState>;

const DEMO_ITEMS: DemoFoodItem[] = [
  { id: "locro", name: "Locro de papa", note: "con aguacate y queso", emoji: "🥣", qty: 1, unitPrice: 4.5, posExternalId: "POS-001" },
  { id: "seco", name: "Seco de chivo", note: "con arroz amarillo", emoji: "🍖", qty: 1, unitPrice: 8.9, posExternalId: "POS-002" },
  { id: "encebollado", name: "Encebollado", note: "porción grande", emoji: "🐟", qty: 1, unitPrice: 6, posExternalId: "POS-003" },
  { id: "llapingacho", name: "Llapingacho", note: "con chorizo y huevo", emoji: "🥔", qty: 1, unitPrice: 5.5, posExternalId: "POS-004" },
  { id: "ceviche", name: "Ceviche de camarón", note: "del día", emoji: "🦐", qty: 1, unitPrice: 9.5, posExternalId: "POS-005" },
  { id: "bolon", name: "Bolón de verde", note: "mixto", emoji: "🟢", qty: 1, unitPrice: 3.5, posExternalId: "POS-006" },
  { id: "jugo-1", name: "Jugo de naranjilla", note: "natural", emoji: "🧃", qty: 1, unitPrice: 2.5, posExternalId: "POS-007" },
  { id: "jugo-2", name: "Jugo de naranjilla", note: "natural", emoji: "🧃", qty: 1, unitPrice: 2.5, posExternalId: "POS-008" },
  { id: "club-1", name: "Club Verde", note: "fría", emoji: "🍺", qty: 1, unitPrice: 2.75, posExternalId: "POS-009" },
  { id: "club-2", name: "Club Verde", note: "fría", emoji: "🍺", qty: 1, unitPrice: 2.75, posExternalId: "POS-010" },
  { id: "morocho", name: "Morocho", note: "canela y leche", emoji: "🥛", qty: 1, unitPrice: 2, posExternalId: "POS-011" },
];

const SEEDED_GUESTS: Array<Omit<DemoGuest, "joinedAt" | "updatedAt">> = [
  { id: "seed-manuel", label: "P0", name: "Manuel", hue: 222, status: "reviewing" },
  { id: "seed-ana", label: "P0", name: "Ana", hue: 152, status: "paid" },
];

function getStore(): DemoStore {
  const globalStore = globalThis as typeof globalThis & {
    __mesitaDemoTables?: DemoStore;
  };
  if (!globalStore.__mesitaDemoTables) {
    globalStore.__mesitaDemoTables = new Map();
  }
  return globalStore.__mesitaDemoTables;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createState(token: string): DemoTableState {
  const ts = nowIso();
  return {
    token,
    restaurant: {
      name: "Doña Pepa",
      tagline: "Cocina Quiteña",
      city: "Quito · Ecuador",
      ivaRate: 0.15,
      serviceRate: 0.1,
      serviceEnabled: true,
    },
    table: { name: "Mesa 12" },
    // POS integration will replace this array with bill lines from the open POS document.
    items: DEMO_ITEMS,
    guests: SEEDED_GUESTS.map((guest) => ({ ...guest, joinedAt: ts, updatedAt: ts })),
    claims: {
      locro: "seed-ana",
      seco: "seed-manuel",
      ceviche: "seed-manuel",
    },
    paidItemIds: ["locro"],
    payments: [
      {
        id: "pay-seed-ana",
        guestId: "seed-ana",
        guestName: "Ana",
        mode: "item",
        amount: 5.63,
        subtotal: 4.5,
        iva: 0.68,
        service: 0.45,
        tip: 0,
        itemIds: ["locro"],
        method: "Demo",
        ref: "MQR-DEMO-1024",
        createdAt: ts,
      },
    ],
    nextGuestNumber: 1,
    version: 1,
    updatedAt: ts,
  };
}

function touch(state: DemoTableState): DemoTableState {
  state.version += 1;
  state.updatedAt = nowIso();
  return state;
}

export function getDemoTableState(token: string): DemoTableState {
  const store = getStore();
  const existing = store.get(token);
  if (existing) return existing;
  const created = createState(token);
  store.set(token, created);
  return created;
}

export function resetDemoTableState(token: string): DemoTableState {
  const state = createState(token);
  getStore().set(token, state);
  return state;
}

export function joinDemoTable(token: string, guestId?: string): {
  state: DemoTableState;
  guest: DemoGuest;
} {
  const state = getDemoTableState(token);
  if (guestId) {
    const existing = state.guests.find((guest) => guest.id === guestId);
    if (existing) {
      existing.status = existing.status === "paid" ? "paid" : "selecting";
      existing.updatedAt = nowIso();
      return { state: touch(state), guest: existing };
    }
  }

  const ts = nowIso();
  const number = state.nextGuestNumber;
  state.nextGuestNumber += 1;
  const guest: DemoGuest = {
    id: crypto.randomUUID(),
    label: `P${number}`,
    name: `P${number}`,
    hue: (number * 53 + 24) % 360,
    status: "selecting",
    joinedAt: ts,
    updatedAt: ts,
  };
  state.guests.unshift(guest);
  return { state: touch(state), guest };
}

export function renameDemoGuest(token: string, guestId: string, name: string): DemoTableState {
  const state = getDemoTableState(token);
  const guest = state.guests.find((candidate) => candidate.id === guestId);
  if (!guest) return state;
  const cleaned = name.trim().slice(0, 34);
  guest.name = cleaned || guest.label;
  guest.updatedAt = nowIso();
  return touch(state);
}

export function setDemoGuestStatus(
  token: string,
  guestId: string,
  status: DemoGuestStatus
): DemoTableState {
  const state = getDemoTableState(token);
  const guest = state.guests.find((candidate) => candidate.id === guestId);
  if (!guest) return state;
  guest.status = status;
  guest.updatedAt = nowIso();
  return touch(state);
}

export function claimDemoItem(token: string, guestId: string, itemId: string): DemoTableState {
  const state = getDemoTableState(token);
  if (state.paidItemIds.includes(itemId)) return state;
  const current = state.claims[itemId];
  if (current === guestId) delete state.claims[itemId];
  else state.claims[itemId] = guestId;
  setDemoGuestStatus(token, guestId, "reviewing");
  return touch(state);
}

export function recordDemoPayment(
  token: string,
  input: Omit<DemoPayment, "id" | "createdAt" | "ref">
): DemoTableState {
  const state = getDemoTableState(token);
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
  return touch(state);
}
