import { initialsFor } from "@/lib/guest-billing/split-math";

/** Scroll metrics for the bill shell — pure helpers for UI + tests. */

export const SCROLL_BOTTOM_THRESHOLD_PX = 40;
/** Base hysteresis when dock is already expanded (anti-flicker). */
export const SCROLL_COLLAPSE_HYSTERESIS_PX = 100;
/** Extra hysteresis when the receipt peek is also present underneath
 *  the dock — the larger combined stack reshapes the viewport more
 *  aggressively, so a single mini↔full flip is the difference between
 *  ~110px and ~190px of bottom chrome. Without this larger window the
 *  user gets caught in a feedback loop where padding-bottom drifts and
 *  drives a new metric read every frame. */
export const SCROLL_COLLAPSE_HYSTERESIS_PEEK_PX = 60;
export const SCROLLABLE_OVERFLOW_PX = 12;

export interface ScrollMetricsInput {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface ScrollMetricsOptions {
  /** When true, keep "at bottom" until the user scrolls further up (anti-flicker). */
  dockExpanded?: boolean;
  /** True when the receipt peek is currently below the dock — applies
   *  the larger anti-flicker window. R3 regression fix (2026-06-23). */
  receiptPeekVisible?: boolean;
}

export function isScrollAtBottom(
  { scrollTop, clientHeight, scrollHeight }: ScrollMetricsInput,
  options?: ScrollMetricsOptions,
): boolean {
  let threshold = SCROLL_BOTTOM_THRESHOLD_PX;
  if (options?.dockExpanded) {
    threshold += SCROLL_COLLAPSE_HYSTERESIS_PX;
    if (options.receiptPeekVisible) {
      threshold += SCROLL_COLLAPSE_HYSTERESIS_PEEK_PX;
    }
  }
  return scrollTop + clientHeight >= scrollHeight - threshold;
}

export function isContentScrollable({
  clientHeight,
  scrollHeight,
}: Pick<ScrollMetricsInput, "clientHeight" | "scrollHeight">): boolean {
  return scrollHeight > clientHeight + SCROLLABLE_OVERFLOW_PX;
}

export function computeBillShellScrollMetrics(
  el: ScrollMetricsInput | null | undefined,
  options?: ScrollMetricsOptions,
): { atBottom: boolean; scrollable: boolean } {
  if (!el) return { atBottom: false, scrollable: false };
  return {
    atBottom: isScrollAtBottom(el, options),
    scrollable: isContentScrollable(el),
  };
}

/** Reserve scroll space for the expanded dock — avoids mini↔full padding feedback loops. */
export function measureExpandedPayStackHeight(el: HTMLElement): number {
  const hadMini = el.classList.contains("dock-mini");
  if (hadMini) {
    el.classList.remove("dock-mini");
    el.classList.add("dock-full");
  }
  const height = Math.ceil(el.getBoundingClientRect().height);
  if (hadMini) {
    el.classList.add("dock-mini");
    el.classList.remove("dock-full");
  }
  return height > 0 ? height : el.offsetHeight;
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
