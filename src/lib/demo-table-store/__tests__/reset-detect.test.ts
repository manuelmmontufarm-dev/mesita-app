import { describe, expect, it } from "vitest";

/** Mirror of useDemoTableSession helper — real reset vs sync noise. */
function isRemoteTableReset(
  demoResetSeq: number,
  guestId: string | null,
  lastResetSeq: number | undefined,
  guestIdsOnServer: string[],
): boolean {
  if (guestId == null || lastResetSeq === undefined) return false;
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
});
