import { beforeAll, describe, expect, it } from "vitest";

import { listDemoTables } from "@/lib/demo-table-catalog";
import {
  claimDemoItem,
  joinDemoTable,
  getDemoTableState,
  resetDemoTableState,
} from "@/lib/demo-table-store";

beforeAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("multi-token isolation — catalog-backed demo tables", () => {
  it("each catalog token initializes with its own menu", async () => {
    for (const def of listDemoTables()) {
      await resetDemoTableState(def.token);
      const state = await getDemoTableState(def.token);
      expect(state.table.name).toBe(def.table.name);
      expect(state.restaurant.name).toBe(def.restaurant.name);
      if (def.token === "demo") {
        expect(state.items.map((i) => i.id)).toEqual(
          def.items.map((i) => i.id),
        );
      } else {
        expect(state.items).toHaveLength(0);
      }
    }
  });

  it("joining mesa-1 does not pollute mesa-2 state", async () => {
    await resetDemoTableState("demo-mesa-1");
    await resetDemoTableState("demo-mesa-2");

    const { guest: g1 } = await joinDemoTable("demo-mesa-1", {
      deviceId: "iso-device-A",
    });
    expect(g1).toBeTruthy();

    const m2 = await getDemoTableState("demo-mesa-2");
    expect(m2.guests).toHaveLength(0);
    expect(m2.table.name).toBe("2");
  });

  it("mesa-2 POS-linked tables start empty after reset (items from POS pull)", async () => {
    await resetDemoTableState("demo-mesa-2");
    const { state } = await joinDemoTable("demo-mesa-2", {
      deviceId: "mesa2-device",
    });
    expect(state.items).toHaveLength(0);
    expect(state.paidItemIds).toHaveLength(0);
  });

  it("mesa-4 POS-linked reset clears catalog seed (invoice demo uses mesa 12)", async () => {
    await resetDemoTableState("demo-mesa-4");
    const state = await getDemoTableState("demo-mesa-4");
    expect(state.items).toHaveLength(0);
  });

  it("mesa-4 catalog subtotal supports invoice trigger (>= $50 food)", () => {
    const def = listDemoTables().find((t) => t.token === "demo-mesa-4");
    expect(def).toBeTruthy();
    const total = def!.items.reduce(
      (sum, it) => sum + it.qty * it.unitPrice,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it("claim on mesa-1 is invisible to mesa-3", async () => {
    await resetDemoTableState("demo-mesa-1");
    await resetDemoTableState("demo-mesa-3");
    const { guest } = await joinDemoTable("demo-mesa-1", {
      deviceId: "iso-claim-A",
    });
    await claimDemoItem("demo-mesa-1", guest.id, "bolon");

    const m1 = await getDemoTableState("demo-mesa-1");
    const m3 = await getDemoTableState("demo-mesa-3");
    expect(m1.claims["bolon"]).toBe(guest.id);
    expect(m3.claims["bolon"]).toBeUndefined();
    expect(m3.guests).toHaveLength(0);
  });

  it("default token `demo` keeps legacy menu byte-identical", async () => {
    await resetDemoTableState("demo");
    const state = await getDemoTableState("demo");
    expect(state.table.name).toBe("12");
    expect(state.items.map((i) => i.id)).toEqual([
      "locro",
      "seco",
      "encebollado",
      "ceviche",
      "jugo-1",
      "jugo-2",
      "club-1",
      "club-2",
    ]);
  });
});
