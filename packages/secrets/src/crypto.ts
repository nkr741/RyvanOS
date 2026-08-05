import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { ValidationError } from "@ryvan/common";
import type { EncryptionKey } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Normalises key material to exactly 32 bytes.
 *
 * Accepts base64 or hex of the right length directly. Anything else is hashed
 * to 32 bytes rather than truncated or padded — truncating silently weakens the
 * key, and padding makes two different passphrases collide.
 */
export function deriveKey(material: string): Buffer {
  if (!material || material.length < 16) {
    throw new ValidationError("key.material", "must be at least 16 characters");
  }

  for (const encoding of ["base64", "hex"] as const) {
    try {
      const decoded = Buffer.from(material, encoding);
      if (decoded.length === KEY_BYTES) return decoded;
    } catch {
      // Not this encoding; fall through to the digest.
    }
  }

  return createHash("sha256").update(material, "utf8").digest();
}

export interface Sealed {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts with AES-256-GCM.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: without an
 * auth tag, an attacker with write access to the database can flip bits in a
 * credential and the platform would decrypt the result and use it.
 *
 * A fresh IV per write is mandatory — reusing one under the same key destroys
 * GCM's security entirely.
 */
export function seal(plaintext: string, key: Buffer): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Decrypts, throwing if the ciphertext or tag has been altered. */
export function unseal(sealed: Sealed, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/** Indexes keys by id, validating each. The first entry is the active key. */
export function prepareKeys(keys: EncryptionKey[]): {
  active: { id: string; key: Buffer };
  byId: Map<string, Buffer>;
} {
  if (!keys?.length) {
    throw new ValidationError("keys", "at least one encryption key is required");
  }

  const byId = new Map<string, Buffer>();
  for (const key of keys) {
    if (!key.id) {
      throw new ValidationError("key.id", "must not be empty");
    }
    byId.set(key.id, deriveKey(key.material));
  }

  return { active: { id: keys[0]!.id, key: byId.get(keys[0]!.id)! }, byId };
}
