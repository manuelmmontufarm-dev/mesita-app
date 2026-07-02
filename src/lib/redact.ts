// Pure, runtime-agnostic redaction — no Node built-ins. Kept separate from
// log.ts (which uses Node's `crypto` for hashForLog) so this can be imported
// from Edge runtime code (e.g. src/sentry.edge.config.ts) without pulling in
// a Node-only module that Edge bundling cannot resolve.
const SENSITIVE_FIELDS = new Set([
  "email", "password", "token", "ticketNumber", "paymentToken",
  "providerTransactionId", "posDocumentId", "apiKey", "secret",
  "sessionToken", "identificacion", "cardNumber",
]);

export function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  return Object.entries(obj as Record<string, unknown>).reduce(
    (acc, [key, value]) => {
      if (SENSITIVE_FIELDS.has(key)) {
        acc[key] = "[redacted]";
      } else if (value && typeof value === "object") {
        acc[key] = redact(value);
      } else {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, unknown>
  );
}
