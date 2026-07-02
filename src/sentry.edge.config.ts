// Sentry Edge runtime configuration (middleware, edge API routes).
// Loaded by src/instrumentation.ts via register().
import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, sentryBeforeSendTransaction } from "@/lib/sentry-redact";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  debug: false,
  beforeSend: sentryBeforeSend,
  beforeSendTransaction: sentryBeforeSendTransaction,
});
