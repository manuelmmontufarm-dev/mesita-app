import type { ErrorEvent, EventHint } from "@sentry/nextjs";
// TransactionEvent is not re-exported from @sentry/nextjs's public surface in
// this SDK version — @sentry/core is the shared type source underneath both
// beforeSend (ErrorEvent) and beforeSendTransaction (TransactionEvent).
import type { TransactionEvent, Breadcrumb, Exception } from "@sentry/core";
import { redact } from "@/lib/redact";

type AnySentryEvent = ErrorEvent | TransactionEvent;

/**
 * Sentry beforeSend/beforeSendTransaction hook.
 *
 * Redaction is layered on top of `sendDefaultPii: false` (never send IP,
 * cookies, request headers by default). This hook is the last line of
 * defense against secrets/PII that end up in exception messages, breadcrumbs,
 * or `extra`/`contexts` payloads that individual call sites forgot to scrub.
 *
 * Never send: API keys/auth headers, PAN/CVV/payment tokens, full cédula/RUC,
 * full email/phone/address, database URLs.
 */

const SECRET_PATTERNS: RegExp[] = [
  // Database connection strings (postgresql://user:pass@host or similar)
  /\b\w+:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
  // Authorization headers, e.g. "Authorization: Bearer sk_live_abc123"
  /\bauthorization\s*[:=]\s*(?:bearer\s+)?\S+/gi,
  // Bare bearer tokens outside an "Authorization:" prefix
  /\bbearer\s+\S+/gi,
  // Card-like 13-19 digit sequences (PAN)
  /\b(?:\d[ -]?){13,19}\b/g,
  // CVV-labeled 3-4 digit sequences
  /\bcvv\s*[:=]?\s*\d{3,4}\b/gi,
];

function scrubString(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

function deepScrub<T>(value: T): T {
  if (typeof value === "string") {
    return scrubString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepScrub(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    // redact() already strips known sensitive keys (email, password, token,
    // paymentToken, cardNumber, identificacion, etc. — see src/lib/log.ts).
    const stripped = redact(value) as Record<string, unknown>;
    for (const key of Object.keys(stripped)) {
      stripped[key] = deepScrub(stripped[key]);
    }
    return stripped as unknown as T;
  }
  return value;
}

function scrubEvent(event: AnySentryEvent): AnySentryEvent {
  // Request data (headers, cookies, query string) can carry auth tokens or
  // full identifiers — drop it rather than try to selectively scrub it.
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.data) {
      event.request.data = deepScrub(event.request.data);
    }
  }

  if (event.user) {
    // Keep only an opaque id if present; drop email/ip/username outright.
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  if (event.extra) {
    event.extra = deepScrub(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = deepScrub(event.contexts) as typeof event.contexts;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb: Breadcrumb) => ({
      ...crumb,
      message: crumb.message ? scrubString(crumb.message) : crumb.message,
      data: crumb.data ? deepScrub(crumb.data) : crumb.data,
    }));
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exc: Exception) => ({
      ...exc,
      value: exc.value ? scrubString(exc.value) : exc.value,
    }));
  }

  if (event.message) {
    event.message = scrubString(event.message);
  }

  return event;
}

export function sentryBeforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  return scrubEvent(event) as ErrorEvent;
}

export function sentryBeforeSendTransaction(
  event: TransactionEvent,
  _hint: EventHint
): TransactionEvent | null {
  return scrubEvent(event) as TransactionEvent;
}
