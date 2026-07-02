import { decrypt } from "@/lib/encryption";
import { resolveTableField } from "../contract/table-mapping";

// v2 API — confirmed working by live testing 2026-06-02
// Sandbox credentials use integracionapi.contifico.com
const CONTIFICO_BASE_URLS: Record<string, string> = {
  production: "https://api.contifico.com/sistema/api/v2",
  sandbox:    "https://integracionapi.contifico.com/sistema/api/v2",
};

export interface PosConfig {
  provider: string;
  apiKey: string;        // decrypted; never logged
  environment: string;
  tableField: string;    // Contífico document field holding the table identifier
  baseUrl: string;
  /** Contífico `forma_cobro` short code for POST /documento/{id}/cobro/.
   *  Must match a forma configured in the restaurant's Contífico account.
   *  Confirmed codes: "EF" (efectivo/cash), "TC" (tarjeta/card).
   *  Default "EF"; set to "TC" for card payments once tipo_ping is confirmed. */
  paymentMethod: string;
  /** Required when paymentMethod = "TC". Contífico card-terminal network code.
   *  "D" = Datafast (confirmed working). Diners code TBD — pending Contífico support answer. */
  tipoPing?: string;
  /** Contract O5/O6 — persona create + documento cliente attach are UNVERIFIED
   *  against the real sandbox, so they are opt-in (CONTIFICO_ATTACH_CLIENTE=1).
   *  Off ⇒ the cobro is registered against the document's existing cliente. */
  attachClienteEnabled: boolean;
}

export function buildPosConfig(restaurant: {
  invoiceMode: string;
  posProvider: string | null;
  posApiKeyEnc: string | null;
  posEnvironment: string;
  posTableField: string | null;
  posPaymentMethod?: string | null;
  posTipoPing?: string | null;
}): PosConfig {
  if (restaurant.invoiceMode !== "POS") {
    throw new Error("Restaurant is not POS-enabled");
  }
  if (!restaurant.posApiKeyEnc) {
    throw new Error("POS API key not configured for this restaurant");
  }
  if (!restaurant.posProvider) {
    throw new Error("POS provider not configured for this restaurant");
  }
  return {
    provider: restaurant.posProvider,
    apiKey: decrypt(restaurant.posApiKeyEnc),
    environment: restaurant.posEnvironment,
    // Frozen table-mapping rule: default adicional1, restricted to documented
    // free-text fields (adicional1 | adicional2 | descripcion).
    tableField: resolveTableField(restaurant.posTableField),
    baseUrl: resolveBaseUrl(restaurant.posEnvironment),
    paymentMethod: restaurant.posPaymentMethod ?? "EF",
    tipoPing: restaurant.posTipoPing ?? undefined,
    attachClienteEnabled: process.env.CONTIFICO_ATTACH_CLIENTE === "1",
  };
}

/**
 * Base URL is pure configuration (contract rule: simulator vs real Contífico
 * differ ONLY by base URL + credentials). CONTIFICO_BASE_URL overrides the
 * environment presets — point it at a Mesita POS deployment's /sistema/api/v2
 * to run against the simulator. No code path may inspect this URL to change
 * payload semantics.
 */
function resolveBaseUrl(environment: string): string {
  const override = process.env.CONTIFICO_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  return CONTIFICO_BASE_URLS[environment] ?? CONTIFICO_BASE_URLS.production;
}
