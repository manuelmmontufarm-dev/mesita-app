/**
 * useGuestPaymentFlow — MesitaQR customer payment state machine.
 *
 * Ports the App() shell in `design_handoff_customer/customer/app.jsx` to a
 * typed React hook backed by useReducer so the transitions can be unit-tested
 * without React rendering. The hook owns flow state only — it does not fetch
 * the bill, talk to Kushki, or touch Prisma. Those are injected as callbacks
 * so we can preserve the existing real backend wiring at the call sites
 * (`src/app/pay/[token]/page.tsx`, demo route).
 *
 * SEAMS (callbacks injected by the parent component):
 *   onFetchBill       → GET /pos/tables/:id/bill
 *   onPaid(payload)   → payment gateway + SRI e-invoice issuance
 *   liveEvents?       → WebSocket session events (member join, claim, paid)
 */

import { useCallback, useMemo, useReducer } from "react";

import {
  billSubtotal,
  computeTotals,
  equalShareSubtotal,
  freeUnits,
  guestLabel,
  itemOwed,
  lineTotal,
  memberSubtotal,
  paidSubtotal,
  round2,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  BillTab,
  BillTotals,
  Claims,
  ItemId,
  MemberId,
  RestaurantConfig,
  SplitMode,
  Stage,
  TableMember,
} from "@/lib/guest-billing/types";

/* ---------------- payment / receipt payloads ---------------- */

export type PaymentMethod = "datafast" | "diners" | "kushki" | "card";

export interface EInvoicePayload {
  /** "Cédula" (10) or "RUC" (13). */
  idNumber: string;
  /** Razón social / nombre. */
  legalName: string;
  address: string;
  email: string;
  phone?: string;
}

export interface PaidPayload {
  method: PaymentMethod;
  amount: number;
  card: { last4: string };
  eInvoice: EInvoicePayload | null;
  /** Provider-agnostic charge token (e.g. demo:4242). */
  paymentToken?: string;
  splitMode?: "FULL" | "EQUAL" | "BY_ITEM";
  selectedItemIds?: string[];
  equalSplitPeople?: number;
  voluntaryTipAmount?: number;
  /** Live form-state name (what the user just typed) — source of truth for pay POST. */
  typedName?: string;
  /** Food subtotal for this payment (excludes IVA/servicio/propina). */
  foodSubtotal?: number;
  /** Client receipt ref — demo store should reuse this instead of generating a new one. */
  receiptRef?: string;
  /** Item → units settled in this payment (BY_ITEM partial shares). */
  itemUnits?: Record<string, number>;
}

export interface ReceiptLineItem {
  name: string;
  emoji?: string;
  amt: number;
}

export interface Receipt {
  name: string;
  amount: number;
  subtotal: number;
  iva: number;
  propina: number;
  servicio: number;
  ivaRate: number;
  mode: SplitMode;
  items: ReceiptLineItem[];
  how: string;
  method: PaymentMethod;
  methodLabel: string;
  eInvoice: EInvoicePayload | null;
  ref: string;
  date: string;
}

/* ---------------- state shape ---------------- */

export interface FlowState {
  stage: Stage;
  tab: BillTab;
  name: string;
  nameErr: boolean;
  mode: SplitMode;
  tip: number;
  people: number;
  claims: Claims;
  paidIds: MemberId[];
  paidItemIds: ItemId[];
  sharePicker: boolean;
  shareItem: ItemId | null;
  receipts: Receipt[];
  /** Last method + eInvoice seen from PaymentScreen, kept for receipt building. */
  lastMethod: PaymentMethod;
  lastEInvoice: EInvoicePayload | null;
}

export interface FlowInit {
  initialStage?: Stage;
  initialTab?: BillTab;
  initialMode?: SplitMode;
  initialTip: number;
  initialPeople: number;
  initialClaims?: Claims;
  initialPaidIds?: MemberId[];
  initialPaidItemIds?: ItemId[];
  initialReceipts?: Receipt[];
  initialName?: string;
}

export function createInitialState(init: FlowInit): FlowState {
  return {
    stage: init.initialStage ?? "loading",
    tab: init.initialTab ?? "cuenta",
    name: init.initialName?.trim() ?? "",
    nameErr: false,
    mode: init.initialMode ?? "item",
    tip: init.initialTip,
    people: init.initialPeople,
    claims: init.initialClaims ?? {},
    paidIds: init.initialPaidIds ?? [],
    paidItemIds: init.initialPaidItemIds ?? [],
    sharePicker: false,
    shareItem: null,
    receipts: init.initialReceipts ?? [],
    lastMethod: "datafast",
    lastEInvoice: null,
  };
}

/* ---------------- actions ---------------- */

export type FlowAction =
  | { type: "load/start" }
  | { type: "load/success" }
  | { type: "load/error" }
  | { type: "name/set"; name: string }
  | { type: "name/error"; err: boolean }
  | { type: "mode/set"; mode: SplitMode }
  | { type: "tip/set"; tip: number }
  | { type: "people/set"; people: number }
  | { type: "tab/set"; tab: BillTab }
  | { type: "claim/setUnits"; itemId: ItemId; memberId: MemberId; units: number }
  | { type: "claim/replace"; itemId: ItemId; unitsMap: Record<MemberId, number> }
  | { type: "share/openPicker" }
  | { type: "share/closePicker" }
  | { type: "share/openItem"; itemId: ItemId }
  | { type: "share/closeItem" }
  | { type: "stage/goConfirm" }
  | { type: "stage/goPayment" }
  | { type: "stage/goBill" }
  | { type: "stage/goWaiting" }
  | { type: "stage/goSuccess" }
  | { type: "payment/cacheMethod"; method: PaymentMethod; eInvoice: EInvoicePayload | null }
  | { type: "payment/complete"; receipt: Receipt; markedItems: ItemId[]; partialItemIds: ItemId[]; youId: MemberId }
  | {
      type: "sync/fromServer";
      claims: Claims;
      paidItemIds: ItemId[];
      paidIds: MemberId[];
      people: number;
    }
  | { type: "reset"; init: FlowInit };

/* ---------------- reducer ---------------- */

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "load/start":
      return { ...state, stage: "loading" };
    case "load/success":
      return { ...state, stage: "bill" };
    case "load/error":
      return { ...state, stage: "error" };

    case "name/set": {
      const cleared = action.name.trim() ? false : state.nameErr;
      return { ...state, name: action.name, nameErr: cleared };
    }
    case "name/error":
      return { ...state, nameErr: action.err };

    case "mode/set":
      return { ...state, mode: action.mode };
    case "tip/set":
      return { ...state, tip: action.tip };
    case "people/set":
      return { ...state, people: Math.max(1, Math.round(action.people)) };
    case "tab/set":
      return { ...state, tab: action.tab };

    case "claim/setUnits": {
      const itemMap = { ...(state.claims[action.itemId] || {}) };
      if (action.units <= 0.001) {
        delete itemMap[action.memberId];
      } else {
        itemMap[action.memberId] = round2(action.units);
      }
      return {
        ...state,
        claims: { ...state.claims, [action.itemId]: itemMap },
      };
    }
    case "claim/replace": {
      const clean: Record<MemberId, number> = {};
      for (const [id, u] of Object.entries(action.unitsMap)) {
        if (u > 0.001) clean[id] = round2(u);
      }
      return {
        ...state,
        claims: { ...state.claims, [action.itemId]: clean },
      };
    }

    case "share/openPicker":
      return { ...state, sharePicker: true };
    case "share/closePicker":
      return { ...state, sharePicker: false };
    case "share/openItem":
      return { ...state, shareItem: action.itemId, sharePicker: false };
    case "share/closeItem":
      return { ...state, shareItem: null };

    case "stage/goConfirm":
      return { ...state, stage: "confirm" };
    case "stage/goPayment":
      return { ...state, stage: "payment" };
    case "stage/goBill":
      return {
        ...state,
        stage: "bill",
        mode:
          state.stage === "waiting" || state.stage === "success"
            ? "item"
            : state.mode,
      };
    case "stage/goWaiting":
      return { ...state, stage: "waiting" };
    case "stage/goSuccess":
      return { ...state, stage: "success" };

    case "payment/cacheMethod":
      return {
        ...state,
        lastMethod: action.method,
        lastEInvoice: action.eInvoice,
      };

    case "payment/complete": {
      const paidIds = state.paidIds.includes(action.youId)
        ? state.paidIds
        : [...state.paidIds, action.youId];
      const paidItemIds = Array.from(
        new Set([...state.paidItemIds, ...action.markedItems]),
      );
      const nextClaims = { ...state.claims };
      for (const itemId of action.partialItemIds) {
        const itemMap = { ...(nextClaims[itemId] || {}) };
        delete itemMap[action.youId];
        if (Object.keys(itemMap).length === 0) delete nextClaims[itemId];
        else nextClaims[itemId] = itemMap;
      }
      return {
        ...state,
        stage: "waiting",
        receipts: [...state.receipts, action.receipt],
        paidIds,
        paidItemIds,
        claims: nextClaims,
      };
    }

    case "sync/fromServer":
      return {
        ...state,
        claims: action.claims,
        paidItemIds: Array.from(
          new Set([...state.paidItemIds, ...action.paidItemIds]),
        ),
        paidIds: Array.from(new Set([...state.paidIds, ...action.paidIds])),
        people: Math.max(1, action.people),
      };

    case "reset":
      return createInitialState(action.init);
  }
}

/* ---------------- derivation helpers (pure) ---------------- */

const GUEST_NAME = guestLabel(1);

const METHOD_LABELS: Record<PaymentMethod, string> = {
  datafast: "Datafast",
  diners: "Diners Club",
  kushki: "Tarjeta",
  card: "Tarjeta",
};

/** SRI-style threshold — paying the full bill above this requires invoice data. */
export const INVOICE_MANDATORY_THRESHOLD = 50;

export interface DerivedTotals {
  fullSub: number;
  paidSub: number;
  remainingSub: number;
  paidPeople: number;
  remainingPeople: number;
  myUnpaidSub: number;
  /** Subtotal used to compute totals: mode-dependent. */
  subtotal: number;
  totals: BillTotals;
  canPay: boolean;
  /** Table still has unpaid balance — guest may return for another payment. */
  canPayMore: boolean;
  /** True iff fewer than 2 people remain to pay. Drives forced e-invoice. */
  isLastPayer: boolean;
  /** Full-table pay (Todo) with total ≥ threshold — invoice mandatory even with others at table. */
  requiresFullBillInvoice: boolean;
}

/** Whether checkout must collect e-invoice data before charging. */
export function requiresMandatoryInvoice(opts: {
  isLastPayer: boolean;
  mode: SplitMode;
  paymentTotal: number;
}): boolean {
  if (opts.isLastPayer) return true;
  return (
    opts.mode === "todo" &&
    opts.paymentTotal >= INVOICE_MANDATORY_THRESHOLD
  );
}

export function deriveTotals(
  state: FlowState,
  items: readonly BillItem[],
  config: Pick<RestaurantConfig, "ivaRate" | "serviceRate" | "serviceEnabled">,
  youId: MemberId,
): DerivedTotals {
  const fullSub = billSubtotal(items);
  const paidFromItems = paidSubtotal(items, state.paidItemIds);
  const paidFromReceipts = round2(
    state.receipts.reduce((s, r) => s + r.subtotal, 0),
  );
  const effectivePaidSub = Math.max(paidFromItems, paidFromReceipts);
  const remainingSub = Math.max(0, fullSub - effectivePaidSub);
  const splitCount = Math.max(1, Math.round(state.people));
  const paidPeople = state.paidIds.length;
  const remainingPeople = Math.max(1, state.people - paidPeople);
  const myUnpaidSub = items.reduce(
    (s, it) =>
      s + (state.paidItemIds.includes(it.id) ? 0 : itemOwed(it, state.claims, youId)),
    0,
  );
  const youPaidEqualShare = state.receipts.some((r) => r.mode === "equal");
  const subtotal =
    state.mode === "equal"
      ? youPaidEqualShare
        ? 0
        : equalShareSubtotal(fullSub, state.people, remainingSub)
      : state.mode === "todo"
        ? remainingSub
        : myUnpaidSub;
  const totals = computeTotals(subtotal, config, state.tip);
  const equalShareSub = equalShareSubtotal(fullSub, state.people, fullSub);
  const isLastPayer =
    state.mode === "equal"
      ? paidPeople >= splitCount - 1 || remainingSub <= equalShareSub + 0.01
      : state.mode === "todo"
        ? true
        : remainingPeople <= 1;
  return {
    fullSub,
    paidSub: effectivePaidSub,
    remainingSub,
    paidPeople,
    remainingPeople,
    myUnpaidSub,
    subtotal,
    totals,
    canPay: subtotal > 0.001,
    canPayMore: remainingSub > 0.001,
    isLastPayer,
    requiresFullBillInvoice:
      state.mode === "todo" && totals.total >= INVOICE_MANDATORY_THRESHOLD,
  };
}

/**
 * Build the receipt object that the design's onPaid() in app.jsx assembles.
 * Pure — takes a `now` so tests get deterministic refs and dates.
 */
export function buildReceipt(args: {
  state: FlowState;
  items: readonly BillItem[];
  totals: BillTotals;
  ivaRate: number;
  method: PaymentMethod;
  eInvoice: EInvoicePayload | null;
  youId: MemberId;
  now: Date;
  random?: () => number;
}): Receipt {
  const { state, items, totals, ivaRate, method, eInvoice, youId, now } = args;
  const rand = args.random ?? Math.random;
  const finalName = state.name.trim() || GUEST_NAME;
  const ref =
    "MQR-" +
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    Math.floor(1000 + rand() * 9000);
  const dateStr =
    now.toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    now.toLocaleTimeString("es-EC", {
      hour: "2-digit",
      minute: "2-digit",
    });

  let lineItems: ReceiptLineItem[] = [];
  let how = "";
  if (state.mode === "todo") {
    lineItems = items.map((it) => ({
      name: it.name,
      emoji: it.emoji,
      amt: lineTotal(it),
    }));
    how = "Pagaste toda la cuenta de la mesa";
  } else if (state.mode === "equal") {
    how = `División en partes iguales · 1 de ${state.people}`;
  } else {
    lineItems = items
      .filter(
        (it) =>
          unitsOf(state.claims, it.id, youId) > 0 &&
          !state.paidItemIds.includes(it.id),
      )
      .map((it) => ({
        name: it.name,
        emoji: it.emoji,
        amt: itemOwed(it, state.claims, youId),
      }));
    how = lineItems.length
      ? `Pagaste ${lineItems.length} plato${lineItems.length > 1 ? "s" : ""} que escogiste`
      : "Pagaste tu parte";
  }

  return {
    name: finalName,
    amount: totals.total,
    subtotal: totals.subtotal,
    iva: totals.iva,
    propina: totals.propina,
    servicio: totals.servicio,
    ivaRate,
    mode: state.mode,
    items: lineItems,
    how,
    method,
    methodLabel: METHOD_LABELS[method] ?? "Tarjeta",
    eInvoice,
    ref,
    date: dateStr,
  };
}

/**
 * Items that should be marked paid-for-everyone after a successful payment.
 * todo pays everything, item pays mine, equal pays nothing.
 */
export function itemsToMarkPaid(
  state: FlowState,
  items: readonly BillItem[],
  youId: MemberId,
): ItemId[] {
  if (state.mode === "todo") {
    return items
      .filter((it) => !state.paidItemIds.includes(it.id))
      .map((it) => it.id);
  }
  if (state.mode === "item") {
    return items
      .filter((it) => {
        if (state.paidItemIds.includes(it.id)) return false;
        const yours = unitsOf(state.claims, it.id, youId);
        return yours >= it.qty - 0.001;
      })
      .map((it) => it.id);
  }
  return [];
}

export function itemsPartiallyPaid(
  state: FlowState,
  items: readonly BillItem[],
  youId: MemberId,
): ItemId[] {
  if (state.mode !== "item") return [];
  const marked = new Set(itemsToMarkPaid(state, items, youId));
  return items
    .filter((it) => {
      const yours = unitsOf(state.claims, it.id, youId);
      return yours > 0.001 && !marked.has(it.id);
    })
    .map((it) => it.id);
}

export function itemUnitsForPayment(
  state: FlowState,
  items: readonly BillItem[],
  youId: MemberId,
): Record<string, number> {
  if (state.mode !== "item") return {};
  const units: Record<string, number> = {};
  for (const it of items) {
    const yours = unitsOf(state.claims, it.id, youId);
    if (yours > 0.001) units[it.id] = yours;
  }
  return units;
}

export function latestReceipt(state: FlowState): Receipt | null {
  const n = state.receipts.length;
  return n > 0 ? state.receipts[n - 1]! : null;
}

export function receiptsTotal(receipts: readonly Receipt[]): number {
  return round2(receipts.reduce((s, r) => s + r.amount, 0));
}

/* ---------------- React hook ---------------- */

export interface UseGuestPaymentFlowOptions {
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  init: FlowInit;
  youId?: MemberId;
  /** Real backend hook. If omitted, payment is a no-op for the parent layer. */
  onPaid?: (payload: PaidPayload) => Promise<void> | void;
  /** Inject a clock for testability. */
  now?: () => Date;
}

export function useGuestPaymentFlow(opts: UseGuestPaymentFlowOptions) {
  const youId = opts.youId ?? "you";
  const [state, dispatch] = useReducer(
    flowReducer,
    opts.init,
    createInitialState,
  );

  const derived = useMemo(
    () => deriveTotals(state, opts.items, opts.config, youId),
    [state, opts.items, opts.config, youId],
  );

  const toggleMine = useCallback(
    (item: BillItem) => {
      if (state.paidItemIds.includes(item.id)) return;
      const itemMap = state.claims[item.id] ?? {};
      const sharedCount = Object.values(itemMap).filter((u) => u > 0.001).length;
      const yours = unitsOf(state.claims, item.id, youId);
      if (yours > 0 && sharedCount > 1) return;
      if (yours > 0) {
        dispatch({ type: "claim/setUnits", itemId: item.id, memberId: youId, units: 0 });
        return;
      }
      const free = freeUnits(item, state.claims);
      if (free > 0.001) {
        dispatch({ type: "claim/setUnits", itemId: item.id, memberId: youId, units: free });
      }
    },
    [state.claims, state.paidItemIds, youId],
  );

  const claimFromMesa = useCallback(
    (item: BillItem) => {
      dispatch({ type: "tab/set", tab: "cuenta" });
      dispatch({ type: "mode/set", mode: "item" });
      if (state.paidItemIds.includes(item.id)) return;
      const free = freeUnits(item, state.claims);
      if (free > 0.001) {
        dispatch({ type: "claim/setUnits", itemId: item.id, memberId: youId, units: free });
      }
    },
    [state.claims, state.paidItemIds, youId],
  );

  const goToConfirm = useCallback(() => {
    if (!derived.canPay) return;
    if (!state.name.trim()) {
      dispatch({ type: "name/set", name: GUEST_NAME });
    }
    dispatch({ type: "stage/goConfirm" });
  }, [derived.canPay, state.name]);

  const submitPayment = useCallback(
    async (payload: PaidPayload) => {
      dispatch({
        type: "payment/cacheMethod",
        method: payload.method,
        eInvoice: payload.eInvoice,
      });
      const splitMode: PaidPayload["splitMode"] =
        state.mode === "item"
          ? "BY_ITEM"
          : state.mode === "equal"
            ? "EQUAL"
            : "FULL";
      const selectedItemIds = itemsToMarkPaid(state, opts.items, youId);
      const itemUnits = itemUnitsForPayment(state, opts.items, youId);
      const now = opts.now ? opts.now() : new Date();
      const receipt = buildReceipt({
        state,
        items: opts.items,
        totals: derived.totals,
        ivaRate: opts.config.ivaRate,
        method: payload.method,
        eInvoice: payload.eInvoice,
        youId,
        now,
      });
      const enriched: PaidPayload = {
        ...payload,
        splitMode,
        selectedItemIds:
          state.mode === "item"
            ? selectedItemIds
            : state.mode === "todo"
              ? opts.items
                  .filter((it) => !state.paidItemIds.includes(it.id))
                  .map((it) => it.id)
              : undefined,
        itemUnits,
        equalSplitPeople: state.people,
        voluntaryTipAmount: derived.totals.propina,
        typedName: state.name.trim() || undefined,
        foodSubtotal: derived.subtotal,
        receiptRef: receipt.ref,
      };
      if (opts.onPaid) {
        await opts.onPaid(enriched);
      }
      const markedItems = itemsToMarkPaid(state, opts.items, youId);
      const partialItemIds = itemsPartiallyPaid(state, opts.items, youId);
      dispatch({
        type: "payment/complete",
        receipt,
        markedItems,
        partialItemIds,
        youId,
      });
    },
    [state, opts.items, opts.config.ivaRate, opts.onPaid, opts.now, derived.totals, youId],
  );

  const setName = useCallback(
    (name: string) => dispatch({ type: "name/set", name }),
    [],
  );
  const setMode = useCallback(
    (mode: SplitMode) => dispatch({ type: "mode/set", mode }),
    [],
  );
  const setTip = useCallback(
    (tip: number) => dispatch({ type: "tip/set", tip }),
    [],
  );
  const setPeople = useCallback(
    (people: number) => dispatch({ type: "people/set", people }),
    [],
  );
  const setTab = useCallback(
    (tab: BillTab) => dispatch({ type: "tab/set", tab }),
    [],
  );
  const setClaimUnits = useCallback(
    (itemId: ItemId, memberId: MemberId, units: number) =>
      dispatch({ type: "claim/setUnits", itemId, memberId, units }),
    [],
  );
  const replaceClaim = useCallback(
    (itemId: ItemId, unitsMap: Record<MemberId, number>) =>
      dispatch({ type: "claim/replace", itemId, unitsMap }),
    [],
  );
  const openSharePicker = useCallback(
    () => dispatch({ type: "share/openPicker" }),
    [],
  );
  const closeSharePicker = useCallback(
    () => dispatch({ type: "share/closePicker" }),
    [],
  );
  const openShareItem = useCallback(
    (itemId: ItemId) => dispatch({ type: "share/openItem", itemId }),
    [],
  );
  const closeShareItem = useCallback(() => dispatch({ type: "share/closeItem" }), []);
  const loadStart = useCallback(() => dispatch({ type: "load/start" }), []);
  const loadSuccess = useCallback(() => dispatch({ type: "load/success" }), []);
  const loadError = useCallback(() => dispatch({ type: "load/error" }), []);
  const goToBill = useCallback(() => dispatch({ type: "stage/goBill" }), []);
  const confirmPay = useCallback(() => dispatch({ type: "stage/goPayment" }), []);
  const goToWaiting = useCallback(() => dispatch({ type: "stage/goWaiting" }), []);
  const finishWaiting = useCallback(() => dispatch({ type: "stage/goSuccess" }), []);
  const reset = useCallback(
    (init: FlowInit) => dispatch({ type: "reset", init }),
    [],
  );
  const syncFromServer = useCallback(
    (patch: {
      claims: Claims;
      paidItemIds: ItemId[];
      paidIds: MemberId[];
      people: number;
    }) => dispatch({ type: "sync/fromServer", ...patch }),
    [],
  );

  return {
    state,
    derived,
    dispatch,
    youId,
    setName,
    setMode,
    setTip,
    setPeople,
    setTab,
    toggleMine,
    claimFromMesa,
    setClaimUnits,
    replaceClaim,
    openSharePicker,
    closeSharePicker,
    openShareItem,
    closeShareItem,
    loadStart,
    loadSuccess,
    loadError,
    goToBill,
    goToConfirm,
    confirmPay,
    submitPayment,
    goToWaiting,
    finishWaiting,
    reset,
    syncFromServer,
  };
}

// Re-export memberSubtotal so views can compute Mesa per-person owed totals.
export { memberSubtotal };
