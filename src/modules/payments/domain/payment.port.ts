export type PaymentProviderType = "STUB" | "DINERS";
export type PaymentEnvironment = "SANDBOX" | "PRODUCTION";

export interface ProviderConfig {
  provider: PaymentProviderType;
  environment: PaymentEnvironment;
  privateKeyEnc?: string | null;
  publicKey?: string | null;
}

export interface ChargeParams {
  chargeToken: string;
  amount: number;
  voluntaryTip: number;
}

export interface ChargeResult {
  approved: boolean;
  transactionId?: string;
  errorText?: string;
}

export interface RefundParams {
  transactionId: string;
  amount: number;
}

export interface RefundResult {
  success: boolean;
  message?: string;
}

export interface PaymentPort {
  charge(params: ChargeParams, config: ProviderConfig): Promise<ChargeResult>;
  refund(params: RefundParams, config: ProviderConfig): Promise<RefundResult>;
}
