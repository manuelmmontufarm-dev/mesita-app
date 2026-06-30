import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, count, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique, count, update } },
}));

vi.mock("@/lib/api-utils", () => ({
  checkAdminSecret: vi.fn(() => true),
  errorResponse: (message: string, status = 500) =>
    new Response(JSON.stringify({ success: false, error: message }), { status }),
  successResponse: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), { status }),
}));

import { PATCH } from "../route";

function request(role: string) {
  return new Request("http://localhost/api/admin/users/user-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

describe("PATCH /api/admin/users/[userId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prevents demoting the last owner", async () => {
    findUnique.mockResolvedValue({ id: "user-1", role: "OWNER", restaurantId: "rest-1" });
    count.mockResolvedValue(1);

    const response = await PATCH(request("MANAGER"), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates a staff role when ownership remains valid", async () => {
    findUnique.mockResolvedValue({ id: "user-2", role: "SERVER", restaurantId: "rest-1" });
    update.mockResolvedValue({
      id: "user-2",
      name: "Ana",
      email: "ana@example.com",
      role: "MANAGER",
      restaurantId: "rest-1",
    });

    const response = await PATCH(request("MANAGER"), {
      params: Promise.resolve({ userId: "user-2" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: "MANAGER" } }));
    expect(json.data.role).toBe("MANAGER");
  });
});
