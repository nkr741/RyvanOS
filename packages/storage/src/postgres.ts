import { ValidationError } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type {
  DocumentFilter,
  DocumentStore,
  Migration,
  SqlClient,
  SqlResult,
  StorageDriver,
  StorageHealth,
  VectorMatch,
  VectorQuery,
  VectorRecord,
  VectorStore,
} from "./types.js";

/**
 * The slice of `pg` this driver uses. Typed structurally so the package builds
 * and its unit tests run without `pg` installed — it is an optional peer
 * dependency, needed only when someone actually points at Postgres.
 */
interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface PgPoolClient extends PgQueryable {
  release(): void;
}

interface PgPool extends PgQueryable {
  connect(): Promise<PgPoolClient>;
  end(): Promise<void>;
}

export interface PostgresDriverOptions {
  /** Standard connection string, e.g. postgres://user:pass@host:5432/db. */
  connectionString?: string;
  /** Supply an existing pool instead of letting the driver create one. */
  pool?: PgPool;
  /** Table prefix, so several tenants or test runs can share a database. */
  tablePrefix?: string;
  /** Embedding width for the vector column. Must match your model. Default 1536. */
  vectorDimensions?: number;
  logger?: ILogger;
}

const DEFAULT_VECTOR_DIMENSIONS = 1536;

/** Identifiers are interpolated into DDL, so they must not be attacker-shaped. */
function assertSafeIdentifier(value: string, field: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new ValidationError(field, `"${value}" is not a valid SQL identifier`);
  }
  return value;
}

/**
 * Postgres-backed storage: SQL access, a JSONB document store, and pgvector
 * similarity search.
 *
 * One table per collection keeps domain stores from each needing bespoke DDL,
 * while `payload` being JSONB still allows indexes on whichever fields turn out
 * to matter.
 */
export class PostgresDriver implements StorageDriver, SqlClient, DocumentStore {
  readonly kind = "postgres" as const;

  private pool?: PgPool;
  private readonly options: PostgresDriverOptions;
  private readonly prefix: string;
  private readonly vectorDimensions: number;
  private readonly logger?: ILogger;
  private readonly ensured = new Set<string>();

  constructor(options: PostgresDriverOptions = {}) {
    this.options = options;
    this.prefix = assertSafeIdentifier(options.tablePrefix ?? "ryvan", "tablePrefix");
    this.vectorDimensions = options.vectorDimensions ?? DEFAULT_VECTOR_DIMENSIONS;
    this.logger = options.logger;
    this.pool = options.pool;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    if (!this.options.connectionString) {
      throw new ValidationError("connectionString", "is required when no pool is supplied");
    }

    // Imported lazily so the package does not hard-depend on `pg`.
    const pg = (await import("pg")) as unknown as {
      default?: { Pool: new (config: { connectionString: string }) => PgPool };
      Pool?: new (config: { connectionString: string }) => PgPool;
    };

    const Pool = pg.Pool ?? pg.default?.Pool;
    if (!Pool) {
      throw new ValidationError("pg", "the 'pg' package is installed but exports no Pool");
    }

    this.pool = new Pool({ connectionString: this.options.connectionString });
    this.logger?.info("Postgres driver connected", { prefix: this.prefix });
  }

  async disconnect(): Promise<void> {
    // Only tear down a pool this driver created; a supplied one is the caller's.
    if (this.pool && !this.options.pool) {
      await this.pool.end();
    }
    this.pool = undefined;
    this.ensured.clear();
  }

  async health(): Promise<StorageHealth> {
    const startedAt = Date.now();

    try {
      await this.query("SELECT 1");
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

  // --- SqlClient ------------------------------------------------------------

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>> {
    const result = await this.requirePool().query(sql, params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
  }

  /**
   * Runs `fn` inside one transaction, rolling back if it throws.
   *
   * Only statements issued on the `client` argument are enrolled. The driver's
   * own `put`/`get`/`find` run on the pool and are **not** rolled back — there
   * is no ambient transaction in this design. Callers needing transactional
   * document writes must use the client they are handed.
   */
  async transaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();

    const scoped: SqlClient = {
      query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as R[], rowCount: result.rowCount ?? result.rows.length };
      },
      // Postgres has no true nested transactions; reusing the same client keeps
      // every statement in one transaction rather than silently opening another.
      transaction: async <R>(inner: (c: SqlClient) => Promise<R>) => inner(scoped),
    };

    try {
      await client.query("BEGIN");
      const result = await fn(scoped);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // --- migrations -----------------------------------------------------------

  /**
   * Applies migrations that have not run yet, in id order, each in its own
   * transaction. Recording the id in the same transaction as the statements
   * means a crash mid-migration leaves it un-recorded and it simply retries.
   */
  async migrate(migrations: Migration[]): Promise<string[]> {
    const table = `${this.prefix}_migrations`;

    await this.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await this.query<{ id: string }>(`SELECT id FROM ${table}`);
    const applied = new Set(rows.map((row) => row.id));
    const ran: string[] = [];

    for (const migration of [...migrations].sort((a, b) => a.id.localeCompare(b.id))) {
      if (applied.has(migration.id)) continue;

      await this.transaction(async (client) => {
        for (const statement of migration.up) {
          await client.query(statement);
        }
        await client.query(`INSERT INTO ${table} (id) VALUES ($1)`, [migration.id]);
      });

      ran.push(migration.id);
      this.logger?.info("Migration applied", { id: migration.id });
    }

    return ran;
  }

  // --- DocumentStore --------------------------------------------------------

  async put<T extends { id: string }>(collection: string, document: T): Promise<void> {
    if (!document?.id) {
      throw new ValidationError("document.id", "must not be empty");
    }

    const table = await this.ensureCollection(collection);

    await this.query(
      `INSERT INTO ${table} (id, payload, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [document.id, JSON.stringify(document)],
    );
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const table = await this.ensureCollection(collection);

    const { rows } = await this.query<{ payload: T }>(
      `SELECT payload FROM ${table} WHERE id = $1`,
      [id],
    );

    return rows[0]?.payload;
  }

  async find<T>(collection: string, filter?: DocumentFilter): Promise<T[]> {
    const table = await this.ensureCollection(collection);
    const { clause, params } = this.buildWhere(filter?.where);

    let sql = `SELECT payload FROM ${table} ${clause}`;

    if (filter?.orderBy) {
      // Ordering is on a JSON field, so it is parameterised as a path rather
      // than interpolated — an orderBy value can come from a caller.
      params.push(filter.orderBy);
      const direction = filter.direction === "desc" ? "DESC" : "ASC";
      sql += ` ORDER BY payload -> $${params.length} ${direction}`;
    }

    if (filter?.limit !== undefined) {
      params.push(filter.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (filter?.offset !== undefined) {
      params.push(filter.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const { rows } = await this.query<{ payload: T }>(sql, params);
    return rows.map((row) => row.payload);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const table = await this.ensureCollection(collection);
    const { rowCount } = await this.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  async count(collection: string, filter?: Pick<DocumentFilter, "where">): Promise<number> {
    const table = await this.ensureCollection(collection);
    const { clause, params } = this.buildWhere(filter?.where);

    const { rows } = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table} ${clause}`,
      params,
    );

    return Number(rows[0]?.count ?? 0);
  }

  // --- VectorStore ----------------------------------------------------------

  async upsert(namespace: string, records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    const table = await this.ensureVectorNamespace(namespace);

    await this.transaction(async (client) => {
      for (const record of records) {
        if (!record.id) {
          throw new ValidationError("record.id", "must not be empty");
        }
        if (record.embedding?.length !== this.vectorDimensions) {
          throw new ValidationError(
            "record.embedding",
            `expected ${this.vectorDimensions} dimensions, got ${record.embedding?.length ?? 0}`,
          );
        }

        await client.query(
          `INSERT INTO ${table} (id, embedding, metadata, content) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE
             SET embedding = EXCLUDED.embedding,
                 metadata  = EXCLUDED.metadata,
                 content   = EXCLUDED.content`,
          [
            record.id,
            toVectorLiteral(record.embedding),
            JSON.stringify(record.metadata ?? {}),
            record.content ?? null,
          ],
        );
      }
    });
  }

  /**
   * Similarity search.
   *
   * `1 - (embedding <=> $1)` is pgvector's cosine distance turned into raw
   * cosine similarity; the extra `+ 1) / 2` rescales to 0..1 so it agrees
   * exactly with `cosineSimilarity()` and the in-memory store.
   */
  async vectorQuery(namespace: string, query: VectorQuery): Promise<VectorMatch[]> {
    if (!query.embedding?.length) {
      throw new ValidationError("query.embedding", "must not be empty");
    }

    const table = await this.ensureVectorNamespace(namespace);
    const params: unknown[] = [toVectorLiteral(query.embedding)];
    let where = "";

    if (query.filter && Object.keys(query.filter).length > 0) {
      params.push(JSON.stringify(query.filter));
      where = `WHERE metadata @> $${params.length}::jsonb`;
    }

    params.push(query.topK ?? 10);

    const { rows } = await this.query<{
      id: string;
      embedding: string;
      metadata: Record<string, unknown>;
      content: string | null;
      score: number;
    }>(
      `SELECT id, embedding::text AS embedding, metadata, content,
              ((1 - (embedding <=> $1)) + 1) / 2 AS score
       FROM ${table} ${where}
       ORDER BY embedding <=> $1
       LIMIT $${params.length}`,
      params,
    );

    return rows
      .map((row) => ({
        id: row.id,
        embedding: parseVectorLiteral(row.embedding),
        metadata: row.metadata,
        content: row.content ?? undefined,
        score: Number(row.score),
      }))
      .filter((match) => query.minScore === undefined || match.score >= query.minScore);
  }

  async deleteVectors(namespace: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const table = await this.ensureVectorNamespace(namespace);
    const { rowCount } = await this.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [ids]);
    return rowCount;
  }

  async countVectors(namespace: string): Promise<number> {
    const table = await this.ensureVectorNamespace(namespace);
    const { rows } = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table}`,
    );
    return Number(rows[0]?.count ?? 0);
  }

  // --- internals ------------------------------------------------------------

  private buildWhere(where?: Record<string, unknown>): { clause: string; params: unknown[] } {
    if (!where || Object.keys(where).length === 0) {
      return { clause: "", params: [] };
    }

    // `@>` containment matches nested shapes too, so a dotted key is expanded
    // into the nested object it describes.
    const containment: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(where)) {
      if (!key.includes(".")) {
        containment[key] = value;
        continue;
      }

      const parts = key.split(".");
      let cursor = containment;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        cursor[part] ??= {};
        cursor = cursor[part] as Record<string, unknown>;
      }
      cursor[parts[parts.length - 1]!] = value;
    }

    return { clause: "WHERE payload @> $1::jsonb", params: [JSON.stringify(containment)] };
  }

  private async ensureCollection(collection: string): Promise<string> {
    const table = `${this.prefix}_${assertSafeIdentifier(collection, "collection")}`;
    if (this.ensured.has(table)) return table;

    await this.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.query(
      `CREATE INDEX IF NOT EXISTS ${table}_payload_idx ON ${table} USING GIN (payload)`,
    );

    this.ensured.add(table);
    return table;
  }

  private async ensureVectorNamespace(namespace: string): Promise<string> {
    const table = `${this.prefix}_vec_${assertSafeIdentifier(namespace, "namespace")}`;
    if (this.ensured.has(table)) return table;

    await this.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        embedding vector(${this.vectorDimensions}) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        content TEXT
      )
    `);
    await this.query(
      `CREATE INDEX IF NOT EXISTS ${table}_metadata_idx ON ${table} USING GIN (metadata)`,
    );

    this.ensured.add(table);
    return table;
  }

  private requirePool(): PgPool {
    if (!this.pool) {
      throw new ValidationError("PostgresDriver", "not connected — call connect() first");
    }
    return this.pool;
  }
}

/** pgvector's wire format is a bracketed list, not a Postgres array. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function parseVectorLiteral(literal: string): number[] {
  const trimmed = literal.trim();
  const inner = trimmed.startsWith("[") ? trimmed.slice(1, -1) : trimmed;
  return inner.length === 0 ? [] : inner.split(",").map(Number);
}

/**
 * Adapts the driver to the plain `VectorStore` port.
 *
 * `PostgresDriver` cannot satisfy both `DocumentStore` and `VectorStore`
 * directly — both declare `delete`, `count`, and `query` with different
 * meanings. Rather than overload them and invite a silent mix-up, the driver
 * names its vector methods explicitly and this wrapper presents the port.
 */
export class PostgresVectorStore implements VectorStore {
  constructor(private readonly driver: PostgresDriver) {}

  async upsert(namespace: string, records: VectorRecord[]): Promise<void> {
    return this.driver.upsert(namespace, records);
  }

  async query(namespace: string, query: VectorQuery): Promise<VectorMatch[]> {
    return this.driver.vectorQuery(namespace, query);
  }

  async delete(namespace: string, ids: string[]): Promise<number> {
    return this.driver.deleteVectors(namespace, ids);
  }

  async count(namespace: string): Promise<number> {
    return this.driver.countVectors(namespace);
  }
}
