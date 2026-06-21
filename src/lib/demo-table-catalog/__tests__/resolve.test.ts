import { describe, it, expect } from "vitest";

import {
  DEMO_TABLE_DEFINITIONS,
  isCatalogDemoToken,
  listDemoTables,
  resolveDemoTableToken,
} from "@/lib/demo-table-catalog";

describe("demo-table-catalog/resolve", () => {
  it("resolves `demo` to the default definition", () => {
    const def = resolveDemoTableToken("demo");
    expect(def).not.toBeNull();
    expect(def?.slug).toBe("default");
    expect(def?.table.name).toBe("12");
    expect(def?.restaurant.name).toBe("La Doña Pepa");
  });

  it.each(["mesa-1", "mesa-2", "mesa-3", "mesa-4"])(
    "resolves `demo-%s` to the matching slug",
    (slug) => {
      const def = resolveDemoTableToken(`demo-${slug}`);
      expect(def).not.toBeNull();
      expect(def?.slug).toBe(slug);
      expect(def?.token).toBe(`demo-${slug}`);
    },
  );

  it("returns null for unknown demo slugs", () => {
    expect(resolveDemoTableToken("demo-unknown")).toBeNull();
    expect(resolveDemoTableToken("demo-mesa-99")).toBeNull();
  });

  it("does NOT match live Postgres-seeded tokens (tkn-mesa-01-demo)", () => {
    expect(resolveDemoTableToken("tkn-mesa-01-demo")).toBeNull();
    expect(isCatalogDemoToken("tkn-mesa-01-demo")).toBe(false);
  });

  it("rejects injection-style tokens", () => {
    expect(resolveDemoTableToken("demo-../")).toBeNull();
    expect(resolveDemoTableToken("demo-mesa 1")).toBeNull();
    expect(resolveDemoTableToken("demo-MESA-1")).toBeNull();
    expect(resolveDemoTableToken("demo-")).toBeNull();
    expect(resolveDemoTableToken("")).toBeNull();
    // @ts-expect-error — defensive against bad runtime input
    expect(resolveDemoTableToken(undefined)).toBeNull();
    // @ts-expect-error — defensive against bad runtime input
    expect(resolveDemoTableToken(null)).toBeNull();
  });

  it("isCatalogDemoToken matches resolve outcome", () => {
    expect(isCatalogDemoToken("demo")).toBe(true);
    expect(isCatalogDemoToken("demo-mesa-1")).toBe(true);
    expect(isCatalogDemoToken("demo-bogus")).toBe(false);
  });

  it("listDemoTables returns 5 unique slugs and tokens", () => {
    const all = listDemoTables();
    expect(all.length).toBe(5);
    const slugs = new Set(all.map((d) => d.slug));
    const tokens = new Set(all.map((d) => d.token));
    expect(slugs.size).toBe(5);
    expect(tokens.size).toBe(5);
    expect(tokens.has("demo")).toBe(true);
    expect(tokens.has("demo-mesa-1")).toBe(true);
    expect(tokens.has("demo-mesa-2")).toBe(true);
    expect(tokens.has("demo-mesa-3")).toBe(true);
    expect(tokens.has("demo-mesa-4")).toBe(true);
  });

  it("default definition content matches the legacy hardcoded state byte-for-byte", () => {
    const def = resolveDemoTableToken("demo");
    expect(def?.items.map((i) => i.id)).toEqual([
      "locro",
      "seco",
      "encebollado",
      "ceviche",
      "jugo-1",
      "jugo-2",
      "club-1",
      "club-2",
    ]);
    expect(def?.restaurant).toEqual({
      name: "La Doña Pepa",
      tagline: "Comida casera ecuatoriana",
      city: "Quito",
      ivaRate: 0.15,
      serviceRate: 0.1,
      serviceEnabled: true,
    });
    expect(def?.seed).toBeUndefined();
  });

  it("mesa-2 has a seeded partial-payment state", () => {
    const def = DEMO_TABLE_DEFINITIONS.find((d) => d.slug === "mesa-2");
    expect(def?.seed?.paidItemIds).toContain("fritada");
    expect(def?.seed?.itemPaidUnits?.empanada).toBe(1);
  });

  it("mesa-4 bill total is >= $50 to trigger invoice flow", () => {
    const def = DEMO_TABLE_DEFINITIONS.find((d) => d.slug === "mesa-4");
    const total =
      def?.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0) ?? 0;
    expect(total).toBeGreaterThanOrEqual(50);
  });
});
