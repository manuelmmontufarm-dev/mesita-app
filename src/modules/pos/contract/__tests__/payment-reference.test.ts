import { describe, it, expect } from "vitest";
import {
  deriveNumeroComprobante,
  NUMERO_COMPROBANTE_LENGTH,
} from "../payment-reference";

describe("numero_comprobante derivation", () => {
  it("is exactly 15 chars (documented varchar(15) max)", () => {
    const ref = deriveNumeroComprobante("0b0e5db1-7a86-4dd1-9d3f-2f45c47f3f0a");
    expect(ref).toHaveLength(NUMERO_COMPROBANTE_LENGTH);
    expect(ref.startsWith("MSTA")).toBe(true);
    expect(ref).toMatch(/^MSTA[0-9A-F]{11}$/);
  });

  it("is deterministic — reconciliation depends on this", () => {
    const a = deriveNumeroComprobante("payment-1");
    expect(deriveNumeroComprobante("payment-1")).toBe(a);
    expect(deriveNumeroComprobante("payment-2")).not.toBe(a);
  });

  it("refuses empty payment ids", () => {
    expect(() => deriveNumeroComprobante("")).toThrow();
  });
});
