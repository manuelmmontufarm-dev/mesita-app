import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";

import { computeBillShellScrollMetrics } from "@/lib/guest-billing/bill-shell-scroll";

/** Probe the live document for the receipt peek state. We can't read it
 *  via React props from inside a generic hook, but `<html>` carries the
 *  `has-receipt-peek` class as the single source of truth — set by
 *  `GuestBillFlow` via `useEffect`. Returns false during SSR. */
function isReceiptPeekVisible(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("has-receipt-peek");
}

/**
 * Bill / confirm / payment dock: mini pill while scrolling, full bar at bottom.
 * Uses scroll hysteresis so dock height changes do not oscillate at the threshold.
 */
export function useCollapsiblePayDock(
  scrollRef: RefObject<HTMLDivElement | null>,
  remeasureDeps: readonly unknown[],
  enabled: boolean,
) {
  const [atBottom, setAtBottom] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const dockExpandedRef = useRef(true);
  /** Track the last metric read — if the user isn't actively scrolling
   *  and ResizeObserver fires because of OUR own dock-height change, we
   *  short-circuit to break feedback loops. R3 regression fix. */
  const lastScrollTopRef = useRef<number | null>(null);

  const readMetrics = useCallback(
    (el: HTMLDivElement) => {
      const metrics = computeBillShellScrollMetrics(el, {
        dockExpanded: dockExpandedRef.current,
        receiptPeekVisible: isReceiptPeekVisible(),
      });
      const expanded = !enabled || metrics.atBottom || !metrics.scrollable;
      dockExpandedRef.current = expanded;
      lastScrollTopRef.current = el.scrollTop;
      return metrics;
    },
    [enabled],
  );

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const metrics = readMetrics(e.currentTarget);
      setAtBottom(metrics.atBottom);
      setScrollable(metrics.scrollable);
    },
    [readMetrics],
  );

  const remeasureScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const metrics = readMetrics(el);
    setAtBottom(metrics.atBottom);
    setScrollable(metrics.scrollable);
  }, [scrollRef, readMetrics]);

  useLayoutEffect(() => {
    remeasureScroll();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    /** Debounce ResizeObserver bursts caused by our own padding ⇄ dock-height
     *  feedback. One animation frame is enough to coalesce concurrent
     *  observations and avoid the per-frame oscillation reported in R3. */
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        remeasureScroll();
      });
    });
    ro.observe(el);
    for (const child of el.children) {
      ro.observe(child);
    }
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content-height deps only
  }, remeasureDeps);

  const dockExpanded = !enabled || atBottom || !scrollable;

  useLayoutEffect(() => {
    if (!enabled) return;
    remeasureScroll();
  }, [enabled, remeasureScroll]);
  // ↑ `dockExpanded` intentionally removed from deps (R3 fix): re-measuring
  //   on every dockExpanded transition was the inner loop driving the
  //   confirm-stage oscillation when the receipt peek was visible.

  return { handleScroll, dockExpanded, atBottom, scrollable, remeasureScroll };
}
