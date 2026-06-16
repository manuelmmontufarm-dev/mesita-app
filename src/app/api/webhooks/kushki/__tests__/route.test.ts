import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Mock Prisma before importing the route
vi.mock("@/lib/db", () => ({
  prisma: {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { POST } from "../route";
import { prisma } from "@/lib/db";

const TEST_SECRET = "test-webhook-secret-32chars-long!!";

function makeHmac(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function makeRequest(body: string, signature: string): Request {
  return new Request("http://localhost/api/webhooks/kushki", {
    method: "POST",
    body,
    headers: { "x-kushki-signature": signature },
  });
}

describe("POST /api/webhooks/kushki", () => {
  beforeEach(() => {
    process.env.KUSHKI_WEBHOOK_SECRET = TEST_SECRET;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.KUSHKI_WEBHOOK_SECRET;
  });

  it("1. valid HMAC signature → 200", async () => {
    const body = JSON.stringify({ ticketNumber: "abc-123" });
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest(body, makeHmac(body)));

    expect(res.status).toBe(200);
  });

  it("2. invalid HMAC signature → 401", async () => {
    const body = JSON.stringify({ ticketNumber: "abc-123" });

    const res = await POST(makeRequest(body, "wrong_signature_value_here_0000000000000000000000000000000000000"));

    expect(res.status).toBe(401);
  });

  it("3. missing KUSHKI_WEBHOOK_SECRET env var → 500", async () => {
    delete process.env.KUSHKI_WEBHOOK_SECRET;
    const body = JSON.stringify({ ticketNumber: "abc-123" });

    const res = await POST(makeRequest(body, "any_sig"));

    expect(res.status).toBe(500);
  });

  it("4. no ticketNumber in body → 200 (event ignored)", async () => {
    const body = JSON.stringify({ transactionStatus: "APPROVAL" });

    const res = await POST(makeRequest(body, makeHmac(body)));

    expect(res.status).toBe(200);
    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it("5. unknown ticketNumber → 200 (event ignored)", async () => {
    const body = JSON.stringify({ ticketNumber: "nonexistent-ticket-123" });
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest(body, makeHmac(body)));

    expect(res.status).toBe(200);
  });

  it("6. DB update throws → 500 (so Kushki retries the event)", async () => {
    const body = JSON.stringify({
      ticketNumber: "abc-123",
      transactionStatus: "DECLINED",
    });
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({
      id: "pay-1",
      status: "COMPLETED",
    } as never);
    vi.mocked(prisma.payment.update).mockRejectedValue(new Error("DB down"));

    const res = await POST(makeRequest(body, makeHmac(body)));

    expect(res.status).toBe(500);
  });

  it("7. DB lookup throws → 500 (so Kushki retries the event)", async () => {
    const body = JSON.stringify({ ticketNumber: "abc-123" });
    vi.mocked(prisma.payment.findFirst).mockRejectedValue(new Error("DB down"));

    const res = await POST(makeRequest(body, makeHmac(body)));

    expect(res.status).toBe(500);
  });
});
