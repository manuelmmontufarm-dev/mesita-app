export interface ProviderConfig {
  kushkiPrivateKey: string;
  kushkiPublicKey: string;
  kushkiEnvironment: "SANDBOX" | "PRODUCTION";
}

export interface ChargeParams {
  kushkiToken: string;
  amount: number;
  voluntaryTip: number;
}

export interface ChargeResult {
  approved: boolean;
  ticketNumber?: string;
  errorText?: string;
}

export interface RefundParams {
  ticketNumber: string;
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
