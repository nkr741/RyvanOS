import { hash, compare } from "bcryptjs";
import { ValidationError } from "@ryvan/common";

const BCRYPT_COST = 12;

const BCRYPT_MAX_BYTES = 72;

export async function hashPassword(password: string): Promise<string> {
  if (!password || !password.trim()) {
    throw new ValidationError("password", "must not be empty or whitespace-only");
  }
  if (new TextEncoder().encode(password).length > BCRYPT_MAX_BYTES) {
    throw new ValidationError(
      "password",
      `must not exceed ${BCRYPT_MAX_BYTES} bytes (bcrypt truncates beyond this)`,
    );
  }
  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password) {
    throw new ValidationError("password", "must not be empty");
  }
  if (!passwordHash) {
    throw new ValidationError("hash", "must not be empty");
  }
  return compare(password, passwordHash);
}

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push("must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("must contain at least one number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("must contain at least one special character");
  }
  if (password.length > 128) {
    errors.push("must not exceed 128 characters");
  }

  return { valid: errors.length === 0, errors };
}
