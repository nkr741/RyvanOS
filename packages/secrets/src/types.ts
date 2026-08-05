/**
 * Where a secret applies. A secret with no scope is platform-wide; one scoped
 * to an org is invisible to every other tenant.
 */
export interface SecretScope {
  orgId?: string;
  projectId?: string;
}

/**
 * A stored secret with its value removed.
 *
 * This is the only shape that leaves the service on a list or read-metadata
 * call. Returning the plaintext by default is how credentials end up in logs,
 * error reports and console screenshots.
 */
export interface SecretMetadata {
  /** Stable name within its scope, e.g. "sap.password". */
  name: string;
  scope: SecretScope;
  description?: string;
  /** Increments on every write, so a rotation is visible without the value. */
  version: number;
  createdAt: number;
  updatedAt: number;
  /** Set when the secret should stop being served. */
  expiresAt?: number;
  lastAccessedAt?: number;
  accessCount: number;
}

/** The encrypted record as it sits at rest. */
export interface SealedSecret extends SecretMetadata {
  /** Composite of scope and name — unique, and what the store keys on. */
  id: string;
  /** Base64 AES-256-GCM ciphertext. */
  ciphertext: string;
  /** Base64 initialisation vector, unique per write. */
  iv: string;
  /** Base64 authentication tag — detects tampering with the ciphertext. */
  authTag: string;
  /** Which key encrypted this, so keys can be rotated without a mass re-encrypt. */
  keyId: string;
}

export interface SetSecretInput {
  name: string;
  value: string;
  scope?: SecretScope;
  description?: string;
  expiresAt?: number;
}

export interface SecretStore {
  put(secret: SealedSecret): Promise<void>;
  get(id: string): Promise<SealedSecret | undefined>;
  list(scope?: SecretScope): Promise<SealedSecret[]>;
  delete(id: string): Promise<boolean>;
}

export interface EncryptionKey {
  /** Recorded on every secret this key seals, so rotation is incremental. */
  id: string;
  /** 32 bytes, base64 or hex. Anything shorter is rejected. */
  material: string;
}

export interface SecretsServiceOptions {
  /**
   * Keys used to seal secrets. The first is the active one; the rest are kept
   * so previously sealed secrets stay readable through a rotation.
   */
  keys: EncryptionKey[];
  store?: SecretStore;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}
