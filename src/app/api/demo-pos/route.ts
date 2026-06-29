import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  createCategory,
  createExtraTable,
  createMenuItem,
  deleteExtraTable,
  deleteMenuItem,
  getDemoPosConfigStatus,
  getMenu,
  getReports,
  listActivities,
  listAllTables,
  listInvoices,
  listQrTables,
  updateExtraTable,
  updateMenuItem,
} from "@/lib/demo-pos";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "overview";

  if (view === "tables") {
    return successResponse({ tables: await listAllTables(), qrTables: listQrTables() }, 200);
  }
  if (view === "menu") {
    return successResponse(await getMenu(), 200);
  }
  if (view === "invoices") {
    return successResponse({ invoices: await listInvoices() }, 200);
  }
  if (view === "reports") {
    return successResponse({ reports: await getReports() }, 200);
  }
  if (view === "activity") {
    return successResponse({ activities: await listActivities() }, 200);
  }
  if (view === "config") {
    return successResponse(getDemoPosConfigStatus(), 200);
  }

  const [tables, menu, invoices] = await Promise.all([
    listAllTables(),
    getMenu(),
    listInvoices(10),
  ]);
  return successResponse({ tables, menu, invoices, qrTables: listQrTables() }, 200);
}

const menuItemSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  price: z.number().positive(),
  categoryId: z.string().min(1),
});

const tableSchema = z.object({
  name: z.string().min(1),
  posExternalId: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse("Invalid body", 400);

  const entity = (body as { entity?: string }).entity;

  if (entity === "menu-item") {
    const parsed = menuItemSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid menu item", 400);
    const item = await createMenuItem(parsed.data);
    return successResponse(item, 201);
  }

  if (entity === "category") {
    const name = (body as { name?: string }).name;
    if (!name?.trim()) return errorResponse("Category name required", 400);
    await createCategory(name);
    return successResponse(await getMenu(), 201);
  }

  if (entity === "table") {
    const parsed = tableSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid table", 400);
    const table = await createExtraTable(parsed.data);
    return successResponse(table, 201);
  }

  return errorResponse("Unknown entity", 400);
}

export async function PATCH(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse("Invalid body", 400);

  const { entity, id, ...rest } = body as {
    entity?: string;
    id?: string;
    name?: string;
    posExternalId?: string | null;
    emoji?: string;
    price?: number;
    categoryId?: string;
    available?: boolean;
  };

  if (!id) return errorResponse("id required", 400);

  if (entity === "menu-item") {
    const updated = await updateMenuItem(id, rest);
    if (!updated) return errorResponse("Menu item not found", 404);
    return successResponse(updated, 200);
  }

  if (entity === "table") {
    const updated = await updateExtraTable(id, {
      name: rest.name,
      posExternalId: rest.posExternalId,
    });
    if (!updated) return errorResponse("Table not found", 404);
    return successResponse(updated, 200);
  }

  return errorResponse("Unknown entity", 400);
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const id = url.searchParams.get("id");
  if (!entity || !id) return errorResponse("entity and id required", 400);

  if (entity === "menu-item") {
    const ok = await deleteMenuItem(id);
    if (!ok) return errorResponse("Menu item not found", 404);
    return successResponse({ deleted: true }, 200);
  }

  if (entity === "table") {
    const ok = await deleteExtraTable(id);
    if (!ok) return errorResponse("Cannot delete this table", 400);
    return successResponse({ deleted: true }, 200);
  }

  return errorResponse("Unknown entity", 400);
}
