/**
 * Request payload for POST /api/auth/register
 */
export interface RegisterRequest {
  email: string;
  password: string;
  restaurantName: string;
}

/**
 * Response payload for auth endpoints
 */
export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    restaurantId: string;
  };
}

/**
 * Session user object shape
 * Extends next-auth Session with custom fields
 */
export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: "OWNER" | "MANAGER" | "SERVER";
  restaurantId: string;
}
