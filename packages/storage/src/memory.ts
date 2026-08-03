import { ValidationError, deepClone } from "@ryvan/common";
import { cosineSimilarity } from "./similarity.js";
import type {
  DocumentFilter,
  DocumentStore,
  KeyValueSetOptions,
  KeyValueStore,
  ObjectMetadata,
  ObjectStore,
  StorageDriver,
  StorageHealth,
  VectorMatch,
  VectorQuery,
  VectorRecord,
  VectorStore,
} from "./types.js";

/** Translates a glob (`*` only) into an anchored RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

interface Expiring<T> {
  value: T;
  expiresAt?: number;
}

/**
 * In-memory key/value store with TTL semantics matching the Redis driver.
 *
 * Expiry is lazy — checked on read rather than swept on a timer — so a key that
 * has passed its TTL is indistinguishable from one that was never set, which is
 * what callers actually depend on.
 */
export class InMemoryKeyValueStore implements KeyValueStore, StorageDriver {
  readonly kind = "memory" as const;
  private readonly entries = new Map<string, Expiring<unknown>>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {
    this.entries.clear();
  }

  async health(): Promise<StorageHealth> {
    return { kind: this.kind, reachable: true, latencyMs: 0, checkedAt: Date.now() };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.read(key);
    return entry ? (deepClone(entry.value) as T) : undefined;
  }

  async set<T>(key: string, value: T, options?: KeyValueSetOptions): Promise<boolean> {
    if (!key) {
      throw new ValidationError("key", "must not be empty");
    }
    if (options?.ifNotExists && this.read(key)) {
      return false;
    }

    this.entries.set(key, {
      value: deepClone(value),
      expiresAt: options?.ttlMs !== undefined ? Date.now() + options.ttlMs : undefined,
    });

    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.read(key) !== undefined;
  }

  async increment(key: string, by = 1, ttlMs?: number): Promise<number> {
    const existing = this.read(key);
    const current = typeof existing?.value === "number" ? existing.value : 0;
    const next = current + by;

    this.entries.set(key, {
      value: next,
      expiresAt:
        ttlMs !== undefined
          ? Date.now() + ttlMs
          : // Preserve any deadline already on the key.
            existing?.expiresAt,
    });

    return next;
  }

  async keys(pattern?: string): Promise<string[]> {
    const matcher = pattern ? globToRegExp(pattern) : undefined;

    return Array.from(this.entries.keys()).filter(
      (key) => this.read(key) !== undefined && (!matcher || matcher.test(key)),
    );
  }

  async clear(pattern?: string): Promise<number> {
    const keys = await this.keys(pattern);
    for (const key of keys) this.entries.delete(key);
    return keys.length;
  }

  private read(key: string): Expiring<unknown> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry;
  }
}

/** In-memory document store. Clones on the way in and out, as a database does. */
export class InMemoryDocumentStore implements DocumentStore, StorageDriver {
  readonly kind = "memory" as const;
  private readonly collections = new Map<string, Map<string, unknown>>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {
    this.collections.clear();
  }

  async health(): Promise<StorageHealth> {
    return { kind: this.kind, reachable: true, latencyMs: 0, checkedAt: Date.now() };
  }

  async put<T extends { id: string }>(collection: string, document: T): Promise<void> {
    if (!document?.id) {
      throw new ValidationError("document.id", "must not be empty");
    }
    this.collection(collection).set(document.id, deepClone(document));
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const document = this.collection(collection).get(id);
    return document ? (deepClone(document) as T) : undefined;
  }

  async find<T>(collection: string, filter?: DocumentFilter): Promise<T[]> {
    let documents = Array.from(this.collection(collection).values());

    if (filter?.where) {
      documents = documents.filter((document) => matchesWhere(document, filter.where!));
    }

    if (filter?.orderBy) {
      const key = filter.orderBy;
      const direction = filter.direction === "desc" ? -1 : 1;

      documents = [...documents].sort((a, b) => {
        const left = (a as Record<string, unknown>)[key];
        const right = (b as Record<string, unknown>)[key];

        if (left === right) return 0;
        // Absent values sort last regardless of direction, matching how SQL
        // NULLS LAST behaves — a missing field is not "smallest".
        if (left === undefined || left === null) return 1;
        if (right === undefined || right === null) return -1;

        return (compareValues(left, right) as number) * direction;
      });
    }

    const offset = filter?.offset ?? 0;
    const end = filter?.limit !== undefined ? offset + filter.limit : undefined;

    return documents.slice(offset, end).map((document) => deepClone(document) as T);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    return this.collection(collection).delete(id);
  }

  async count(collection: string, filter?: Pick<DocumentFilter, "where">): Promise<number> {
    if (!filter?.where) return this.collection(collection).size;

    return Array.from(this.collection(collection).values()).filter((document) =>
      matchesWhere(document, filter.where!),
    ).length;
  }

  private collection(name: string): Map<string, unknown> {
    if (!name) {
      throw new ValidationError("collection", "must not be empty");
    }
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new Map();
      this.collections.set(name, collection);
    }
    return collection;
  }
}

/** Orders two defined values of the same broad shape. Returns -1, 0, or 1. */
function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function matchesWhere(document: unknown, where: Record<string, unknown>): boolean {
  const record = document as Record<string, unknown>;

  for (const [key, expected] of Object.entries(where)) {
    // Dotted paths let callers filter on nested fields, e.g. "subject.orgId".
    const actual = key.includes(".")
      ? key.split(".").reduce<unknown>((value, part) => {
          return value && typeof value === "object"
            ? (value as Record<string, unknown>)[part]
            : undefined;
        }, record)
      : record[key];

    if (actual !== expected) return false;
  }

  return true;
}

/** In-memory object store. */
export class InMemoryObjectStore implements ObjectStore, StorageDriver {
  readonly kind = "memory" as const;
  private readonly objects = new Map<string, { body: Uint8Array; meta: ObjectMetadata }>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {
    this.objects.clear();
  }

  async health(): Promise<StorageHealth> {
    return { kind: this.kind, reachable: true, latencyMs: 0, checkedAt: Date.now() };
  }

  async put(key: string, body: Uint8Array, contentType?: string): Promise<ObjectMetadata> {
    if (!key) {
      throw new ValidationError("key", "must not be empty");
    }

    const meta: ObjectMetadata = {
      key,
      size: body.byteLength,
      contentType,
      updatedAt: Date.now(),
    };

    this.objects.set(key, { body: body.slice(), meta });
    return meta;
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.objects.get(key)?.body.slice();
  }

  async head(key: string): Promise<ObjectMetadata | undefined> {
    const object = this.objects.get(key);
    return object ? { ...object.meta } : undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.objects.delete(key);
  }

  async list(prefix?: string): Promise<ObjectMetadata[]> {
    return Array.from(this.objects.values())
      .filter((object) => !prefix || object.meta.key.startsWith(prefix))
      .map((object) => ({ ...object.meta }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
}

/**
 * In-memory vector store using exhaustive cosine similarity.
 *
 * Exact rather than approximate, which makes it the right thing to test
 * against: results are deterministic and match what pgvector returns for the
 * same inputs, so a test that passes here means the same thing in production.
 */
export class InMemoryVectorStore implements VectorStore, StorageDriver {
  readonly kind = "memory" as const;
  private readonly namespaces = new Map<string, Map<string, VectorRecord>>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {
    this.namespaces.clear();
  }

  async health(): Promise<StorageHealth> {
    return { kind: this.kind, reachable: true, latencyMs: 0, checkedAt: Date.now() };
  }

  async upsert(namespace: string, records: VectorRecord[]): Promise<void> {
    const store = this.namespace(namespace);

    for (const record of records) {
      if (!record.id) {
        throw new ValidationError("record.id", "must not be empty");
      }
      if (!record.embedding?.length) {
        throw new ValidationError("record.embedding", "must not be empty");
      }
      store.set(record.id, deepClone(record));
    }
  }

  async query(namespace: string, query: VectorQuery): Promise<VectorMatch[]> {
    if (!query.embedding?.length) {
      throw new ValidationError("query.embedding", "must not be empty");
    }

    const topK = query.topK ?? 10;
    const candidates = Array.from(this.namespace(namespace).values()).filter(
      (record) => !query.filter || matchesWhere(record.metadata ?? {}, query.filter),
    );

    return candidates
      .map((record) => ({
        ...deepClone(record),
        score: cosineSimilarity(query.embedding, record.embedding),
      }))
      .filter((match) => query.minScore === undefined || match.score >= query.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async delete(namespace: string, ids: string[]): Promise<number> {
    const store = this.namespace(namespace);
    let deleted = 0;
    for (const id of ids) {
      if (store.delete(id)) deleted++;
    }
    return deleted;
  }

  async count(namespace: string): Promise<number> {
    return this.namespace(namespace).size;
  }

  private namespace(name: string): Map<string, VectorRecord> {
    if (!name) {
      throw new ValidationError("namespace", "must not be empty");
    }
    let store = this.namespaces.get(name);
    if (!store) {
      store = new Map();
      this.namespaces.set(name, store);
    }
    return store;
  }
}
