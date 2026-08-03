export { RBACEngine } from "./rbac.js";
export { TokenManager } from "./token.js";
export type { TokenManagerConfig } from "./token.js";
export { APIKeyManager } from "./api-keys.js";
export { hashPassword, verifyPassword, validatePasswordStrength } from "./password.js";
export { IdentityService } from "./identity-service.js";
export type { IdentityServiceConfig } from "./identity-service.js";
export { InMemoryIdentityStore, normalizeEmail } from "./identity-store.js";
export type { IdentityStore } from "./identity-store.js";

export type {
  Permission,
  User,
  Organization,
  Project,
  Role,
  APIKey,
  Session,
  TokenPayload,
  AuthResult,
} from "./types.js";
