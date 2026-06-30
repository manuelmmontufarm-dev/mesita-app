import { beforeEach, describe, expect, it } from "vitest";

import {
  claimDemoItem,
  getDemoTableState,
  joinDemoTable,
  resetDemoTableState,
} from "@/lib/demo-table-store";

beforeEach(async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await resetDemoTableState("demo-mesa-1");
});

describe("claimDemoItem race — first server write wins", () => {
  it("rejects a second guest claiming an owned item", async () => {
    const { guest: a } = await joinDemoTable("demo-mesa-1", { deviceId: "dev-a" });
    const { guest: b } = await joinDemoTable("demo-mesa-1", { deviceId: "dev-b" });

    const first = await claimDemoItem("demo-mesa-1", a.id, "bolon");
    expect(first.rejected).toBeUndefined();
    expect(first.state.claims.bolon).toBe(a.id);

    const second = await claimDemoItem("demo-mesa-1", b.id, "bolon");
    expect(second.rejected).toEqual({ itemId: "bolon", ownerId: a.id });
    expect(second.state.claims.bolon).toBe(a.id);
    expect(second.state.claimShares?.bolon).toBeUndefined();
  });

  it("parallel claims leave exactly one owner and no claimShares", async () => {
    const { guest: a } = await joinDemoTable("demo-mesa-1", { deviceId: "dev-a2" });
    const { guest: b } = await joinDemoTable("demo-mesa-1", { deviceId: "dev-b2" });

    await Promise.all([
      claimDemoItem("demo-mesa-1", a.id, "bolon"),
      claimDemoItem("demo-mesa-1", b.id, "bolon"),
    ]);

    const state = await getDemoTableState("demo-mesa-1");
    const owner = state.claims.bolon;
    expect(owner === a.id || owner === b.id).toBe(true);
    expect(state.claimShares?.bolon).toBeUndefined();
  });
});
