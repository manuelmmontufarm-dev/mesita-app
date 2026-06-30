import { describe, expect, it } from "vitest";

import type {
  BillItem,
  Claims,
  RestaurantConfig,
} from "@/lib/guest-billing/types";

import {
  buildReceipt,
  createInitialState,
  deriveTotals,
  flowReducer,
  itemsToMarkPaid,
  requiresMandatoryInvoice,
  type FlowInit,
  type FlowState,
} from "../useGuestPaymentFlow";

const items: BillItem[] = [
  { id: "loc", name: "Locro", qty: 1, unitPrice: 4.5, emoji: "🥣" },
  { id: "sec", name: "Seco", qty: 1, unitPrice: 8.9, emoji: "🍖" },
  { id: "cev", name: "Ceviche", qty: 1, unitPrice: 9.5, emoji: "🦐" },
  { id: "enc", name: "Encebollado", qty: 1, unitPrice: 6.0, emoji: "🐟" },
];

const config: RestaurantConfig = {
  name: "Doña Pepa",
  table: "Mesa 12",
  currency: "USD",
  ivaRate: 0.15,
  serviceRate: 0.1,
  serviceEnabled: true,
  tipPresets: [10, 15, 20],
  defaultTip: 10,
};

const baseInit: FlowInit = {
  initialTip: 10,
  initialPeople: 4,
  initialMode: "item",
};

const withState = (overrides: Partial<FlowState> = {}): FlowState => ({
  ...createInitialState(baseInit),
  ...overrides,
});

describe("createInitialState", () => {
  it("starts in loading + cuenta tab with item mode", () => {
    const s = createInitialState(baseInit);
    expect(s.stage).toBe("loading");
    expect(s.tab).toBe("cuenta");
    expect(s.mode).toBe("item");
    expect(s.tip).toBe(10);
    expect(s.people).toBe(4);
    expect(s.claims).toEqual({});
    expect(s.paidIds).toEqual([]);
    expect(s.receipts).toEqual([]);
    expect(s.lastMethod).toBe("datafast");
  });

  it("honours overrides (claims seed, paid ids, initial stage)", () => {
    const s = createInitialState({
      ...baseInit,
      initialStage: "bill",
      initialClaims: { loc: { ana: 1 } },
      initialPaidIds: ["ana"],
      initialPaidItemIds: ["loc"],
    });
    expect(s.stage).toBe("bill");
    expect(s.claims).toEqual({ loc: { ana: 1 } });
    expect(s.paidIds).toEqual(["ana"]);
    expect(s.paidItemIds).toEqual(["loc"]);
  });
});

describe("flowReducer — stage transitions", () => {
  it("load/start → loading", () => {
    const s = flowReducer(withState({ stage: "bill" }), { type: "load/start" });
    expect(s.stage).toBe("loading");
  });

  it("load/success → bill", () => {
    const s = flowReducer(withState({ stage: "loading" }), { type: "load/success" });
    expect(s.stage).toBe("bill");
  });

  it("load/error → error", () => {
    const s = flowReducer(withState({ stage: "loading" }), { type: "load/error" });
    expect(s.stage).toBe("error");
  });

  it("bill → confirm → payment → waiting → success path", () => {
    let s = withState({ stage: "bill" });
    s = flowReducer(s, { type: "stage/goConfirm" });
    expect(s.stage).toBe("confirm");
    s = flowReducer(s, { type: "stage/goPayment" });
    expect(s.stage).toBe("payment");
    s = flowReducer(s, { type: "stage/goWaiting" });
    expect(s.stage).toBe("waiting");
    s = flowReducer(s, { type: "stage/goSuccess" });
    expect(s.stage).toBe("success");
  });

  it("waiting → goBill switches to item mode for another payment", () => {
    const s = flowReducer(withState({ stage: "waiting", mode: "equal" }), {
      type: "stage/goBill",
    });
    expect(s.stage).toBe("bill");
    expect(s.mode).toBe("item");
  });
});

describe("flowReducer — name / mode / tip / people", () => {
  it("name/set clears nameErr when value is non-empty", () => {
    const s = flowReducer(withState({ nameErr: true }), {
      type: "name/set",
      name: "Juanito",
    });
    expect(s.name).toBe("Juanito");
    expect(s.nameErr).toBe(false);
  });

  it("name/set keeps nameErr when value is whitespace only", () => {
    const s = flowReducer(withState({ nameErr: true }), {
      type: "name/set",
      name: "  ",
    });
    expect(s.nameErr).toBe(true);
  });

  it("people/set clamps at 1 and rounds", () => {
    let s = flowReducer(withState(), { type: "people/set", people: 0 });
    expect(s.people).toBe(1);
    s = flowReducer(withState(), { type: "people/set", people: -3 });
    expect(s.people).toBe(1);
    s = flowReducer(withState(), { type: "people/set", people: 4.7 });
    expect(s.people).toBe(5);
  });

  it("mode/set + tip/set + tab/set", () => {
    let s = flowReducer(withState(), { type: "mode/set", mode: "todo" });
    expect(s.mode).toBe("todo");
    s = flowReducer(s, { type: "tip/set", tip: 15 });
    expect(s.tip).toBe(15);
    s = flowReducer(s, { type: "tab/set", tab: "mesa" });
    expect(s.tab).toBe("mesa");
  });
});

describe("flowReducer — claims", () => {
  it("setUnits adds and rounds units", () => {
    const s = flowReducer(withState(), {
      type: "claim/setUnits",
      itemId: "cev",
      memberId: "you",
      units: 0.5,
    });
    expect(s.claims).toEqual({ cev: { you: 0.5 } });
  });

  it("setUnits with 0 (or below epsilon) removes the member entry", () => {
    const s = flowReducer(withState({ claims: { cev: { you: 1, ana: 0.5 } } }), {
      type: "claim/setUnits",
      itemId: "cev",
      memberId: "you",
      units: 0,
    });
    expect(s.claims.cev).toEqual({ ana: 0.5 });
  });

  it("replace wipes and re-seeds an item's claims, dropping tiny residuals", () => {
    const s = flowReducer(withState({ claims: { cev: { ana: 1 } } }), {
      type: "claim/replace",
      itemId: "cev",
      unitsMap: { you: 0.5, manuel: 0.5, ghost: 0.0005 },
    });
    expect(s.claims.cev).toEqual({ you: 0.5, manuel: 0.5 });
  });
});

describe("flowReducer — payment/complete", () => {
  it("appends youId to paidIds (idempotent), merges markedItems, → waiting", () => {
    const initial = withState({
      stage: "payment",
      paidIds: ["ana"],
      paidItemIds: ["loc"],
    });
    const receipt = {
      name: "Tú",
      amount: 17.25,
      subtotal: 13.4,
      iva: 2.01,
      propina: 1.34,
      servicio: 1.34,
      ivaRate: 0.15,
      mode: "item" as const,
      items: [{ name: "Seco", emoji: "🍖", amt: 8.9 }],
      how: "Pagaste 1 plato que escogiste",
      method: "datafast" as const,
      methodLabel: "Datafast",
      eInvoice: null,
      ref: "MQR-X",
      date: "2026-06-14",
    };
    const s = flowReducer(initial, {
      type: "payment/complete",
      receipt,
      markedItems: ["sec", "loc"],
      partialItemIds: [],
      youId: "you",
    });
    expect(s.stage).toBe("waiting");
    expect(s.paidIds).toEqual(["ana", "you"]);
    expect(s.paidItemIds.sort()).toEqual(["loc", "sec"]);
    expect(s.receipts).toEqual([receipt]);

    const again = flowReducer(s, {
      type: "payment/complete",
      receipt,
      markedItems: ["cev"],
      partialItemIds: [],
      youId: "you",
    });
    expect(again.paidIds).toEqual(["ana", "you"]);
    expect(again.paidItemIds.sort()).toEqual(["cev", "loc", "sec"]);
    expect(again.receipts).toHaveLength(2);
  });
});

describe("flowReducer — share sheets", () => {
  it("openItem closes the picker", () => {
    let s = flowReducer(withState(), { type: "share/openPicker" });
    expect(s.sharePicker).toBe(true);
    s = flowReducer(s, { type: "share/openItem", itemId: "cev" });
    expect(s.sharePicker).toBe(false);
    expect(s.shareItem).toBe("cev");
    s = flowReducer(s, { type: "share/closeItem" });
    expect(s.shareItem).toBeNull();
  });
});

describe("deriveTotals", () => {
  it("item mode: uses myUnpaidSub as subtotal", () => {
    const claims: Claims = {
      sec: { you: 1 },
      cev: { you: 0.5, ana: 0.5 },
    };
    const d = deriveTotals(withState({ claims }), items, config, "you");
    expect(d.subtotal).toBeCloseTo(13.65, 5);
    expect(d.totals.total).toBeCloseTo(13.65 * 1.35, 5);
    expect(d.canPay).toBe(true);
  });

  it("equal mode: subtotal = fixed share of full bill capped by remaining", () => {
    const d = deriveTotals(
      withState({ mode: "equal", people: 4, paidItemIds: ["loc"] }),
      items,
      config,
      "you",
    );
    expect(d.remainingSub).toBeCloseTo(24.4, 5);
    // fullSub ≈ 28.9 → share ≈ 7.225, not remaining/remainingPeople
    expect(d.subtotal).toBeCloseTo(7.23, 1);
  });

  it("equal mode with one payer left does not charge full remaining bill", () => {
    const d = deriveTotals(
      withState({
        mode: "equal",
        people: 4,
        paidIds: ["a", "b", "c"],
      }),
      items,
      config,
      "you",
    );
    expect(d.remainingPeople).toBe(1);
    expect(d.subtotal).toBeLessThan(d.remainingSub - 0.01);
    expect(d.isLastPayer).toBe(true);
  });

  it("todo mode: subtotal = remainingSub", () => {
    const d = deriveTotals(
      withState({ mode: "todo", paidItemIds: ["loc"] }),
      items,
      config,
      "you",
    );
    expect(d.subtotal).toBeCloseTo(24.4, 5);
  });

  it("requiresFullBillInvoice when todo mode total ≥ 50", () => {
    const bigItems = [
      { id: "a", name: "A", qty: 1, unitPrice: 40 },
      { id: "b", name: "B", qty: 1, unitPrice: 10 },
    ];
    const d = deriveTotals(
      withState({ mode: "todo", people: 4, paidIds: [] }),
      bigItems,
      config,
      "you",
    );
    expect(d.isLastPayer).toBe(true);
    expect(d.requiresFullBillInvoice).toBe(true);
    expect(requiresMandatoryInvoice({
      isLastPayer: d.isLastPayer,
      mode: "todo",
      paymentTotal: d.totals.total,
    })).toBe(true);
  });

  it("isLastPayer is true when remainingPeople ≤ 1", () => {
    const d = deriveTotals(
      withState({ paidIds: ["ana", "manuel", "mateo"], people: 4 }),
      items,
      config,
      "you",
    );
    expect(d.remainingPeople).toBe(1);
    expect(d.isLastPayer).toBe(true);
  });

  it("remainingSub accounts for receipt subtotals on partial payments", () => {
    const receipt = {
      name: "Tú",
      amount: 8.4,
      subtotal: 4.5,
      iva: 0.68,
      propina: 0.68,
      servicio: 0.45,
      ivaRate: 0.15,
      mode: "item" as const,
      items: [{ name: "Locro", emoji: "🥣", amt: 4.5 }],
      how: "½ plato",
      method: "card" as const,
      methodLabel: "Tarjeta",
      eInvoice: null,
      ref: "MQR-1",
      date: "2026-06-14",
    };
    const d = deriveTotals(
      withState({ mode: "item", receipts: [receipt] }),
      items,
      config,
      "you",
    );
    expect(d.remainingSub).toBeCloseTo(24.4, 1);
    expect(d.paidSub).toBeCloseTo(4.5, 2);
  });

  it("canPayMore when table still has balance after partial pay", () => {
    const d = deriveTotals(
      withState({ mode: "item", paidItemIds: ["loc"], receipts: [{
        name: "Tú",
        amount: 5,
        subtotal: 4.5,
        iva: 0.68,
        propina: 0,
        servicio: 0.45,
        ivaRate: 0.15,
        mode: "item" as const,
        items: [],
        how: "",
        method: "card" as const,
        methodLabel: "Tarjeta",
        eInvoice: null,
        ref: "MQR-1",
        date: "2026-06-14",
      }] }),
      items,
      config,
      "you",
    );
    expect(d.canPay).toBe(false);
    expect(d.canPayMore).toBe(true);
  });

  it("equal mode: no second equal charge after already paid equal share", () => {
    const d = deriveTotals(
      withState({
        mode: "equal",
        people: 4,
        receipts: [{
          name: "Tú",
          amount: 10,
          subtotal: 7.23,
          iva: 1,
          propina: 0,
          servicio: 0,
          ivaRate: 0.15,
          mode: "equal" as const,
          items: [],
          how: "División en partes iguales",
          method: "card" as const,
          methodLabel: "Tarjeta",
          eInvoice: null,
          ref: "MQR-1",
          date: "2026-06-14",
        }],
      }),
      items,
      config,
      "you",
    );
    expect(d.canPay).toBe(false);
    expect(d.canPayMore).toBe(true);
  });
});

describe("itemsToMarkPaid", () => {
  it("todo → every item", () => {
    const ids = itemsToMarkPaid(withState({ mode: "todo" }), items, "you");
    expect(ids.sort()).toEqual(["cev", "enc", "loc", "sec"]);
  });

  it("item → only items where you own the full qty", () => {
    const ids = itemsToMarkPaid(
      withState({
        mode: "item",
        claims: { sec: { you: 1 }, cev: { you: 0.5, ana: 0.5 } },
      }),
      items,
      "you",
    );
    expect(ids).toEqual(["sec"]);
  });

  it("partial item payment clears your claim but keeps item unpaid", () => {
    const receipt = {
      name: "Tú",
      amount: 4.75,
      subtotal: 4.75,
      iva: 0,
      propina: 0,
      servicio: 0,
      ivaRate: 0.15,
      mode: "item" as const,
      items: [{ name: "Ceviche", emoji: "🦐", amt: 4.75 }],
      how: "½ plato",
      method: "card" as const,
      methodLabel: "Tarjeta",
      eInvoice: null,
      ref: "MQR-P",
      date: "2026-06-14",
    };
    const s = flowReducer(
      withState({
        mode: "item",
        claims: { cev: { you: 0.5, ana: 0.5 } },
      }),
      {
        type: "payment/complete",
        receipt,
        markedItems: [],
        partialItemIds: ["cev"],
        youId: "you",
      },
    );
    expect(s.paidItemIds).toEqual([]);
    expect(s.claims.cev).toEqual({ ana: 0.5 });
    expect(s.stage).toBe("waiting");
  });

  it("equal → none (others may still owe)", () => {
    const ids = itemsToMarkPaid(withState({ mode: "equal" }), items, "you");
    expect(ids).toEqual([]);
  });
});

describe("buildReceipt", () => {
  const totals = {
    subtotal: 10,
    iva: 1.5,
    propina: 1,
    servicio: 1,
    total: 13.5,
  };
  const now = new Date("2026-06-14T18:30:00Z");

  it("item mode: lists claimed items and pluralizes 'plato(s)'", () => {
    const r = buildReceipt({
      state: withState({
        mode: "item",
        name: "Juanito",
        claims: { sec: { you: 1 }, cev: { you: 0.5 } },
      }),
      items,
      totals,
      ivaRate: 0.15,
      method: "datafast",
      eInvoice: null,
      youId: "you",
      now,
      random: () => 0,
    });
    expect(r.name).toBe("Juanito");
    expect(r.items.map((i) => i.name).sort()).toEqual(["Ceviche", "Seco"]);
    expect(r.how).toBe("Pagaste 2 platos que escogiste");
    expect(r.methodLabel).toBe("Datafast");
    expect(r.ref).toMatch(/^MQR-2026/);
  });

  it("todo mode: lists every item and uses 'toda la cuenta' copy", () => {
    const r = buildReceipt({
      state: withState({ mode: "todo", name: "Ana" }),
      items,
      totals,
      ivaRate: 0.15,
      method: "card",
      eInvoice: null,
      youId: "you",
      now,
      random: () => 0,
    });
    expect(r.items).toHaveLength(items.length);
    expect(r.how).toBe("Pagaste toda la cuenta de la mesa");
    expect(r.methodLabel).toBe("Tarjeta");
  });

  it("equal mode: no item lines, uses 'división en partes iguales' copy", () => {
    const r = buildReceipt({
      state: withState({ mode: "equal", name: "", people: 4 }),
      items,
      totals,
      ivaRate: 0.15,
      method: "diners",
      eInvoice: null,
      youId: "you",
      now,
      random: () => 0,
    });
    expect(r.items).toEqual([]);
    expect(r.how).toBe("División en partes iguales · 1 de 4");
    expect(r.name).toBe("Persona 1");
    expect(r.methodLabel).toBe("Diners Club");
  });
});

describe("flowReducer — sync/fromServer", () => {
  it("merges paid ids and paid items instead of replacing with stale server", () => {
    const s = flowReducer(
      withState({
        stage: "waiting",
        paidIds: ["you"],
        paidItemIds: ["loc", "sec", "cev", "enc"],
      }),
      {
        type: "sync/fromServer",
        claims: {},
        paidIds: [],
        paidItemIds: [],
        people: 2,
      },
    );
    expect(s.paidIds).toEqual(["you"]);
    expect(s.paidItemIds).toEqual(["loc", "sec", "cev", "enc"]);
  });
});
