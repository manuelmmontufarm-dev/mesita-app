// Sentry server-side (Node.js runtime) configuration.
// Loaded by src/instrumentation.ts via register().
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, sentryBeforeSendTransaction } from "@/lib/sentry-redact";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Conservative sampling for a small release — full error capture, low trace volume.
  tracesSampleRate: 0.1,

  // Never send default PII (IP, cookies, headers) — this app handles payment
  // and guest data; only structured, redacted fields should reach Sentry.
  sendDefaultPii: false,

  debug: false,

  // Strip sensitive fields from every event before it leaves the process.
  beforeSend: sentryBeforeSend,
  beforeSendTransaction: sentryBeforeSendTransaction,
});
