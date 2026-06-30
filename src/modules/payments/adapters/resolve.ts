import type { PaymentPort, PaymentProviderType } from "../domain/payment.port";
import { dinersAdapter } from "./diners/client";
import { stubAdapter } from "./stub/client";
import { decrypt } from "@/lib/encryption";

export function resolvePaymentProvider(override?: string | null): PaymentProviderType {
  const raw = (override ?? process.env.PAYMENT_PROVIDER ?? "STUB").toUpperCase();
  return raw === "DINERS" ? "DINERS" : "STUB";
}

export function getPaymentAdapter(provider?: PaymentProviderType): PaymentPort {
  const p = provider ?? resolvePaymentProvider();
  return p === "DINERS" ? dinersAdapter : stubAdapter;
}

export function buildProviderConfig(restaurant: {
  paymentProvider?: string | null;
  paymentPrivateKeyEnc?: string | null;
  paymentPublicKey?: string | null;
  paymentEnvironment?: string | null;
}): import("../domain/payment.port").ProviderConfig {
  const provider = resolvePaymentProvider(restaurant.paymentProvider);
  return {
    provider,
    environment: (restaurant.paymentEnvironment ?? "SANDBOX") as "SANDBOX" | "PRODUCTION",
    privateKeyEnc: restaurant.paymentPrivateKeyEnc,
    publicKey: restaurant.paymentPublicKey,
  };
}

/** Decrypted private key when Diners credentials are stored encrypted. */
export function getDecryptedPrivateKey(config: import("../domain/payment.port").ProviderConfig): string | null {
  if (!config.privateKeyEnc) return null;
  try {
    return decrypt(config.privateKeyEnc);
  } catch {
    return null;
  }
}
