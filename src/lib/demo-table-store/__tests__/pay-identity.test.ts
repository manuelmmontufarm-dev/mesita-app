import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  joinDemoTable,
  recordDemoPayment,
  renameDemoGuest,
  resetDemoTableState,
  getDemoTableState,
} from "@/lib/demo-table-store";

const TOKEN = "test-pay-identity";

beforeEach(async () => {
  await resetDemoTableState(TOKEN);
});

afterEach(async () => {
  await resetDemoTableState(TOKEN);
});

describe("recordDemoPayment — name preservation guardrail", () => {
  it("writes the typed name when pay sends a real (non-label) guestName", async () => {
    const { guest } = await joinDemoTable(TOKEN, { deviceId: "d-pay-1" });

    const state = await recordDemoPayment(TOKEN, {
      guestId: guest.id,
      guestName: "Manuel",
      mode: "todo",
      amount: 30,
      subtotal: 24,
      iva: 3,
      service: 2,
      tip: 1,
      itemIds: [],
      method: "demo",
    });

    const updated = state.guests.find((g) => g.id === guest.id);
    expect(updated?.name).toBe("Manuel");
  });

  it("does NOT clobber a previously-typed real name when pay sends a stale Persona N label", async () => {
    const { guest } = await joinDemoTable(TOKEN, { deviceId: "d-pay-2" });

    // User typed their real name first (rename POST)
    await renameDemoGuest(TOKEN, guest.id, "Manuel");

    // Race scenario: a delayed pay POST sends the stale auto-label.
    // Previously this clobbered "Manuel" with "Persona 1". Now it's preserved.
    const state = await recordDemoPayment(TOKEN, {
      guestId: guest.id,
      guestName: "Persona 1",
      mode: "todo",
      amount: 30,
      subtotal: 24,
      iva: 3,
      service: 2,
      tip: 1,
      itemIds: [],
      method: "demo",
    });

    const updated = state.guests.find((g) => g.id === guest.id);
    expect(updated?.name).toBe("Manuel");
  });

  it("does allow a Persona N label to settle the name when no real name was set", async () => {
    // Edge case: user never typed anything — initial state has guest.name == "Persona 1".
    // A pay POST with guestName "Persona 1" is fine (no-op, both labels).
    const { guest } = await joinDemoTable(TOKEN, { deviceId: "d-pay-3" });

    const state = await recordDemoPayment(TOKEN, {
      guestId: guest.id,
      guestName: "Persona 1",
      mode: "todo",
      amount: 30,
      subtotal: 24,
      iva: 3,
      service: 2,
      tip: 1,
      itemIds: [],
      method: "demo",
    });

    const updated = state.guests.find((g) => g.id === guest.id);
    expect(updated?.name).toBe("Persona 1");
  });

  it("marks the guest as paid after pay regardless of name fields", async () => {
    const { guest } = await joinDemoTable(TOKEN, { deviceId: "d-pay-4" });
    await renameDemoGuest(TOKEN, guest.id, "Ale");
    await recordDemoPayment(TOKEN, {
      guestId: guest.id,
      guestName: "Ale",
      mode: "todo",
      amount: 12,
      subtotal: 10,
      iva: 1.5,
      service: 0.5,
      tip: 0,
      itemIds: [],
      method: "demo",
    });
    const state = await getDemoTableState(TOKEN);
    expect(state.guests.find((g) => g.id === guest.id)?.status).toBe("paid");
  });
});
