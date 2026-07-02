import { describe, it, expect } from "vitest";
import {
  buildTableMappingValue,
  parseTableMappingValue,
  resolveTableMappings,
  resolveTableField,
  isAllowedTableField,
  MAX_POS_EXTERNAL_ID_LENGTH,
} from "../table-mapping";

describe("table mapping — frozen rule", () => {
  it("builds MESITA_TABLE:<posExternalId>", () => {
    expect(buildTableMappingValue("MESA-12")).toBe("MESITA_TABLE:MESA-12");
    expect(buildTableMappingValue("  MESA-12  ")).toBe("MESITA_TABLE:MESA-12");
  });

  it("rejects invalid external ids at build time", () => {
    expect(() => buildTableMappingValue("")).toThrow();
    expect(() => buildTableMappingValue("   ")).toThrow();
    expect(() => buildTableMappingValue("MESA 12")).toThrow(); // whitespace
    expect(() => buildTableMappingValue("MESA:12")).toThrow(); // colon
    expect(() => buildTableMappingValue("X".repeat(MAX_POS_EXTERNAL_ID_LENGTH + 1))).toThrow();
  });

  it("parses valid values and rejects missing prefix / empty id", () => {
    expect(parseTableMappingValue("MESITA_TABLE:MESA-12")).toBe("MESA-12");
    expect(parseTableMappingValue("  MESITA_TABLE:MESA-12  ")).toBe("MESA-12");
    expect(parseTableMappingValue("MESA-12")).toBeNull(); // no prefix
    expect(parseTableMappingValue("mesita_table:MESA-12")).toBeNull(); // case-sensitive
    expect(parseTableMappingValue("MESITA_TABLE:")).toBeNull(); // empty id
    expect(parseTableMappingValue("MESITA_TABLE:   ")).toBeNull();
    expect(parseTableMappingValue("MESITA_TABLE:A:B")).toBeNull(); // colon in id
    expect(parseTableMappingValue(null)).toBeNull();
    expect(parseTableMappingValue(42)).toBeNull();
    expect(parseTableMappingValue(`MESITA_TABLE:${"X".repeat(65)}`)).toBeNull();
  });

  it("flags ambiguous duplicate mappings instead of guessing", () => {
    const res = resolveTableMappings([
      { id: "DOC-A", mappingValue: "MESITA_TABLE:MESA-1" },
      { id: "DOC-B", mappingValue: "MESITA_TABLE:MESA-1" }, // duplicate!
      { id: "DOC-C", mappingValue: "MESITA_TABLE:MESA-2" },
      { id: "DOC-D", mappingValue: "sin mapeo" },
    ]);
    expect(res.mapped.get("MESA-2")).toBe("DOC-C");
    expect(res.mapped.has("MESA-1")).toBe(false); // neither doc wins
    expect(res.ambiguous.get("MESA-1")).toEqual(["DOC-A", "DOC-B"]);
    expect(res.unmapped).toEqual(["DOC-D"]);
  });

  it("field selection is configurable but restricted to documented fields", () => {
    expect(resolveTableField(undefined)).toBe("adicional1"); // default
    expect(resolveTableField(null)).toBe("adicional1");
    expect(resolveTableField("adicional2")).toBe("adicional2");
    expect(resolveTableField("descripcion")).toBe("descripcion");
    expect(resolveTableField("subtotal_12")).toBe("adicional1"); // not a free-text field
    expect(isAllowedTableField("adicional1")).toBe(true);
    expect(isAllowedTableField("cliente")).toBe(false);
  });
});
