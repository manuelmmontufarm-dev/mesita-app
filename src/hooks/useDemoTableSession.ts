"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mapDemoStateToSession } from "@/lib/demo-live-adapter";
import { emojiForItemName } from "@/lib/demo-restaurant";
import type { DemoTableState } from "@/lib/demo-table-store";
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

const SESSION_KEY = (token: string) => `mesita:demo-guest:${token}`;
const POLL_MS = 2_000;

export interface UseDemoTableSessionResult {
  state: TableSessionState | null;
  guestSessionId: string | null;
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

/** Full roster from Redis — every guest + anyone referenced in claims. */
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

async function postDemo<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/demo/table/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
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
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVersion = useRef<number | undefined>(undefined);

  const applyDemo = useCallback((demo: DemoTableState) => {
    if (demo.version === lastVersion.current) return;
    lastVersion.current = demo.version;
    setRaw(demo);
    setState(mapDemoStateToSession(demo));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const savedId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(SESSION_KEY(token)) ?? undefined
        : undefined;

    postDemo<{ state: DemoTableState; guest: { id: string } }>(token, {
      action: "join",
      guestId: savedId,
    })
      .then(({ state: joined, guest }) => {
        if (cancelled) return;
        window.localStorage.setItem(SESSION_KEY(token), guest.id);
        setGuestSessionId(guest.id);
        applyDemo(joined);
        setLoading(false);
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
  }, [token, joinAttempt, applyDemo]);

  useEffect(() => {
    if (!guestSessionId) return;
    const events = new EventSource(
      `/api/demo/table/${encodeURIComponent(token)}/events`,
    );
    const onState = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as DemoTableState;
        applyDemo(next);
      } catch (err) {
        console.error(err);
      }
    };
    events.addEventListener("state", onState);
    return () => {
      events.removeEventListener("state", onState);
      events.close();
    };
  }, [token, guestSessionId, applyDemo]);

  useEffect(() => {
    if (!guestSessionId) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
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
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, guestSessionId, applyDemo]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      const data = await postDemo<DemoTableState | { state: DemoTableState }>(token, body);
      const next =
        data && typeof data === "object" && "state" in data
          ? (data as { state: DemoTableState }).state
          : (data as DemoTableState);
      applyDemo(next);
    },
    [token, applyDemo],
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
      }, 300);
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
    retry: () => setJoinAttempt((n) => n + 1),
    resetSeq: raw?.resetSeq ?? 0,
    paidSummaries,
    isDemo: true,
  };
}
