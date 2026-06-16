import { decrypt } from "@/lib/encryption";

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
   *  Default "EF"; set to "TC" for Kushki card payments once tipo_ping is confirmed. */
  paymentMethod: string;
  /** Required when paymentMethod = "TC". Contífico card-terminal network code.
   *  "D" = Datafast (confirmed working). Kushki code TBD — pending Contífico support answer. */
  tipoPing?: string;
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
    tableField: restaurant.posTableField ?? "referencia",
    baseUrl: CONTIFICO_BASE_URLS[restaurant.posEnvironment] ?? CONTIFICO_BASE_URLS.production,
    paymentMethod: restaurant.posPaymentMethod ?? "EF",
    tipoPing: restaurant.posTipoPing ?? undefined,
  };
}
