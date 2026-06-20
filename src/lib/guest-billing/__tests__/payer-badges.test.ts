import { describe, expect, it } from "vitest";

import { assignPayerBadges, badgesForGuest } from "../payer-badges";

const t0 = "2026-06-19T20:00:00.000Z";
const t1 = "2026-06-19T20:01:00.000Z";
const t2 = "2026-06-19T20:08:00.000Z";

describe("assignPayerBadges", () => {
  it("gives fastest and mr money to solo payer", () => {
    const awards = assignPayerBadges(
      [
        {
          guestId: "a",
          guestName: "Ana",
          amount: 12,
          tip: 2,
          mode: "item",
          createdAt: t0,
        },
      ],
      { final: true },
    );
    const ana = badgesForGuest(awards, "a").map((b) => b.id);
    expect(ana).toContain("fastest");
    expect(ana).toContain("mr-money");
    expect(ana).toContain("picky");
  });

  it("assigns fastest, slowest, mr money, and saver when table closes", () => {
    const awards = assignPayerBadges(
      [
        {
          guestId: "a",
          guestName: "Ana",
          amount: 10,
          tip: 1,
          mode: "item",
          createdAt: t0,
        },
        {
          guestId: "b",
          guestName: "Bob",
          amount: 25,
          tip: 5,
          mode: "todo",
          createdAt: t2,
        },
      ],
      { final: true },
    );
    expect(badgesForGuest(awards, "a").some((b) => b.id === "fastest")).toBe(true);
    expect(badgesForGuest(awards, "a").some((b) => b.id === "saver")).toBe(true);
    expect(badgesForGuest(awards, "b").some((b) => b.id === "slowest")).toBe(true);
    expect(badgesForGuest(awards, "b").some((b) => b.id === "mr-money")).toBe(true);
    expect(badgesForGuest(awards, "b").some((b) => b.id === "todo-king")).toBe(true);
  });

  it("holds slowest badge until final", () => {
    const mid = assignPayerBadges(
      [
        { guestId: "a", guestName: "A", amount: 10, tip: 0, mode: "equal", createdAt: t0 },
        { guestId: "b", guestName: "B", amount: 10, tip: 0, mode: "equal", createdAt: t1 },
      ],
      { final: false },
    );
    expect(badgesForGuest(mid, "b").some((b) => b.id === "slowest")).toBe(false);

    const fin = assignPayerBadges(
      [
        { guestId: "a", guestName: "A", amount: 10, tip: 0, mode: "equal", createdAt: t0 },
        { guestId: "b", guestName: "B", amount: 10, tip: 0, mode: "equal", createdAt: t1 },
      ],
      { final: true },
    );
    expect(badgesForGuest(fin, "b").some((b) => b.id === "slowest")).toBe(true);
  });
});
