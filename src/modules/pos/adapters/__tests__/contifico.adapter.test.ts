import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ContificoAdapter } from "../contifico.adapter";
import type { PosConfig } from "../pos-config";
import { deriveNumeroComprobante } from "../../contract/payment-reference";

const config: PosConfig = {
  provider: "CONTIFICO",
  apiKey: "test-api-key-do-not-log",
  environment: "sandbox",
  tableField: "adicional1",
  baseUrl: "https://integracionapi.contifico.com/sistema/api/v2",
  paymentMethod: "EF",
  attachClienteEnabled: false,
};

// Mirrors the frozen contract fixtures (contracts/contifico-v2/fixtures)
const sampleDoc = {
  id: "DOC-001",
  tipo_documento: "PRE",
  estado: "P",
  pos: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
  adicional1: "MESITA_TABLE:T4",
  detalles: [
    { producto_id: "P1", producto_nombre: "Lomo fino", cantidad: 1, precio: 15.0 },
    { producto_id: "P2", producto_nombre: "Agua mineral", cantidad: 2, precio: 2.5 },
  ],
  subtotal_0: 0,
  subtotal_12: 20.0, // official wire name — even at 15% IVA
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

/** Helper: build a fetch mock that returns different responses per URL/method. */
function sequencedFetch(
  routes: Array<{ match: RegExp; method?: string; body: unknown; status?: number }>
) {
  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    for (const r of routes) {
      if (r.match.test(url) && (!r.method || r.method === method)) {
        const status = r.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(r.body),
          text: () => Promise.resolve(JSON.stringify(r.body)),
        };
      }
    }
    throw new Error(`unmocked URL: ${method} ${url}`);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("ContificoAdapter.pullOrders (frozen contract O2/O4)", () => {
  it("queries with documented params: tipo=PRE + result_size/result_page", async () => {
    const fetchMock = mockFetch([sampleDoc]);
    vi.stubGlobal("fetch", fetchMock);
    await new ContificoAdapter(config).pullOrders();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("tipo=PRE");
    expect(url).toContain("result_size=");
    expect(url).toContain("result_page=");
    expect(url).not.toContain("tipo_documento="); // v1 drift removed
    expect(url).not.toContain("limit="); // undocumented param removed
  });

  it("sends the RAW api key (no Token prefix) in the Authorization header", async () => {
    const fetchMock = mockFetch([sampleDoc]);
    vi.stubGlobal("fetch", fetchMock);
    await new ContificoAdapter(config).pullOrders();
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.AUTHORIZATION).toBe("test-api-key-do-not-log");
  });

  it("maps a PRE document: subtotal_12 → subtotal, parsed MESITA_TABLE id", async () => {
    vi.stubGlobal("fetch", mockFetch([sampleDoc]));
    const orders = await new ContificoAdapter(config).pullOrders();

    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.posDocumentId).toBe("DOC-001");
    expect(order.posTableId).toBe("T4"); // parsed from MESITA_TABLE:T4
    expect(order.posToken).toBe("a004388c-1550-463e-a96e-a1dc4dfe7c8a");
    expect(order.subtotal).toBe(20.0);
    expect(order.iva).toBe(3.0);
    expect(order.propina).toBe(2.0);
    expect(order.total).toBe(25.0);
    expect(order.isClosedInPos).toBe(false);
    expect(order.items[0]).toMatchObject({ name: "Lomo fino", quantity: 1, unitPrice: 15.0 });
  });

  it("accepts both bare-array and {count,results} envelopes (shape UNVERIFIED)", async () => {
    vi.stubGlobal("fetch", mockFetch({ count: 1, results: [sampleDoc] }));
    const enveloped = await new ContificoAdapter(config).pullOrders();
    expect(enveloped).toHaveLength(1);

    vi.stubGlobal("fetch", mockFetch([sampleDoc]));
    const bare = await new ContificoAdapter(config).pullOrders();
    expect(bare).toHaveLength(1);
  });

  it("filters non-PRE rows defensively even when the query asked for PRE", async () => {
    const fac = { ...sampleDoc, id: "DOC-FAC", tipo_documento: "FAC" };
    vi.stubGlobal("fetch", mockFetch([sampleDoc, fac]));
    const orders = await new ContificoAdapter(config).pullOrders();
    expect(orders.map((o) => o.posDocumentId)).toEqual(["DOC-001"]);
  });

  it("blank posTableId when mapping value has no MESITA_TABLE prefix or field missing", async () => {
    const noPrefix = { ...sampleDoc, id: "DOC-A", adicional1: "T4" };
    const missing = { ...sampleDoc, id: "DOC-B", adicional1: undefined };
    vi.stubGlobal("fetch", mockFetch([noPrefix, missing]));
    const orders = await new ContificoAdapter(config).pullOrders();
    expect(orders.map((o) => o.posTableId)).toEqual(["", ""]);
  });

  it("ambiguous duplicate mappings: BOTH open docs blanked, never guessed", async () => {
    const docA = { ...sampleDoc, id: "DOC-A" };
    const docB = { ...sampleDoc, id: "DOC-B" }; // same MESITA_TABLE:T4
    const docC = { ...sampleDoc, id: "DOC-C", adicional1: "MESITA_TABLE:T9" };
    vi.stubGlobal("fetch", mockFetch([docA, docB, docC]));
    const orders = await new ContificoAdapter(config).pullOrders();
    const byId = Object.fromEntries(orders.map((o) => [o.posDocumentId, o.posTableId]));
    expect(byId["DOC-A"]).toBe("");
    expect(byId["DOC-B"]).toBe("");
    expect(byId["DOC-C"]).toBe("T9");
  });

  it.each([
    ["P", false],
    ["E", false], // E:generado is OPEN — was missing pre-relay
    ["C", true],
    ["G", true], // G:pagado is CLOSED — was missing pre-relay
    ["A", true],
    ["F", true],
  ])("estado %s → isClosedInPos=%s", async (estado, closed) => {
    vi.stubGlobal("fetch", mockFetch([{ ...sampleDoc, id: `DOC-${estado}`, estado }]));
    const orders = await new ContificoAdapter(config).pullOrders();
    expect(orders[0].isClosedInPos).toBe(closed);
  });

  it("returns posToken=null when document has no pos field (manually created)", async () => {
    vi.stubGlobal("fetch", mockFetch([{ ...sampleDoc, pos: null }]));
    const orders = await new ContificoAdapter(config).pullOrders();
    expect(orders[0].posToken).toBeNull();
  });

  it("prefers nombre_manual, then producto_nombre, then descripcion for item names", async () => {
    const doc = {
      ...sampleDoc,
      detalles: [
        { producto_id: "P1", producto_nombre: "Base", nombre_manual: "Especial", cantidad: 1, precio: 15.0 },
        { producto_id: "P2", descripcion: "Legacy", cantidad: 1, precio: 10.0 },
      ],
    };
    vi.stubGlobal("fetch", mockFetch([doc]));
    const orders = await new ContificoAdapter(config).pullOrders();
    expect(orders[0].items.map((i) => i.name)).toEqual(["Especial", "Legacy"]);
  });

  it("parses the real captured Contífico fixture (bare array, string money, subtotal_12)", async () => {
    const fixturePath = join(__dirname, "fixtures/contifico_pre_docs.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
    vi.stubGlobal("fetch", mockFetch(fixture));
    const orders = await new ContificoAdapter(config).pullOrders();

    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(typeof order.posDocumentId).toBe("string");
      expect(order.total).toBeGreaterThan(0);
      // subtotal must come from the documented subtotal_12 (string "250.0" → 250)
      expect(Number.isFinite(order.subtotal)).toBe(true);
      for (const item of order.items) {
        expect(typeof item.name).toBe("string");
        expect(item.name.length).toBeGreaterThan(0);
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

describe("ContificoAdapter.confirmPayment (frozen contract O7)", () => {
  const paymentParams = {
    posDocumentId: "DOC-001",
    amount: 25.0,
    paymentReference: "pay-abc",
    posToken: "a004388c-1550-463e-a96e-a1dc4dfe7c8a",
  };
  const expectedRef = deriveNumeroComprobante("pay-abc");

  it("201 → success; body carries ONLY documented params with derived numero_comprobante", async () => {
    const fetchMock = mockFetch({ id: "COB-999", forma_cobro: "EF", monto: "25.0" }, 201);
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ContificoAdapter(config).confirmPayment(paymentParams);

    expect(result.success).toBe(true);
    expect(result.posFacturaId).toBe("COB-999");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.forma_cobro).toBe("EF");
    expect(body.monto).toBe(25.0);
    expect(body.fecha).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(body.numero_comprobante).toBe(expectedRef);
    expect(body.numero_comprobante.length).toBeLessThanOrEqual(15);
    // Drift killed: no lote, no descripcion, no pos in the body
    expect(body.lote).toBeUndefined();
    expect(body.descripcion).toBeUndefined();
    expect(body.pos).toBeUndefined();
  });

  it("TC cobro includes tipo_ping (required by param table) and no lote", async () => {
    const fetchMock = mockFetch({ id: "COB-2" }, 201);
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ContificoAdapter({ ...config, paymentMethod: "TC", tipoPing: "D" });
    await adapter.confirmPayment(paymentParams);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.forma_cobro).toBe("TC");
    expect(body.tipo_ping).toBe("D");
    expect(body.lote).toBeUndefined();
    expect(body.numero_comprobante).toBe(expectedRef);
  });

  it("409 is NOT blind success: reconciliation finds our reference → success", async () => {
    const fetchMock = sequencedFetch([
      { match: /\/cobro\/$/, method: "POST", body: { error: "conflict" }, status: 409 },
      {
        match: /\/cobro\/$/,
        method: "GET",
        body: [{ forma_cobro: "EF", monto: "25.0", numero_comprobante: expectedRef }],
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ContificoAdapter(config).confirmPayment(paymentParams);
    expect(result.success).toBe(true);
  });

  it("409 with NO matching reference in the cobro list → failure (no silent success)", async () => {
    const fetchMock = sequencedFetch([
      { match: /\/cobro\/$/, method: "POST", body: { error: "conflict" }, status: 409 },
      {
        match: /\/cobro\/$/,
        method: "GET",
        body: [{ forma_cobro: "EF", monto: "5.0", numero_comprobante: "MSTAOTHERPAYMT" }],
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ContificoAdapter(config).confirmPayment(paymentParams);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/409/);
  });

  it("timeout/network failure triggers reconciliation; found reference → success (POST landed)", async () => {
    let posted = false;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
      if ((options?.method ?? "GET") === "POST") {
        posted = true;
        throw new Error("socket hang up"); // POST 'failed' but actually landed
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          posted ? [{ forma_cobro: "EF", monto: "25.0", numero_comprobante: expectedRef }] : [],
        text: async () => "[]",
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ContificoAdapter(config).confirmPayment(paymentParams);
    expect(result.success).toBe(true);
  });

  it("network failure + failed reconciliation read → failure with retry-able message, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await new ContificoAdapter(config).confirmPayment(paymentParams);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/unknown|retry/i);
  });

  it("reconciliation tolerates numeric numero_comprobante/lote in responses", async () => {
    const numericRef = deriveNumeroComprobante("pay-numeric");
    const fetchMock = sequencedFetch([
      { match: /\/cobro\/$/, method: "POST", body: {}, status: 500 },
      {
        match: /\/cobro\/$/,
        method: "GET",
        // official examples show these as numbers — must not drop the row
        body: [{ forma_cobro: "EF", monto: 25.0, numero_comprobante: numericRef, lote: 123456 }],
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ContificoAdapter(config).confirmPayment({
      ...paymentParams,
      paymentReference: "pay-numeric",
    });
    expect(result.success).toBe(true);
  });

  it("never exposes the API key in error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("test-api-key-do-not-log leaked")));
    const result = await new ContificoAdapter(config).confirmPayment(paymentParams);
    expect(result.errorMessage).not.toContain("test-api-key");
  });

  describe("cliente attach (config-gated, UNVERIFIED — contract O5/O6)", () => {
    const guestData = {
      tipo: "CEDULA" as const,
      identificacion: "0102030405",
      email: "guest@example.com",
      nombre: "Guest Name",
    };

    it("attachClienteEnabled=false (default): no persona/PUT calls at all", async () => {
      const fetchMock = sequencedFetch([
        { match: /\/cobro\/$/, method: "POST", body: { id: "COB-1" }, status: 201 },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const result = await new ContificoAdapter(config).confirmPayment({
        ...paymentParams,
        guestData,
      });
      expect(result.success).toBe(true);
      expect(fetchMock.mock.calls.some((c: unknown[]) => /\/persona\//.test(String(c[0])))).toBe(false);
    });

    it("enabled: documented ?search= lookup (NOT ?identificacion=) with exact client-side match", async () => {
      const fetchMock = sequencedFetch([
        {
          match: /\/persona\/\?search=/,
          method: "GET",
          body: [{ id: "CLI-42", cedula: "0102030405", razon_social: "Guest" }],
        },
        { match: /\/documento\/DOC-001\/$/, method: "PUT", body: { id: "DOC-001" } },
        { match: /\/cobro\/$/, method: "POST", body: { id: "COB-100" }, status: 201 },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const adapter = new ContificoAdapter({ ...config, attachClienteEnabled: true });
      const result = await adapter.confirmPayment({ ...paymentParams, guestData });

      expect(result.success).toBe(true);
      const urls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(urls.some((u) => u.includes("/persona/?search=0102030405"))).toBe(true);
      expect(urls.some((u) => u.includes("identificacion="))).toBe(false);

      const putCall = fetchMock.mock.calls.find(
        (c: unknown[]) =>
          /\/documento\/DOC-001\/$/.test(String(c[0])) &&
          (c[1] as RequestInit)?.method === "PUT"
      );
      const putBody = JSON.parse((putCall![1] as { body: string }).body);
      expect(putBody.cliente.cedula).toBe("0102030405"); // documented shape, not cliente_id
    });

    it("enabled: persona create uses documented body + ?pos= param", async () => {
      const fetchMock = sequencedFetch([
        { match: /\/persona\/\?search=/, method: "GET", body: [] },
        { match: /\/persona\/\?pos=/, method: "POST", body: { id: "CLI-NEW" }, status: 201 },
        { match: /\/documento\/DOC-001\/$/, method: "PUT", body: { id: "DOC-001" } },
        { match: /\/cobro\/$/, method: "POST", body: { id: "COB-101" }, status: 201 },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const adapter = new ContificoAdapter({ ...config, attachClienteEnabled: true });
      const result = await adapter.confirmPayment({ ...paymentParams, guestData });

      expect(result.success).toBe(true);
      const createCall = fetchMock.mock.calls.find(
        (c: unknown[]) =>
          /\/persona\/\?pos=/.test(String(c[0])) && (c[1] as RequestInit)?.method === "POST"
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse((createCall![1] as { body: string }).body);
      expect(body.cedula).toBe("0102030405");
      expect(body.es_cliente).toBe(true);
      expect(body.es_proveedor).toBe(false);
      expect(body.tipo_identificacion).toBeUndefined(); // old undocumented shape gone
      expect(body.identificacion).toBeUndefined();
    });

    it("enabled: CONSUMIDOR_FINAL skips persona entirely", async () => {
      const fetchMock = sequencedFetch([
        { match: /\/cobro\/$/, method: "POST", body: { id: "COB-CF" }, status: 201 },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const adapter = new ContificoAdapter({ ...config, attachClienteEnabled: true });
      const result = await adapter.confirmPayment({
        ...paymentParams,
        guestData: { tipo: "CONSUMIDOR_FINAL", identificacion: "9999999999", email: "" },
      });
      expect(result.success).toBe(true);
      expect(fetchMock.mock.calls.some((c: unknown[]) => /\/persona\//.test(String(c[0])))).toBe(false);
    });

    it("enabled: PUT failure logs and the cobro still proceeds (best-effort)", async () => {
      const fetchMock = sequencedFetch([
        { match: /\/persona\/\?search=/, method: "GET", body: [{ id: "CLI-F", cedula: "0304050607" }] },
        { match: /\/documento\/DOC-001\/$/, method: "PUT", body: { error: "bad" }, status: 400 },
        { match: /\/cobro\/$/, method: "POST", body: { id: "COB-OK" }, status: 201 },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new ContificoAdapter({ ...config, attachClienteEnabled: true });
      const result = await adapter.confirmPayment({
        ...paymentParams,
        guestData: { ...guestData, identificacion: "0304050607", email: "x@example.com" },
      });
      expect(result.success).toBe(true);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/POS_DOC_CLIENTE_UPDATE_FAILED/);
      expect(logged).not.toContain("test-api-key");
    });
  });
});

describe("ContificoAdapter.getOrderStatus (contract O3/O8)", () => {
  it.each([
    ["P", false],
    ["E", false],
    ["C", true],
    ["G", true],
    ["A", true],
    ["F", true],
  ])("estado %s → isClosedInPos=%s", async (estado, closed) => {
    vi.stubGlobal("fetch", mockFetch({ id: "DOC-001", tipo_documento: "PRE", estado, total: 1 }));
    const status = await new ContificoAdapter(config).getOrderStatus("DOC-001");
    expect(status).toEqual({ exists: true, isClosedInPos: closed });
  });

  it("404 → exists=false", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "not found" }, 404));
    const status = await new ContificoAdapter(config).getOrderStatus("DOC-DEAD");
    expect(status).toEqual({ exists: false, isClosedInPos: false });
  });

  it("network error → throws sanitized (caller can fail-open)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const adapter = new ContificoAdapter(config);
    await expect(adapter.getOrderStatus("DOC-001")).rejects.toThrow(/getOrderStatus failed/);
    await expect(adapter.getOrderStatus("DOC-001")).rejects.not.toThrow(/test-api-key/);
  });
});

describe("ContificoAdapter.ping", () => {
  it("uses documented list params (no ?limit=)", async () => {
    const fetchMock = mockFetch([]);
    vi.stubGlobal("fetch", fetchMock);
    await new ContificoAdapter(config).ping();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("result_size=1");
    expect(url).not.toContain("limit=");
  });
});
