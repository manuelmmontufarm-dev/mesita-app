import { describe, expect, it } from "vitest";

import {
  createPendingDemoOps,
  mergeClaimsPreserveLocal,
  mergeDemoStateWithPending,
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

  it("applies pending release over stale server claim", () => {
    const pending = createPendingDemoOps();
    pending.claims.set("locro", "release");
    const incoming = { ...base(), claims: { locro: "g1" } };
    const merged = mergeDemoStateWithPending(incoming, pending, "g1");
    expect(merged.claims.locro).toBeUndefined();
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
});
