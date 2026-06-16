import { createHash } from "crypto";

const SENSITIVE_FIELDS = new Set([
  "email", "password", "token", "ticketNumber", "kushkiToken",
  "kushkiTransactionId", "posDocumentId", "apiKey", "secret",
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

export function hashForLog(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
