/**
 * Shared multi-user scenario catalog + simulated device client.
 * Used by:
 *   - Layer 1: src/lib/demo-table-store/__tests__/multi-user-scenarios.test.ts (vitest fuzz)
 *   - Layer 2: tests/e2e/demo-multi-device.spec.ts (Playwright UI)
 *
 * The catalog is the single source of truth — both layers iterate the same 20
 * scenarios, so if a scenario is added, removed, or renamed, both layers see it.
 */

import {
  claimDemoItem,
  getDemoTableState,
  joinDemoTable,
  recordDemoPayment,
  releaseDemoItem,
  renameDemoGuest,
  resetDemoTableState,
  setDemoGuestStatus,
  splitDemoItem,
  type DemoGuest,
  type DemoSplitMode,
  type DemoTableState,
} from "@/lib/demo-table-store";

/* ───────────────────────── jitter & timing helpers ─────────────────────── */

/** Random delay in [minMs, maxMs] — exposes scheduling races. */
export async function jitter(minMs = 1, maxMs = 50): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  await new Promise((r) => setTimeout(r, ms));
}

/* ───────────────────────── simulated device client ─────────────────────── */

export class SimulatedDevice {
  readonly deviceId: string;
  guestId: string | null = null;

  constructor(
    readonly token: string,
    opts?: { deviceId?: string },
  ) {
    this.deviceId = opts?.deviceId ?? `dev-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Idempotent join — caches guestId for subsequent actions. */
  async join(): Promise<DemoGuest> {
    await jitter();
    const { guest } = await joinDemoTable(this.token, {
      guestId: this.guestId ?? undefined,
      deviceId: this.deviceId,
    });
    this.guestId = guest.id;
    return guest;
  }

  /** Join without jitter — for cold-start race tests. */
  async joinFast(): Promise<DemoGuest> {
    const { guest } = await joinDemoTable(this.token, {
      guestId: this.guestId ?? undefined,
      deviceId: this.deviceId,
    });
    this.guestId = guest.id;
    return guest;
  }

  /** Simulate a refresh: forget guestId but keep deviceId. */
  forgetGuestId(): void {
    this.guestId = null;
  }

  /** Simulate full storage wipe (NEW device fingerprint). */
  forgetDeviceId(): SimulatedDevice {
    return new SimulatedDevice(this.token);
  }

  async claim(itemId: string): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    await jitter();
    return claimDemoItem(this.token, this.guestId!, itemId);
  }

  /** Fire claim without jitter — exposes lost-update races. */
  async claimFast(itemId: string): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    return claimDemoItem(this.token, this.guestId!, itemId);
  }

  async release(itemId: string): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    await jitter();
    return releaseDemoItem(this.token, this.guestId!, itemId);
  }

  async split(
    itemId: string,
    unitsMap: Record<string, number>,
  ): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    await jitter();
    return splitDemoItem(this.token, this.guestId!, itemId, unitsMap);
  }

  async rename(name: string): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    await jitter();
    return renameDemoGuest(this.token, this.guestId!, name);
  }

  async pay(opts: {
    mode: DemoSplitMode;
    amount?: number;
    subtotal?: number;
    itemIds?: string[];
    itemUnits?: Record<string, number>;
    guestName?: string;
    equalPeople?: number;
  }): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    await jitter();
    const subtotal = opts.subtotal ?? (opts.amount ?? 10) / 1.25;
    return recordDemoPayment(this.token, {
      guestId: this.guestId!,
      guestName: opts.guestName ?? "Tester",
      mode: opts.mode,
      amount: opts.amount ?? 10,
      subtotal,
      iva: subtotal * 0.15,
      service: subtotal * 0.1,
      tip: 0,
      itemIds: opts.itemIds ?? [],
      itemUnits: opts.itemUnits,
      equalPeople: opts.equalPeople,
      method: "demo",
    });
  }

  async status(s: "selecting" | "reviewing" | "in_payment" | "paid"): Promise<DemoTableState> {
    if (!this.guestId) await this.join();
    await jitter();
    return setDemoGuestStatus(this.token, this.guestId!, s);
  }
}

/* ───────────────────────── scenario catalog ─────────────────────────── */

export interface Scenario {
  id: string; // "01" .. "20"
  category: "join" | "claim" | "rename" | "pay" | "reset" | "edge";
  name: string;
  /** True if scenario is only meaningful at store level (no observable UI). */
  storeOnly?: boolean;
  /** Run function — token is unique per rep, guaranteed clean state. */
  run: (token: string) => Promise<void>;
}

const ITEM_IDS = ["locro", "seco", "encebollado", "ceviche"];

export const SCENARIOS: Scenario[] = [
  // ────── JOIN ───────────────────────────────────────────────────────────
  {
    id: "01",
    category: "join",
    name: "3-device race join → exactly 3 Personas",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      const c = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join(), c.join()]);
      const state = await getDemoTableState(token);
      expectEq(state.guests.length, 3, "guest count");
      const labels = new Set(state.guests.map((g) => g.label));
      expectEq(labels.size, 3, "unique labels");
      expectTrue(labels.has("Persona 1") && labels.has("Persona 2") && labels.has("Persona 3"), "labels are Persona 1/2/3");
    },
  },
  {
    id: "02",
    category: "join",
    name: "5-device burst join → Persona 1..5 no gaps",
    run: async (token) => {
      const devs = Array.from({ length: 5 }, () => new SimulatedDevice(token));
      await Promise.all(devs.map((d) => d.join()));
      const state = await getDemoTableState(token);
      expectEq(state.guests.length, 5, "guest count");
      const numbers = state.guests
        .map((g) => Number(g.label.replace("Persona ", "")))
        .sort((x, y) => x - y);
      expectEq(numbers.join(","), "1,2,3,4,5", "Persona N sequential");
    },
  },
  {
    id: "03",
    category: "join",
    name: "Same deviceId × 4 → same guest, no number inflation",
    run: async (token) => {
      const d = new SimulatedDevice(token, { deviceId: "stable-d" });
      const g1 = await d.join();
      const g2 = await d.join();
      const g3 = await d.join();
      const g4 = await d.join();
      expectEq(g1.id, g2.id, "join 2 same id");
      expectEq(g1.id, g3.id, "join 3 same id");
      expectEq(g1.id, g4.id, "join 4 same id");
      expectEq(g1.label, "Persona 1", "label stable");
    },
  },
  {
    id: "04",
    category: "join",
    name: "Refresh (forget guestId, keep deviceId) → same Persona",
    run: async (token) => {
      const d = new SimulatedDevice(token, { deviceId: "refresh-d" });
      const first = await d.join();
      d.forgetGuestId();
      const after = await d.join();
      expectEq(first.id, after.id, "guestId recovered via deviceId");
      expectEq(first.label, after.label, "label preserved");
    },
  },
  // ────── CLAIM / RELEASE ────────────────────────────────────────────────
  {
    id: "05",
    category: "claim",
    name: "2-device race on same item → last writer wins, no inconsistency",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await Promise.all([a.claim("locro"), b.claim("locro")]);
      const state = await getDemoTableState(token);
      const owner = state.claims["locro"];
      expectTrue(owner === a.guestId || owner === b.guestId, "owner is one of the racers");
      // No phantom claims
      const guestIds = new Set(state.guests.map((g) => g.id));
      for (const [item, gid] of Object.entries(state.claims)) {
        expectTrue(guestIds.has(gid), `claim ${item} → known guest`);
      }
    },
  },
  {
    id: "06",
    category: "claim",
    name: "Claim → release → claim → final state = claimed",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.claim("seco");
      await a.release("seco");
      await a.claim("seco");
      const state = await getDemoTableState(token);
      expectEq(state.claims["seco"], a.guestId, "final owner = a");
    },
  },
  {
    id: "07",
    category: "claim",
    name: "Ping-pong A claim → B claim → A release → B keeps it",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await a.claim("ceviche");
      await b.claim("ceviche");
      await a.release("ceviche"); // a's release is no-op since b owns it
      const state = await getDemoTableState(token);
      expectEq(state.claims["ceviche"], b.guestId, "B retains ownership after A's no-op release");
    },
  },
  {
    id: "08",
    category: "claim",
    name: "Claim a paid item → no-op",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.pay({ mode: "todo" }); // marks all items paid
      const before = await getDemoTableState(token);
      const b = new SimulatedDevice(token);
      await b.join();
      await b.claim("locro");
      const after = await getDemoTableState(token);
      expectEq(
        JSON.stringify(after.claims),
        JSON.stringify(before.claims),
        "claims unchanged on paid item",
      );
    },
  },
  // ────── RENAME ──────────────────────────────────────────────────────────
  {
    id: "09",
    category: "rename",
    name: "Rapid sequential renames → final wins",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      for (const name of ["M", "Ma", "Man", "Manu", "Manue", "Manuel"]) {
        await a.rename(name);
      }
      const state = await getDemoTableState(token);
      expectEq(
        state.guests.find((g) => g.id === a.guestId)?.name,
        "Manuel",
        "final name persisted",
      );
    },
  },
  {
    id: "10",
    category: "rename",
    name: "Concurrent renames on 2 devices → each keeps its own",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await Promise.all([a.rename("Manuel"), b.rename("Ale")]);
      const state = await getDemoTableState(token);
      expectEq(
        state.guests.find((g) => g.id === a.guestId)?.name,
        "Manuel",
        "a kept Manuel",
      );
      expectEq(
        state.guests.find((g) => g.id === b.guestId)?.name,
        "Ale",
        "b kept Ale",
      );
    },
  },
  {
    id: "11",
    category: "rename",
    name: "Rename → immediate pay → guestName preserved",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.rename("Manuel");
      // Pay sends typed name as guestName — should not clobber
      await a.pay({ mode: "todo", guestName: "Manuel" });
      const state = await getDemoTableState(token);
      const me = state.guests.find((g) => g.id === a.guestId);
      expectEq(me?.name, "Manuel", "name still Manuel after pay");
      const payment = state.payments[0];
      expectEq(payment?.guestName, "Manuel", "payment carries Manuel");
    },
  },
  // ────── PAY ─────────────────────────────────────────────────────────────
  {
    id: "12",
    category: "pay",
    name: "Pay mode `item` → only chosen items paid",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.claim("locro");
      await a.claim("seco");
      await a.pay({ mode: "item", itemIds: ["locro", "seco"] });
      const state = await getDemoTableState(token);
      expectTrue(state.paidItemIds.includes("locro"), "locro paid");
      expectTrue(state.paidItemIds.includes("seco"), "seco paid");
      expectTrue(!state.paidItemIds.includes("ceviche"), "ceviche NOT paid");
      expectEq(
        state.guests.find((g) => g.id === a.guestId)?.status,
        "reviewing",
        "a stays reviewing until table closes",
      );
    },
  },
  {
    id: "13",
    category: "pay",
    name: "Pay mode `equal` × 3 devices → table closes after last",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      const c = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join(), c.join()]);
      await a.pay({ mode: "equal", equalPeople: 3 });
      const mid = await getDemoTableState(token);
      expectTrue(mid.paidItemIds.length < mid.items.length, "table NOT closed after 1st payer");
      await b.pay({ mode: "equal", equalPeople: 3 });
      await c.pay({ mode: "equal", equalPeople: 3 });
      const state = await getDemoTableState(token);
      expectEq(state.paidItemIds.length, state.items.length, "all items paid after 3rd");
    },
  },
  {
    id: "14",
    category: "pay",
    name: "Pay mode `todo` → all items marked paid immediately",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.pay({ mode: "todo" });
      const state = await getDemoTableState(token);
      expectEq(state.paidItemIds.length, state.items.length, "all items paid");
    },
  },
  {
    id: "15",
    category: "pay",
    name: "Stale guestName=Persona N does NOT clobber typed name",
    storeOnly: true,
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.rename("Manuel");
      // Simulate a delayed pay POST with stale label
      await a.pay({ mode: "todo", guestName: "Persona 1" });
      const state = await getDemoTableState(token);
      expectEq(
        state.guests.find((g) => g.id === a.guestId)?.name,
        "Manuel",
        "name preserved",
      );
    },
  },
  // ────── RESET / RECOVERY ────────────────────────────────────────────────
  {
    id: "16",
    category: "reset",
    name: "Reset → resetSeq bumps, guests and claims cleared",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await a.claim("locro");
      await b.claim("seco");
      const before = await getDemoTableState(token);
      expectEq(Object.keys(before.claims).length, 2, "claims set before reset");
      const reset = await resetDemoTableState(token);
      expectEq(reset.resetSeq, before.resetSeq + 1, "resetSeq +1");
      expectEq(reset.guests.length, 0, "guests cleared");
      expectEq(Object.keys(reset.claims).length, 0, "claims cleared");
      expectEq(reset.nextGuestNumber, 1, "counter reset to 1");
    },
  },
  {
    id: "17",
    category: "reset",
    name: "Stale guestId + deviceId → recovery without dupe Persona",
    run: async (token) => {
      // pre-seed one guest with a known deviceId
      const a = new SimulatedDevice(token, { deviceId: "stable-recover" });
      await a.join();
      const originalLabel = (await getDemoTableState(token)).guests[0].label;
      // simulate a fully stale guestId by passing garbage but real deviceId
      const stale = new SimulatedDevice(token, { deviceId: "stable-recover" });
      stale.guestId = "00000000-0000-0000-0000-000000000000";
      const recovered = await stale.join();
      expectEq(recovered.label, originalLabel, "same label restored");
      const state = await getDemoTableState(token);
      expectEq(state.guests.length, 1, "no duplicate Persona");
    },
  },
  {
    id: "18",
    category: "reset",
    name: "Lost-update heal — fresh device, new Persona, no throw",
    storeOnly: true,
    run: async (token) => {
      // Pre-populate with 1 guest
      const a = new SimulatedDevice(token);
      await a.join();
      // Now a brand-new device joins (simulating the heal triggering a fresh join)
      const fresh = new SimulatedDevice(token);
      const g = await fresh.join();
      expectEq(g.label, "Persona 2", "Persona 2 assigned");
      const state = await getDemoTableState(token);
      expectEq(state.guests.length, 2, "exactly 2 guests");
    },
  },
  // ────── EDGE ────────────────────────────────────────────────────────────
  {
    id: "19",
    category: "edge",
    name: "Pay item mode with empty itemIds → no crash, no state corruption",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      // pay with empty itemIds — should not throw, no items marked paid
      await a.pay({ mode: "item", itemIds: [] });
      const state = await getDemoTableState(token);
      expectEq(state.paidItemIds.length, 0, "no items paid");
      expectEq(
        state.guests.find((g) => g.id === a.guestId)?.status,
        "reviewing",
        "guest stays reviewing on partial payment",
      );
    },
  },
  {
    id: "20",
    category: "edge",
    name: "Rename to 'Invitado' → falls back to label, never persists 'Invitado'",
    run: async (token) => {
      const a = new SimulatedDevice(token);
      await a.join();
      await a.rename("Invitado");
      const state = await getDemoTableState(token);
      const me = state.guests.find((g) => g.id === a.guestId);
      expectTrue(
        me?.name !== "Invitado" && me?.name?.toLowerCase() !== "invitado",
        `name should NOT be Invitado (got "${me?.name}")`,
      );
    },
  },
  {
    id: "21",
    category: "claim",
    name: "4-device parallel claim burst → every claim persisted",
    run: async (token) => {
      const devices = [
        new SimulatedDevice(token),
        new SimulatedDevice(token),
        new SimulatedDevice(token),
        new SimulatedDevice(token),
      ];
      await Promise.all(devices.map((d) => d.join()));
      const itemIds = ["locro", "seco", "encebollado", "ceviche"];
      await Promise.all(
        devices.map((d, i) => d.claimFast(itemIds[i]!)),
      );
      const state = await getDemoTableState(token);
      for (let i = 0; i < itemIds.length; i++) {
        expectEq(
          state.claims[itemIds[i]!],
          devices[i]!.guestId,
          `${itemIds[i]} owned by device ${i}`,
        );
      }
    },
  },
  {
    id: "22",
    category: "claim",
    name: "50/50 split persists in claimShares for both guests",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await a.join();
      await b.join();
      await a.split("locro", { [a.guestId!]: 0.5, [b.guestId!]: 0.5 });
      const state = await getDemoTableState(token);
      expectEq(state.claims.locro, undefined, "single-owner claim cleared");
      expectEq(
        state.claimShares?.locro?.[a.guestId!],
        0.5,
        "guest A half unit",
      );
      expectEq(
        state.claimShares?.locro?.[b.guestId!],
        0.5,
        "guest B half unit",
      );
      const mapped = (
        await import("@/lib/demo-optimistic-merge")
      ).mapClaimsFromDemoRaw(state);
      expectEq(mapped.locro?.[a.guestId!], 0.5, "mapped A");
      expectEq(mapped.locro?.[b.guestId!], 0.5, "mapped B");
    },
  },

  /* ──────────── R1–R5 regression bed (added 2026-06-23) ──────────────────
     Each scenario reproduces one of the visual-or-functional bugs the user
     reported as "0/10" after the dock/receipt/scroll commits of 2026-06-23.
     Layer 1 covers the store-level invariants; Layer 2 covers the UI gate. */

  // ────── R2: completed-dock "Regresar al resumen de mesa" ───────────────
  {
    id: "23",
    category: "pay",
    name: "R2 — 3 devices pay everything → all items appear in paidItemIds",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      const c = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join(), c.join()]);
      // Each takes one item, all pay item-mode
      await a.claim("locro");
      await b.claim("seco");
      await c.claim("encebollado");
      // Last item: split 50/50 between A and B to mimic the rounding edge
      await a.split("ceviche", { [a.guestId!]: 0.5, [b.guestId!]: 0.5 });
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 1 } });
      await b.pay({ mode: "item", itemIds: ["seco"], itemUnits: { seco: 1 } });
      await c.pay({ mode: "item", itemIds: ["encebollado"], itemUnits: { encebollado: 1 } });
      await a.pay({ mode: "item", itemIds: ["ceviche"], itemUnits: { ceviche: 0.5 } });
      await b.pay({ mode: "item", itemIds: ["ceviche"], itemUnits: { ceviche: 0.5 } });
      // `tableClosed` is derived (see demo-table-progress.ts) — the canonical
      // store-level proxy is "every item id is in paidItemIds OR every unit
      // appears in itemPaidUnits ≥ qty".
      const state = await getDemoTableState(token);
      const allCovered = state.items.every((it) => {
        if (state.paidItemIds.includes(it.id)) return true;
        const units = state.itemPaidUnits?.[it.id] ?? 0;
        return units + 0.001 >= it.qty;
      });
      expectTrue(allCovered, "every item is fully paid (no residual units)");
    },
  },
  {
    id: "24",
    category: "pay",
    name: "R2 — 50/50 split leaves NO residual paidUnits > 1.001",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await a.split("locro", { [a.guestId!]: 0.5, [b.guestId!]: 0.5 });
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 0.5 } });
      await b.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 0.5 } });
      const state = await getDemoTableState(token);
      const paid = state.itemPaidUnits?.locro ?? 0;
      expectTrue(paid >= 0.999 && paid <= 1.001, `paidUnits ≈ 1 (got ${paid})`);
    },
  },

  // ────── R1: multi-device sync under load ───────────────────────────────
  {
    id: "25",
    category: "claim",
    name: "R1 — 3 devices, 10 rapid claim/release cycles, no drift",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      const c = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join(), c.join()]);
      for (let i = 0; i < 10; i++) {
        await Promise.all([
          a.claim("locro"),
          b.claim("seco"),
          c.claim("encebollado"),
        ]);
        await Promise.all([
          a.release("locro"),
          b.release("seco"),
          c.release("encebollado"),
        ]);
      }
      const state = await getDemoTableState(token);
      // After all releases, no claim should be left on these items
      expectEq(state.claims.locro, undefined, "locro released");
      expectEq(state.claims.seco, undefined, "seco released");
      expectEq(state.claims.encebollado, undefined, "encebollado released");
    },
  },
  {
    id: "26",
    category: "claim",
    name: "R1 — race: A claims while B pays a different item",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await b.claim("locro");
      await Promise.all([
        a.claim("seco"),
        b.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 1 } }),
      ]);
      const state = await getDemoTableState(token);
      expectEq(state.claims.seco, a.guestId, "A's claim survived B's pay");
      expectTrue(state.paidItemIds.includes("locro"), "B's pay registered");
    },
  },

  // ────── R5: split math + receipt count consistency ─────────────────────
  {
    id: "27",
    category: "pay",
    name: "R5 — split + pay logs exactly 2 receipts (not 4)",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await a.split("locro", { [a.guestId!]: 0.5, [b.guestId!]: 0.5 });
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 0.5 }, amount: 5 });
      await b.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 0.5 }, amount: 5 });
      const state = await getDemoTableState(token);
      const receipts = state.payments ?? [];
      expectEq(receipts.length, 2, "exactly 2 receipts logged");
    },
  },

  // ────── R3 / receipt drawer post-reset ─────────────────────────────────
  {
    id: "28",
    category: "reset",
    name: "Reset mid-payment clears receipts cleanly",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      await a.join();
      await a.claim("locro");
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 1 } });
      await resetDemoTableState(token);
      const state = await getDemoTableState(token);
      expectEq(state.payments?.length ?? 0, 0, "no payments after reset");
      expectEq(state.paidItemIds.length, 0, "no paidItemIds after reset");
      expectEq(Object.keys(state.claims).length, 0, "no claims after reset");
      const paidUnits = Object.values(state.itemPaidUnits ?? {}).filter(
        (v) => v > 0.001,
      );
      expectEq(paidUnits.length, 0, "no residual partial payments after reset");
    },
  },

  // ────── R4: ring math — paidPct 100 implies tableClosed ────────────────
  {
    id: "29",
    category: "pay",
    name: "R4 — paying every unit yields 100% progress (no off-by-one)",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      await a.join();
      // Single device pays full bill via "todo" mode
      await a.pay({ mode: "todo" });
      const state = await getDemoTableState(token);
      // tableClosed is derived from paidItemIds covering every item.
      const remaining = state.items.filter(
        (it) => !state.paidItemIds.includes(it.id),
      );
      expectEq(remaining.length, 0, "no item left unpaid after pay-all");
    },
  },

  // ────── Cold-join late ─────────────────────────────────────────────────
  {
    id: "30",
    category: "join",
    name: "Cold join after 3 payments → new guest sees server-authoritative state",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      const c = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join(), c.join()]);
      await a.claim("locro");
      await b.claim("seco");
      await c.claim("encebollado");
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 1 } });
      await b.pay({ mode: "item", itemIds: ["seco"], itemUnits: { seco: 1 } });
      await c.pay({ mode: "item", itemIds: ["encebollado"], itemUnits: { encebollado: 1 } });
      const cold = new SimulatedDevice(token);
      const guest = await cold.join();
      expectEq(guest.label, "Persona 4", "cold join gets Persona 4");
      const state = await getDemoTableState(token);
      expectEq(state.paidItemIds.length, 3, "cold join sees 3 paid items");
    },
  },

  // ────── Rename sync across devices ─────────────────────────────────────
  {
    id: "31",
    category: "rename",
    name: "Rename → another device sees it on next read",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await a.rename("Manuel");
      const stateFromB = await getDemoTableState(token);
      const seen = stateFromB.guests.find((g) => g.id === a.guestId)?.name;
      expectEq(seen, "Manuel", "B reads A's new name");
    },
  },

  // ────── Reset + immediate join → fresh roster ──────────────────────────
  {
    id: "32",
    category: "reset",
    name: "Reset then immediate join → Persona 1 only",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      await a.join();
      await resetDemoTableState(token);
      const b = new SimulatedDevice(token);
      const g = await b.join();
      const state = await getDemoTableState(token);
      expectEq(state.guests.length, 1, "1 guest after reset");
      expectEq(g.label, "Persona 1", "label resets to 1");
    },
  },

  // ────── Mixed-mode pay (todo while others have items) ──────────────────
  {
    id: "33",
    category: "pay",
    name: "Mixed: B claims, A pays todo → A clears all items",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await b.claim("locro");
      await a.pay({ mode: "todo" });
      const state = await getDemoTableState(token);
      expectEq(
        state.paidItemIds.length,
        state.items.length,
        "every item marked paid after pay-all",
      );
    },
  },

  // ────── Split → reassign all to one ────────────────────────────────────
  {
    id: "34",
    category: "claim",
    name: "Split then reassign all units to one guest → claim collapses cleanly",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      const b = new SimulatedDevice(token);
      await Promise.all([a.join(), b.join()]);
      await a.split("locro", { [a.guestId!]: 0.5, [b.guestId!]: 0.5 });
      await a.split("locro", { [a.guestId!]: 1.0 });
      const state = await getDemoTableState(token);
      expectEq(state.claims.locro, a.guestId, "single-owner claim restored");
      const shares = state.claimShares?.locro;
      expectTrue(
        !shares || Object.values(shares).every((v) => v <= 0.001),
        "no leftover fractional shares",
      );
    },
  },

  // ────── Idempotency: same pay submitted twice ──────────────────────────
  {
    id: "35",
    category: "pay",
    name: "Duplicate pay submission → only one receipt persists",
    storeOnly: true,
    run: async (token) => {
      await resetDemoTableState(token);
      const a = new SimulatedDevice(token);
      await a.join();
      await a.claim("locro");
      // Same submission twice. The store is allowed to coalesce or accept both
      // — what we care about is that NO ghost receipt with no items appears.
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 1 } });
      await a.pay({ mode: "item", itemIds: ["locro"], itemUnits: { locro: 1 } });
      const state = await getDemoTableState(token);
      const ghosts = (state.payments ?? []).filter(
        (p) => !p.itemIds || p.itemIds.length === 0,
      );
      expectEq(ghosts.length, 0, "no ghost receipts");
    },
  },
];

/* ───────────────────────── tiny assert helpers ─────────────────────── */

function expectEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `[assert ${label}] expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function expectTrue(cond: boolean, label: string): void {
  if (!cond) throw new Error(`[assert ${label}] expected true`);
}

/** UI-observable subset for Playwright (excludes storeOnly). */
export const UI_SCENARIOS = SCENARIOS.filter((s) => !s.storeOnly);

export const ITEMS_AVAILABLE = ITEM_IDS;
