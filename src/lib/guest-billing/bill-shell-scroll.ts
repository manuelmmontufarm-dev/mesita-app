import { initialsFor } from "@/lib/guest-billing/split-math";

/** Scroll metrics for the bill shell — pure helpers for UI + tests. */

export const SCROLL_BOTTOM_THRESHOLD_PX = 40;
export const SCROLL_COLLAPSE_HYSTERESIS_PX = 100;
export const SCROLLABLE_OVERFLOW_PX = 12;

export interface ScrollMetricsInput {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface ScrollMetricsOptions {
  /** When true, keep "at bottom" until the user scrolls further up (anti-flicker). */
  dockExpanded?: boolean;
}

export function isScrollAtBottom(
  { scrollTop, clientHeight, scrollHeight }: ScrollMetricsInput,
  options?: ScrollMetricsOptions,
): boolean {
  const threshold =
    SCROLL_BOTTOM_THRESHOLD_PX +
    (options?.dockExpanded ? SCROLL_COLLAPSE_HYSTERESIS_PX : 0);
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
  if (!el.classList.contains("dock-mini")) return el.offsetHeight;
  el.classList.remove("dock-mini");
  el.classList.add("dock-full");
  const height = el.offsetHeight;
  el.classList.add("dock-mini");
  el.classList.remove("dock-full");
  return height;
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
