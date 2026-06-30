import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getDemoTableState,
  joinDemoTable,
  markDemoTableClosed,
  startFreshDemoSession,
  resetDemoTableState,
} from "@/lib/demo-table-store";

/**
 * Lifecycle de la mesa cerrada (Fase 3):
 *  - markDemoTableClosed conserva guests/payments y marca sessionPhase "closed".
 *  - un comensal que vuelve re-entra al snapshot de éxito (sin wipe).
 *  - un dispositivo nuevo arranca una sesión limpia (mesa vacía).
 */

const TOKEN = "test-closed-phase";

beforeEach(async () => {
  await resetDemoTableState(TOKEN);
});

afterEach(async () => {
  await resetDemoTableState(TOKEN);
});

describe("markDemoTableClosed", () => {
  it("sets sessionPhase closed and preserves guests without bumping resetSeq", async () => {
    await joinDemoTable(TOKEN, { deviceId: "device-a" });
    const before = await getDemoTableState(TOKEN);

    const closed = await markDemoTableClosed(TOKEN);

    expect(closed.sessionPhase).toBe("closed");
    expect(closed.closedAt).toBeTruthy();
    expect(closed.guests).toHaveLength(1);
    expect(closed.resetSeq).toBe(before.resetSeq); // no bump → no exitToLobby
    expect(closed.guests[0].status).toBe("paid");
  });
});

describe("join after close", () => {
  it("returning device re-enters the closed snapshot (no fresh session)", async () => {
    const joined = await joinDemoTable(TOKEN, { deviceId: "device-a" });
    await markDemoTableClosed(TOKEN);

    const rejoin = await joinDemoTable(TOKEN, { deviceId: "device-a" });

    expect(rejoin.state.sessionPhase).toBe("closed");
    expect(rejoin.guest.id).toBe(joined.guest.id);
    expect(rejoin.state.guests).toHaveLength(1);
  });

  it("a brand new device starts a fresh open session (empty table)", async () => {
    await joinDemoTable(TOKEN, { deviceId: "device-a" });
    const closed = await markDemoTableClosed(TOKEN);

    const fresh = await joinDemoTable(TOKEN, { deviceId: "device-new" });

    expect(fresh.state.sessionPhase).toBe("open");
    expect(fresh.state.resetSeq).toBeGreaterThan(closed.resetSeq);
    // only the new guest remains — old paid guests were cleared
    expect(fresh.state.guests).toHaveLength(1);
    expect(fresh.guest.deviceId).toBe("device-new");
  });
});

describe("startFreshDemoSession", () => {
  it("bumps resetSeq, clears guests/payments and reopens the table", async () => {
    await joinDemoTable(TOKEN, { deviceId: "device-a" });
    const closed = await markDemoTableClosed(TOKEN);

    const fresh = await startFreshDemoSession(TOKEN);

    expect(fresh.sessionPhase).toBe("open");
    expect(fresh.closedAt).toBeUndefined();
    expect(fresh.guests).toHaveLength(0);
    expect(fresh.payments).toHaveLength(0);
    expect(fresh.resetSeq).toBe(closed.resetSeq + 1);
  });
});
