import { describe, expect, it } from "vitest";

import { assignPayerBadges, badgesForGuest } from "../payer-badges";

const t0 = "2026-06-19T20:00:00.000Z";
const t1 = "2026-06-19T20:01:00.000Z";
const t2 = "2026-06-19T20:08:00.000Z";

describe("assignPayerBadges", () => {
  it("gives a solo-table quip instead of fastest when alone", () => {
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
        {
          guestId: "a",
          guestName: "Ana",
          amount: 43,
          tip: 3,
          mode: "todo",
          createdAt: t1,
        },
      ],
      { final: true },
    );
    const ana = badgesForGuest(awards, "a");
    expect(ana).toHaveLength(1);
    expect(ana[0]?.id).not.toBe("fastest");
    expect(ana[0]?.id).toBe("todo-king");
  });

  it("picks one primary badge per guest when table closes", () => {
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
    expect(badgesForGuest(awards, "a")).toEqual([
      expect.objectContaining({ id: "fastest" }),
    ]);
    expect(badgesForGuest(awards, "b")).toEqual([
      expect.objectContaining({ id: "slowest" }),
    ]);
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
    expect(badgesForGuest(fin, "b")).toEqual([
      expect.objectContaining({ id: "slowest" }),
    ]);
  });
});
