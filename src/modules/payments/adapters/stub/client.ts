import { v4 as uuidv4 } from "uuid";
import type {
  ChargeParams,
  ChargeResult,
  PaymentPort,
  ProviderConfig,
  RefundParams,
  RefundResult,
} from "../../domain/payment.port";

export function isStubPaymentToken(token: string): boolean {
  return token.startsWith("stub:") || token.startsWith("demo:");
}

/** @deprecated use isStubPaymentToken */
export const isDemoPaymentToken = isStubPaymentToken;

function makeTransactionId(prefix: string): string {
  return `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

export const stubAdapter: PaymentPort = {
  async charge(params: ChargeParams, _config: ProviderConfig): Promise<ChargeResult> {
    if (!isStubPaymentToken(params.chargeToken)) {
      return { approved: false, errorText: "Invalid stub payment token" };
    }
    const prefix = params.chargeToken.startsWith("demo:") ? "DEMO" : "STUB";
    return {
      approved: true,
      transactionId: makeTransactionId(prefix),
    };
  },

  async refund(_params: RefundParams, _config: ProviderConfig): Promise<RefundResult> {
    return { success: true };
  },
};

/** @deprecated use stubAdapter.charge via PaymentPort */
export async function chargeStubCard(params: ChargeParams): Promise<ChargeResult> {
  return stubAdapter.charge(params, { provider: "STUB", environment: "SANDBOX" });
}

/** @deprecated use isStubPaymentToken */
export async function chargeDemoCard(params: ChargeParams): Promise<ChargeResult> {
  return chargeStubCard(params);
}
