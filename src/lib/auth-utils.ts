import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Hashes a plaintext password using bcryptjs with 10 salt rounds
 * @param password - The plaintext password to hash
 * @returns Promise<string> - The hashed password
 * @throws Error if password is less than 8 characters
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(password, 10);
}

/**
 * Validates a plaintext password against a bcrypt hash
 * @param plaintext - The plaintext password to validate
 * @param hashed - The bcrypt hash to compare against
 * @returns Promise<boolean> - True if password matches, false otherwise
 */
export async function validatePassword(
  plaintext: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hashed);
}

/**
 * Validates email format using basic regex
 * @param email - The email address to validate
 * @returns boolean - True if email format is valid, false otherwise
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generates a temporary password for newly created staff accounts
 * Returns a random 12-character password with mixed case and numbers
 * @returns string - The generated temporary password
 */
export function generateTemporaryPassword(): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";

  // Generate random bytes for good entropy
  const randomBytes = crypto.randomBytes(12);

  let password = "";
  // First 4: uppercase
  for (let i = 0; i < 4; i++) {
    password += uppercase[randomBytes[i] % uppercase.length];
  }
  // Next 4: lowercase
  for (let i = 4; i < 8; i++) {
    password += lowercase[randomBytes[i] % lowercase.length];
  }
  // Last 4: numbers
  for (let i = 8; i < 12; i++) {
    password += numbers[randomBytes[i] % numbers.length];
  }

  return password;
}

/**
 * Checks if a user must change their password on next login
 * @param mustChangePassword - The mustChangePassword flag from User model
 * @returns boolean - True if user must change password, false otherwise
 */
export function isMustChangePassword(mustChangePassword: boolean): boolean {
  return mustChangePassword;
}
