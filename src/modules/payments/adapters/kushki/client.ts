import { decrypt } from "@/lib/encryption";
import axios from "axios";
import type { ChargeParams, ChargeResult, ProviderConfig, RefundParams, RefundResult } from "../../domain/payment.port";
import { IVA_RATE, TAX_MULTIPLIER } from "@/lib/constants/ecuador-tax";

export { type ProviderConfig };

const PROD_URL = "https://api.kushkipagos.com";
const UAT_URL  = "https://api-uat.kushkipagos.com";

// Ecuador tax decomposition for Kushki amount fields.
// TAX_MULTIPLIER = 1.25 (10% propina + 15% IVA, additive on subtotal).
// total = subtotalIva * TAX_MULTIPLIER + voluntaryTip
function buildAmountFields(totalUsd: number, voluntaryTipUsd: number) {
  const totalCents    = Math.round(totalUsd * 100);
  const tipCents      = Math.round(voluntaryTipUsd * 100);
  const baseCents     = totalCents - tipCents;
  const subtotalIvaCents  = Math.round(baseCents / TAX_MULTIPLIER);
  const ivaCents          = Math.round(subtotalIvaCents * IVA_RATE);
  const subtotalIva0Cents = baseCents - subtotalIvaCents - ivaCents + tipCents;
  return {
    subtotalIva:  subtotalIvaCents  / 100,
    subtotalIva0: subtotalIva0Cents / 100,
    iva:          ivaCents          / 100,
    ice:          0,
    currency:     "USD",
  };
}

export function buildProviderConfig(restaurant: {
  kushkiPrivateKeyEnc: string | null;
  kushkiPublicKey:     string | null;
  kushkiEnvironment:   string;
}): ProviderConfig {
  if (!restaurant.kushkiPrivateKeyEnc) throw new Error("Kushki private key not configured");
  if (!restaurant.kushkiPublicKey)     throw new Error("Kushki public key not configured");
  return {
    kushkiPrivateKey:    decrypt(restaurant.kushkiPrivateKeyEnc),
    kushkiPublicKey:     restaurant.kushkiPublicKey,
    kushkiEnvironment:   restaurant.kushkiEnvironment as "SANDBOX" | "PRODUCTION",
  };
}

export async function chargeCard(params: ChargeParams, config: ProviderConfig): Promise<ChargeResult> {
  const baseUrl = config.kushkiEnvironment === "PRODUCTION" ? PROD_URL : UAT_URL;
  const amounts = buildAmountFields(params.amount, params.voluntaryTip);
  try {
    const response = await axios.post(
      `${baseUrl}/card/v1/charges`,
      { token: params.kushkiToken, amount: amounts, currency: "USD", fullResponse: true },
      {
        headers: { "Private-Merchant-Id": config.kushkiPrivateKey, "Content-Type": "application/json" },
        timeout: 30_000,
      }
    );
    return { approved: true, ticketNumber: String(response.data.ticketNumber) };
  } catch (err: any) {
    const msg = err.response?.data?.message ?? "Payment declined";
    return { approved: false, errorText: msg };
  }
}

export async function refundPayment(params: RefundParams, config: ProviderConfig): Promise<RefundResult> {
  const baseUrl = config.kushkiEnvironment === "PRODUCTION" ? PROD_URL : UAT_URL;
  try {
    await axios.delete(
      `${baseUrl}/card/v1/charges/${params.ticketNumber}`,
      {
        headers: { "Private-Merchant-Id": config.kushkiPrivateKey },
        timeout: 15_000,
      }
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.response?.data?.message ?? "Refund failed" };
  }
}
