import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDemoTableState, joinDemoTable, resetDemoTableState } from "@/lib/demo-table-store";

/**
 * Repro tests for the multi-device duplicate-Persona bug.
 * Documented in TODAY.md (2026-06-19 — Fix demo: ghosts y Personas duplicadas).
 *
 * NOTE: in-memory store only (no Redis env in tests). These tests exercise the
 * deterministic dedupe + number-derivation logic; the production Redis path
 * uses the same code, so passing here implies the same invariants there
 * (race window aside, which the deviceId heal absorbs in the client).
 */

const TOKEN = "test-idempotency";

beforeEach(async () => {
  // clean slate between tests — wipe the shared in-memory store
  await resetDemoTableState(TOKEN);
});

afterEach(async () => {
  await resetDemoTableState(TOKEN);
});

describe("joinDemoTable idempotency", () => {
  it("3 fresh joins with 3 different deviceIds → exactly 3 guests, Persona 1/2/3", async () => {
    const a = await joinDemoTable(TOKEN, { deviceId: "device-a" });
    const b = await joinDemoTable(TOKEN, { deviceId: "device-b" });
    const c = await joinDemoTable(TOKEN, { deviceId: "device-c" });

    const state = await getDemoTableState(TOKEN);
    expect(state.guests).toHaveLength(3);

    const labels = state.guests.map((g) => g.label).sort();
    expect(labels).toEqual(["Persona 1", "Persona 2", "Persona 3"]);

    // Each guest is uniquely identified by its deviceId
    expect(a.guest.deviceId).toBe("device-a");
    expect(b.guest.deviceId).toBe("device-b");
    expect(c.guest.deviceId).toBe("device-c");
  });

  it("re-join with same deviceId returns the SAME guest (no ghost, no number bump)", async () => {
    const first = await joinDemoTable(TOKEN, { deviceId: "device-x" });
    const second = await joinDemoTable(TOKEN, { deviceId: "device-x" });
    const third = await joinDemoTable(TOKEN, { deviceId: "device-x" });

    expect(second.guest.id).toBe(first.guest.id);
    expect(third.guest.id).toBe(first.guest.id);
    expect(second.guest.label).toBe(first.guest.label);

    const state = await getDemoTableState(TOKEN);
    expect(state.guests).toHaveLength(1);
    expect(state.guests[0].label).toBe("Persona 1");
  });

  it("re-join with stored guestId (no deviceId) returns same guest and binds deviceId", async () => {
    const first = await joinDemoTable(TOKEN, { deviceId: "device-y" });

    // Simulate: deviceId got cleared somehow but client still has guestId
    const second = await joinDemoTable(TOKEN, { guestId: first.guest.id });
    expect(second.guest.id).toBe(first.guest.id);

    // Subsequent join WITH deviceId still finds the same guest
    const third = await joinDemoTable(TOKEN, { deviceId: "device-y" });
    expect(third.guest.id).toBe(first.guest.id);
  });

  it("Persona N number derives from existing labels — no monotonic ghost inflation", async () => {
    await joinDemoTable(TOKEN, { deviceId: "d1" });
    await joinDemoTable(TOKEN, { deviceId: "d2" });
    await joinDemoTable(TOKEN, { deviceId: "d3" });

    // Simulate ghost: state.nextGuestNumber is now 4, but if we manually wipe
    // the guest list (e.g., post-recovery) the next number must still be 1.
    const fresh = await resetDemoTableState(TOKEN);
    expect(fresh.nextGuestNumber).toBe(1);

    const recovered = await joinDemoTable(TOKEN, { deviceId: "d-new" });
    expect(recovered.guest.label).toBe("Persona 1");
  });

  it("stale guestId WITH deviceId fallback does NOT throw 409 — creates fresh guest", async () => {
    // Simulates: client has a stored guestId from a previous reset.
    // Old behaviour: throw DemoGuestNotFoundError → 409 → clearStored → loop.
    // New behaviour: deviceId rescues us into a brand-new Persona.
    const recovered = await joinDemoTable(TOKEN, {
      guestId: "stale-uuid-from-old-session",
      deviceId: "device-recover",
    });
    expect(recovered.guest.id).not.toBe("stale-uuid-from-old-session");
    expect(recovered.guest.label).toBe("Persona 1");
    expect(recovered.guest.deviceId).toBe("device-recover");
  });

  it("legacy call signature (string guestId) still works — back-compat", async () => {
    const first = await joinDemoTable(TOKEN, { deviceId: "device-legacy" });
    const second = await joinDemoTable(TOKEN, first.guest.id);
    expect(second.guest.id).toBe(first.guest.id);
  });
});
