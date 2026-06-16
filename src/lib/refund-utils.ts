import axios from "axios";

/**
 * Refund utilities for processing full refunds via Kushki API
 * Handles refund calls and request validation
 */

const KUSHKI_API_URL = "https://api.kushkipagos.com/v1";
const KUSHKI_SECRET_KEY = process.env.KUSHKI_SECRET_KEY;

export interface RefundResponse {
  status: "APPROVED" | "DECLINED" | "ERROR" | string;
  message?: string;
  transactionId?: string;
}

/**
 * Process a refund via Kushki API
 * @param transactionId - Original Kushki transaction ID to refund
 * @param amount - Amount to refund (in USD, e.g., 25.50)
 * @param currency - Currency code (e.g., "USD")
 * @returns Kushki refund response or throws Error
 */
export async function refundViaKushki(
  transactionId: string,
  amount: number,
  currency: string
): Promise<RefundResponse> {
  // Validate that secret key is configured
  if (!KUSHKI_SECRET_KEY) {
    throw new Error("KUSHKI_SECRET_KEY environment variable is not configured");
  }

  try {
    // Call Kushki refund API
    const response = await axios.post<RefundResponse>(
      `${KUSHKI_API_URL}/refunds/${transactionId}`,
      {
        amount: Math.round(amount * 100) / 100, // Ensure 2 decimals
        currency,
      },
      {
        headers: {
          Authorization: `Bearer ${KUSHKI_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 seconds
      }
    );

    return response.data;
  } catch (error) {
    // Re-throw with meaningful error message
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      throw new Error(`Kushki refund failed: ${message}`);
    }
    throw error;
  }
}

/**
 * Validate refund request parameters
 * @param amount - Amount to refund
 * @param reason - Reason for refund
 * @returns Validation result with valid flag and any errors
 */
export function validateRefundRequest(
  amount: number,
  reason: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate amount
  if (typeof amount !== "number" || amount < 0.01) {
    errors.push("Amount must be a number greater than or equal to 0.01");
  }

  // Validate reason
  if (typeof reason !== "string" || reason.trim().length === 0) {
    errors.push("Reason must be a non-empty string");
  }

  if (reason && reason.length > 255) {
    errors.push("Reason must be 255 characters or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
