import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

const VALID_REGIMES = ["GENERAL", "RIMPE_EMPRENDEDOR", "RIMPE_NEGOCIO_POPULAR"] as const;

const fiscalSchema = z.object({
  ruc: z.string().regex(/^\d{13}$/, "RUC must be 13 digits").optional(),
  razonSocial: z.string().min(2).max(300).optional(),
  nombreComercial: z.string().min(2).max(300).optional(),
  direccionMatriz: z.string().min(5).max(500).optional(),
  establecimientoCodigo: z.string().regex(/^\d{3}$/, "Must be 3 digits, e.g. 001").optional(),
  puntoEmisionCodigo: z.string().regex(/^\d{3}$/, "Must be 3 digits, e.g. 001").optional(),
  regimen: z.enum(VALID_REGIMES).optional(),
  obligadoContabilidad: z.boolean().optional(),
  contribuyenteEspecial: z.string().max(20).nullable().optional(),
  contactEmail: z.string().email().optional(),
  phone: z.string().max(20).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) return authResult;
    const { restaurantId, role } = authResult;

    if (restaurantId !== id) return errorResponse("Forbidden", 403);
    if (!hasRole(role, "OWNER")) return errorResponse("Owner access required", 403);

    const body = await request.json();
    const parsed = fiscalSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const data = parsed.data;
    const updated = await prisma.restaurant.update({
      where: { id },
      data: {
        ...(data.ruc !== undefined && { ruc: data.ruc }),
        ...(data.razonSocial !== undefined && { razonSocial: data.razonSocial }),
        ...(data.nombreComercial !== undefined && { nombreComercial: data.nombreComercial }),
        ...(data.direccionMatriz !== undefined && { direccionMatriz: data.direccionMatriz }),
        ...(data.establecimientoCodigo !== undefined && { establecimientoCodigo: data.establecimientoCodigo }),
        ...(data.puntoEmisionCodigo !== undefined && { puntoEmisionCodigo: data.puntoEmisionCodigo }),
        ...(data.regimen !== undefined && { regimen: data.regimen }),
        ...(data.obligadoContabilidad !== undefined && { obligadoContabilidad: data.obligadoContabilidad }),
        ...(data.contribuyenteEspecial !== undefined && { contribuyenteEspecial: data.contribuyenteEspecial }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
      select: {
        id: true, ruc: true, razonSocial: true, nombreComercial: true,
        direccionMatriz: true, establecimientoCodigo: true, puntoEmisionCodigo: true,
        regimen: true, obligadoContabilidad: true, contribuyenteEspecial: true,
        contactEmail: true, phone: true,
      },
    });

    return successResponse(updated, 200);
  } catch (error) {
    console.error("Error updating fiscal config:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) return authResult;
    const { restaurantId } = authResult;

    if (restaurantId !== id) return errorResponse("Forbidden", 403);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true, ruc: true, razonSocial: true, nombreComercial: true,
        direccionMatriz: true, establecimientoCodigo: true, puntoEmisionCodigo: true,
        regimen: true, obligadoContabilidad: true, contribuyenteEspecial: true,
        contactEmail: true, phone: true,
      },
    });

    if (!restaurant) return errorResponse("Restaurant not found", 404);
    return successResponse(restaurant, 200);
  } catch (error) {
    console.error("Error fetching fiscal config:", error);
    return errorResponse("Internal server error", 500);
  }
}
