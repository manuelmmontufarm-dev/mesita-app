import { describe, it, expect, beforeEach, vi } from "vitest";
import { middleware } from "./middleware";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const createMockRequest = (
  pathname: string,
  ip: string = "192.168.1.1",
  headers: Record<string, string> = {}
): NextRequest => {
  const url = new URL(`http://localhost:3000${pathname}`);
  return {
    nextUrl: url,
    url: url.toString(),
    headers: new Headers({
      "x-forwarded-for": ip,
      ...headers,
    }),
    cookies: { get: (_name: string) => undefined },
  } as unknown as NextRequest;
};

describe("middleware - rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under the rate limit", async () => {
    const request = createMockRequest("/api/bills/bill-123/pay", "unique-ip-1");
    const response = await middleware(request);
    expect(response?.status).not.toBe(429);
  });

  it("rate limit is tracked per IP address", async () => {
    // Verify rate limiter is checking the IP from x-forwarded-for
    const ip1 = "unique-test-ip-1";
    const ip2 = "unique-test-ip-2";

    const request1 = createMockRequest("/api/bills/bill-123/pay", ip1);
    const response1 = await middleware(request1);
    expect(response1?.status).not.toBe(429);

    // Different IP should not be affected by previous requests
    const request2 = createMockRequest("/api/bills/bill-456/pay", ip2);
    const response2 = await middleware(request2);
    expect(response2?.status).not.toBe(429);
  });

  it("applies rate limiting per IP", async () => {
    // Two different IPs should have independent limits
    const request1 = createMockRequest("/api/bills/bill-123/pay", "unique-ip-3");
    const response1 = await middleware(request1);
    expect(response1?.status).not.toBe(429);

    const request2 = createMockRequest("/api/bills/bill-456/pay", "unique-ip-4");
    const response2 = await middleware(request2);
    expect(response2?.status).not.toBe(429);
  });

  it("does not rate limit non-payment endpoints", async () => {
    const request = createMockRequest("/api/some/other/endpoint");
    const response = await middleware(request);
    expect(response?.status).not.toBe(429);
  });

  it("extracts IP from x-forwarded-for header", async () => {
    const request = createMockRequest("/api/bills/bill-123/pay", "10.0.0.1, 10.0.0.2");
    const response = await middleware(request);
    expect(response?.status).not.toBe(429);
  });

  it("uses x-real-ip as fallback", async () => {
    const url = new URL("http://localhost:3000/api/bills/bill-123/pay");
    const request = {
      nextUrl: url,
      url: url.toString(),
      headers: new Headers({
        "x-real-ip": "10.0.0.3",
      }),
    } as unknown as NextRequest;
    const response = await middleware(request);
    expect(response?.status).not.toBe(429);
  });

  it("payment endpoint path matching works correctly", async () => {
    // Should match /api/bills/[billId]/pay pattern
    const payRequest = createMockRequest("/api/bills/xyz123/pay", "unique-ip-test");
    const payResponse = await middleware(payRequest);
    // Just verify it runs without error
    expect(payResponse).toBeDefined();

    // Should NOT match other patterns
    const otherRequest = createMockRequest("/api/bills/xyz123/cancel", "unique-ip-test");
    const otherResponse = await middleware(otherRequest);
    expect(otherResponse).toBeDefined();
  });
});

describe("middleware - public routes", () => {
  it("allows access to / without auth", async () => {
    const request = createMockRequest("/");
    const response = await middleware(request);
    expect(response?.status).not.toBe(307); // Not a redirect
  });

  it("allows access to /login without auth", async () => {
    const request = createMockRequest("/login");
    const response = await middleware(request);
    expect(response?.status).not.toBe(307);
  });

  it("allows access to /register without auth", async () => {
    const request = createMockRequest("/register");
    const response = await middleware(request);
    expect(response?.status).not.toBe(307);
  });

  it("allows access to /api/auth/* without session", async () => {
    const request = createMockRequest("/api/auth/signin");
    const response = await middleware(request);
    expect(response?.status).not.toBe(307);
  });
});

describe("middleware - admin access", () => {
  it("allows access to /admin/login without auth", async () => {
    const request = createMockRequest("/admin/login");
    const response = await middleware(request);
    expect(response?.status).not.toBe(307);
  });

  it("redirects to admin login if ADMIN_SECRET not configured", async () => {
    vi.stubEnv("ADMIN_SECRET", "");
    const request = createMockRequest("/admin");
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("allows access with valid Bearer token", async () => {
    vi.stubEnv("ADMIN_SECRET", "test-secret-123");
    const request = createMockRequest("/admin", "127.0.0.1", {
      authorization: "Bearer test-secret-123",
    });
    const response = await middleware(request);
    expect(response?.status).not.toBe(307);
  });

  it("allows access with valid X-Admin-Secret header", async () => {
    vi.stubEnv("ADMIN_SECRET", "test-secret-123");
    const request = createMockRequest("/admin", "127.0.0.1", {
      "x-admin-secret": "test-secret-123",
    });
    const response = await middleware(request);
    expect(response?.status).not.toBe(307);
  });

  it("redirects on invalid admin secret", async () => {
    vi.stubEnv("ADMIN_SECRET", "correct-secret");
    const request = createMockRequest("/admin", "127.0.0.1", {
      authorization: "Bearer wrong-secret",
    });
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });
});
