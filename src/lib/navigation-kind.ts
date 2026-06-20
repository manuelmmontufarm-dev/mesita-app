/** True for QR scans / external links — false for reload/back-forward. */
export function isFreshDocumentNavigation(): boolean {
  if (typeof performance === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return nav?.type === "navigate";
}
