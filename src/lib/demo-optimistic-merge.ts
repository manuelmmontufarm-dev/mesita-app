import type { DemoTableState } from "@/lib/demo-table-store";
import type { Claims, MemberId } from "@/lib/guest-billing/types";

/** Demo store: itemId → single owner guestId, or claimShares for splits. */
export function mapClaimsFromDemoRaw(raw: DemoTableState): Claims {
  const claims: Claims = {};
  for (const [itemId, unitsMap] of Object.entries(raw.claimShares ?? {})) {
    const clean: Record<string, number> = {};
    for (const [guestId, units] of Object.entries(unitsMap)) {
      if (units > 0.001) clean[guestId] = units;
    }
    if (Object.keys(clean).length > 0) claims[itemId] = clean;
  }
  for (const [itemId, guestId] of Object.entries(raw.claims)) {
    if (claims[itemId]) continue;
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

export function clearPendingDemoOps(pending: PendingDemoOps): void {
  pending.claims.clear();
  pending.pendingNames.clear();
}

/** Drop pending ops the server snapshot already reflects. Returns true if anything was pruned. */
export function pruneResolvedPendingClaims(
  demo: DemoTableState,
  pending: PendingDemoOps,
  guestId: string | null,
): boolean {
  if (!guestId) return false;
  let changed = false;
  for (const [itemId, op] of [...pending.claims.entries()]) {
    const owner = demo.claims[itemId];
    if (op === "claim" && owner === guestId) {
      pending.claims.delete(itemId);
      changed = true;
    } else if (op === "release" && owner !== guestId) {
      pending.claims.delete(itemId);
      changed = true;
    }
  }
  return changed;
}

/** Pending claim/release ops still waiting for the server to match (drives loading UI). */
export function deriveVisiblePendingClaims(
  raw: DemoTableState | null,
  pending: PendingDemoOps,
  guestId: string | null,
): Record<string, PendingClaimOp> {
  const out: Record<string, PendingClaimOp> = {};
  if (!guestId) return out;
  for (const [itemId, op] of pending.claims) {
    if (!raw) {
      out[itemId] = op;
      continue;
    }
    const owner = raw.claims[itemId];
    const resolved =
      (op === "claim" && owner === guestId) ||
      (op === "release" && owner !== guestId);
    if (!resolved) out[itemId] = op;
  }
  return out;
}

/** True when the server wiped the table — never replay stale optimistic ops. */
export function isDemoTableReset(
  incomingResetSeq: number,
  lastResetSeq: number | undefined,
): boolean {
  if (lastResetSeq === undefined) return false;
  return incomingResetSeq > lastResetSeq;
}

/**
 * Merge an incoming server snapshot with in-flight optimistic ops so poll/SSE
 * cannot roll back a claim or rename that hasn't round-tripped yet.
 * Skipped entirely after a table reset (resetSeq bump).
 */
export function mergeDemoStateWithPending(
  incoming: DemoTableState,
  pending: PendingDemoOps,
  guestId: string | null,
  opts?: { afterReset?: boolean },
): DemoTableState {
  if (opts?.afterReset) return incoming;
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
  opts?: { trustLocal?: boolean },
): Claims {
  if (opts?.trustLocal === false) return { ...serverMapClone(server) };
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

function serverMapClone(server: Claims): Claims {
  const out: Claims = {};
  for (const [itemId, map] of Object.entries(server)) {
    out[itemId] = { ...map };
  }
  return out;
}

/** Bill UI: server demo claims are single-owner; keep local multi-guest splits visible. */
export function mergeClaimsForDisplay(
  server: Claims,
  local: Claims,
  youId: MemberId,
): Claims {
  const merged = mergeClaimsPreserveLocal(server, local, youId, {
    trustLocal: true,
  });
  for (const [itemId, localMap] of Object.entries(local)) {
    const claimants = Object.values(localMap).filter((u) => u > 0.001).length;
    if (claimants > 1) {
      merged[itemId] = { ...localMap };
    }
  }
  for (const [itemId, serverMap] of Object.entries(server)) {
    const claimants = Object.values(serverMap).filter((u) => u > 0.001).length;
    if (claimants > 1) {
      merged[itemId] = { ...serverMap };
    }
  }
  return merged;
}
