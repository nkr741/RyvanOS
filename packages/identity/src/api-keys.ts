// bcryptjs v2 is CommonJS with only a default export. Named imports work under
// a bundler but throw at runtime in native ESM ("does not provide an export
// named 'compare'"), so destructure the default instead.
import bcrypt from "bcryptjs";

const { hash, compare } = bcrypt;
import { generateId, ValidationError } from "@ryvan/common";
import { InMemoryIdentityStore } from "./identity-store.js";
import type { IdentityStore } from "./identity-store.js";
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
  private readonly store: IdentityStore;

  constructor(store: IdentityStore = new InMemoryIdentityStore()) {
    this.store = store;
  }

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

    await this.store.saveApiKey(apiKey);

    return { apiKey, rawKey };
  }

  async validate(rawKey: string): Promise<APIKey | null> {
    if (!rawKey || !rawKey.startsWith(KEY_NAMESPACE)) return null;

    const parts = rawKey.slice(KEY_NAMESPACE.length).split("_");
    if (parts.length !== 2) return null;

    const apiKey = await this.store.getApiKeyByPrefix(parts[0]!);
    if (!apiKey) return null;

    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
      return null;
    }

    const matches = await compare(rawKey, apiKey.keyHash);
    if (!matches) return null;

    const updated: APIKey = { ...apiKey, lastUsedAt: Date.now() };
    await this.store.saveApiKey(updated);
    return updated;
  }

  async revoke(keyId: string): Promise<boolean> {
    if (!keyId) {
      throw new ValidationError("keyId", "must not be empty");
    }
    return this.store.deleteApiKey(keyId);
  }

  async listByUser(userId: string): Promise<APIKey[]> {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }
    return this.store.listApiKeysByUser(userId);
  }

  async listByOrg(orgId: string): Promise<APIKey[]> {
    if (!orgId) {
      throw new ValidationError("orgId", "must not be empty");
    }
    return this.store.listApiKeysByOrg(orgId);
  }
}
