import { describe, expect, it } from "vitest";

import {
  computeBillShellScrollMetrics,
  isContentScrollable,
  isScrollAtBottom,
  payerAvatarInitials,
  SCROLLABLE_OVERFLOW_PX,
  SCROLL_BOTTOM_THRESHOLD_PX,
} from "@/lib/guest-billing/bill-shell-scroll";

describe("bill-shell-scroll", () => {
  describe("isScrollAtBottom", () => {
    it("returns true when within bottom threshold", () => {
      expect(
        isScrollAtBottom({
          scrollTop: 560,
          clientHeight: 400,
          scrollHeight: 1000,
        }),
      ).toBe(true);
    });

    it("returns false when far from bottom", () => {
      expect(
        isScrollAtBottom({
          scrollTop: 0,
          clientHeight: 400,
          scrollHeight: 1000,
        }),
      ).toBe(false);
    });

    it("uses SCROLL_BOTTOM_THRESHOLD_PX at the edge", () => {
      const clientHeight = 400;
      const scrollHeight = 1000;
      const scrollTop =
        scrollHeight - clientHeight - SCROLL_BOTTOM_THRESHOLD_PX;
      expect(
        isScrollAtBottom({ scrollTop, clientHeight, scrollHeight }),
      ).toBe(true);
    });

    it("keeps atBottom longer when dock is expanded (hysteresis)", () => {
      const input = { scrollTop: 500, clientHeight: 400, scrollHeight: 1000 };
      expect(isScrollAtBottom(input)).toBe(false);
      expect(isScrollAtBottom(input, { dockExpanded: true })).toBe(true);
    });
  });

  describe("isContentScrollable", () => {
    it("returns false when content fits viewport", () => {
      expect(
        isContentScrollable({ clientHeight: 800, scrollHeight: 805 }),
      ).toBe(false);
    });

    it("returns true when overflow exceeds threshold", () => {
      expect(
        isContentScrollable({
          clientHeight: 400,
          scrollHeight: 400 + SCROLLABLE_OVERFLOW_PX + 1,
        }),
      ).toBe(true);
    });
  });

  describe("computeBillShellScrollMetrics", () => {
    it("returns safe defaults for null element", () => {
      expect(computeBillShellScrollMetrics(null)).toEqual({
        atBottom: false,
        scrollable: false,
      });
    });

    it("combines atBottom and scrollable for tall bill content", () => {
      expect(
        computeBillShellScrollMetrics({
          scrollTop: 0,
          clientHeight: 500,
          scrollHeight: 1200,
        }),
      ).toEqual({ atBottom: false, scrollable: true });
    });
  });

  describe("payerAvatarInitials", () => {
    it("uses typed name when present", () => {
      expect(payerAvatarInitials("Manuel", "Persona 1")).toBe("MA");
    });

    it("falls back to seat label when input empty", () => {
      expect(payerAvatarInitials("", "Persona 1")).toBe("P1");
    });

    it("handles Persona N legacy labels", () => {
      expect(payerAvatarInitials("", "Persona 3")).toBe("P3");
    });
  });
});
