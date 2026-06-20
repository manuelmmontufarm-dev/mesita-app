import { initialsFor } from "@/lib/guest-billing/split-math";

/** Scroll metrics for the bill shell — pure helpers for UI + tests. */

export const SCROLL_BOTTOM_THRESHOLD_PX = 40;
export const SCROLLABLE_OVERFLOW_PX = 12;

export interface ScrollMetricsInput {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export function isScrollAtBottom({
  scrollTop,
  clientHeight,
  scrollHeight,
}: ScrollMetricsInput): boolean {
  return scrollTop + clientHeight >= scrollHeight - SCROLL_BOTTOM_THRESHOLD_PX;
}

export function isContentScrollable({
  clientHeight,
  scrollHeight,
}: Pick<ScrollMetricsInput, "clientHeight" | "scrollHeight">): boolean {
  return scrollHeight > clientHeight + SCROLLABLE_OVERFLOW_PX;
}

export function computeBillShellScrollMetrics(
  el: ScrollMetricsInput | null | undefined,
): { atBottom: boolean; scrollable: boolean } {
  if (!el) return { atBottom: false, scrollable: false };
  return {
    atBottom: isScrollAtBottom(el),
    scrollable: isContentScrollable(el),
  };
}

/** Initials in the payer avatar circle (typed name wins over seat fallback). */
export function payerAvatarInitials(
  typedName: string,
  fallbackLabel: string,
): string {
  const trimmed = typedName.trim();
  if (trimmed) return initialsFor(trimmed);
  return initialsFor(fallbackLabel || "Tú");
}
