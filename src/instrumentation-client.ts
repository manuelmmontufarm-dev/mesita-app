// Sentry browser (client-side) configuration — instruments the guest payment
// UI and owner/admin dashboard React code. Auto-loaded by Next.js.
import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, sentryBeforeSendTransaction } from "@/lib/sentry-redact";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  // Never collect IP/PII automatically — this surface handles guest payment flows.
  sendDefaultPii: false,

  debug: false,

  // Session replay is OFF: this app renders payment forms and guest personal
  // data (email, ticketNumber). Do not enable replay integrations here without
  // an explicit, reviewed masking policy for those fields.
  integrations: [],

  beforeSend: sentryBeforeSend,
  beforeSendTransaction: sentryBeforeSendTransaction,
});

// Required so Next.js reports client-side navigation errors to Sentry.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
