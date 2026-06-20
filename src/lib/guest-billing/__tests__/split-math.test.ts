import { describe, expect, it } from "vitest";

import type { BillItem, Claims, RestaurantConfig, TableMember } from "../types";
import {
  billSubtotal,
  claimantsOf,
  claimedUnits,
  computeTotals,
  fmt,
  freeUnits,
  GUEST_PREFIX,
  guestLabel,
  displayPillLabel,
  memberPillLabel,
  initialsFor,
  guestAvatarHue,
  normalizeMemberName,
  personNumberFromLabel,
  hueFromGuestId,
  isItemPaid,
  itemOwed,
  lineTotal,
  memberSubtotal,
  namePillLabel,
  paidSubtotal,
  round2,
  unclaimedItems,
  unitsOf,
  unpaidItems,
} from "../split-math";

const items: BillItem[] = [
  { id: "loc", name: "Locro", qty: 1, unitPrice: 4.5 },
  { id: "sec", name: "Seco", qty: 1, unitPrice: 8.9 },
  { id: "cev", name: "Ceviche", qty: 1, unitPrice: 9.5 },
  { id: "enc", name: "Encebollado", qty: 1, unitPrice: 6.0 },
];

const roster: TableMember[] = [
  { id: "you", name: "Tú", initials: "Tú", hue: 265, isYou: true },
  { id: "manuel", name: "Manuel", initials: "MA", hue: 222 },
  { id: "ana", name: "Ana", initials: "AN", hue: 152 },
];

const baseConfig: Pick<
  RestaurantConfig,
  "ivaRate" | "serviceRate" | "serviceEnabled"
> = {
  ivaRate: 0.15,
  serviceRate: 0.1,
  serviceEnabled: true,
};

describe("currency primitives", () => {
  it("round2 rounds to 2 decimals via Math.round (IEEE-754 semantics)", () => {
    // Matches data.jsx verbatim: Math.round(n * 100) / 100.
    // 1.005 * 100 = 100.49999… in IEEE-754 → rounds to 100 → 1.
    // Documenting actual behavior so future refactors don't drift.
    expect(round2(1.005)).toBe(1);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(0)).toBe(0);
  });

  it("fmt formats USD with two decimals and $ prefix", () => {
    expect(fmt(0)).toBe("$0.00");
    expect(fmt(4.5)).toBe("$4.50");
    expect(fmt(9.999)).toBe("$10.00");
  });

  it("lineTotal multiplies qty × unitPrice", () => {
    expect(lineTotal({ qty: 2, unitPrice: 3.25 })).toBe(6.5);
  });

  it("billSubtotal sums all line totals", () => {
    expect(billSubtotal(items)).toBeCloseTo(4.5 + 8.9 + 9.5 + 6.0, 5);
  });
});

describe("initialsFor", () => {
  it("returns 'Tú' for empty / nullish names", () => {
    expect(initialsFor("")).toBe("Tú");
    expect(initialsFor("   ")).toBe("Tú");
    expect(initialsFor(null)).toBe("Tú");
    expect(initialsFor(undefined)).toBe("Tú");
  });

  it("preserves legacy P labels in initialsFor", () => {
    expect(initialsFor("P1")).toBe("P1");
    expect(initialsFor("p2")).toBe("P2");
    expect(initialsFor(`${GUEST_PREFIX}10`)).toBe("P10");
  });

  it("abbreviates Persona labels for compact initials", () => {
    expect(initialsFor("Persona 1")).toBe("P1");
    expect(initialsFor("Persona 12")).toBe("P12");
  });

  it("returns first two characters uppercased for real names", () => {
    expect(initialsFor("Juanito")).toBe("JU");
    expect(initialsFor("ana")).toBe("AN");
    expect(initialsFor("manuel")).toBe("MA");
    expect(initialsFor("María José")).toBe("MA");
  });
});

describe("namePillLabel", () => {
  it("returns Tú for empty names", () => {
    expect(namePillLabel("")).toBe("Tú");
    expect(namePillLabel("   ")).toBe("Tú");
  });

  it("keeps short names whole up to 10 characters", () => {
    expect(namePillLabel("Juanito")).toBe("Juanito");
    expect(namePillLabel("La Ñaña")).toBe("La Ñaña");
  });

  it("truncates longer names at 10 characters", () => {
    expect(namePillLabel("María José")).toBe("María José");
    expect(namePillLabel("El Panita")).toBe("El Panita");
    expect(namePillLabel("Supercalifrag")).toBe("Supercalif");
  });
});

describe("guestLabel & displayPillLabel", () => {
  it("formats sequential guests as Persona N", () => {
    expect(guestLabel(1)).toBe("Persona 1");
    expect(guestLabel(2)).toBe("Persona 2");
  });

  it("maps legacy P2 to Persona 2 in pills", () => {
    expect(displayPillLabel("P2")).toBe("Persona 2");
    expect(displayPillLabel("Persona 3")).toBe("Persona 3");
  });

  it("memberPillLabel prefers typed name for you", () => {
    expect(memberPillLabel({ isYou: true, name: "Tú" }, "Manuel")).toBe("Manuel");
    expect(memberPillLabel({ isYou: true, name: "Tú" }, "")).toBe("Tú");
    expect(memberPillLabel({ name: "Persona 2" }, undefined)).toBe("Persona 2");
  });

  it("normalizeMemberName strips Invitado", () => {
    expect(normalizeMemberName("Invitado", "Persona 2")).toBe("Persona 2");
    expect(normalizeMemberName("", "Persona 3")).toBe("Persona 3");
    expect(normalizeMemberName("Manuel", "Persona 1")).toBe("Manuel");
  });

  it("guestAvatarHue uses fixed cheerful palette", () => {
    expect(guestAvatarHue(0)).toBe(152);
    expect(guestAvatarHue(1)).toBe(210);
    expect(guestAvatarHue(2)).toBe(275);
  });

  it("personNumberFromLabel parses Persona N", () => {
    expect(personNumberFromLabel("Persona 3")).toBe(3);
    expect(personNumberFromLabel("persona 1")).toBe(1);
    expect(personNumberFromLabel("Manuel")).toBeNull();
  });

  it("hueFromGuestId is stable for same id", () => {
    const a = hueFromGuestId("abc-123");
    const b = hueFromGuestId("abc-123");
    expect(a).toBe(b);
  });
});

describe("claims helpers", () => {
  const claims: Claims = {
    loc: { ana: 1 },
    sec: { manuel: 1 },
    cev: { manuel: 0.5, ana: 0.5 },
  };

  it("unitsOf returns claimed units, 0 if missing", () => {
    expect(unitsOf(claims, "loc", "ana")).toBe(1);
    expect(unitsOf(claims, "cev", "manuel")).toBe(0.5);
    expect(unitsOf(claims, "enc", "ana")).toBe(0);
    expect(unitsOf(claims, "missing", "ana")).toBe(0);
  });

  it("claimedUnits sums every member's units for an item", () => {
    expect(claimedUnits(claims, "loc")).toBe(1);
    expect(claimedUnits(claims, "cev")).toBe(1);
    expect(claimedUnits(claims, "enc")).toBe(0);
  });

  it("claimantsOf returns member ids in roster order", () => {
    expect(claimantsOf(claims, "cev", roster)).toEqual(["manuel", "ana"]);
    expect(claimantsOf(claims, "enc", roster)).toEqual([]);
  });

  it("freeUnits = qty − claimedUnits, rounded to 2dp", () => {
    expect(freeUnits(items[0], claims)).toBe(0);
    expect(freeUnits(items[2], claims)).toBe(0);
    expect(freeUnits(items[3], claims)).toBe(1);
  });

  it("itemOwed = units × unitPrice (handles fractional)", () => {
    expect(itemOwed(items[2], claims, "manuel")).toBeCloseTo(4.75, 5);
    expect(itemOwed(items[2], claims, "ana")).toBeCloseTo(4.75, 5);
    expect(itemOwed(items[0], claims, "manuel")).toBe(0);
  });

  it("memberSubtotal sums one member's owed across the bill", () => {
    expect(memberSubtotal(items, claims, "manuel")).toBeCloseTo(8.9 + 4.75, 5);
    expect(memberSubtotal(items, claims, "ana")).toBeCloseTo(4.5 + 4.75, 5);
    expect(memberSubtotal(items, claims, "you")).toBe(0);
  });

  it("unclaimedItems excludes items with no free units", () => {
    const free = unclaimedItems(items, claims).map((it) => it.id);
    expect(free).toEqual(["enc"]);
  });

  it("fractional epsilon: residuals below 0.001 are treated as claimed", () => {
    const epsClaims: Claims = { loc: { ana: 0.9995 } };
    expect(
      unclaimedItems(items, epsClaims).find((it) => it.id === "loc"),
    ).toBeUndefined();
  });
});

describe("paid-items helpers", () => {
  const paid = ["loc", "cev"];

  it("isItemPaid checks membership", () => {
    expect(isItemPaid(paid, "loc")).toBe(true);
    expect(isItemPaid(paid, "enc")).toBe(false);
  });

  it("paidSubtotal sums full lineTotal of paid items (paid-for-all rule)", () => {
    expect(paidSubtotal(items, paid)).toBeCloseTo(4.5 + 9.5, 5);
  });

  it("unpaidItems returns the rest", () => {
    expect(unpaidItems(items, paid).map((i) => i.id)).toEqual(["sec", "enc"]);
  });
});

describe("computeTotals", () => {
  it("applies IVA 15%, tip %, and service 10% when enabled", () => {
    const t = computeTotals(100, baseConfig, 10);
    expect(t.subtotal).toBe(100);
    expect(t.iva).toBeCloseTo(15, 5);
    expect(t.propina).toBeCloseTo(10, 5);
    expect(t.servicio).toBeCloseTo(10, 5);
    expect(t.total).toBeCloseTo(135, 5);
  });

  it("skips servicio when disabled", () => {
    const t = computeTotals(100, { ...baseConfig, serviceEnabled: false }, 15);
    expect(t.servicio).toBe(0);
    expect(t.total).toBeCloseTo(100 + 15 + 15, 5);
  });

  it("handles tip = 0", () => {
    const t = computeTotals(50, baseConfig, 0);
    expect(t.propina).toBe(0);
    expect(t.total).toBeCloseTo(50 + 7.5 + 5, 5);
  });

  it("handles subtotal = 0", () => {
    const t = computeTotals(0, baseConfig, 20);
    expect(t).toEqual({
      subtotal: 0,
      iva: 0,
      propina: 0,
      servicio: 0,
      total: 0,
    });
  });
});

describe("integration: mixed claim + paid scenario", () => {
  // Replicates the design seed: Ana paid her Locro, Manuel/Ana shared Ceviche,
  // Manuel claimed Seco, Encebollado free.
  const claims: Claims = {
    sec: { manuel: 1 },
    cev: { manuel: 0.5, ana: 0.5 },
    loc: { ana: 1 },
  };
  const paidItemIds = ["loc"];

  it("Ana's unpaid subtotal = remaining cev share only", () => {
    const ana = memberSubtotal(unpaidItems(items, paidItemIds), claims, "ana");
    expect(ana).toBeCloseTo(4.75, 5);
  });

  it("Manuel's unpaid subtotal = Seco + half Ceviche", () => {
    const manuel = memberSubtotal(
      unpaidItems(items, paidItemIds),
      claims,
      "manuel",
    );
    expect(manuel).toBeCloseTo(8.9 + 4.75, 5);
  });

  it("paidSubtotal reflects only Locro (paid for all)", () => {
    expect(paidSubtotal(items, paidItemIds)).toBe(4.5);
  });

  it("remaining subtotal = bill − paid", () => {
    const remaining = billSubtotal(items) - paidSubtotal(items, paidItemIds);
    expect(remaining).toBeCloseTo(8.9 + 9.5 + 6.0, 5);
  });
});
