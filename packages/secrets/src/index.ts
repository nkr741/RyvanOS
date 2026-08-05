export { SecretsService, InMemorySecretStore, secretId } from "./secrets-service.js";
export { seal, unseal, deriveKey, prepareKeys } from "./crypto.js";

export type { Sealed } from "./crypto.js";

export type {
  SecretScope,
  SecretMetadata,
  SealedSecret,
  SetSecretInput,
  SecretStore,
  EncryptionKey,
  SecretsServiceOptions,
} from "./types.js";
