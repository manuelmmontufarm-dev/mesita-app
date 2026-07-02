import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, create } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { table: { findMany, create } },
}));

vi.mock("@/lib/api-utils", () => ({
  requireAuth: vi.fn(),
  errorResponse: (msg: string, status = 500) =>
    new Response(JSON.stringify({ success: false, error: msg }), { status }),
  successResponse: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), { status }),
}));

import { requireAuth } from "@/lib/api-utils";
import { GET, POST } from "@/app/api/tables/route";

describe("/api/tables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "user-1",
      restaurantId: "rest-1",
      role: "OWNER",
    });
  });

  it("GET returns tables with posExternalId", async () => {
    findMany.mockResolvedValue([
      {
        id: "tbl-1",
        name: "Mesa 5",
        token: "tok-abc",
        posExternalId: "Mesa 5",
        restaurantId: "rest-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0].posExternalId).toBe("Mesa 5");
  });

  // Owner read-only mode defaults ON (demo deployment posture — see
  // src/lib/owner-mode.ts). Tests set the env EXPLICITLY for each behavior so
  // neither direction depends on an accidental default.
  it("POST creates table with posExternalId when owner mutations are enabled", async () => {
    vi.stubEnv("OWNER_READONLY", "0");
    try {
      create.mockResolvedValue({
        id: "tbl-new",
        name: "Mesa 5",
        token: "uuid-token",
        posExternalId: "Mesa 5",
        restaurantId: "rest-1",
      });

      const req = new Request("http://localhost/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Mesa 5", posExternalId: "Mesa 5" }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ posExternalId: "Mesa 5" }),
        })
      );
      expect(json.data.posExternalId).toBe("Mesa 5");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("POST is rejected 403 in owner read-only mode (explicit and by default)", async () => {
    const req = () =>
      new Request("http://localhost/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Mesa 6" }),
      });

    vi.stubEnv("OWNER_READONLY", "1");
    try {
      expect((await POST(req())).status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }

    // default (both env vars ABSENT) is read-only too — the demo posture
    const prevServer = process.env.OWNER_READONLY;
    const prevClient = process.env.NEXT_PUBLIC_OWNER_READONLY;
    delete process.env.OWNER_READONLY;
    delete process.env.NEXT_PUBLIC_OWNER_READONLY;
    try {
      expect((await POST(req())).status).toBe(403);
    } finally {
      if (prevServer !== undefined) process.env.OWNER_READONLY = prevServer;
      if (prevClient !== undefined) process.env.NEXT_PUBLIC_OWNER_READONLY = prevClient;
    }
    expect(create).not.toHaveBeenCalled();
  });
});
