import type {
  ChargeParams,
  ChargeResult,
  PaymentPort,
  ProviderConfig,
  RefundParams,
  RefundResult,
} from "../../domain/payment.port";

export class DinersNotConfiguredError extends Error {
  constructor() {
    super(
      "Diners Club no está configurado. Define credenciales en Configuración o usa PAYMENT_PROVIDER=STUB."
    );
    this.name = "DinersNotConfiguredError";
  }
}

export const dinersAdapter: PaymentPort = {
  async charge(_params: ChargeParams, config: ProviderConfig): Promise<ChargeResult> {
    if (!config.privateKeyEnc || !config.publicKey) {
      return { approved: false, errorText: new DinersNotConfiguredError().message };
    }
    throw new DinersNotConfiguredError();
  },

  async refund(_params: RefundParams, config: ProviderConfig): Promise<RefundResult> {
    if (!config.privateKeyEnc) {
      return { success: false, message: new DinersNotConfiguredError().message };
    }
    throw new DinersNotConfiguredError();
  },
};
