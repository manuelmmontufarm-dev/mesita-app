import { describe, expect, it } from "vitest";

import { shouldApplyDemoVersion } from "@/lib/demo-table-store";

describe("shouldApplyDemoVersion", () => {
  it("accepts first snapshot", () => {
    expect(shouldApplyDemoVersion(1, undefined)).toBe(true);
  });

  it("accepts strictly newer versions", () => {
    expect(shouldApplyDemoVersion(5, 4)).toBe(true);
  });

  it("rejects equal version", () => {
    expect(shouldApplyDemoVersion(4, 4)).toBe(false);
  });

  it("rejects stale snapshots", () => {
    expect(shouldApplyDemoVersion(3, 7)).toBe(false);
  });
});
