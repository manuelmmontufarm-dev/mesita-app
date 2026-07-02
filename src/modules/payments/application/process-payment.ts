import { getPaymentAdapter } from "../adapters/resolve";
import { isStubPaymentToken } from "../adapters/stub/client";
import type { ProviderConfig } from "../domain/payment.port";
import { buildPosConfig } from "@/modules/pos/adapters/pos-config";
import { ContificoAdapter } from "@/modules/pos/adapters/contifico.adapter";
import type { POSGuestData } from "@/modules/pos/domain/pos.port";
import type { BillStatus, SplitMode } from "../domain/payment.repository";
import type { BillRepository } from "@/modules/bills/domain/bill.repository";
import type { PaymentRepository } from "../domain/payment.repository";
import { v4 as uuidv4 } from "uuid";
import { redact, hashForLog } from "@/lib/log";
import { computeFallbackTotal } from "@/lib/money";
import {
  BillAlreadyClosedError,
  BillUnavailableError,
  IdempotencyConflictError,
  InvoiceDataRequiredError,
} from "./errors";

export {
  BillAlreadyClosedError,
  BillUnavailableError,
  IdempotencyConflictError,
  InvoiceDataRequiredError,
};

export interface PosRestaurantConfig {
  invoiceMode: string;
  posProvider: string | null;
  posApiKeyEnc: string | null;
  posEnvironment: string;
  posTableField: string | null;
  posPaymentMethod?: string | null;
}

export interface ProcessPaymentParams {
  billId: string;
  restaurantId: string;
  amount: number;
  voluntaryTipAmount: number;
  chargeToken: string;
  splitMode: SplitMode;
  selectedItemIds?: string[];
  equalSplitPeople?: number;
  providerConfig: ProviderConfig;
  posRestaurant?: PosRestaurantConfig;
  checkoutMode: "CONSUMIDOR_FINAL" | "FACTURA_CON_DATOS";
  guestData?: {
    email: string;
    identificacion?: string;
    nombre?: string;
  };
  guestSessionId?: string;
  idempotencyKey: string;
}

export interface ProcessPaymentResult {
  paymentId: string;
  billStatus: BillStatus;
  alreadyProcessed: boolean;
}

function detectTipo(
  identificacion: string | undefined
): "CEDULA" | "RUC" | "PASAPORTE" | "CONSUMIDOR_FINAL" {
  if (!identificacion) return "CONSUMIDOR_FINAL";
  if (/^\d{10}$/.test(identificacion)) return "CEDULA";
  if (/^\d{13}$/.test(identificacion)) return "RUC";
  return "PASAPORTE";
}

export async function processPayment(
  params: ProcessPaymentParams,
  repos: { bill: BillRepository; payment: PaymentRepository }
): Promise<ProcessPaymentResult> {
  const {
    billId,
    restaurantId,
    amount,
    voluntaryTipAmount,
    chargeToken,
    splitMode,
    selectedItemIds,
    equalSplitPeople: requestedSplitPeople,
    providerConfig,
    posRestaurant,
    guestData: rawGuestData,
    guestSessionId,
    idempotencyKey,
  } = params;

  const normalizedGuest: POSGuestData = {
    tipo: detectTipo(rawGuestData?.identificacion),
    identificacion: rawGuestData?.identificacion ?? "",
    email: rawGuestData?.email ?? "",
    nombre: rawGuestData?.nombre,
  };
  const hasUsableGuestData =
    normalizedGuest.tipo !== "CONSUMIDOR_FINAL" &&
    !!normalizedGuest.identificacion &&
    !!normalizedGuest.email;

  const existingPayment = await repos.payment.findByIdempotencyKey(idempotencyKey);

  if (existingPayment) {
    if (existingPayment.billId !== billId) {
      throw new IdempotencyConflictError();
    }
    return {
      paymentId: existingPayment.id,
      billStatus: "UNPAID" as BillStatus,
      alreadyProcessed: true,
    };
  }

  const billSnapshot = await repos.bill.findSnapshot(billId);

  if (billSnapshot && posRestaurant?.invoiceMode === "POS" && billSnapshot.posDocumentId) {
    let adapterForCheck: ContificoAdapter | null = null;
    try {
      const posConfig = buildPosConfig(posRestaurant);
      adapterForCheck = new ContificoAdapter(posConfig);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "POS_PRECHECK_CONFIG_ERROR",
          severity: "HIGH",
          billId,
          restaurantId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    }

    if (adapterForCheck?.getOrderStatus) {
      try {
        const status = await adapterForCheck.getOrderStatus(billSnapshot.posDocumentId);
        if (!status.exists) {
          throw new BillUnavailableError();
        }
        const hasOurPreviousPayment = billSnapshot.payments.length > 0;
        if (status.isClosedInPos && !hasOurPreviousPayment) {
          throw new BillAlreadyClosedError();
        }
      } catch (err) {
        if (
          err instanceof BillAlreadyClosedError ||
          err instanceof BillUnavailableError
        ) {
          throw err;
        }
        console.error(
          JSON.stringify(
            redact({
              event: "POS_PRECHECK_FAILED_FAIL_OPEN",
              severity: "HIGH",
              billId: hashForLog(billId),
              restaurantId: hashForLog(restaurantId),
              posDocumentId: hashForLog(billSnapshot.posDocumentId),
              error: err instanceof Error ? err.message : String(err),
              ts: new Date().toISOString(),
            })
          )
        );
      }
    }
  }

  if (billSnapshot) {
    const billTotal = billSnapshot.posTotal ?? computeFallbackTotal(billSnapshot.items);
    const wouldBeFullyPaidAfterThisSplit = wouldThisSplitCloseTheBill(
      billSnapshot,
      splitMode,
      selectedItemIds,
      requestedSplitPeople
    );
    const recipientAlreadyExists = billSnapshot.invoiceRecipientPaymentId !== null;

    if (
      billTotal > 50 &&
      wouldBeFullyPaidAfterThisSplit &&
      !recipientAlreadyExists &&
      !hasUsableGuestData
    ) {
      throw new InvoiceDataRequiredError();
    }
  }

  const paymentAdapter = getPaymentAdapter(providerConfig.provider);
  let chargeResponse;
  try {
    chargeResponse = await paymentAdapter.charge(
      {
        chargeToken,
        amount: Math.round(amount * 100) / 100,
        voluntaryTip: voluntaryTipAmount,
      },
      providerConfig
    );
  } catch (error) {
    throw error instanceof Error ? error : new Error("Payment processing failed");
  }

  if (!chargeResponse.approved) {
    throw new Error(`Payment declined: ${chargeResponse.errorText ?? "Unknown error"}`);
  }

  const paymentId = uuidv4();

  let thisPaymentIsRecipient = false;

  try {
    const result = await repos.payment.recordPaymentAtomically({
      paymentId,
      billId,
      restaurantId,
      amount,
      voluntaryTip: voluntaryTipAmount,
      providerTransactionId: chargeResponse.transactionId ?? "",
      idempotencyKey,
      splitMode,
      selectedItemIds,
      requestedSplitPeople,
      guestSessionId,
      guestIdentificacion: rawGuestData?.identificacion ?? null,
      guestEmail: rawGuestData?.email ?? null,
      guestNombre: rawGuestData?.nombre ?? null,
      guestTipo: normalizedGuest.tipo,
      hasUsableGuestData,
    });
    thisPaymentIsRecipient = result.thisPaymentIsRecipient;

    if (posRestaurant?.invoiceMode === "POS") {
      try {
        const posIds = await repos.bill.findPosInfo(billId);
        if (posIds) {
          const { posDocumentId, posToken } = posIds;
          const posConfig = buildPosConfig(posRestaurant);
          const adapter = new ContificoAdapter(posConfig);

          const guestDataForCobro: POSGuestData | undefined =
            thisPaymentIsRecipient && hasUsableGuestData ? normalizedGuest : undefined;

          const cobroNetAmount = Math.round((amount - voluntaryTipAmount) * 100) / 100;

          const cobro = await adapter.confirmPayment({
            posDocumentId,
            posToken,
            amount: cobroNetAmount,
            paymentReference: paymentId,
            guestData: guestDataForCobro,
          });
          if (!cobro.success) {
            await repos.payment.updatePosRegistration(paymentId, {
              registered: false,
              note: cobro.errorMessage ?? "Cobro failed",
            });
            console.error(
              JSON.stringify(
                redact({
                  event: "POS_COBRO_FAILED",
                  severity: "CRITICAL",
                  billId: hashForLog(billId),
                  restaurantId: hashForLog(restaurantId),
                  posDocumentId: hashForLog(posDocumentId),
                  paymentId,
                  amount,
                  errorMessage: cobro.errorMessage,
                  ts: new Date().toISOString(),
                })
              )
            );
          } else {
            await repos.payment.updatePosRegistration(paymentId, { registered: true });
          }
        }
      } catch (err) {
        await repos.payment.updatePosRegistration(paymentId, {
          registered: false,
          note: err instanceof Error ? err.message : String(err),
        }).catch(() => undefined);
        console.error(
          JSON.stringify(
            redact({
              event: "POS_COBRO_FAILED",
              severity: "CRITICAL",
              billId: hashForLog(billId),
              restaurantId: hashForLog(restaurantId),
              paymentId,
              amount,
              error: err instanceof Error ? err.message : String(err),
              ts: new Date().toISOString(),
            })
          )
        );
      }
    }

    return {
      paymentId,
      billStatus: result.billStatus,
      alreadyProcessed: false,
    };
  } catch (error) {
    // Concurrent duplicate idempotency key: another request with the SAME key
    // won the race (unique-constraint violation, balance guard, or claim
    // guard — the trigger doesn't matter). That request's payment IS this
    // payment — return it as already-processed instead of failing (invariant:
    // N identical retries produce exactly one completed payment).
    {
      const winner = await repos.payment
        .findByIdempotencyKey(idempotencyKey)
        .catch(() => null);
      if (winner && winner.billId === billId) {
        // Best-effort void of OUR duplicate charge — the winner's charge stands.
        if (!isStubPaymentToken(chargeToken)) {
          try {
            await paymentAdapter.refund(
              { transactionId: chargeResponse.transactionId ?? "", amount },
              providerConfig
            );
          } catch {
            // logged below via PAYMENT_COMPENSATION_FAILED path semantics
            console.error(
              JSON.stringify(
                redact({
                  event: "PAYMENT_DUPLICATE_VOID_FAILED",
                  severity: "CRITICAL",
                  billId: hashForLog(billId),
                  transactionId: hashForLog(chargeResponse.transactionId ?? ""),
                  ts: new Date().toISOString(),
                })
              )
            );
          }
        }
        return {
          paymentId: winner.id,
          billStatus: "UNPAID" as BillStatus,
          alreadyProcessed: true,
        };
      }
    }

    console.error("Transaction error — attempting void:", error);
    if (!isStubPaymentToken(chargeToken)) {
      try {
        await paymentAdapter.refund(
          { transactionId: chargeResponse.transactionId ?? "", amount },
          providerConfig
        );
      } catch (voidError) {
        console.error(
          JSON.stringify(
            redact({
              event: "PAYMENT_COMPENSATION_FAILED",
              severity: "CRITICAL",
              billId: hashForLog(billId),
              restaurantId: hashForLog(restaurantId),
              transactionId: hashForLog(chargeResponse.transactionId ?? ""),
              amount,
              dbError: error instanceof Error ? error.message : String(error),
              refundError: voidError instanceof Error ? voidError.message : String(voidError),
              ts: new Date().toISOString(),
            })
          )
        );
      }
    }
    throw error;
  }
}

function wouldThisSplitCloseTheBill(
  bill: {
    items: { id: string; isPaid: boolean }[];
    equalSplitPeople: number | null;
    equalSharesPaid: number;
  },
  splitMode: SplitMode,
  selectedItemIds: string[] | undefined,
  requestedSplitPeople: number | undefined
): boolean {
  if (splitMode === "EQUAL") {
    const totalPeople = bill.equalSplitPeople ?? requestedSplitPeople ?? 1;
    return bill.equalSharesPaid + 1 >= totalPeople;
  }

  if (splitMode === "BY_ITEM") {
    const ids = new Set(selectedItemIds ?? []);
    return bill.items.every((i) => i.isPaid || ids.has(i.id));
  }

  return true;
}
