import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db";

/**
 * Payment utilities for idempotency and optimistic locking
 * Prevents duplicate charges and handles race conditions
 */

/**
 * Generate a unique idempotency key for a payment attempt
 * Uses UUID v4 to ensure cryptographic uniqueness
 */
export function generateIdempotencyKey(): string {
  return uuidv4();
}

/**
 * Check if an idempotency key has already been processed
 * Returns existing payment ID if key was already used
 */
export async function checkIdempotencyKey(
  key: string
): Promise<{ exists: boolean; paymentId?: string }> {
  try {
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });

    if (existingPayment) {
      return { exists: true, paymentId: existingPayment.id };
    }

    return { exists: false };
  } catch (error) {
    // If query fails, return safe default (process as new)
    return { exists: false };
  }
}

/**
 * Attempt to claim a bill item using optimistic locking
 * Checks that version field hasn't changed since it was read
 * If version matches, marks item as paid and increments version
 * If version doesn't match, another payment already claimed it
 *
 * @deprecated Item claiming now happens atomically INSIDE the payment
 * transaction — see `PrismaPaymentRepository.recordPaymentAtomically`
 * (guarded `updateMany` with `isPaid: false` + count check). This standalone
 * helper claims items outside that transaction and must not be used in the
 * payment flow. Kept (with its tests) until all call sites are removed.
 */
export async function claimBillItemOptimistic(
  itemId: string,
  readVersion: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Attempt updateMany with version matching
    // Only succeeds if version field matches exactly
    const updated = await prisma.billItem.updateMany({
      where: {
        id: itemId,
        version: readVersion, // Only update if version matches
      },
      data: {
        isPaid: true,
        paidAt: new Date(),
        version: { increment: 1 }, // Increment version for next attempt
      },
    });

    // If updateMany count is 0, version mismatch occurred
    if (updated.count === 0) {
      return {
        success: false,
        error: "Este ítem ya fue pagado", // Item already paid
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Claim multiple bill items atomically using optimistic locking
 * Ensures all items can be claimed before marking any as paid
 * Used in BY_ITEM split mode
 */
export async function claimBillItemsOptimistic(
  itemsWithVersions: Array<{ id: string; version: number }>
): Promise<{ success: boolean; error?: string; failedItemId?: string }> {
  try {
    // Verify all items exist and versions match before updating
    const itemsToVerify = await prisma.billItem.findMany({
      where: {
        id: { in: itemsWithVersions.map((iv) => iv.id) },
      },
      select: { id: true, version: true, isPaid: true },
    });

    // Check if all items exist
    if (itemsToVerify.length !== itemsWithVersions.length) {
      return {
        success: false,
        error: "One or more items not found",
      };
    }

    // Check if any items are already paid
    for (const item of itemsToVerify) {
      if (item.isPaid) {
        return {
          success: false,
          error: "Este ítem ya fue pagado",
          failedItemId: item.id,
        };
      }
    }

    // Check if versions match
    for (const itemWithVersion of itemsWithVersions) {
      const item = itemsToVerify.find((i) => i.id === itemWithVersion.id);
      if (item && item.version !== itemWithVersion.version) {
        return {
          success: false,
          error: "Version mismatch — item was modified",
          failedItemId: itemWithVersion.id,
        };
      }
    }

    // All checks passed, update all items atomically
    await prisma.$transaction(
      itemsWithVersions.map((itemWithVersion) =>
        prisma.billItem.update({
          where: { id: itemWithVersion.id },
          data: {
            isPaid: true,
            paidAt: new Date(),
            version: { increment: 1 },
          },
        })
      )
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
