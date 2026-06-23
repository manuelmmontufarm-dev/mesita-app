import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";

import { computeBillShellScrollMetrics } from "@/lib/guest-billing/bill-shell-scroll";

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

  const readMetrics = useCallback(
    (el: HTMLDivElement) => {
      const metrics = computeBillShellScrollMetrics(el, {
        dockExpanded: dockExpandedRef.current,
      });
      const expanded = !enabled || metrics.atBottom || !metrics.scrollable;
      dockExpandedRef.current = expanded;
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
    const ro = new ResizeObserver(() => remeasureScroll());
    ro.observe(el);
    for (const child of el.children) {
      ro.observe(child);
    }
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content-height deps only
  }, remeasureDeps);

  const dockExpanded = !enabled || atBottom || !scrollable;

  return { handleScroll, dockExpanded, atBottom, scrollable, remeasureScroll };
}
