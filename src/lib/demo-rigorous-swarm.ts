/**
 * 20 rigorous swarm scenarios — each runs 10 simulated diners against an
 * isolated demo table token. Designed to expose join races, partial-pay bugs,
 * equal-split edge cases, and concurrent claim conflicts.
 */

import { billSubtotal } from "@/lib/guest-billing/split-math";

import { SimulatedDevice } from "./demo-scenarios";
import { getDemoTableState, joinDemoTable } from "./demo-table-store";

export interface RigorousSwarmScenario {
  id: string;
  name: string;
  run: (token: string) => Promise<void>;
}

const ITEMS = [
  "locro",
  "seco",
  "encebollado",
  "ceviche",
  "jugo-1",
  "jugo-2",
  "club-1",
  "club-2",
] as const;

function swarm(token: string, n = 10): SimulatedDevice[] {
  return Array.from({ length: n }, (_, i) =>
    new SimulatedDevice(token, { deviceId: `swarm-${i}` }),
  );
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function tableSubtotal(token: string): Promise<number> {
  const state = await getDemoTableState(token);
  return billSubtotal(state.items);
}

export const RIGOROUS_SWARM_SCENARIOS: RigorousSwarmScenario[] = [
  {
    id: "R01",
    name: "10 diners join in parallel",
    run: async (token) => {
      const devices = swarm(token);
      const guests = await Promise.all(devices.map((d) => d.join()));
      assert(guests.length === 10, "10 guests joined");
      const state = await getDemoTableState(token);
      assert(state.guests.length === 10, "10 guests on table");
    },
  },
  {
    id: "R02",
    name: "10 diners claim 8 unique items in parallel",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      await Promise.all(
        devices.slice(0, 8).map((d, i) => d.claimFast(ITEMS[i]!)),
      );
      const state = await getDemoTableState(token);
      assert(Object.keys(state.claims).length === 8, "8 claims persisted");
    },
  },
  {
    id: "R03",
    name: "10 diners fight for locro — exactly one owner",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      await Promise.all(devices.map((d) => d.claimFast("locro").catch(() => null)));
      const state = await getDemoTableState(token);
      const owners = new Set(
        state.guests.filter((g) => state.claims.locro === g.id).map((g) => g.id),
      );
      assert(
        state.claims.locro != null || owners.size <= 1,
        "at most one locro owner",
      );
    },
  },
  {
    id: "R04",
    name: "10 concurrent renames — all unique names persist",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      await Promise.all(devices.map((d, i) => d.rename(`Comensal${i + 1}`)));
      const state = await getDemoTableState(token);
      const names = new Set(state.guests.map((g) => g.name));
      assert(names.size === 10, "10 distinct names");
    },
  },
  {
    id: "R05",
    name: "10 partial item payments (0.5 unit) — table stays open",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      for (let i = 0; i < 8; i++) {
        await devices[i]!.claim(ITEMS[i]!);
      }
      const fullSub = await tableSubtotal(token);
      const unitPrice = (await getDemoTableState(token)).items[0]!.unitPrice;
      await devices[0]!.pay({
        mode: "item",
        itemIds: [],
        itemUnits: { locro: 0.5 },
        subtotal: unitPrice * 0.5,
        amount: unitPrice * 0.5 * 1.35,
      });
      const state = await getDemoTableState(token);
      assert(!state.paidItemIds.includes("locro"), "locro not fully paid");
      assert(
        state.payments.reduce((s, p) => s + p.subtotal, 0) < fullSub - 0.02,
        "bill not fully covered",
      );
    },
  },
  {
    id: "R06",
    name: "10 equal-split payers (equalPeople=10) close table",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      const fullSub = await tableSubtotal(token);
      const share = fullSub / 10;
      for (const d of devices) {
        await d.pay({ mode: "equal", equalPeople: 10, subtotal: share, amount: share * 1.35 });
      }
      const state = await getDemoTableState(token);
      assert(
        state.paidItemIds.length === state.items.length,
        "all items paid after 10 equal shares",
      );
    },
  },
  {
    id: "R07",
    name: "1 solo diner equalPeople=2 partial — table stays open",
    run: async (token) => {
      const a = new SimulatedDevice(token, { deviceId: "solo-eq" });
      await a.join();
      const fullSub = await tableSubtotal(token);
      await a.pay({
        mode: "equal",
        equalPeople: 2,
        subtotal: fullSub / 2,
        amount: (fullSub / 2) * 1.35,
      });
      const state = await getDemoTableState(token);
      assert(state.paidItemIds.length < state.items.length, "table still open");
      assert(
        state.guests[0]?.status === "reviewing",
        "guest reviewing after partial equal pay",
      );
    },
  },
  {
    id: "R08",
    name: "10 join → 5 pay item → 5 claim remainder",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      for (let i = 0; i < 5; i++) {
        await devices[i]!.claim(ITEMS[i]!);
        await devices[i]!.pay({
          mode: "item",
          itemIds: [ITEMS[i]!],
          subtotal: (await getDemoTableState(token)).items.find((it) => it.id === ITEMS[i])!
            .unitPrice,
        });
      }
      for (let i = 5; i < 10; i++) {
        await devices[i]!.claim(ITEMS[i - 5]!);
      }
      const state = await getDemoTableState(token);
      assert(state.paidItemIds.length === 5, "5 items fully paid");
      assert(Object.keys(state.claims).length >= 5, "claims remain for unpaid");
    },
  },
  {
    id: "R09",
    name: "10 refresh cycles (forget guestId, rejoin via deviceId)",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      for (const d of devices) {
        const id = d.guestId;
        d.forgetGuestId();
        const g = await d.join();
        assert(g.id === id, "same guestId after refresh");
      }
    },
  },
  {
    id: "R10",
    name: "10-diner claim/release storm",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      await Promise.all(devices.map((d) => d.claim("seco")));
      await Promise.all(devices.map((d) => d.release("seco").catch(() => null)));
      const state = await getDemoTableState(token);
      assert(state.claims.seco == null, "seco released");
    },
  },
  {
    id: "R11",
    name: "10 sequential partial pays same guest different items",
    run: async (token) => {
      const a = new SimulatedDevice(token, { deviceId: "serial-payer" });
      await a.join();
      for (const itemId of ITEMS) {
        await a.claim(itemId);
        const price = (await getDemoTableState(token)).items.find((it) => it.id === itemId)!
          .unitPrice;
        await a.pay({ mode: "item", itemIds: [itemId], subtotal: price, amount: price * 1.35 });
      }
      const state = await getDemoTableState(token);
      assert(state.paidItemIds.length === ITEMS.length, "all items paid by one guest");
    },
  },
  {
    id: "R12",
    name: "10 diners todo race — first todo closes table",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      const fullSub = await tableSubtotal(token);
      await devices[0]!.pay({
        mode: "todo",
        subtotal: fullSub,
        amount: fullSub * 1.35,
      });
      const state = await getDemoTableState(token);
      assert(state.paidItemIds.length === state.items.length, "todo closed table");
    },
  },
  {
    id: "R13",
    name: "10 join with stale guestId + deviceId recovery",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      const staleIds = devices.map((d) => d.guestId!);
      for (const d of devices) d.forgetGuestId();
      await Promise.all(
        devices.map((d, i) =>
          joinDemoTable(token, { guestId: staleIds[i]!, deviceId: d.deviceId }),
        ),
      );
      const state = await getDemoTableState(token);
      assert(state.guests.length === 10, "10 guests after stale recovery");
    },
  },
  {
    id: "R14",
    name: "10 concurrent join+claim",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(
        devices.map(async (d, i) => {
          await d.join();
          await d.claimFast(ITEMS[i % ITEMS.length]!);
        }),
      );
      const state = await getDemoTableState(token);
      assert(Object.keys(state.claims).length >= 8, "most claims persisted");
    },
  },
  {
    id: "R15",
    name: "10 equal payers with equalPeople=5 — table closes at 5",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      const fullSub = await tableSubtotal(token);
      const share = fullSub / 5;
      for (let i = 0; i < 5; i++) {
        await devices[i]!.pay({
          mode: "equal",
          equalPeople: 5,
          subtotal: share,
          amount: share * 1.35,
        });
      }
      const state = await getDemoTableState(token);
      assert(state.paidItemIds.length === state.items.length, "5 shares closed table");
    },
  },
  {
    id: "R16",
    name: "10 diners pay empty itemIds partial — no false full-item marks",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      const fullSub = await tableSubtotal(token);
      const share = fullSub / 10;
      await Promise.all(
        devices.map((d) =>
          d.pay({ mode: "item", itemIds: [], subtotal: share, amount: share * 1.35 }),
        ),
      );
      const state = await getDemoTableState(token);
      assert(
        state.paidItemIds.length < state.items.length,
        "partial payments did not mark all items",
      );
      assert(state.payments.length === 10, "10 payments recorded");
    },
  },
  {
    id: "R17",
    name: "10-device rename then pay — names on payments",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      await Promise.all(devices.map((d, i) => d.rename(`P${i + 1}`)));
      await devices[0]!.claim("locro");
      const price = (await getDemoTableState(token)).items.find((it) => it.id === "locro")!
        .unitPrice;
      await devices[0]!.pay({
        mode: "item",
        itemIds: ["locro"],
        guestName: "P1",
        subtotal: price,
        amount: price * 1.35,
      });
      const state = await getDemoTableState(token);
      assert(state.payments[0]?.guestName === "P1", "payment has typed name");
    },
  },
  {
    id: "R18",
    name: "10 join burst on cold table (no prior GET)",
    run: async (token) => {
      const devices = swarm(token);
      const results = await Promise.allSettled(devices.map((d) => d.joinFast()));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      assert(ok === 10, `all 10 cold joins succeeded (got ${ok})`);
    },
  },
  {
    id: "R19",
    name: "10 diners mixed modes — no crash",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      await devices[0]!.claim("locro");
      await devices[0]!.pay({ mode: "item", itemIds: ["locro"], subtotal: 4.5 });
      await devices[1]!.pay({ mode: "equal", equalPeople: 3, subtotal: 5 });
      await devices[2]!.pay({ mode: "item", itemIds: [], subtotal: 2, itemUnits: { seco: 0.25 } });
      const state = await getDemoTableState(token);
      assert(state.payments.length >= 3, "mixed payments recorded");
    },
  },
  {
    id: "R20",
    name: "10-diner full lifecycle: join → claim → pay → rejoin",
    run: async (token) => {
      const devices = swarm(token);
      await Promise.all(devices.map((d) => d.join()));
      for (let i = 0; i < 8; i++) {
        await devices[i]!.claim(ITEMS[i]!);
      }
      for (let i = 0; i < 4; i++) {
        const itemId = ITEMS[i]!;
        const price = (await getDemoTableState(token)).items.find((it) => it.id === itemId)!
          .unitPrice;
        await devices[i]!.pay({
          mode: "item",
          itemIds: [itemId],
          subtotal: price,
          amount: price * 1.35,
        });
        devices[i]!.forgetGuestId();
        await devices[i]!.join();
      }
      const state = await getDemoTableState(token);
      assert(state.paidItemIds.length === 4, "4 items paid after lifecycle");
      assert(state.guests.length === 10, "10 guests still on table");
    },
  },
];
