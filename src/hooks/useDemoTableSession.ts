"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { mapDemoStateToSession } from "@/lib/demo-live-adapter";
import { demoDebug } from "@/lib/demo-debug";
import {
  clearPendingDemoOps,
  createPendingDemoOps,
  deriveVisiblePendingClaims,
  isDemoTableReset,
  mapClaimsFromDemoRaw,
  mergeDemoStateWithPending,
  pruneResolvedPendingClaims,
  type PendingClaimOp,
  type PendingDemoOps,
} from "@/lib/demo-optimistic-merge";
import { emojiForItemName, getDemoLobbyFallback } from "@/lib/demo-restaurant";
import type { DemoTableState } from "@/lib/demo-table-store";
import { shouldApplyDemoVersion } from "@/lib/demo-table-store";
import { isFreshDocumentNavigation } from "@/lib/navigation-kind";
import { clearStoredPaymentForm } from "@/lib/guest-billing/payment-form-storage";
import type {
  BillItem,
  Claims,
  RestaurantConfig,
  TableMember,
  TablePaymentSummary,
} from "@/lib/guest-billing";
import {
  guestAvatarHue,
  guestLabel,
  initialsFor,
  NAME_PILL_MAX,
  normalizeMemberName,
  personNumberFromLabel,
} from "@/lib/guest-billing/split-math";
import { IVA_RATE, PROPINA_RATE } from "@/lib/constants/ecuador-tax";

import type {
  GuestSessionStatus,
  LiveSessionActions,
  TableSessionState,
} from "./useLiveTableSession";

/** Tab-scoped — each browser tab is a separate demo guest. */
const SESSION_KEY = (token: string) => `mesita:demo-guest:${token}`;
const ENTERED_KEY = (token: string) => `mesita:demo-entered:${token}`;
const RESET_SEQ_KEY = (token: string) => `mesita:demo-reset-seq:${token}`;
/** Device-scoped (NOT token-scoped) — survives nav/refresh/QR. Idempotency key for join. */
const DEVICE_ID_KEY = "mesita:device-id";

/** Live sync every 500ms — version guard prevents stale overwrites. */
const SYNC_INTERVAL_MS = 500;

export interface UseDemoTableSessionResult {
  state: TableSessionState | null;
  guestSessionId: string | null;
  yourDisplayName: string;
  loading: boolean;
  error: string | null;
  items: BillItem[];
  members: TableMember[];
  config: RestaurantConfig;
  claims: Claims;
  paidItemIds: string[];
  people: number;
  version: number;
  billId: string | null;
  liveSession: LiveSessionActions | null;
  resetDemo: () => Promise<void>;
  payDemo: (body: {
    guestName: string;
    /** Live form-state typed name — wins over server-derived guestName when set. */
    typedName?: string;
    mode: "item" | "equal" | "todo";
    amount: number;
    subtotal: number;
    iva: number;
    service: number;
    tip: number;
    itemIds: string[];
    itemUnits?: Record<string, number>;
    equalPeople?: number;
    method: string;
  }) => Promise<void>;
  retry: () => void;
  resetSeq: number;
  paidSummaries: TablePaymentSummary[];
  /** Cumulative partial item payments from demo store. */
  itemPaidUnits: Readonly<Record<string, number>>;
  /** Number of payment transactions on the table. */
  paymentCount: number;
  /** Bumps on optimistic local patches — keeps flow claims in sync before server version. */
  syncRevision: number;
  /** Item ids with in-flight claim/release on this device — show loading until server confirms. */
  pendingClaims: Readonly<Record<string, PendingClaimOp>>;
  isDemo: true;
  sseConnected: boolean;
  /** User tapped "Entrar a la mesa" (or returning with that consent saved). */
  hasEntered: boolean;
  /** Client hydrated sessionStorage — avoid flash of bill before lobby. */
  hydrated: boolean;
  entering: boolean;
  enterTable: () => Promise<void>;
  lobby: {
    restaurantName: string;
    tagline: string;
    table: string;
    city: string;
  };
}

function mapDemoItems(raw: DemoTableState): BillItem[] {
  return raw.items.map((it) => ({
    id: it.id,
    name: it.name,
    qty: it.qty,
    unitPrice: it.unitPrice,
    emoji: it.emoji || emojiForItemName(it.name),
  }));
}

function buildDemoRoster(
  raw: DemoTableState | null,
  youId: string | null,
): TableMember[] {
  if (!raw) return [];
  const byId = new Map<string, TableMember>();

  for (const g of raw.guests) {
    const name = normalizeMemberName(g.name, g.label);
    byId.set(g.id, {
      id: g.id,
      name,
      seatLabel: g.label,
      initials: initialsFor(name),
      hue: g.hue,
      isYou: g.id === youId,
    });
  }

  for (const guestId of Object.values(raw.claims)) {
    if (!guestId || byId.has(guestId)) continue;
    const guest = raw.guests.find((g) => g.id === guestId);
    const slot =
      personNumberFromLabel(guest?.label) ??
      personNumberFromLabel(guest?.name) ??
      byId.size + 1;
    const label = guest?.label || guestLabel(slot);
    const name = normalizeMemberName(guest?.name, label);
    byId.set(guestId, {
      id: guestId,
      name,
      seatLabel: label,
      initials: initialsFor(name),
      hue: guest?.hue ?? guestAvatarHue(slot - 1),
      isYou: guestId === youId,
    });
  }

  return Array.from(byId.values());
}

function mapPaidSummaries(raw: DemoTableState | null): TablePaymentSummary[] {
  if (!raw) return [];
  return raw.payments.map((p) => {
    const guest = raw.guests.find((g) => g.id === p.guestId);
    return {
      guestId: p.guestId,
      guestName: normalizeMemberName(
        p.guestName,
        guest?.label || guest?.name || "Persona",
      ),
      amount: p.amount,
      method: p.method,
      tip: p.tip,
      mode: p.mode,
      createdAt: p.createdAt,
      itemCount: p.itemIds?.length ?? 0,
      subtotal: p.subtotal,
      itemIds: p.itemIds?.length ? [...p.itemIds] : undefined,
    };
  });
}

function readStoredGuestId(token: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem(SESSION_KEY(token)) ?? undefined;
}

function writeStoredGuestId(token: string, guestId: string): void {
  sessionStorage.setItem(SESSION_KEY(token), guestId);
}

function clearStoredGuestId(token: string): void {
  sessionStorage.removeItem(SESSION_KEY(token));
}

function readStoredEntered(token: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(ENTERED_KEY(token)) === "1";
}

function writeStoredEntered(token: string): void {
  sessionStorage.setItem(ENTERED_KEY(token), "1");
}

function clearStoredEntered(token: string): void {
  sessionStorage.removeItem(ENTERED_KEY(token));
}

function readStoredResetSeq(token: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = sessionStorage.getItem(RESET_SEQ_KEY(token));
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function writeStoredResetSeq(token: string, resetSeq: number): void {
  sessionStorage.setItem(RESET_SEQ_KEY(token), String(resetSeq));
}

function clearStoredResetSeq(token: string): void {
  sessionStorage.removeItem(RESET_SEQ_KEY(token));
}

/** Stable per-browser id in localStorage — same across tabs/refresh/QR re-scan. */
function getOrCreateDeviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** True when the server wiped the table (reset) — not a normal sync tick. */
function isRemoteTableReset(
  demo: DemoTableState,
  guestId: string | null,
  lastResetSeq: number | undefined,
): boolean {
  if (guestId == null || lastResetSeq === undefined) return false;
  if (demo.resetSeq <= lastResetSeq) return false;
  return !demo.guests.some((g) => g.id === guestId);
}

async function postDemo<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/demo/table/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (res.status === 409) {
    throw new Error("SESSION_EXPIRED");
  }
  if (!res.ok || !payload.success) {
    throw new Error(payload.error ?? "Demo session action failed");
  }
  return payload.data as T;
}

const DEMO_STATUS_MAP: Record<GuestSessionStatus, string> = {
  SELECTING: "selecting",
  REVIEWING: "reviewing",
  IN_PAYMENT: "in_payment",
  PAID: "paid",
  LEFT: "selecting",
};

export function useDemoTableSession(token: string): UseDemoTableSessionResult {
  const [raw, setRaw] = useState<DemoTableState | null>(null);
  const [state, setState] = useState<TableSessionState | null>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [entering, setEntering] = useState(false);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const [syncRevision, setSyncRevision] = useState(0);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last typed name not yet POSTed (paired with renameTimer). */
  const pendingRename = useRef<string | null>(null);
  const lastVersion = useRef<number | undefined>(undefined);
  const lastResetSeq = useRef<number | undefined>(undefined);
  const guestSessionIdRef = useRef<string | null>(null);
  const rejoining = useRef(false);
  /** True while a pay POST is in flight — blocks the silent heal re-join. */
  const paying = useRef(false);
  const pendingOps = useRef<PendingDemoOps>(createPendingDemoOps());
  const actionChain = useRef<Promise<unknown>>(Promise.resolve());
  const joinTableRef = useRef<
    | ((opts?: { guestId?: string; clearStored?: boolean }) => Promise<string | null>)
    | null
  >(null);

  guestSessionIdRef.current = guestSessionId;

  const patchLocalDemo = useCallback((patch: (demo: DemoTableState) => DemoTableState) => {
    setRaw((prev) => {
      if (!prev) return prev;
      const next = patch(prev);
      setState(mapDemoStateToSession(next));
      setSyncRevision((n) => n + 1);
      return next;
    });
  }, []);

  const exitToLobby = useCallback(() => {
    clearStoredGuestId(token);
    clearStoredEntered(token);
    clearStoredResetSeq(token);
    clearStoredPaymentForm(token);
    setHasEntered(false);
    setGuestSessionId(null);
    setRaw(null);
    setState(null);
    setError(null);
    setLoading(false);
    setEntering(false);
    lastVersion.current = undefined;
    lastResetSeq.current = undefined;
    pendingOps.current = createPendingDemoOps();
    actionChain.current = Promise.resolve();
    demoDebug("lobby", "back to entry screen");
  }, [token]);

  const applyDemo = useCallback((demo: DemoTableState, opts?: { force?: boolean; source?: string }) => {
    const incoming = demo.version;
    const last = lastVersion.current;
    if (!opts?.force && !shouldApplyDemoVersion(incoming, last)) {
      demoDebug("sync:skip", `ignored stale snapshot from ${opts?.source ?? "?"}`, {
        incoming,
        last,
      });
      return;
    }
    lastVersion.current = Math.max(last ?? 0, incoming);
    demoDebug("sync:apply", `v${incoming} from ${opts?.source ?? "?"}`, {
      guests: demo.guests.map((g) => ({ id: g.id.slice(0, 8), name: g.name, label: g.label })),
      resetSeq: demo.resetSeq,
    });
    setRaw(demo);
    setState(mapDemoStateToSession(demo));
  }, []);

  /** Apply server snapshot + detect real table reset (guest gone), never on version-only sync. */
  const ingestDemoState = useCallback(
    (demo: DemoTableState, opts?: { force?: boolean; source?: string }) => {
      const gid = guestSessionIdRef.current;
      const prevReset = lastResetSeq.current ?? readStoredResetSeq(token);
      const tableReset = isDemoTableReset(demo.resetSeq, prevReset);

      if (
        readStoredEntered(token) &&
        isRemoteTableReset(demo, gid, prevReset)
      ) {
        demoDebug("lobby", "remote reset — guest removed", {
          resetSeq: demo.resetSeq,
          prevReset,
        });
        clearPendingDemoOps(pendingOps.current);
        exitToLobby();
        return;
      }

      if (tableReset) {
        clearPendingDemoOps(pendingOps.current);
        pendingRename.current = null;
        if (renameTimer.current) clearTimeout(renameTimer.current);
        demoDebug("sync:reset", `resetSeq ${prevReset} → ${demo.resetSeq}`);
      }

      if (gid) {
        if (pruneResolvedPendingClaims(demo, pendingOps.current, gid)) {
          setSyncRevision((n) => n + 1);
        }
      }

      const pending = pendingOps.current;
      const hasPending =
        pending.claims.size > 0 || pending.pendingNames.size > 0;
      const merged =
        opts?.force || !hasPending || tableReset
          ? demo
          : mergeDemoStateWithPending(demo, pending, gid, {
              afterReset: tableReset,
            });

      applyDemo(merged, opts);

      if (prevReset === undefined || demo.resetSeq >= prevReset) {
        lastResetSeq.current = demo.resetSeq;
        writeStoredResetSeq(token, demo.resetSeq);
      }

      // Lost-update heal — skip while claims/rename/pay in flight.
      if (
        readStoredEntered(token) &&
        gid &&
        demo.resetSeq === (prevReset ?? demo.resetSeq) &&
        !demo.guests.some((g) => g.id === gid) &&
        !rejoining.current &&
        !paying.current &&
        !hasPending
      ) {
        demoDebug("rejoin", "ghost detected — silent re-join via deviceId");
        void joinTableRef.current?.().catch(() => {
          /* swallow — next sync will retry */
        });
      }
    },
    [applyDemo, exitToLobby, token],
  );

  const joinTable = useCallback(
    async (opts?: { guestId?: string; clearStored?: boolean }) => {
      if (rejoining.current) return null;
      rejoining.current = true;
      try {
        if (opts?.clearStored) clearStoredGuestId(token);
        const savedId = opts?.guestId ?? readStoredGuestId(token);
        const deviceId = getOrCreateDeviceId();
        try {
          const { state: joined, guest } = await postDemo<{
            state: DemoTableState;
            guest: { id: string };
          }>(token, { action: "join", guestId: savedId, deviceId });
          writeStoredGuestId(token, guest.id);
          setGuestSessionId(guest.id);
          ingestDemoState(joined, { force: true, source: "join" });
          lastResetSeq.current = joined.resetSeq;
          writeStoredResetSeq(token, joined.resetSeq);
          demoDebug("join", `guest ${guest.id.slice(0, 8)}`, {
            label: joined.guests.find((g) => g.id === guest.id)?.label,
            resetSeq: joined.resetSeq,
          });
          return guest.id;
        } catch (err) {
          if (savedId && err instanceof Error && err.message === "SESSION_EXPIRED") {
            clearStoredGuestId(token);
            demoDebug("join", "stale guestId — fresh join", { savedId: savedId.slice(0, 8) });
            const { state: joined, guest } = await postDemo<{
              state: DemoTableState;
              guest: { id: string };
            }>(token, { action: "join", deviceId });
            writeStoredGuestId(token, guest.id);
            setGuestSessionId(guest.id);
            ingestDemoState(joined, { force: true, source: "join-fresh" });
            lastResetSeq.current = joined.resetSeq;
            writeStoredResetSeq(token, joined.resetSeq);
            return guest.id;
          }
          throw err;
        }
      } finally {
        rejoining.current = false;
      }
    },
    [token, ingestDemoState],
  );

  joinTableRef.current = joinTable;

  useLayoutEffect(() => {
    if (isFreshDocumentNavigation()) {
      clearStoredGuestId(token);
      clearStoredEntered(token);
      clearStoredResetSeq(token);
      demoDebug("lobby", "fresh visit — require entry screen");
    }
    const storedReset = readStoredResetSeq(token);
    if (storedReset !== undefined) {
      lastResetSeq.current = storedReset;
    }
    setHasEntered(readStoredEntered(token));
    setHydrated(true);
  }, [token]);

  /** Re-join only when user already consented (refresh mid-session). */
  useEffect(() => {
    if (!hydrated) return;
    if (!readStoredEntered(token)) {
      setHasEntered(false);
      setLoading(false);
      return;
    }
    if (guestSessionId) {
      setHasEntered(true);
      return;
    }

    let cancelled = false;
    setHasEntered(true);
    setLoading(true);
    setError(null);

    joinTable()
      .then(() => {
        if (!cancelled) {
          setLoading(false);
          setEntering(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        clearStoredEntered(token);
        setHasEntered(false);
        setError(err instanceof Error ? err.message : "No pudimos entrar a la mesa.");
        setLoading(false);
        setEntering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, token, joinAttempt, joinTable, guestSessionId]);

  const enterTable = useCallback(async () => {
    if (readStoredEntered(token) && guestSessionId) return;
    setEntering(true);
    setError(null);
    writeStoredEntered(token);
    setHasEntered(true);
    setJoinAttempt((n) => n + 1);
  }, [guestSessionId, token]);

  useEffect(() => {
    if (!guestSessionId) return;

    let closed = false;
    const events = new EventSource(
      `/api/demo/table/${encodeURIComponent(token)}/events`,
    );

    const onOpen = () => {
      if (!closed) setSseConnected(true);
    };
    const onState = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as DemoTableState;
        ingestDemoState(next, { source: "sse" });
        demoDebug("sync:sse", `event v${next.version}`);
      } catch (err) {
        console.error(err);
      }
    };
    const onError = () => {
      setSseConnected(false);
    };

    events.addEventListener("open", onOpen);
    events.addEventListener("state", onState);
    events.addEventListener("error", onError);

    return () => {
      closed = true;
      events.removeEventListener("open", onOpen);
      events.removeEventListener("state", onState);
      events.removeEventListener("error", onError);
      events.close();
      setSseConnected(false);
    };
  }, [token, guestSessionId, ingestDemoState]);

  /** Poll every 500ms for continuous multi-device sync. */
  useEffect(() => {
    if (!guestSessionId) return;
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      try {
        const res = await fetch(`/api/demo/table/${encodeURIComponent(token)}`);
        const payload = await res.json();
        if (!cancelled && res.ok && payload.success) {
          ingestDemoState(payload.data as DemoTableState, { source: "poll" });
          demoDebug("sync:poll", `v${(payload.data as DemoTableState).version}`);
        }
      } catch (err) {
        demoDebug("error", "poll failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, guestSessionId, ingestDemoState]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const data = await postDemo<DemoTableState | { state: DemoTableState }>(token, body);
        const next =
          data && typeof data === "object" && "state" in data
            ? (data as { state: DemoTableState }).state
            : (data as DemoTableState);
        ingestDemoState(next, { force: true, source: "action" });
        return next;
      } catch (err) {
        if (err instanceof Error && err.message === "SESSION_EXPIRED") {
          demoDebug("join", "409 on action — try recover join");
          try {
            await joinTable();
            return;
          } catch {
            exitToLobby();
          }
        }
        throw err;
      }
    },
    [token, ingestDemoState, joinTable, exitToLobby],
  );

  const enqueueAction = useCallback(
    (body: Record<string, unknown>) => {
      const run = actionChain.current.then(() => postAction(body));
      actionChain.current = run.catch(() => undefined);
      return run;
    },
    [postAction],
  );

  const onRename = useCallback(
    (name: string) => {
      if (!guestSessionId) return;
      const trimmed = name.trim().slice(0, NAME_PILL_MAX);
      const display =
        trimmed && trimmed.toLowerCase() !== "invitado" ? trimmed : null;
      pendingRename.current = trimmed;
      if (display) {
        pendingOps.current.pendingNames.set(guestSessionId, display);
      } else {
        pendingOps.current.pendingNames.delete(guestSessionId);
      }
      patchLocalDemo((prev) => ({
        ...prev,
        guests: prev.guests.map((g) =>
          g.id === guestSessionId
            ? {
                ...g,
                name: display ?? g.label,
                updatedAt: new Date().toISOString(),
              }
            : g,
        ),
      }));
      if (renameTimer.current) clearTimeout(renameTimer.current);
      renameTimer.current = setTimeout(() => {
        const toSend = pendingRename.current;
        if (toSend == null) return;
        pendingRename.current = null;
        void enqueueAction({ action: "rename", guestId: guestSessionId, name: toSend })
          .then(() => {
            pendingOps.current.pendingNames.delete(guestSessionId);
          })
          .catch(console.error);
      }, 80);
    },
    [guestSessionId, enqueueAction, patchLocalDemo],
  );

  /** Force-send any pending rename synchronously before a critical action (pay). */
  const flushRename = useCallback(async () => {
    if (renameTimer.current) {
      clearTimeout(renameTimer.current);
      renameTimer.current = null;
    }
    const toSend = pendingRename.current;
    if (toSend == null || !guestSessionId) return;
    pendingRename.current = null;
    try {
      await enqueueAction({ action: "rename", guestId: guestSessionId, name: toSend });
      pendingOps.current.pendingNames.delete(guestSessionId);
    } catch (err) {
      console.error(err);
    }
  }, [guestSessionId, enqueueAction]);

  const onClaim = useCallback(
    (billItemId: string, _units: number) => {
      if (!guestSessionId) return;
      patchLocalDemo((prev) => {
        const claims = { ...prev.claims };
        const op: "claim" | "release" =
          claims[billItemId] === guestSessionId ? "release" : "claim";
        if (op === "release") delete claims[billItemId];
        else claims[billItemId] = guestSessionId;
        pendingOps.current.claims.set(billItemId, op);
        return { ...prev, claims };
      });
      void enqueueAction({ action: "claim", guestId: guestSessionId, itemId: billItemId })
        .then(() => {
          pendingOps.current.claims.delete(billItemId);
        })
        .catch((err) => {
          pendingOps.current.claims.delete(billItemId);
          console.error(err);
        });
    },
    [guestSessionId, enqueueAction, patchLocalDemo],
  );

  const onRelease = useCallback(
    (billItemId: string) => {
      if (!guestSessionId) return;
      patchLocalDemo((prev) => {
        const claims = { ...prev.claims };
        delete claims[billItemId];
        pendingOps.current.claims.set(billItemId, "release");
        return { ...prev, claims };
      });
      void enqueueAction({
        action: "release",
        guestId: guestSessionId,
        itemId: billItemId,
      })
        .then(() => {
          pendingOps.current.claims.delete(billItemId);
        })
        .catch((err) => {
          pendingOps.current.claims.delete(billItemId);
          console.error(err);
        });
    },
    [guestSessionId, enqueueAction, patchLocalDemo],
  );

  const onStatus = useCallback(
    (status: GuestSessionStatus) => {
      if (!guestSessionId) return;
      void postAction({
        action: "status",
        guestId: guestSessionId,
        status: DEMO_STATUS_MAP[status],
      }).catch(console.error);
    },
    [guestSessionId, postAction],
  );

  const liveSession: LiveSessionActions | null = useMemo(
    () =>
      guestSessionId
        ? { guestSessionId, onRename, onClaim, onRelease, onStatus }
        : null,
    [guestSessionId, onRename, onClaim, onRelease, onStatus],
  );

  const resetDemo = useCallback(async () => {
    clearPendingDemoOps(pendingOps.current);
    pendingRename.current = null;
    try {
      await postAction({ action: "reset" });
    } finally {
      exitToLobby();
    }
  }, [postAction, exitToLobby]);

  const payDemo = useCallback(
    async (body: {
      guestName: string;
      typedName?: string;
      mode: "item" | "equal" | "todo";
      amount: number;
      subtotal: number;
      iva: number;
      service: number;
      tip: number;
      itemIds: string[];
      itemUnits?: Record<string, number>;
      equalPeople?: number;
      method: string;
    }) => {
      if (!guestSessionId) return;
      // Flush any pending rename FIRST so the server has the typed name before pay.
      await flushRename();
      // Form-state name wins over server-derived guestName (which can lag mid-typing).
      const typed = body.typedName?.trim();
      const resolvedName = typed && typed.length > 0 ? typed : body.guestName;
      paying.current = true;
      try {
        const { typedName: _typed, ...rest } = body;
        await postAction({
          action: "pay",
          guestId: guestSessionId,
          ...rest,
          guestName: resolvedName,
        });
      } finally {
        paying.current = false;
      }
    },
    [guestSessionId, postAction, flushRename],
  );

  const claims = useMemo(() => (raw ? mapClaimsFromDemoRaw(raw) : {}), [raw]);
  const pendingClaims = useMemo(
    () => deriveVisiblePendingClaims(raw, pendingOps.current, guestSessionId),
    [raw, guestSessionId, syncRevision],
  );
  const paidItemIds = useMemo(
    () => (state ? state.items.filter((i) => i.isPaid).map((i) => i.id) : []),
    [state],
  );
  const items = useMemo(() => (raw ? mapDemoItems(raw) : []), [raw]);
  const members = useMemo(
    () => buildDemoRoster(raw, guestSessionId),
    [raw, guestSessionId],
  );
  const paidSummaries = useMemo(() => mapPaidSummaries(raw), [raw]);
  const itemPaidUnits = useMemo(
    () => raw?.itemPaidUnits ?? {},
    [raw?.itemPaidUnits],
  );
  const paymentCount = raw?.payments.length ?? 0;

  const yourDisplayName = useMemo(() => {
    if (!raw || !guestSessionId) return "";
    const g = raw.guests.find((guest) => guest.id === guestSessionId);
    return g?.name?.trim() && g.name.toLowerCase() !== "invitado"
      ? g.name.trim()
      : g?.label || "";
  }, [raw, guestSessionId]);

  const lobbyFallback = useMemo(() => getDemoLobbyFallback(token), [token]);

  const config: RestaurantConfig = useMemo(
    () => ({
      name: raw?.restaurant.name ?? lobbyFallback.restaurantName,
      tagline: raw?.restaurant.tagline ?? lobbyFallback.tagline,
      table: raw?.table.name ?? lobbyFallback.table,
      city: raw?.restaurant.city ?? lobbyFallback.city,
      currency: "USD",
      ivaRate: IVA_RATE,
      serviceRate: PROPINA_RATE,
      serviceEnabled: true,
      tipPresets: [10, 15, 20],
      defaultTip: 15,
      demoMode: true,
    }),
    [raw, lobbyFallback],
  );

  const lobby = useMemo(
    () => ({
      restaurantName: raw?.restaurant.name ?? lobbyFallback.restaurantName,
      tagline: raw?.restaurant.tagline ?? lobbyFallback.tagline,
      table: raw?.table.name ?? lobbyFallback.table,
      city: raw?.restaurant.city ?? lobbyFallback.city,
    }),
    [raw, lobbyFallback],
  );
  const people = state?.guests.length ?? 1;

  return {
    state,
    guestSessionId,
    yourDisplayName,
    loading,
    error,
    items,
    members,
    config,
    claims,
    pendingClaims,
    paidItemIds,
    people,
    version: state?.version ?? 0,
    billId: "demo-bill",
    liveSession,
    resetDemo,
    payDemo,
    retry: () => setJoinAttempt((n) => n + 1),
    resetSeq: raw?.resetSeq ?? 0,
    paidSummaries,
    itemPaidUnits,
    paymentCount,
    syncRevision,
    isDemo: true,
    sseConnected,
    hasEntered,
    hydrated,
    entering,
    enterTable,
    lobby,
  };
}
