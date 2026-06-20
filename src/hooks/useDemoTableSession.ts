"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mapDemoStateToSession } from "@/lib/demo-live-adapter";
import { emojiForItemName } from "@/lib/demo-restaurant";
import type { DemoTableState } from "@/lib/demo-table-store";
import { shouldApplyDemoVersion } from "@/lib/demo-table-store";
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
} from "@/lib/guest-billing/split-math";
import { IVA_RATE, PROPINA_RATE } from "@/lib/constants/ecuador-tax";

import type {
  GuestSessionStatus,
  LiveSessionActions,
  TableSessionState,
} from "./useLiveTableSession";

/** Tab-scoped — each browser tab is a separate demo guest. */
const SESSION_KEY = (token: string) => `mesita:demo-guest:${token}`;

/** Slow fallback when SSE drops (SSE is primary). */
const POLL_FALLBACK_MS = 8_000;

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
    mode: "item" | "equal" | "todo";
    amount: number;
    subtotal: number;
    iva: number;
    service: number;
    tip: number;
    itemIds: string[];
    equalPeople?: number;
    method: string;
  }) => Promise<void>;
  retry: () => void;
  resetSeq: number;
  paidSummaries: TablePaymentSummary[];
  isDemo: true;
}

function mapClaimsFromDemo(state: TableSessionState): Claims {
  const claims: Claims = {};
  for (const claim of state.claims) {
    if (claim.status !== "ACTIVE") continue;
    const itemMap = { ...(claims[claim.billItemId] ?? {}) };
    itemMap[claim.guestSessionId] = claim.units;
    claims[claim.billItemId] = itemMap;
  }
  return claims;
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
    const name = g.name?.trim() || g.label;
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
    const name =
      guest?.name?.trim() || guest?.label || guestLabel(byId.size + 1);
    byId.set(guestId, {
      id: guestId,
      name,
      seatLabel: guest?.label,
      initials: initialsFor(name),
      hue: guest?.hue ?? guestAvatarHue(byId.size),
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
      guestName:
        p.guestName?.trim() ||
        guest?.name?.trim() ||
        guest?.label ||
        "Persona",
      amount: p.amount,
      method: p.method,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVersion = useRef<number | undefined>(undefined);
  const lastResetSeq = useRef<number | undefined>(undefined);
  const rejoining = useRef(false);

  const applyDemo = useCallback((demo: DemoTableState, opts?: { force?: boolean }) => {
    if (!opts?.force && !shouldApplyDemoVersion(demo.version, lastVersion.current)) {
      return;
    }
    lastVersion.current = Math.max(lastVersion.current ?? 0, demo.version);
    setRaw(demo);
    setState(mapDemoStateToSession(demo));
  }, []);

  const joinTable = useCallback(
    async (opts?: { guestId?: string; clearStored?: boolean }) => {
      if (rejoining.current) return null;
      rejoining.current = true;
      try {
        if (opts?.clearStored) clearStoredGuestId(token);
        const savedId = opts?.guestId ?? readStoredGuestId(token);
        const { state: joined, guest } = await postDemo<{
          state: DemoTableState;
          guest: { id: string };
        }>(token, { action: "join", guestId: savedId });
        writeStoredGuestId(token, guest.id);
        setGuestSessionId(guest.id);
        applyDemo(joined, { force: true });
        lastResetSeq.current = joined.resetSeq;
        return guest.id;
      } finally {
        rejoining.current = false;
      }
    },
    [token, applyDemo],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    joinTable()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "No pudimos abrir la demo.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, joinAttempt, joinTable]);

  /** After table reset or expired guest — single re-join (avoids double-join on reset). */
  useEffect(() => {
    if (!raw) return;

    if (lastResetSeq.current === undefined) {
      lastResetSeq.current = raw.resetSeq;
    }

    const resetChanged = raw.resetSeq !== lastResetSeq.current;
    const guestMissing =
      guestSessionId != null && !raw.guests.some((g) => g.id === guestSessionId);

    if (!resetChanged && !guestMissing) return;
    if (rejoining.current) return;

    if (resetChanged) {
      lastResetSeq.current = raw.resetSeq;
      lastVersion.current = undefined;
    }

    clearStoredGuestId(token);
    void joinTable({ clearStored: true });
  }, [raw, raw?.resetSeq, raw?.guests, guestSessionId, joinTable, token]);

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
        applyDemo(next);
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
  }, [token, guestSessionId, applyDemo]);

  /** Fallback poll only when SSE is disconnected — avoids double-sync lag. */
  useEffect(() => {
    if (!guestSessionId || sseConnected) return;
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      try {
        const res = await fetch(`/api/demo/table/${encodeURIComponent(token)}`);
        const payload = await res.json();
        if (!cancelled && res.ok && payload.success) {
          applyDemo(payload.data as DemoTableState);
        }
      } catch {
        /* soft fail */
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_FALLBACK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, guestSessionId, sseConnected, applyDemo]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const data = await postDemo<DemoTableState | { state: DemoTableState }>(token, body);
        const next =
          data && typeof data === "object" && "state" in data
            ? (data as { state: DemoTableState }).state
            : (data as DemoTableState);
        applyDemo(next, { force: true });
        return next;
      } catch (err) {
        if (err instanceof Error && err.message === "SESSION_EXPIRED") {
          await joinTable({ clearStored: true });
        }
        throw err;
      }
    },
    [token, applyDemo, joinTable],
  );

  const onRename = useCallback(
    (name: string) => {
      if (!guestSessionId) return;
      const trimmed = name.trim().slice(0, NAME_PILL_MAX);
      if (renameTimer.current) clearTimeout(renameTimer.current);
      renameTimer.current = setTimeout(() => {
        void postAction({ action: "rename", guestId: guestSessionId, name: trimmed }).catch(
          console.error,
        );
      }, 400);
    },
    [guestSessionId, postAction],
  );

  const onClaim = useCallback(
    (billItemId: string, _units: number) => {
      if (!guestSessionId) return;
      void postAction({ action: "claim", guestId: guestSessionId, itemId: billItemId }).catch(
        console.error,
      );
    },
    [guestSessionId, postAction],
  );

  const onRelease = useCallback(
    (billItemId: string) => {
      if (!guestSessionId) return;
      void postAction({
        action: "release",
        guestId: guestSessionId,
        itemId: billItemId,
      }).catch(console.error);
    },
    [guestSessionId, postAction],
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
    await postAction({ action: "reset" });
  }, [postAction]);

  const payDemo = useCallback(
    async (body: {
      guestName: string;
      mode: "item" | "equal" | "todo";
      amount: number;
      subtotal: number;
      iva: number;
      service: number;
      tip: number;
      itemIds: string[];
      equalPeople?: number;
      method: string;
    }) => {
      if (!guestSessionId) return;
      await postAction({ action: "pay", guestId: guestSessionId, ...body });
    },
    [guestSessionId, postAction],
  );

  const claims = useMemo(() => (state ? mapClaimsFromDemo(state) : {}), [state]);
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

  const yourDisplayName = useMemo(() => {
    if (!raw || !guestSessionId) return "";
    const g = raw.guests.find((guest) => guest.id === guestSessionId);
    return g?.name?.trim() || g?.label || "";
  }, [raw, guestSessionId]);

  const config: RestaurantConfig = useMemo(
    () => ({
      name: "Mesita Demo",
      tagline: "Comida ecuatoriana",
      table: "12",
      city: "Quito",
      currency: "USD",
      ivaRate: IVA_RATE,
      serviceRate: PROPINA_RATE,
      serviceEnabled: true,
      tipPresets: [0, 10, 15, 20],
      defaultTip: 15,
      demoMode: true,
    }),
    [],
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
    isDemo: true,
  };
}
