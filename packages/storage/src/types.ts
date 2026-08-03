/**
 * Storage ports.
 *
 * These are deliberately generic: no mission, workflow, or audit types appear
 * anywhere in this package. Domain packages declare their own store interfaces
 * (`WorkflowStore`, `MissionStore`, `AuditStore`, `MemoryBackend`); the durable
 * implementations of those live in `@ryvan/persistence`, which is allowed to
 * know both. That keeps the "no domain package imports another" rule intact.
 */

export type StorageKind = "memory" | "postgres" | "redis" | "s3" | "filesystem";

// --- key/value --------------------------------------------------------------

export interface KeyValueSetOptions {
  /** Time to live in milliseconds. Omitted means the entry does not expire. */
  ttlMs?: number;
  /** Only write when the key does not already exist. Returns false if it does. */
  ifNotExists?: boolean;
}

/**
 * Ephemeral, fast storage — caches, locks, rate limit counters, session state.
 * Backed by Redis in production and by a map in tests.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: KeyValueSetOptions): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  /** Atomic increment. Creates the key at 0 first when absent. */
  increment(key: string, by?: number, ttlMs?: number): Promise<number>;
  /** Keys matching a glob pattern. Expensive on large keyspaces — avoid on hot paths. */
  keys(pattern?: string): Promise<string[]>;
  clear(pattern?: string): Promise<number>;
}

// --- documents --------------------------------------------------------------

export interface DocumentFilter {
  /** Exact-match field equality. */
  where?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  orderBy?: string;
  direction?: "asc" | "desc";
}

/**
 * Durable records addressed by id, within a named collection.
 *
 * Backed by a single Postgres table per collection with a JSONB payload, which
 * keeps domain stores from each needing bespoke DDL while still allowing
 * indexes on the fields that matter.
 */
export interface DocumentStore {
  put<T extends { id: string }>(collection: string, document: T): Promise<void>;
  get<T>(collection: string, id: string): Promise<T | undefined>;
  find<T>(collection: string, filter?: DocumentFilter): Promise<T[]>;
  delete(collection: string, id: string): Promise<boolean>;
  count(collection: string, filter?: Pick<DocumentFilter, "where">): Promise<number>;
}

// --- objects ----------------------------------------------------------------

export interface ObjectMetadata {
  key: string;
  size: number;
  contentType?: string;
  updatedAt: number;
  etag?: string;
}

/** Blobs — attachments, exports, model artefacts, audit archives. */
export interface ObjectStore {
  put(key: string, body: Uint8Array, contentType?: string): Promise<ObjectMetadata>;
  get(key: string): Promise<Uint8Array | undefined>;
  head(key: string): Promise<ObjectMetadata | undefined>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<ObjectMetadata[]>;
}

// --- vectors ----------------------------------------------------------------

export interface VectorRecord {
  id: string;
  embedding: number[];
  /** Filterable attributes stored alongside the vector. */
  metadata?: Record<string, unknown>;
  /** The text the embedding was produced from, kept for retrieval. */
  content?: string;
}

export interface VectorQuery {
  embedding: number[];
  topK?: number;
  /** Exact-match metadata filter applied before ranking. */
  filter?: Record<string, unknown>;
  /** Drop results scoring below this. Scores are cosine similarity, 0..1. */
  minScore?: number;
}

export interface VectorMatch extends VectorRecord {
  /** Cosine similarity, 1 = identical. */
  score: number;
}

/**
 * Similarity search. Backed by Postgres + pgvector, which is why the platform's
 * compose file already pins `pgvector/pgvector:pg16` — no separate vector
 * database is needed.
 */
export interface VectorStore {
  upsert(namespace: string, records: VectorRecord[]): Promise<void>;
  query(namespace: string, query: VectorQuery): Promise<VectorMatch[]>;
  delete(namespace: string, ids: string[]): Promise<number>;
  count(namespace: string): Promise<number>;
}

// --- sql --------------------------------------------------------------------

export interface SqlResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * Escape hatch for adapters that need real SQL — indexes, joins, aggregates.
 * `transaction` gives a client on which every statement shares one transaction;
 * throwing inside the callback rolls back.
 */
export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
  transaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T>;
}

// --- lifecycle --------------------------------------------------------------

export interface StorageHealth {
  kind: StorageKind;
  reachable: boolean;
  latencyMs?: number;
  message?: string;
  checkedAt: number;
}

/**
 * A storage driver. `connect`/`disconnect` are separate from the `Service`
 * lifecycle because a driver is a dependency of services, not a peer of them.
 */
export interface StorageDriver {
  readonly kind: StorageKind;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<StorageHealth>;
}

export interface Migration {
  /** Ordering key. Use a sortable prefix, e.g. "0001_initial". */
  id: string;
  /** Statements applied in order, inside one transaction. */
  up: string[];
}
