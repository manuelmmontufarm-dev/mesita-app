import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseDocumentoList,
  parseDocumento,
  parseCobroList,
  parsePersonaList,
  matchPersonaByIdentificacion,
  filterOpenPre,
  isOpenEstado,
  isClosedEstado,
  wireAmountToCents,
  centsToWireAmount,
  zCobroCreateBody,
  zPersonaCreateBody,
} from "../contifico-v2.schema";

const FIXTURES = join(process.cwd(), "contracts", "contifico-v2", "fixtures");
const fx = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

describe("frozen contract — golden fixtures", () => {
  it("parses the bare-array documento list", () => {
    const { items, rejected, enveloped } = parseDocumentoList(fx("documento-list-array.json"));
    expect(rejected).toBe(0);
    expect(enveloped).toBe(false);
    expect(items).toHaveLength(2);
    expect(items[0].subtotal_12).toBe("18.26"); // wire name preserved at 15% IVA
  });

  it("parses the {count, results} envelope documento list", () => {
    const { items, rejected, enveloped } = parseDocumentoList(fx("documento-list-envelope.json"));
    expect(rejected).toBe(0);
    expect(enveloped).toBe(true);
    expect(items).toHaveLength(3);
  });

  it("filters to open PRE regardless of upstream query (P and E open; C/F/A/G closed)", () => {
    const { items } = parseDocumentoList(fx("documento-list-envelope.json"));
    const open = filterOpenPre(items);
    expect(open.map((d) => d.id)).toEqual(["DOC0000000000001"]); // C and FAC excluded

    const arrayItems = parseDocumentoList(fx("documento-list-array.json")).items;
    const openArray = filterOpenPre(arrayItems);
    // estado E (generado) counts as open — was missing from the old adapter
    expect(openArray.map((d) => d.id)).toEqual(["DOC0000000000001", "DOC0000000000004"]);
  });

  it("rejects malformed rows individually without failing the batch", () => {
    const good = fx("documento-list-array.json");
    const { items, rejected } = parseDocumentoList([...good, { garbage: true }, null]);
    expect(items).toHaveLength(2);
    expect(rejected).toBe(2);
  });

  it("tolerates null in optional string fields (live responses emit null, not absence)", () => {
    const doc = {
      ...fx("documento-single-open.json"),
      documento: null,
      fecha_emision: null,
      descripcion: null,
      detalles: [
        {
          producto_id: null,
          producto_nombre: null,
          nombre_manual: null,
          cantidad: 1,
          precio: "2.00",
          porcentaje_iva: null,
        },
      ],
    };
    const { items, rejected } = parseDocumentoList([doc]);
    expect(rejected).toBe(0);
    expect(items).toHaveLength(1);
  });

  it("parses single open and closed documentos with money as cents", () => {
    const open = parseDocumento(fx("documento-single-open.json"));
    expect(open).not.toBeNull();
    expect(isOpenEstado(open!.estado)).toBe(true);
    expect(wireAmountToCents(open!.total)).toBe(2300);
    expect(wireAmountToCents(open!.subtotal_12)).toBe(1826);
    expect(wireAmountToCents(open!.iva)).toBe(274);
    expect(wireAmountToCents(open!.servicio)).toBe(200);
    // integer-cent invariant: subtotal + iva + servicio === total exactly
    expect(1826 + 274 + 200).toBe(2300);

    const closed = parseDocumento(fx("documento-single-closed.json"));
    expect(isClosedEstado(closed!.estado)).toBe(true);
    expect(closed!.cobros?.[0].numero_comprobante).toBe("MSTA1A2B3C4D5E6");
  });

  it("parses the cobro list and matches reconciliation references", () => {
    const { items, rejected } = parseCobroList(fx("cobro-list.json"));
    expect(rejected).toBe(0);
    expect(items).toHaveLength(2);
    expect(items.some((c) => c.numero_comprobante === "MSTA1A2B3C4D5E6")).toBe(true);
  });

  it("cobro create bodies validate against the documented param list only", () => {
    expect(zCobroCreateBody.safeParse(fx("cobro-create-request-tc.json")).success).toBe(true);
    expect(zCobroCreateBody.safeParse(fx("cobro-create-request-ef.json")).success).toBe(true);
    // undocumented params are rejected — lote and descripcion must not be sent
    expect(
      zCobroCreateBody.safeParse({
        forma_cobro: "TC",
        monto: 5,
        tipo_ping: "D",
        lote: "X".repeat(36),
      }).success
    ).toBe(false);
    expect(
      zCobroCreateBody.safeParse({ forma_cobro: "EF", monto: 5, descripcion: "ref" }).success
    ).toBe(false);
    // documented limits enforced
    expect(
      zCobroCreateBody.safeParse({ forma_cobro: "TC", monto: 0, tipo_ping: "D" }).success
    ).toBe(false); // monto must be > 0
    expect(
      zCobroCreateBody.safeParse({ forma_cobro: "TC", monto: 5 }).success
    ).toBe(false); // TC requires tipo_ping
    expect(
      zCobroCreateBody.safeParse({ forma_cobro: "TC", monto: 5.005, tipo_ping: "D" }).success
    ).toBe(false); // sub-cent amounts rejected
    expect(
      zCobroCreateBody.safeParse({ forma_cobro: "EF", monto: 5.25 }).success
    ).toBe(true); // EF without tipo_ping is fine
    expect(
      zCobroCreateBody.safeParse({
        forma_cobro: "TC",
        monto: 5,
        numero_comprobante: "X".repeat(16),
      }).success
    ).toBe(false); // numero_comprobante ≤ 15
    expect(
      zCobroCreateBody.safeParse({ forma_cobro: "TC", monto: 5, fecha: "2026-07-01" }).success
    ).toBe(false); // fecha must be dd/mm/yyyy
  });

  it("persona fixtures validate; lookup exact-matches identification client-side", () => {
    expect(zPersonaCreateBody.safeParse(fx("persona-create-request.json")).success).toBe(true);
    // old undocumented payload shape is rejected (strict: unknown keys fail
    // even when all required fields are present)
    expect(
      zPersonaCreateBody.safeParse({
        tipo: "N",
        cedula: "0912345678",
        tipo_identificacion: "CEDULA",
        identificacion: "0912345678",
        razon_social: "X",
        es_cliente: true,
        es_proveedor: false,
      }).success
    ).toBe(false);
    // documented cross-field rules
    expect(
      zPersonaCreateBody.safeParse({
        tipo: "N",
        cedula: "0912345678",
        razon_social: "X",
        es_cliente: false,
        es_proveedor: false,
      }).success
    ).toBe(false); // at least one role must be true
    expect(
      zPersonaCreateBody.safeParse({
        tipo: "N",
        razon_social: "X",
        es_cliente: true,
        es_proveedor: false,
      }).success
    ).toBe(false); // tipo N requires cedula or ruc

    const { items } = parsePersonaList(fx("persona-search-response.json"));
    expect(matchPersonaByIdentificacion(items, "0912345678")?.id).toBe("PER0000000000001");
    // fuzzy search hits must not match unless identification is exact
    expect(matchPersonaByIdentificacion(items, "0912345")).toBeNull();
  });
});

describe("wire money parsing", () => {
  it("accepts numbers and numeric strings, rejects junk", () => {
    expect(wireAmountToCents("18.26")).toBe(1826);
    expect(wireAmountToCents(18.26)).toBe(1826);
    expect(wireAmountToCents("23")).toBe(2300);
    expect(wireAmountToCents(0)).toBe(0);
    expect(wireAmountToCents("10.005")).toBe(1001); // half-up in cents
    expect(wireAmountToCents("abc")).toBeNull();
    expect(wireAmountToCents(null)).toBeNull();
    expect(wireAmountToCents(undefined)).toBeNull();
    expect(wireAmountToCents(NaN)).toBeNull();
    expect(wireAmountToCents({})).toBeNull();
  });

  it("round-trips cents to wire amounts", () => {
    expect(centsToWireAmount(1826)).toBe(18.26);
    expect(centsToWireAmount(wireAmountToCents("0.10")!)).toBe(0.1);
  });
});
