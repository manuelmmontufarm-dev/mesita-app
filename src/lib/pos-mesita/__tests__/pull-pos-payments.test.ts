import { describe, expect, it } from "vitest";
import { mergePosCobrosIntoPayments, cobroFoodSubtotal } from "../pull-pos-payments";
import type { DemoTableState } from "@/lib/demo-table-store";

function baseState(overrides: Partial<DemoTableState> = {}): DemoTableState {
  return {
    token: "demo-mesa-1",
    stateVersion: 7,
    restaurant: {
      name: "La Doña Pepa",
      tagline: "Comida casera ecuatoriana",
      city: "Quito",
      ivaRate: 0.15,
      serviceRate: 0.1,
      serviceEnabled: true,
    },
    table: { name: "1" },
    items: [
      {
        id: "beer",
        name: "Cerveza Club Verde",
        note: "",
        emoji: "🍺",
        qty: 2,
        unitPrice: 2.75,
      },
      {
        id: "cola",
        name: "Cola nacional",
        note: "",
        emoji: "🥤",
        qty: 1,
        unitPrice: 1.75,
      },
    ],
    guests: [],
    claims: {},
    paidItemIds: [],
    itemPaidUnits: {},
    payments: [],
    nextGuestNumber: 1,
    resetSeq: 0,
    version: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("cobroFoodSubtotal", () => {
  it("uses proportional doc subtotal, not full doc subtotal per cobro", () => {
    const doc = {
      id: "doc-1",
      tipo_documento: "PRE",
      estado: "P",
      descripcion: null,
      total: 52.15,
      subtotal_15: 40,
      iva: 6,
      servicio: 4,
      fecha_emision: "01/06/2026",
      cobros: [],
      created_at: new Date().toISOString(),
    };
    const sub = cobroFoodSubtotal({ id: "c1", forma_cobro: "TC", monto: 26.075, referencia: null, procesador: null, detalle: null, created_at: "" }, doc);
    expect(sub).toBeCloseTo(20, 1);
  });

  it("falls back to amount/1.25 when doc totals missing", () => {
    const sub = cobroFoodSubtotal(
      { id: "c1", forma_cobro: "TC", monto: 12.5, referencia: null, procesador: null, detalle: null, created_at: "" },
      {
        id: "d",
        tipo_documento: "PRE",
        estado: "P",
        descripcion: null,
        total: 0,
        iva: 0,
        servicio: 0,
        fecha_emision: "",
        cobros: [],
        created_at: "",
      },
    );
    expect(sub).toBeCloseTo(10, 2);
  });
});

describe("mergePosCobrosIntoPayments", () => {
  it("does not mark all items paid when cobro subtotals are proportional", () => {
    const state = baseState();
    const doc = {
      id: "doc-old",
      tipo_documento: "FAC",
      estado: "C",
      descripcion: "Mesa 1",
      total: 100,
      subtotal_15: 80,
      iva: 12,
      servicio: 8,
      fecha_emision: "01/06/2026",
      cobros: [
        {
          id: "cobro-1",
          forma_cobro: "TC",
          monto: 5,
          referencia: "POS-OLD-1",
          procesador: "Caja",
          detalle: "Cliente",
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
    };

    const merged = mergePosCobrosIntoPayments(state, [doc]);
    expect(merged.paidItemIds).toHaveLength(0);
    expect(merged.payments).toHaveLength(1);
    expect(merged.payments[0]!.subtotal).toBeCloseTo(4, 1);
  });

  it("marks items paid only when caja payments cover the current bill", () => {
    const state = baseState();
    const billSub = 2 * 2.75 + 1.75;
    const doc = {
      id: "doc-full",
      tipo_documento: "FAC",
      estado: "C",
      descripcion: "Mesa 1",
      total: billSub * 1.25,
      subtotal_15: billSub,
      iva: billSub * 0.15,
      servicio: billSub * 0.1,
      fecha_emision: "01/06/2026",
      cobros: [
        {
          id: "cobro-full",
          forma_cobro: "EF",
          monto: billSub * 1.25,
          referencia: "POS-CAJA-123",
          procesador: "Caja",
          detalle: "Manuel",
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
    };

    const merged = mergePosCobrosIntoPayments(state, [doc]);
    expect(merged.paidItemIds).toHaveLength(2);
    expect(merged.payments[0]!.subtotal).toBeCloseTo(billSub, 2);
  });

  it("skips MesitaQR cobros — already in Redis from pay action", () => {
    const state = baseState();
    const doc = {
      id: "doc-mesita",
      tipo_documento: "PRE",
      estado: "P",
      descripcion: null,
      total: 52.15,
      subtotal_15: 40,
      iva: 6,
      servicio: 4,
      fecha_emision: "",
      cobros: [
        {
          id: "c-mesita",
          forma_cobro: "TC",
          monto: 52.15,
          referencia: "MESITAQR:MQR-20260630-1234",
          procesador: "MesitaQR",
          detalle: "Manuel",
          created_at: new Date().toISOString(),
        },
      ],
      created_at: "",
    };
    const merged = mergePosCobrosIntoPayments(state, [doc]);
    expect(merged.payments).toHaveLength(0);
    expect(merged.paidItemIds).toHaveLength(0);
  });

  it("dedupes MESITAQR: prefix against bare Redis ref", () => {
    const state = baseState({
      payments: [
        {
          id: "p1",
          guestId: "g1",
          guestName: "Manuel",
          mode: "todo" as const,
          amount: 10,
          subtotal: 8,
          iva: 1,
          service: 0,
          tip: 0,
          itemIds: [],
          method: "Tarjeta",
          ref: "MQR-20260630-1234",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const doc = {
      id: "doc-dup",
      tipo_documento: "PRE",
      estado: "P",
      descripcion: null,
      total: 10,
      subtotal_15: 8,
      iva: 1,
      servicio: 0,
      fecha_emision: "",
      cobros: [
        {
          id: "c-dup",
          forma_cobro: "TC",
          monto: 10,
          referencia: "MESITAQR:MQR-20260630-1234",
          procesador: "MesitaQR",
          detalle: "Manuel",
          created_at: "",
        },
      ],
      created_at: "",
    };
    const merged = mergePosCobrosIntoPayments(state, [doc]);
    expect(merged.payments).toHaveLength(1);
  });

  it("skips cancelled documentos", () => {
    const state = baseState();
    const merged = mergePosCobrosIntoPayments(state, [
      {
        id: "doc-x",
        tipo_documento: "PRE",
        estado: "X",
        descripcion: null,
        total: 500,
        subtotal_15: 400,
        iva: 60,
        servicio: 40,
        fecha_emision: "",
        cobros: [
          {
            id: "c1",
            forma_cobro: "TC",
            monto: 500,
            referencia: "BAD",
            procesador: null,
            detalle: null,
            created_at: "",
          },
        ],
        created_at: "",
      },
    ]);
    expect(merged.payments).toHaveLength(0);
    expect(merged.paidItemIds).toHaveLength(0);
  });
});
