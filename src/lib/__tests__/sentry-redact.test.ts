import { describe, it, expect } from "vitest";
import { sentryBeforeSend } from "@/lib/sentry-redact";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const hint: EventHint = {};

function makeEvent(overrides: Partial<ErrorEvent>): ErrorEvent {
  return { ...overrides } as ErrorEvent;
}

describe("sentryBeforeSend redaction", () => {
  it("drops request headers, cookies and query string entirely", () => {
    const event = makeEvent({
      request: {
        headers: { authorization: "Bearer secret-token" },
        cookies: { session: "abc123" },
        query_string: "token=leak",
        data: { note: "fine" },
      },
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    expect(result.request?.headers).toBeUndefined();
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();
  });

  it("reduces event.user to an opaque id only, dropping email/ip", () => {
    const event = makeEvent({
      user: { id: "user-123", email: "guest@example.com", ip_address: "1.2.3.4" },
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    expect(result.user).toEqual({ id: "user-123" });
  });

  it("drops user entirely when no id is present", () => {
    const event = makeEvent({ user: { email: "guest@example.com" } });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    expect(result.user).toBeUndefined();
  });

  it("redacts known sensitive keys inside extra/contexts (paymentToken, cardNumber, identificacion, apiKey)", () => {
    const event = makeEvent({
      extra: {
        paymentToken: "stub:4242-4242-4242-4242",
        cardNumber: "4242424242424242",
        identificacion: "0912345678",
        apiKey: "sk_live_abc123",
        safeField: "totally fine",
      },
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    const extra = result.extra as Record<string, unknown>;
    expect(extra.paymentToken).toBe("[redacted]");
    expect(extra.cardNumber).toBe("[redacted]");
    expect(extra.identificacion).toBe("[redacted]");
    expect(extra.apiKey).toBe("[redacted]");
    expect(extra.safeField).toBe("totally fine");
  });

  it("scrubs database connection strings embedded in free-text error messages", () => {
    const event = makeEvent({
      message:
        "Can't reach database server at postgresql://postgres:sup3rSecret@db.abcxyz.supabase.co:5432/postgres",
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    expect(result.message).not.toContain("sup3rSecret");
    expect(result.message).toContain("[redacted]");
  });

  it("scrubs PAN-like digit sequences and CVV out of exception values", () => {
    const event = makeEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "Charge failed for card 4242 4242 4242 4242 cvv: 123",
          },
        ],
      },
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    const value = result.exception?.values?.[0]?.value ?? "";
    expect(value).not.toContain("4242 4242 4242 4242");
    expect(value).not.toMatch(/cvv:\s*123/i);
  });

  it("scrubs authorization headers appearing inside breadcrumb messages/data", () => {
    const event = makeEvent({
      breadcrumbs: [
        {
          message: "fetch failed: Authorization: Bearer sk_live_abc123",
          data: { apiKey: "sk_live_abc123", url: "/api/ok" },
        },
      ],
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    const crumb = result.breadcrumbs?.[0];
    expect(crumb?.message).not.toContain("sk_live_abc123");
    expect((crumb?.data as Record<string, unknown>).apiKey).toBe("[redacted]");
  });

  it("recursively scrubs nested objects, not just top-level keys", () => {
    const event = makeEvent({
      extra: {
        payment: {
          nested: {
            cardNumber: "4242424242424242",
            deep: { token: "secret-abc" },
          },
        },
      },
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    const extra = result.extra as any;
    expect(extra.payment.nested.cardNumber).toBe("[redacted]");
    expect(extra.payment.nested.deep.token).toBe("[redacted]");
  });

  it("leaves harmless fields and messages untouched", () => {
    const event = makeEvent({
      message: "Bill not found",
      extra: { restaurantId: "opaque-id-1", tableId: "opaque-id-2", outcome: "not_found" },
    });
    const result = sentryBeforeSend(event, hint) as ErrorEvent;
    expect(result.message).toBe("Bill not found");
    expect(result.extra).toEqual({
      restaurantId: "opaque-id-1",
      tableId: "opaque-id-2",
      outcome: "not_found",
    });
  });
});
