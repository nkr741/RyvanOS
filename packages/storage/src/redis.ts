import { ValidationError } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type { KeyValueSetOptions, KeyValueStore, StorageDriver, StorageHealth } from "./types.js";

/**
 * The slice of `ioredis` this driver uses. Typed structurally so the package
 * builds and its unit tests run without `ioredis` installed — it is an optional
 * peer dependency.
 */
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  incrbyfloat(key: string, increment: number): Promise<string>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
  scan(cursor: string | number, ...args: unknown[]): Promise<[string, string[]]>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export interface RedisDriverOptions {
  /** Connection string, e.g. redis://localhost:6379. */
  url?: string;
  /** Supply an existing client instead of letting the driver create one. */
  client?: RedisLike;
  /** Prefixes every key, so environments can share one Redis. Default "ryvan". */
  keyPrefix?: string;
  logger?: ILogger;
}

const SCAN_COUNT = 500;

/**
 * Redis-backed key/value store.
 *
 * Values are JSON-encoded, so `get` returns what `set` was given rather than a
 * string. Counters are the exception: `increment` uses Redis' atomic
 * `INCRBYFLOAT`, which is the whole reason to reach for Redis over a map — two
 * processes incrementing the same rate-limit counter must not lose a write.
 */
export class RedisKeyValueStore implements KeyValueStore, StorageDriver {
  readonly kind = "redis" as const;

  private client?: RedisLike;
  private readonly options: RedisDriverOptions;
  private readonly prefix: string;
  private readonly logger?: ILogger;

  constructor(options: RedisDriverOptions = {}) {
    this.options = options;
    this.prefix = options.keyPrefix ?? "ryvan";
    this.logger = options.logger;
    this.client = options.client;
  }

  async connect(): Promise<void> {
    if (this.client) return;

    if (!this.options.url) {
      throw new ValidationError("url", "is required when no client is supplied");
    }

    const module = (await import("ioredis")) as unknown as {
      default?: new (url: string) => RedisLike;
      Redis?: new (url: string) => RedisLike;
    };

    const Redis = module.default ?? module.Redis;
    if (!Redis) {
      throw new ValidationError("ioredis", "the 'ioredis' package exports no client");
    }

    this.client = new Redis(this.options.url);
    this.logger?.info("Redis driver connected", { prefix: this.prefix });
  }

  async disconnect(): Promise<void> {
    // Only close a client this driver created; a supplied one is the caller's.
    if (this.client && !this.options.client) {
      await this.client.quit();
    }
    this.client = undefined;
  }

  async health(): Promise<StorageHealth> {
    const startedAt = Date.now();

    try {
      await this.require().ping();
      return {
        kind: this.kind,
        reachable: true,
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        kind: this.kind,
        reachable: false,
        latencyMs: Date.now() - startedAt,
        message: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.require().get(this.qualify(key));
    if (raw === null) return undefined;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // A counter written by INCRBYFLOAT is a bare number, not JSON.
      return raw as unknown as T;
    }
  }

  async set<T>(key: string, value: T, options?: KeyValueSetOptions): Promise<boolean> {
    if (!key) {
      throw new ValidationError("key", "must not be empty");
    }

    const args: unknown[] = [];
    if (options?.ttlMs !== undefined) args.push("PX", options.ttlMs);
    if (options?.ifNotExists) args.push("NX");

    const result = await this.require().set(this.qualify(key), JSON.stringify(value), ...args);

    // SET NX returns null when the key already existed.
    return result !== null;
  }

  async delete(key: string): Promise<boolean> {
    return (await this.require().del(this.qualify(key))) > 0;
  }

  async has(key: string): Promise<boolean> {
    return (await this.require().exists(this.qualify(key))) > 0;
  }

  async increment(key: string, by = 1, ttlMs?: number): Promise<number> {
    const qualified = this.qualify(key);
    const client = this.require();

    // Read the deadline first: INCRBYFLOAT on an existing key preserves its TTL,
    // but on a fresh key there is none, and re-applying blindly would extend a
    // window that should have kept expiring.
    const remaining = ttlMs === undefined ? await client.pttl(qualified) : -2;
    const next = Number(await client.incrbyfloat(qualified, by));

    if (ttlMs !== undefined) {
      await client.pexpire(qualified, ttlMs);
    } else if (remaining === -2) {
      // -2 means the key did not exist. Nothing to preserve.
    }

    return next;
  }

  async keys(pattern?: string): Promise<string[]> {
    const match = this.qualify(pattern ?? "*");
    const found: string[] = [];
    let cursor = "0";

    // SCAN rather than KEYS: KEYS blocks the server for the whole sweep, which
    // on a production keyspace is an outage.
    do {
      const [next, batch] = await this.require().scan(cursor, "MATCH", match, "COUNT", SCAN_COUNT);
      cursor = next;
      found.push(...batch);
    } while (cursor !== "0");

    return found.map((key) => this.unqualify(key));
  }

  async clear(pattern?: string): Promise<number> {
    const keys = await this.keys(pattern);
    if (keys.length === 0) return 0;

    return this.require().del(...keys.map((key) => this.qualify(key)));
  }

  private qualify(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private unqualify(key: string): string {
    const prefix = `${this.prefix}:`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  private require(): RedisLike {
    if (!this.client) {
      throw new ValidationError("RedisKeyValueStore", "not connected — call connect() first");
    }
    return this.client;
  }
}
