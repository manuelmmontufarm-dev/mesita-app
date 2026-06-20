import type { EInvoicePayload } from "@/hooks/useGuestPaymentFlow";

export interface StoredPaymentCard {
  num: string;
  holder: string;
  exp: string;
  cvv: string;
}

export interface StoredPaymentForm {
  card: StoredPaymentCard;
  bill: EInvoicePayload;
  billChoice: "later" | "me";
}

function storageKey(tableToken: string): string {
  return `mesita:guest:payform:${tableToken}`;
}

export function readStoredPaymentForm(
  tableToken: string,
): StoredPaymentForm | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(tableToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPaymentForm;
    if (!parsed?.card) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredPaymentForm(
  tableToken: string,
  form: StoredPaymentForm,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(tableToken), JSON.stringify(form));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function clearStoredPaymentForm(tableToken: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(storageKey(tableToken));
}
