/**
 * Authentication — AIOS adapter layer.
 *
 * Password hashing routes through @ryvan/identity (adds 72-byte truncation
 * guard and whitespace rejection — security improvements over legacy).
 *
 * JWT tokens remain Cortex-native because AIOS uses a different claim
 * structure ({sub, org, roles, permissions} vs {id, email, role, name}).
 * Swapping would break all 38 API routes that read user.id/user.email.
 * This will be aligned in Sprint 3 when we unify token formats.
 *
 * API surface is UNCHANGED — all 38 consumers import the same functions.
 */

import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { hashPassword as aiosHash, verifyPassword as aiosVerify } from "@ryvan/identity";

// Legacy bcrypt — fallback if AIOS path fails
import { hash, compare } from "bcryptjs";

const SALT_ROUNDS = 12;

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  name: string;
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is not set");
  }
  return secret;
}

// ─── Password operations (AIOS path with legacy fallback) ──────

export async function hashPassword(password: string): Promise<string> {
  try {
    return await aiosHash(password);
  } catch {
    return hash(password, SALT_ROUNDS);
  }
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    return await aiosVerify(password, hashedPassword);
  } catch {
    return compare(password, hashedPassword);
  }
}

// ─── JWT operations (Cortex-native — claim structure differs from AIOS) ──

export function createToken(user: {
  id: string;
  email: string;
  role: string;
  name: string;
}): string {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  return jwt.sign(payload, getSecret(), { expiresIn: "24h", algorithm: "HS256" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function getCurrentUser(request: NextRequest): TokenPayload | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  return verifyToken(token);
}
