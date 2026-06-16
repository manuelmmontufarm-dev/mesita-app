/**
 * Shared display formatters — es-EC locale, America/Guayaquil timezone.
 * Use these instead of ad-hoc `$${n.toFixed(2)}` / toLocaleString calls.
 */

const currencyFormatter = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatCurrency(n: number): string {
  return currencyFormatter.format(Number.isFinite(n) ? n : 0);
}

export function formatDateTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/**
 * Relative time in Spanish: "justo ahora", "hace 2 min", "hace 3 h", "hace 2 días".
 * Falls back to the absolute date past 7 days.
 */
export function formatRelativeTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "justo ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;

  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "hace 1 día";
  if (diffD < 7) return `hace ${diffD} días`;

  return formatDateTime(date);
}
