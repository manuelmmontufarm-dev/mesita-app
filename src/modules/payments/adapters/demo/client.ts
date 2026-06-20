import { v4 as uuidv4 } from "uuid";
import type { ChargeParams, ChargeResult } from "../../domain/payment.port";

export function isDemoPaymentToken(token: string): boolean {
  return token.startsWith("demo:");
}

export async function chargeDemoCard(params: ChargeParams): Promise<ChargeResult> {
  if (!isDemoPaymentToken(params.kushkiToken)) {
    return { approved: false, errorText: "Invalid demo payment token" };
  }
  return {
    approved: true,
    ticketNumber: `DEMO-${uuidv4().slice(0, 8).toUpperCase()}`,
  };
}
