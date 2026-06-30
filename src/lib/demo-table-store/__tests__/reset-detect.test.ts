import { describe, expect, it } from "vitest";

/** Mirror of useDemoTableSession helper — real reset vs sync noise. */
function isRemoteTableReset(
  demoResetSeq: number,
  guestId: string | null,
  lastResetSeq: number | undefined,
  guestIdsOnServer: string[],
  sessionPhase: "open" | "closed" = "open",
): boolean {
  if (guestId == null || lastResetSeq === undefined) return false;
  // Mesa cerrada (pagada): no expulsar si el guest sigue presente — debe ver confeti.
  if (sessionPhase === "closed" && guestIdsOnServer.includes(guestId)) {
    return false;
  }
  if (demoResetSeq <= lastResetSeq) return false;
  return !guestIdsOnServer.includes(guestId);
}

describe("isRemoteTableReset", () => {
  it("ignores sync when resetSeq unchanged", () => {
    expect(isRemoteTableReset(3, "g1", 3, ["g1"])).toBe(false);
  });

  it("ignores resetSeq bump while guest still on server", () => {
    expect(isRemoteTableReset(4, "g1", 3, ["g1", "g2"])).toBe(false);
  });

  it("detects real reset when guest is gone", () => {
    expect(isRemoteTableReset(5, "g1", 4, [])).toBe(true);
  });

  it("does not fire without guest id", () => {
    expect(isRemoteTableReset(5, null, 4, [])).toBe(false);
  });

  it("does not fire on closed table while guest is still present (confetti)", () => {
    // resetSeq did not bump on close; guest still on server → stay for confetti.
    expect(isRemoteTableReset(4, "g1", 4, ["g1"], "closed")).toBe(false);
  });

  it("still detects a genuine fresh session that removed the closed guest", () => {
    // New scan → startFreshDemoSession bumps resetSeq and clears old guests.
    expect(isRemoteTableReset(6, "g1", 5, ["g-new"], "open")).toBe(true);
  });
});
