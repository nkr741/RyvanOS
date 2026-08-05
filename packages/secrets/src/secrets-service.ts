import { EVENTS, NotFoundError, ValidationError, deepClone } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import { scopedEmitter } from "@ryvan/events";
import type { ScopedEmitter } from "@ryvan/events";
import { prepareKeys, seal, unseal } from "./crypto.js";
import type {
  SealedSecret,
  SecretMetadata,
  SecretScope,
  SecretStore,
  SecretsServiceOptions,
  SetSecretInput,
} from "./types.js";

/** Scope and name together identify a secret, so both are in the key. */
export function secretId(name: string, scope: SecretScope = {}): string {
  return [scope.orgId ?? "*", scope.projectId ?? "*", name].join(":");
}

/** Process-local sealed storage. Values here are already encrypted. */
export class InMemorySecretStore implements SecretStore {
  private readonly secrets = new Map<string, SealedSecret>();

  async put(secret: SealedSecret): Promise<void> {
    this.secrets.set(secret.id, deepClone(secret));
  }

  async get(id: string): Promise<SealedSecret | undefined> {
    const secret = this.secrets.get(id);
    return secret ? deepClone(secret) : undefined;
  }

  async list(scope?: SecretScope): Promise<SealedSecret[]> {
    return Array.from(this.secrets.values())
      .filter((secret) => {
        if (scope?.orgId !== undefined && secret.scope.orgId !== scope.orgId) return false;
        if (scope?.projectId !== undefined && secret.scope.projectId !== scope.projectId) {
          return false;
        }
        return true;
      })
      .map((secret) => deepClone(secret));
  }

  async delete(id: string): Promise<boolean> {
    return this.secrets.delete(id);
  }
}

/**
 * Encrypted secret storage, scoped per tenant.
 *
 * Before this, connector credentials travelled in plain configuration objects —
 * readable by anything that could see the config, and printable by anything
 * that logged it. Secrets are now sealed with AES-256-GCM at rest and only
 * unsealed at the moment of use.
 *
 * The API is deliberately asymmetric: `list` and `describe` never return a
 * value, and only `reveal` does. Making the plaintext path explicit is what
 * keeps credentials out of logs, traces and console screenshots.
 */
export class SecretsService implements Service {
  readonly name = "secrets";

  private state: Status = "stopped";
  private readonly store: SecretStore;
  private readonly active: { id: string; key: Buffer };
  private readonly keysById: Map<string, Buffer>;
  private readonly logger?: ILogger;
  private readonly emit: ScopedEmitter;

  constructor(options: SecretsServiceOptions) {
    const { active, byId } = prepareKeys(options.keys);

    this.active = active;
    this.keysById = byId;
    this.store = options.store ?? new InMemorySecretStore();
    this.logger = options.logger;
    this.emit = scopedEmitter("secrets", options.eventBus);
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.state = "running";
    this.logger?.info("Secrets service started", { activeKey: this.active.id });
  }

  async stop(): Promise<void> {
    this.state = "stopping";
    this.state = "stopped";
    this.logger?.info("Secrets service stopped");
  }

  status(): Status {
    return this.state;
  }

  /** Stores or rotates a secret. Returns metadata — never the value. */
  async set(input: SetSecretInput): Promise<SecretMetadata> {
    if (!input.name) {
      throw new ValidationError("name", "must not be empty");
    }
    if (!input.value) {
      throw new ValidationError("value", "must not be empty");
    }

    const scope = input.scope ?? {};
    const id = secretId(input.name, scope);
    const existing = await this.store.get(id);
    const now = Date.now();

    const sealed = seal(input.value, this.active.key);

    const secret: SealedSecret = {
      id,
      name: input.name,
      scope,
      description: input.description ?? existing?.description,
      // Incrementing rather than resetting makes a rotation visible to anyone
      // holding a reference, without exposing either value.
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      accessCount: existing?.accessCount ?? 0,
      lastAccessedAt: existing?.lastAccessedAt,
      keyId: this.active.id,
      ...sealed,
    };

    await this.store.put(secret);
    await this.emit(EVENTS.SECRET_WRITTEN, {
      name: secret.name,
      scope,
      version: secret.version,
    });

    this.logger?.info("Secret stored", { name: secret.name, version: secret.version });
    return this.redact(secret);
  }

  /**
   * Returns the plaintext. The only method that does.
   *
   * Records the access, so an audit can answer "who read this credential and
   * when" — which is the question that matters after an incident.
   */
  async reveal(name: string, scope: SecretScope = {}): Promise<string> {
    const id = secretId(name, scope);
    const secret = await this.store.get(id);

    if (!secret) {
      throw new NotFoundError("Secret", id);
    }
    if (secret.expiresAt !== undefined && Date.now() >= secret.expiresAt) {
      // Serving an expired credential is worse than failing: it looks like it
      // worked right up until the vendor rejects it.
      throw new ValidationError("secret", `"${name}" expired`);
    }

    const key = this.keysById.get(secret.keyId);
    if (!key) {
      throw new ValidationError(
        "secret",
        `"${name}" was sealed with key "${secret.keyId}", which is not configured`,
      );
    }

    const value = unseal(secret, key);

    await this.store.put({
      ...secret,
      accessCount: secret.accessCount + 1,
      lastAccessedAt: Date.now(),
    });
    await this.emit(EVENTS.SECRET_ACCESSED, { name: secret.name, scope: secret.scope });

    return value;
  }

  /** Metadata for one secret, with no value. */
  async describe(name: string, scope: SecretScope = {}): Promise<SecretMetadata | undefined> {
    const secret = await this.store.get(secretId(name, scope));
    return secret ? this.redact(secret) : undefined;
  }

  /** Every secret in a scope, with no values. */
  async list(scope?: SecretScope): Promise<SecretMetadata[]> {
    return (await this.store.list(scope)).map((secret) => this.redact(secret));
  }

  async delete(name: string, scope: SecretScope = {}): Promise<boolean> {
    const deleted = await this.store.delete(secretId(name, scope));

    if (deleted) {
      await this.emit(EVENTS.SECRET_DELETED, { name, scope });
      this.logger?.info("Secret deleted", { name });
    }
    return deleted;
  }

  /**
   * Re-seals every secret still using an old key with the active one.
   *
   * Rotation is incremental by design: old keys stay configured so nothing
   * breaks mid-rotation, and each secret moves the next time this runs.
   */
  async rotate(scope?: SecretScope): Promise<{ rotated: number; skipped: number }> {
    let rotated = 0;
    let skipped = 0;

    for (const secret of await this.store.list(scope)) {
      if (secret.keyId === this.active.id) {
        skipped++;
        continue;
      }

      const key = this.keysById.get(secret.keyId);
      if (!key) {
        // Cannot read it, so cannot re-seal it. Left alone and reported rather
        // than deleted — losing a credential silently is the worse outcome.
        this.logger?.error("Cannot rotate secret: its key is not configured", {
          name: secret.name,
          keyId: secret.keyId,
        });
        skipped++;
        continue;
      }

      await this.store.put({
        ...secret,
        ...seal(unseal(secret, key), this.active.key),
        keyId: this.active.id,
        updatedAt: Date.now(),
      });
      rotated++;
    }

    this.logger?.info("Secret rotation complete", { rotated, skipped });
    return { rotated, skipped };
  }

  /** Strips everything that could reconstruct the value. */
  private redact(secret: SealedSecret): SecretMetadata {
    return {
      name: secret.name,
      scope: secret.scope,
      description: secret.description,
      version: secret.version,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
      expiresAt: secret.expiresAt,
      lastAccessedAt: secret.lastAccessedAt,
      accessCount: secret.accessCount,
    };
  }
}
