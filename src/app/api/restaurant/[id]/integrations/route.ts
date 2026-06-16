import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

const VALID_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
const VALID_POS_PAYMENT_METHODS = ["EF", "TC"] as const;

const schema = z.object({
  kushki: z.object({
    privateKey:  z.string().min(10).max(1000).optional(),
    publicKey:   z.string().min(5).max(300).optional(),
    environment: z.enum(VALID_ENVIRONMENTS).optional(),
    enabled:     z.boolean().optional(),
  }).optional(),
  pos: z.object({
    apiKey:        z.string().min(5).max(1000).optional(),
    environment:   z.enum(VALID_ENVIRONMENTS).optional(),
    tableField:    z.string().max(100).nullable().optional(),
    paymentMethod: z.enum(VALID_POS_PAYMENT_METHODS).optional(),
    enabled:       z.boolean().optional(),
  }).optional(),
});

const SELECT = {
  kushkiPrivateKeyEnc: true,
  kushkiPublicKey:     true,
  kushkiEnvironment:   true,
  paymentsEnabled:     true,
  invoiceMode:         true,
  posProvider:         true,
  posApiKeyEnc:        true,
  posEnvironment:      true,
  posTableField:       true,
  posPaymentMethod:    true,
} as const;

function maskStatus(r: {
  kushkiPrivateKeyEnc: string | null;
  kushkiPublicKey:     string | null;
  kushkiEnvironment:   string;
  paymentsEnabled:     boolean;
  invoiceMode:         string;
  posProvider:         string | null;
  posApiKeyEnc:        string | null;
  posEnvironment:      string;
  posTableField:       string | null;
  posPaymentMethod:    string | null;
}) {
  return {
    kushki: {
      privateKeyConfigured: !!r.kushkiPrivateKeyEnc,
      publicKey:            r.kushkiPublicKey,
      environment:          r.kushkiEnvironment,
      enabled:              r.paymentsEnabled,
    },
    invoicingEnabled: r.invoiceMode !== "DISABLED",
    pos: {
      enabled:          !!r.posProvider,
      provider:         r.posProvider,
      apiKeyConfigured: !!r.posApiKeyEnc,
      environment:      r.posEnvironment,
      tableField:       r.posTableField,
      paymentMethod:    r.posPaymentMethod ?? "EF",
    },
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    if (auth.restaurantId !== id) return errorResponse("Forbidden", 403);

    const r = await prisma.restaurant.findUnique({ where: { id }, select: SELECT });
    if (!r) return errorResponse("Not found", 404);
    return successResponse(maskStatus(r), 200);
  } catch { return errorResponse("Internal server error", 500); }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    if (auth.restaurantId !== id) return errorResponse("Forbidden", 403);
    if (!hasRole(auth.role, "OWNER")) return errorResponse("Owner access required", 403);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.errors[0].message, 400);

    const { kushki, pos } = parsed.data;
    const data: Record<string, unknown> = {};

    if (kushki) {
      if (kushki.privateKey)            data.kushkiPrivateKeyEnc = encrypt(kushki.privateKey);
      if (kushki.publicKey)             data.kushkiPublicKey     = kushki.publicKey;
      if (kushki.environment)           data.kushkiEnvironment   = kushki.environment;
      if (kushki.enabled !== undefined) {
        if (kushki.enabled) {
          const current = await prisma.restaurant.findUnique({ where: { id }, select: { kushkiPrivateKeyEnc: true, kushkiPublicKey: true } });
          const hasPrivate = kushki.privateKey  || current?.kushkiPrivateKeyEnc;
          const hasPublic  = kushki.publicKey   || current?.kushkiPublicKey;
          if (!hasPrivate || !hasPublic) {
            return errorResponse("Cannot enable payments: both Kushki private key and public key must be configured first", 422);
          }
        }
        data.paymentsEnabled = kushki.enabled;
      }
    }

    if (pos) {
      if (pos.apiKey)                  data.posApiKeyEnc     = encrypt(pos.apiKey);
      if (pos.environment)             data.posEnvironment   = pos.environment;
      if (pos.tableField !== undefined) data.posTableField   = pos.tableField;
      if (pos.paymentMethod)           data.posPaymentMethod = pos.paymentMethod;
      if (pos.enabled !== undefined) {
        if (pos.enabled) {
          const current = await prisma.restaurant.findUnique({ where: { id }, select: { posApiKeyEnc: true } });
          const hasKey = pos.apiKey || current?.posApiKeyEnc;
          if (!hasKey) {
            return errorResponse("Cannot enable POS: configure the API key first", 422);
          }
          data.posProvider = "CONTIFICO";
        } else {
          data.posProvider = null;
        }
      }
    }

    if (!Object.keys(data).length) return errorResponse("No fields to update", 400);

    const r = await prisma.restaurant.update({ where: { id }, data, select: SELECT });
    return successResponse(maskStatus(r), 200);
  } catch (error) {
    console.error("integrations PATCH:", error);
    return errorResponse("Internal server error", 500);
  }
}
