"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { emojiForItemName, isDemoTableToken } from "@/lib/demo-restaurant";
import type {
  BillItem,
  Claims,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing";
import {
  guestAvatarHue,
  guestLabel,
  initialsFor,
  NAME_PILL_MAX,
} from "@/lib/guest-billing/split-math";
import { IVA_RATE, PROPINA_RATE } from "@/lib/constants/ecuador-tax";

const SESSION_KEY = (token: string) => `mesita:guest-session:${token}`;
const POLL_MS = 3_000;

export type GuestSessionStatus =
  | "SELECTING"
  | "REVIEWING"
  | "IN_PAYMENT"
  | "PAID"
  | "LEFT";

export interface TableSessionState {
  restaurant: { id: string; name: string; logo: string | null; address: string | null };
  table: { id: string; name: string; token: string };
  bill: {
    id: string;
    status: string;
    breakdown: { subtotal: number; propina: number; iva: number; total: number };
    remainingBalance: number;
  };
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    isPaid: boolean;
  }>;
  guests: Array<{
    id: string;
    label: string;
    displayName: string;
    colorHue: number;
    status: GuestSessionStatus;
  }>;
  claims: Array<{
    billItemId: string;
    guestSessionId: string;
    units: number;
    status: string;
  }>;
  payments: unknown[];
  version: number;
}

export interface LiveSessionActions {
  guestSessionId: string;
  onRename: (name: string) => void;
  onClaim: (billItemId: string, units: number) => void;
  onRelease: (billItemId: string) => void;
  onStatus: (status: GuestSessionStatus) => void;
}

interface UseLiveTableSessionResult {
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
  retry: () => void;
}

function storageGuestId(token: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(SESSION_KEY(token)) ?? undefined;
}

function persistGuestId(token: string, id: string) {
  window.localStorage.setItem(SESSION_KEY(token), id);
}

async function postSession<T>(
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`/api/guest/table-session/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok || !payload.success) {
    throw new Error(payload.error ?? "Session action failed");
  }
  return payload.data as T;
}

function mapClaims(raw: TableSessionState["claims"]): Claims {
  const claims: Claims = {};
  for (const claim of raw) {
    if (claim.status !== "ACTIVE") continue;
    const itemMap = { ...(claims[claim.billItemId] ?? {}) };
    itemMap[claim.guestSessionId] = claim.units;
    claims[claim.billItemId] = itemMap;
  }
  return claims;
}

function mapMembers(
  guests: TableSessionState["guests"],
  youId: string | null,
): TableMember[] {
  return guests.map((g, idx) => {
    const name = g.displayName?.trim() || g.label || guestLabel(idx + 1);
    return {
      id: g.id,
      name,
      seatLabel: g.label,
      initials: initialsFor(name),
      hue: g.colorHue ?? guestAvatarHue(idx),
      isYou: g.id === youId,
    };
  });
}

function mapItems(raw: TableSessionState["items"]): BillItem[] {
  return raw.map((it) => ({
    id: it.id,
    name: it.name,
    qty: it.quantity,
    unitPrice: it.price,
    emoji: emojiForItemName(it.name),
  }));
}

function buildConfig(state: TableSessionState): RestaurantConfig {
  const demo = isDemoTableToken(state.table.token);
  return {
    name: state.restaurant.name,
    tagline: demo ? "Comida ecuatoriana" : undefined,
    table: state.table.name,
    city: demo ? "Quito" : undefined,
    currency: "USD",
    ivaRate: IVA_RATE,
    serviceRate: PROPINA_RATE,
    serviceEnabled: true,
    tipPresets: [10, 15, 20],
    defaultTip: 15,
    demoMode: demo,
  };
}

export function useLiveTableSession(token: string): UseLiveTableSessionResult {
  const [state, setState] = useState<TableSessionState | null>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVersion = useRef<number | undefined>(undefined);

  const applyState = useCallback((next: TableSessionState) => {
    if (next.version === lastVersion.current) return;
    lastVersion.current = next.version;
    setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const savedId = storageGuestId(token);
    postSession<{ state: TableSessionState; guest: { id: string; displayName: string } }>(
      token,
      { action: "join", guestSessionId: savedId },
    )
      .then(({ state: joined, guest }) => {
        if (cancelled) return;
        persistGuestId(token, guest.id);
        setGuestSessionId(guest.id);
        lastVersion.current = joined.version;
        setState(joined);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(
          err instanceof Error
            ? err.message.includes("Internal server")
              ? "No pudimos conectar con la mesa. Revisa que la base de datos esté configurada."
              : err.message
            : "No pudimos conectar con la mesa.",
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, joinAttempt]);

  useEffect(() => {
    if (!guestSessionId) return;
    const events = new EventSource(
      `/api/guest/table-session/${encodeURIComponent(token)}/events`,
    );
    const onState = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as TableSessionState;
        applyState(next);
      } catch (err) {
        console.error(err);
      }
    };
    events.addEventListener("state", onState);
    events.onerror = () => {
      /* EventSource reconnects automatically */
    };
    return () => {
      events.removeEventListener("state", onState);
      events.close();
    };
  }, [token, guestSessionId, applyState]);

  useEffect(() => {
    if (!guestSessionId) return;
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/guest/table-session/${encodeURIComponent(token)}`,
        );
        const payload = await res.json();
        if (!cancelled && res.ok && payload.success) {
          applyState(payload.data as TableSessionState);
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
  }, [token, guestSessionId, applyState]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      const data = await postSession<
        TableSessionState | { state: TableSessionState; guest?: unknown }
      >(token, body);
      const next =
        data &&
        typeof data === "object" &&
        "state" in data &&
        data.state &&
        typeof data.state === "object"
          ? data.state
          : (data as TableSessionState);
      lastVersion.current = next.version;
      setState(next);
    },
    [token],
  );

  const onRename = useCallback(
    (name: string) => {
      if (!guestSessionId) return;
      const trimmed = name.trim().slice(0, NAME_PILL_MAX);
      if (renameTimer.current) clearTimeout(renameTimer.current);
      renameTimer.current = setTimeout(() => {
        void postAction({
          action: "rename",
          guestSessionId,
          displayName: trimmed,
        }).catch(console.error);
      }, 300);
    },
    [guestSessionId, postAction],
  );

  const onClaim = useCallback(
    (billItemId: string, units: number) => {
      if (!guestSessionId) return;
      void postAction({
        action: "claim-item",
        guestSessionId,
        billItemId,
        units,
      }).catch(console.error);
    },
    [guestSessionId, postAction],
  );

  const onRelease = useCallback(
    (billItemId: string) => {
      if (!guestSessionId) return;
      void postAction({
        action: "release-item",
        guestSessionId,
        billItemId,
      }).catch(console.error);
    },
    [guestSessionId, postAction],
  );

  const onStatus = useCallback(
    (status: GuestSessionStatus) => {
      if (!guestSessionId) return;
      void postAction({
        action: "status",
        guestSessionId,
        status,
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

  const claims = useMemo(() => (state ? mapClaims(state.claims) : {}), [state]);
  const paidItemIds = useMemo(
    () => (state ? state.items.filter((i) => i.isPaid).map((i) => i.id) : []),
    [state],
  );
  const items = useMemo(() => (state ? mapItems(state.items) : []), [state]);
  const members = useMemo(
    () => (state ? mapMembers(state.guests, guestSessionId) : []),
    [state, guestSessionId],
  );
  const config = useMemo(
    () =>
      state
        ? buildConfig(state)
        : {
            name: "Mesita",
            table: "",
            currency: "USD" as const,
            ivaRate: IVA_RATE,
            serviceRate: PROPINA_RATE,
            serviceEnabled: true,
            tipPresets: [10, 15, 20],
            defaultTip: 15,
          },
    [state],
  );
  const people = state?.guests.length ?? 1;

  return {
    state,
    guestSessionId,
    loading,
    error: error ?? (!loading && !state ? "Sin cuenta abierta en esta mesa." : null),
    items,
    members,
    config,
    claims,
    paidItemIds,
    people,
    version: state?.version ?? 0,
    billId: state?.bill.id ?? null,
    liveSession,
    retry: () => setJoinAttempt((n) => n + 1),
  };
}
