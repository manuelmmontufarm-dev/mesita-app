import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ContificoAdapter } from "../contifico.adapter";
import type { PosConfig } from "../pos-config";

const config: PosConfig = {
  provider: "CONTIFICO",
  apiKey: "test-api-key-do-not-log",
  environment: "sandbox",
  tableField: "descripcion_adicional",
  baseUrl: "https://integracionapi.contifico.com/sistema/api/v2",
  paymentMethod: "EF",
};

// sampleDoc mirrors the actual Contífico v2 API response shape (confirmed 2026-06-02)
const sampleDoc = {
  id: "DOC-001",
  tipo_documento: "PRE",
  estado: "P",  // Pendiente = open
  pos: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",  // POS UUID — required for cobros
  descripcion_adicional: "T4",
  detalles: [
    { producto_id: "P1", producto_nombre: "Lomo fino", cantidad: 1, precio: 15.0 },
    { producto_id: "P2", producto_nombre: "Agua mineral", cantidad: 2, precio: 2.5 },
  ],
  subtotal: 20.0,
  iva: 3.0,
  servicio: 2.0,
  total: 25.0,
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

/** Helper: build a fetch mock that returns different responses per URL pattern. */
function sequencedFetch(routes: Array<{ match: RegExp; body: unknown; status?: number }>) {
  return vi.fn().mockImplementation(async (url: string) => {
    for (const r of routes) {
      if (r.match.test(url)) {
        const status = r.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(r.body),
          text: () => Promise.resolve(JSON.stringify(r.body)),
        };
      }
    }
    throw new Error(`unmocked URL: ${url}`);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ContificoAdapter.pullOrders", () => {
  it("maps a Contífico PRE document to POSPulledOrder with correct amounts", async () => {
    vi.stubGlobal("fetch", mockFetch([sampleDoc]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();

    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.posDocumentId).toBe("DOC-001");
    expect(order.posTableId).toBe("T4");
    expect(order.posToken).toBe("a004388c-1550-463e-a96e-a1dc4dfe7c8a");
    expect(order.subtotal).toBe(20.0);
    expect(order.iva).toBe(3.0);
    expect(order.propina).toBe(2.0);
    expect(order.total).toBe(25.0);
    expect(order.currency).toBe("USD");
    expect(order.isClosedInPos).toBe(false);
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({ name: "Lomo fino", quantity: 1, unitPrice: 15.0 });
    expect(order.items[1]).toMatchObject({ name: "Agua mineral", quantity: 2, unitPrice: 2.5 });
  });

  it("returns order with empty posTableId when table field is missing — no throw (D-05)", async () => {
    const docWithoutTable = { ...sampleDoc, descripcion_adicional: undefined };
    vi.stubGlobal("fetch", mockFetch([docWithoutTable]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();

    expect(orders).toHaveLength(1);
    expect(orders[0].posTableId).toBe("");
  });

  it("marks isClosedInPos=false for Pendiente (P) documents — P means open", async () => {
    const pendienteDoc = { ...sampleDoc, id: "DOC-002", estado: "P" };
    vi.stubGlobal("fetch", mockFetch([pendienteDoc]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].isClosedInPos).toBe(false);
  });

  it("marks isClosedInPos=true for Facturado (F) documents", async () => {
    const facturadoDoc = { ...sampleDoc, id: "DOC-003", estado: "F" };
    vi.stubGlobal("fetch", mockFetch([facturadoDoc]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].isClosedInPos).toBe(true);
  });

  it("marks isClosedInPos=true for Anulado (A) documents", async () => {
    const anuladoDoc = { ...sampleDoc, id: "DOC-004", estado: "A" };
    vi.stubGlobal("fetch", mockFetch([anuladoDoc]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].isClosedInPos).toBe(true);
  });

  it("marks isClosedInPos=true for Cobrado (C) — fully paid, saldo=0", async () => {
    const cobradoDoc = { ...sampleDoc, id: "DOC-005", estado: "C" };
    vi.stubGlobal("fetch", mockFetch([cobradoDoc]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].isClosedInPos).toBe(true);
  });

  it("returns posToken=null when document has no pos field (manually created)", async () => {
    const manualDoc = { ...sampleDoc, pos: null };
    vi.stubGlobal("fetch", mockFetch([manualDoc]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].posToken).toBeNull();
  });

  it("prefers nombre_manual over producto_nombre when set", async () => {
    const docWithManual = {
      ...sampleDoc,
      detalles: [
        { producto_id: "P1", producto_nombre: "Nombre Base", nombre_manual: "Especial del día", cantidad: 1, precio: 15.0 },
      ],
    };
    vi.stubGlobal("fetch", mockFetch([docWithManual]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].items[0].name).toBe("Especial del día");
  });

  it("falls back to descripcion when producto_nombre and nombre_manual are absent", async () => {
    const docLegacy = {
      ...sampleDoc,
      detalles: [
        { producto_id: "P1", descripcion: "Legacy item name", cantidad: 1, precio: 10.0 },
      ],
    };
    vi.stubGlobal("fetch", mockFetch([docLegacy]));
    const adapter = new ContificoAdapter(config);
    const orders = await adapter.pullOrders();
    expect(orders[0].items[0].name).toBe("Legacy item name");
  });

  it("parses real fixture data captured from Contífico test API", async () => {
    const fixturePath = join(__dirname, "fixtures/contifico_pre_docs.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
    vi.stubGlobal("fetch", mockFetch(fixture));
    const adapter = new ContificoAdapter({ ...config, tableField: "adicional1" });
    const orders = await adapter.pullOrders();

    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(typeof order.posDocumentId).toBe("string");
      expect(order.total).toBeGreaterThan(0);
      expect(Array.isArray(order.items)).toBe(true);
      for (const item of order.items) {
        expect(typeof item.name).toBe("string");
        expect(item.name.length).toBeGreaterThan(0);
        expect(item.unitPrice).toBeGreaterThan(0);
      }
    }
  });

  it("never exposes the API key in thrown errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const adapter = new ContificoAdapter(config);
    await expect(adapter.pullOrders()).rejects.toThrow(/pullOrders failed/);
    await expect(adapter.pullOrders()).rejects.not.toThrow(/test-api-key/);
  });
});

describe("ContificoAdapter.confirmPayment", () => {
  it("returns success=true with posFacturaId (cobro id) on 200", async () => {
    // Real API returns the created cobro object; we use cobro.id as posFacturaId
    vi.stubGlobal("fetch", mockFetch({ id: "COB-999", forma_cobro: "TARJETA", monto: "25.0" }));
    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25.0,
      paymentReference: "pay-abc",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    expect(result.success).toBe(true);
    expect(result.posFacturaId).toBe("COB-999");
  });

  it("returns success=false with errorMessage on POS server error — never throws (D-10)", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "server error" }, 500));
    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25.0,
      paymentReference: "pay-abc",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/500/);
  });

  it("returns success=true on 409 conflict (document already paid — idempotent)", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "already paid" }, 409));
    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25.0,
      paymentReference: "pay-abc",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    expect(result.success).toBe(true);
  });

  it("returns success=false on fetch failure — never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25.0,
      paymentReference: "pay-abc",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });

  it("never exposes the API key in error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("test-api-key-do-not-log leaked")));
    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25.0,
      paymentReference: "pay-xyz",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    expect(result.errorMessage).not.toContain("test-api-key");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Gap #1: tipo_pago reflects PosConfig.paymentMethod
  // ────────────────────────────────────────────────────────────────────────────
  it("Gap #1: EF cobro sends forma_cobro, monto, fecha, descripcion, pos", async () => {
    const fetchMock = mockFetch({ id: "COB-1" });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ContificoAdapter(config); // paymentMethod="EF"
    await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 10,
      paymentReference: "KUSHKI-REF-001",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    const calls = fetchMock.mock.calls.filter((c: any[]) => /\/documento\/DOC-001\/cobro\//.test(c[0]));
    expect(calls.length).toBe(1);
    const body = JSON.parse(calls[0][1].body);
    expect(body.forma_cobro).toBe("EF");
    expect(body.monto).toBe(10);
    expect(body.fecha).toMatch(/\d{2}\/\d{2}\/\d{4}/); // DD/MM/YYYY
    expect(body.descripcion).toBe("KUSHKI-REF-001");
    expect(body.pos).toBe("a004388c-1550-463e-a96e-a1dc4dfe7c8a");
    expect(body.lote).toBeUndefined();        // EF has no lote
    expect(body.documento_id).toBeUndefined(); // id is in URL, not body
  });

  it("Gap #1: TC cobro sends forma_cobro, monto, fecha, tipo_ping, lote, pos", async () => {
    const fetchMock = mockFetch({ id: "COB-2" });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ContificoAdapter({ ...config, paymentMethod: "TC", tipoPing: "D" });
    await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 10,
      paymentReference: "KUSHKI-TX-ABC",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
    });
    const calls = fetchMock.mock.calls.filter((c: any[]) => /\/cobro\//.test(c[0]));
    const body = JSON.parse(calls[0][1].body);
    expect(body.forma_cobro).toBe("TC");
    expect(body.tipo_ping).toBe("D");
    expect(body.lote).toBe("KUSHKI-TX-ABC");
    expect(body.descripcion).toBeUndefined(); // TC has no descripcion
    expect(body.pos).toBe("a004388c-1550-463e-a96e-a1dc4dfe7c8a");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Gap #2: guestData → findOrCreateCliente → PUT documento → POST cobro
  // ────────────────────────────────────────────────────────────────────────────
  it("Gap #2: existing cliente → PUT documento with cliente_id, then POST cobro", async () => {
    const fetchMock = sequencedFetch([
      // GET /persona/?identificacion=... → exists
      { match: /\/persona\/\?identificacion=/, body: [{ id: "CLI-42", identificacion: "0102030405" }] },
      // PUT /documento/<id>/ → 200
      { match: /\/documento\/DOC-001\/$/, body: { id: "DOC-001", cliente_id: "CLI-42" } },
      // POST /cobro/ → success
      { match: /\/documento\/DOC-001\/cobro\//, body: { id: "COB-100" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25,
      paymentReference: "pay-cli",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
      guestData: {
        tipo: "CEDULA",
        identificacion: "0102030405",
        email: "guest@example.com",
        nombre: "Guest Name",
      },
    });

    expect(result.success).toBe(true);
    // Sequence: GET persona, PUT documento, POST cobro
    const urls = fetchMock.mock.calls.map((c: any[]) => c[0]);
    expect(urls.some((u: string) => /\/persona\/\?identificacion=/.test(u))).toBe(true);
    const putCall = fetchMock.mock.calls.find(
      (c: any[]) => /\/documento\/DOC-001\/$/.test(c[0]) && c[1]?.method === "PUT"
    );
    expect(putCall).toBeTruthy();
    const putBody = JSON.parse(putCall![1].body);
    expect(putBody.cliente_id).toBe("CLI-42");
  });

  it("Gap #2: new cliente → POST /persona/, then PUT documento, then POST cobro", async () => {
    const fetchMock = sequencedFetch([
      // GET /persona/ → no results
      { match: /\/persona\/\?identificacion=/, body: [] },
      // POST /persona/ → new id
      { match: /\/persona\/$/, body: { id: "CLI-NEW" } },
      // PUT /documento/<id>/
      { match: /\/documento\/DOC-001\/$/, body: { id: "DOC-001" } },
      // POST /cobro/
      { match: /\/documento\/DOC-001\/cobro\//, body: { id: "COB-101" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25,
      paymentReference: "pay-cli-2",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
      guestData: {
        tipo: "CEDULA",
        identificacion: "0203040506",
        email: "new@example.com",
        nombre: "New Guest",
      },
    });

    expect(result.success).toBe(true);
    const postPersonaCall = fetchMock.mock.calls.find(
      (c: any[]) => /\/persona\/$/.test(c[0]) && c[1]?.method === "POST"
    );
    expect(postPersonaCall).toBeTruthy();
    const personaBody = JSON.parse(postPersonaCall![1].body);
    expect(personaBody.identificacion).toBe("0203040506");
    expect(personaBody.email).toBe("new@example.com");
  });

  it("Gap #2: CONSUMIDOR_FINAL guestData → does NOT call /persona/ or PUT /documento/", async () => {
    const fetchMock = sequencedFetch([
      { match: /\/documento\/DOC-001\/cobro\//, body: { id: "COB-CF" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 10,
      paymentReference: "pay-cf",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
      guestData: {
        tipo: "CONSUMIDOR_FINAL",
        identificacion: "9999999999",
        email: "",
      },
    });

    expect(result.success).toBe(true);
    const calls = fetchMock.mock.calls;
    // Must not call /persona/ at all
    expect(calls.some((c: any[]) => /\/persona\//.test(c[0]))).toBe(false);
    // Must not PUT /documento/{id}/ (the cliente-attach call) — cobro is POST to /cobro/ sub-path
    const putDocCalls = calls.filter((c: any[]) => c[1]?.method === "PUT" && /\/documento\//.test(c[0]));
    expect(putDocCalls).toHaveLength(0);
    // Must POST to the cobro sub-path
    expect(calls.some((c: any[]) => /\/cobro\//.test(c[0]) && c[1]?.method === "POST")).toBe(true);
  });

  it("Gap #2: PUT documento failure → log + cobro proceeds (best-effort, D-10)", async () => {
    const fetchMock = sequencedFetch([
      { match: /\/persona\/\?identificacion=/, body: [{ id: "CLI-FAIL" }] },
      { match: /\/documento\/DOC-001\/$/, body: { error: "bad" }, status: 400 },
      { match: /\/documento\/DOC-001\/cobro\//, body: { id: "COB-OK" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const adapter = new ContificoAdapter(config);
    const result = await adapter.confirmPayment({
      posDocumentId: "DOC-001",
      amount: 25,
      paymentReference: "pay-put-fail",
      posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
      guestData: {
        tipo: "CEDULA",
        identificacion: "0304050607",
        email: "x@example.com",
      },
    });

    expect(result.success).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/POS_DOC_CLIENTE_UPDATE_FAILED/);
    expect(logged).not.toContain("test-api-key");
  });
});

describe("ContificoAdapter.getOrderStatus", () => {
  it("Gap #3: 200 with estado=P → exists=true, isClosedInPos=false (Pendiente = open)", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "DOC-001", estado: "P" }));
    const adapter = new ContificoAdapter(config);
    const status = await adapter.getOrderStatus("DOC-001");
    expect(status).toEqual({ exists: true, isClosedInPos: false });
  });

  it("Gap #3: 200 with estado=C → isClosedInPos=true (Cobrado = fully paid)", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "DOC-001", estado: "C" }));
    const adapter = new ContificoAdapter(config);
    const status = await adapter.getOrderStatus("DOC-001");
    expect(status).toEqual({ exists: true, isClosedInPos: true });
  });

  it("Gap #3: 200 with estado=P → isClosedInPos=false (P = Pendiente, still open)", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "DOC-001", estado: "P" }));
    const adapter = new ContificoAdapter(config);
    const status = await adapter.getOrderStatus("DOC-001");
    expect(status).toEqual({ exists: true, isClosedInPos: false });
  });

  it("Gap #3: 200 with estado=F → isClosedInPos=true (F = Facturado)", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "DOC-001", estado: "F" }));
    const adapter = new ContificoAdapter(config);
    const status = await adapter.getOrderStatus("DOC-001");
    expect(status).toEqual({ exists: true, isClosedInPos: true });
  });

  it("Gap #3: 404 → exists=false", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "not found" }, 404));
    const adapter = new ContificoAdapter(config);
    const status = await adapter.getOrderStatus("DOC-DEAD");
    expect(status).toEqual({ exists: false, isClosedInPos: false });
  });

  it("Gap #3: network error → throws sanitized (caller can fail-open)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const adapter = new ContificoAdapter(config);
    await expect(adapter.getOrderStatus("DOC-001")).rejects.toThrow(/getOrderStatus failed/);
    await expect(adapter.getOrderStatus("DOC-001")).rejects.not.toThrow(/test-api-key/);
  });
});
