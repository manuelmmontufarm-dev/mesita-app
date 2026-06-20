import { beforeAll, describe, expect, it } from "vitest";

import { getDemoTableState, joinDemoTable } from "@/lib/demo-table-store";

/**
 * Repro for production bug: first join on empty Upstash key (no prior GET)
 * must not throw "concurrent update conflict" → 500 Internal server error.
 */
beforeAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("cold join (empty store, no prior GET)", () => {
  it("joinDemoTable seeds and adds guest on first write", async () => {
    const token = `cold-${Math.random().toString(36).slice(2, 10)}`;
    const { guest, state } = await joinDemoTable(token, {
      deviceId: "cold-start-device",
    });
    expect(guest.label).toBe("Persona 1");
    expect(state.guests).toHaveLength(1);
    expect(state.guests[0]?.id).toBe(guest.id);

    const loaded = await getDemoTableState(token);
    expect(loaded.guests).toHaveLength(1);
  });

  it("10 concurrent cold joins all succeed", async () => {
    const token = `cold-concurrent-${Math.random().toString(36).slice(2, 10)}`;
    const joins = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        joinDemoTable(token, { deviceId: `device-${i}` }),
      ),
    );
    expect(joins).toHaveLength(10);
    const loaded = await getDemoTableState(token);
    expect(loaded.guests).toHaveLength(10);
  });

  it("double join same device is idempotent", async () => {
    const token = `cold-idem-${Math.random().toString(36).slice(2, 10)}`;
    const first = await joinDemoTable(token, { deviceId: "idem-device" });
    const second = await joinDemoTable(token, {
      guestId: first.guest.id,
      deviceId: "idem-device",
    });
    expect(second.guest.id).toBe(first.guest.id);
    const loaded = await getDemoTableState(token);
    expect(loaded.guests).toHaveLength(1);
  });
});
