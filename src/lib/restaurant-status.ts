import type { RestaurantStatus } from "@prisma/client";

export const RESTAURANT_BLOCKED_MESSAGE: Record<RestaurantStatus, string | null> = {
  PENDING: "Tu restaurante está pendiente de activación. Contacta al administrador.",
  ACTIVE: null,
  SUSPENDED: "Tu restaurante está suspendido. Contacta soporte.",
};

export function isRestaurantOperational(status: RestaurantStatus): boolean {
  return status === "ACTIVE";
}

export function restaurantBlockMessage(status: RestaurantStatus): string | null {
  return RESTAURANT_BLOCKED_MESSAGE[status];
}
