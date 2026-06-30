import { describe, expect, it } from "vitest";

import {
  createPendingDemoOps,
  deriveVisiblePendingClaims,
  mergeClaimsForDisplay,
  mergeClaimsPreserveLocal,
  mapClaimsFromDemoRaw,
  mergeDemoStateWithPending,
  pruneResolvedPendingClaims,
} from "../demo-optimistic-merge";
import type { DemoTableState } from "@/lib/demo-table-store";

const base = (): DemoTableState => ({
  token: "demo",
  stateVersion: 4,
  restaurant: {
    name: "La Doña Pepa",
    tagline: "",
    city: "Quito",
    ivaRate: 0.15,
    serviceRate: 0.1,
    serviceEnabled: true,
  },
  table: { name: "12" },
  items: [],
  guests: [
    {
      id: "g1",
      label: "Persona 1",
      name: "Persona 1",
      hue: 152,
      status: "selecting",
      joinedAt: "",
      updatedAt: "",
    },
  ],
  claims: {},
  paidItemIds: [],
  itemPaidUnits: {},
  payments: [],
  nextGuestNumber: 2,
  resetSeq: 0,
  version: 5,
  updatedAt: "",
});

describe("mergeDemoStateWithPending", () => {
  it("preserves optimistic claim when server snapshot lacks it", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "claim");
    const incoming = base();
    const merged = mergeDemoStateWithPending(incoming, pending, "g1");
    expect(merged.claims.locro).toBe("g1");
  });

  it("preserves pending rename when server still has Persona label", () => {
    const pending = createPendingDemoOps();
    pending.pendingNames.set("g1", "Manuel");
    const merged = mergeDemoStateWithPending(base(), pending, "g1");
    expect(merged.guests[0]?.name).toBe("Manuel");
  });

  it("does not replay pending claims after table reset", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "claim");
    const incoming = base();
    incoming.resetSeq = 2;
    incoming.claims = {};
    const merged = mergeDemoStateWithPending(incoming, pending, "g1", {
      afterReset: true,
    });
    expect(merged.claims.locro).toBeUndefined();
  });

  it("keeps second pending claim when first claim already on server snapshot", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "claim");
    pending.claims.set("ceviche", "claim");
    const incoming = base();
    incoming.claims.locro = "g1";
    const merged = mergeDemoStateWithPending(incoming, pending, "g1");
    expect(merged.claims.locro).toBe("g1");
    expect(merged.claims.ceviche).toBe("g1");
  });
});

describe("pruneResolvedPendingClaims", () => {
  it("clears claim pending once server owner matches", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "claim");
    const demo = base();
    demo.claims.locro = "g1";
    expect(pruneResolvedPendingClaims(demo, pending, "g1")).toBe(true);
    expect(pending.claims.has("locro")).toBe(false);
  });
});

describe("deriveVisiblePendingClaims", () => {
  it("hides pending once server already reflects claim", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "claim");
    const demo = base();
    demo.claims.locro = "g1";
    expect(deriveVisiblePendingClaims(demo, pending, "g1")).toEqual({});
  });

  it("shows pending while server lacks claim", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "claim");
    expect(deriveVisiblePendingClaims(base(), pending, "g1")).toEqual({
      locro: "claim",
    });
  });
});

describe("mergeClaimsPreserveLocal", () => {
  it("keeps local selection for you until server confirms", () => {
    const server = {};
    const local = { locro: { g1: 1 } };
    const merged = mergeClaimsPreserveLocal(server, local, "g1");
    expect(merged.locro?.g1).toBe(1);
  });

  it("prefers server once it confirms the claim", () => {
    const server = { locro: { g1: 1 } };
    const local = { locro: { g1: 1 } };
    const merged = mergeClaimsPreserveLocal(server, local, "g1");
    expect(merged.locro?.g1).toBe(1);
  });

  it("drops stale local claims when trustLocal is false (post-reset)", () => {
    const server = {};
    const local = { locro: { g1: 1 } };
    const merged = mergeClaimsPreserveLocal(server, local, "g1", {
      trustLocal: false,
    });
    expect(merged.locro).toBeUndefined();
  });
});

describe("mergeClaimsForDisplay", () => {
  it("keeps local multi-guest split when server only has single owner", () => {
    const server = { locro: { g1: 1 } };
    const local = { locro: { g1: 0.5, g2: 0.5 } };
    const merged = mergeClaimsForDisplay(server, local, "g1");
    expect(merged.locro).toEqual({ g1: 0.5, g2: 0.5 });
  });

  it("prefers server multi-guest split when local only has your share", () => {
    const server = { locro: { g1: 0.5, g2: 0.5 } };
    const local = { locro: { g1: 0.5 } };
    const merged = mergeClaimsForDisplay(server, local, "g1");
    expect(merged.locro).toEqual({ g1: 0.5, g2: 0.5 });
  });

  it("drops ghost local split when item is paid + cleared on the server (R5)", () => {
    const server = {}; // server cleared the claim after the pay went through
    const local = { locro: { g1: 0.5, g2: 0.5 } }; // stale optimistic split
    const merged = mergeClaimsForDisplay(server, local, "g1", {
      paidItemIds: ["locro"],
    });
    expect(merged.locro).toBeUndefined();
  });

  it("keeps split visible while server still has the claim (paid mid-flight)", () => {
    const server = { locro: { g1: 0.5, g2: 0.5 } };
    const local = { locro: { g1: 0.5, g2: 0.5 } };
    const merged = mergeClaimsForDisplay(server, local, "g1", {
      paidItemIds: ["locro"],
    });
    // Server still has the split → don't drop it even if it's listed paid.
    expect(merged.locro).toEqual({ g1: 0.5, g2: 0.5 });
  });
});

describe("mapClaimsFromDemoRaw", () => {
  it("prefers claimShares over single-owner claims", () => {
    const raw = {
      claims: { ceviche: "g1" },
      claimShares: { ceviche: { g1: 0.5, g2: 0.5 } },
    } as unknown as DemoTableState;
    expect(mapClaimsFromDemoRaw(raw).ceviche).toEqual({ g1: 0.5, g2: 0.5 });
  });
});
