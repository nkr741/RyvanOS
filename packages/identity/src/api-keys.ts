import { hash, compare } from "bcryptjs";
import { generateId, ValidationError } from "@ryvan/common";
import type { APIKey } from "./types.js";

const BCRYPT_COST = 12;
const KEY_PREFIX_LENGTH = 8;
const KEY_SECRET_LENGTH = 32;
const KEY_NAMESPACE = "ryvan_";

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const maxValid = 256 - (256 % chars.length);
  let result = "";
  while (result.length < length) {
    const bytes = new Uint8Array(length - result.length + 16);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < maxValid) {
        result += chars[bytes[i] % chars.length];
      }
    }
  }
  return result;
}

export class APIKeyManager {
  private keys = new Map<string, APIKey>();
  private keysByPrefix = new Map<string, string>();

  async generate(
    userId: string,
    orgId: string,
    name: string,
    permissions: string[],
    expiresAt?: number,
  ): Promise<{ apiKey: APIKey; rawKey: string }> {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }
    if (!orgId) {
      throw new ValidationError("orgId", "must not be empty");
    }
    if (!name) {
      throw new ValidationError("name", "must not be empty");
    }
    if (!permissions || permissions.length === 0) {
      throw new ValidationError("permissions", "must include at least one permission");
    }

    const prefix = generateRandomString(KEY_PREFIX_LENGTH);
    const secret = generateRandomString(KEY_SECRET_LENGTH);
    const rawKey = `${KEY_NAMESPACE}${prefix}_${secret}`;
    const keyHash = await hash(rawKey, BCRYPT_COST);

    const apiKey: APIKey = {
      id: generateId("key"),
      name,
      keyHash,
      prefix,
      userId,
      organizationId: orgId,
      permissions,
      expiresAt,
      lastUsedAt: undefined,
      createdAt: Date.now(),
    };

    this.keys.set(apiKey.id, apiKey);
    this.keysByPrefix.set(prefix, apiKey.id);

    return { apiKey, rawKey };
  }

  async validate(rawKey: string): Promise<APIKey | null> {
    if (!rawKey || !rawKey.startsWith(KEY_NAMESPACE)) return null;

    const parts = rawKey.slice(KEY_NAMESPACE.length).split("_");
    if (parts.length !== 2) return null;

    const prefix = parts[0];
    const keyId = this.keysByPrefix.get(prefix);
    if (!keyId) return null;

    const apiKey = this.keys.get(keyId);
    if (!apiKey) return null;

    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
      return null;
    }

    const matches = await compare(rawKey, apiKey.keyHash);
    if (!matches) return null;

    const updated: APIKey = { ...apiKey, lastUsedAt: Date.now() };
    this.keys.set(keyId, updated);
    return updated;
  }

  revoke(keyId: string): boolean {
    if (!keyId) {
      throw new ValidationError("keyId", "must not be empty");
    }
    const apiKey = this.keys.get(keyId);
    if (apiKey) {
      this.keysByPrefix.delete(apiKey.prefix);
    }
    return this.keys.delete(keyId);
  }

  listByUser(userId: string): APIKey[] {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }
    const result: APIKey[] = [];
    for (const key of this.keys.values()) {
      if (key.userId === userId) result.push(key);
    }
    return result;
  }

  listByOrg(orgId: string): APIKey[] {
    if (!orgId) {
      throw new ValidationError("orgId", "must not be empty");
    }
    const result: APIKey[] = [];
    for (const key of this.keys.values()) {
      if (key.organizationId === orgId) result.push(key);
    }
    return result;
  }
}
