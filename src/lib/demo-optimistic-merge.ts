import type { DemoTableState } from "@/lib/demo-table-store";
import type { Claims, MemberId } from "@/lib/guest-billing/types";

/** Demo store: itemId → single owner guestId. */
export function mapClaimsFromDemoRaw(raw: DemoTableState): Claims {
  const claims: Claims = {};
  for (const [itemId, guestId] of Object.entries(raw.claims)) {
    if (!guestId) continue;
    claims[itemId] = { [guestId]: 1 };
  }
  return claims;
}

export type PendingClaimOp = "claim" | "release";

export interface PendingDemoOps {
  claims: Map<string, PendingClaimOp>;
  /** Guest id → name not yet confirmed by server. */
  pendingNames: Map<string, string>;
}

export function createPendingDemoOps(): PendingDemoOps {
  return { claims: new Map(), pendingNames: new Map() };
}

/**
 * Merge an incoming server snapshot with in-flight optimistic ops so poll/SSE
 * cannot roll back a claim or rename that hasn't round-tripped yet.
 */
export function mergeDemoStateWithPending(
  incoming: DemoTableState,
  pending: PendingDemoOps,
  guestId: string | null,
): DemoTableState {
  if (pending.claims.size === 0 && pending.pendingNames.size === 0) {
    return incoming;
  }

  const merged: DemoTableState = {
    ...incoming,
    claims: { ...incoming.claims },
    guests: incoming.guests.map((g) => ({ ...g })),
  };

  if (guestId) {
    for (const [itemId, op] of pending.claims) {
      if (op === "claim") merged.claims[itemId] = guestId;
      else delete merged.claims[itemId];
    }

    const pendingName = pending.pendingNames.get(guestId);
    if (pendingName != null) {
      const idx = merged.guests.findIndex((g) => g.id === guestId);
      if (idx >= 0) {
        merged.guests[idx] = {
          ...merged.guests[idx]!,
          name: pendingName,
        };
      }
    }
  }

  for (const [gid, name] of pending.pendingNames) {
    if (gid === guestId) continue;
    const idx = merged.guests.findIndex((g) => g.id === gid);
    if (idx >= 0) {
      merged.guests[idx] = { ...merged.guests[idx]!, name };
    }
  }

  return merged;
}

/** Keep local optimistic claims for `youId` until the server confirms them. */
export function mergeClaimsPreserveLocal(
  server: Claims,
  local: Claims,
  youId: MemberId,
): Claims {
  const merged: Claims = {};
  const itemIds = new Set([...Object.keys(server), ...Object.keys(local)]);

  for (const itemId of itemIds) {
    const serverMap = server[itemId] ?? {};
    const localMap = local[itemId] ?? {};
    const localYours = localMap[youId] ?? 0;
    const serverYours = serverMap[youId] ?? 0;

    if (localYours > 0.001 && serverYours <= 0.001) {
      merged[itemId] = { ...serverMap, [youId]: localYours };
    } else {
      merged[itemId] = { ...serverMap };
    }
  }

  return merged;
}
