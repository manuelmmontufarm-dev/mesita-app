import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import { refreshDemoStateFromPos } from "@/lib/demo-table-store";

let lastRefreshAt = 0;
const MIN_REFRESH_MS = 4_000;

/** Refresca mesas 1–4 en POS sin bloquear la respuesta del dashboard. */
export function scheduleDashboardPosRefresh(): void {
  const now = Date.now();
  if (now - lastRefreshAt < MIN_REFRESH_MS) return;
  lastRefreshAt = now;

  void Promise.all(
    DEMO_TABLE_DEFINITIONS.map((d) =>
      refreshDemoStateFromPos(d.token).catch(() => null),
    ),
  );
}
