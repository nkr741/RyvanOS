import { afterAll, describe, expect, it } from "vitest";
import { documentConformance, keyValueConformance, vectorConformance } from "./conformance.js";
import {
  PostgresDriver,
  PostgresVectorStore,
  parseVectorLiteral,
  toVectorLiteral,
} from "./postgres.js";
import { RedisKeyValueStore } from "./redis.js";

/**
 * Integration tests against real Postgres and Redis.
 *
 * These skip when the URLs are absent, so a laptop with no Docker still gets a
 * green run — but CI must set them. A driver that is only ever exercised
 * against its in-memory twin is a driver nobody has actually tested.
 *
 *   docker run -d --name ryvan-pg -e POSTGRES_DB=ryvan_test -e POSTGRES_USER=ryvan \
 *     -e POSTGRES_PASSWORD=ryvan_dev -p 55432:5432 pgvector/pgvector:pg16
 *   docker run -d --name ryvan-redis -p 56379:6379 redis:7-alpine
 *
 *   RYVAN_TEST_POSTGRES_URL=postgres://ryvan:ryvan_dev@localhost:55432/ryvan_test
 *   RYVAN_TEST_REDIS_URL=redis://localhost:56379
 */

const POSTGRES_URL = process.env.RYVAN_TEST_POSTGRES_URL;
const REDIS_URL = process.env.RYVAN_TEST_REDIS_URL;

// pgvector needs a fixed column width, and the conformance suite builds vectors
// to whatever width it is told. 8 keeps the fixtures readable.
const DIMENSIONS = 8;

const openDrivers: { disconnect(): Promise<void> }[] = [];

afterAll(async () => {
  for (const driver of openDrivers) await driver.disconnect();
});

/** A fresh table prefix per store keeps suites from colliding on reruns. */
let sequence = 0;
function uniquePrefix(): string {
  return `t${Date.now().toString(36)}_${sequence++}`;
}

describe.skipIf(!POSTGRES_URL)("Postgres driver", () => {
  documentConformance("postgres", async () => {
    const driver = new PostgresDriver({
      connectionString: POSTGRES_URL,
      tablePrefix: uniquePrefix(),
    });
    await driver.connect();
    openDrivers.push(driver);
    return driver;
  });

  vectorConformance(
    "postgres/pgvector",
    async () => {
      const driver = new PostgresDriver({
        connectionString: POSTGRES_URL,
        tablePrefix: uniquePrefix(),
        vectorDimensions: DIMENSIONS,
      });
      await driver.connect();
      openDrivers.push(driver);
      return new PostgresVectorStore(driver);
    },
    DIMENSIONS,
  );

  it("reports health", async () => {
    const driver = new PostgresDriver({ connectionString: POSTGRES_URL });
    await driver.connect();
    openDrivers.push(driver);

    const health = await driver.health();

    expect(health.reachable).toBe(true);
    expect(health.kind).toBe("postgres");
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("commits a transaction", async () => {
    const driver = new PostgresDriver({
      connectionString: POSTGRES_URL,
      tablePrefix: uniquePrefix(),
    });
    await driver.connect();
    openDrivers.push(driver);

    await driver.transaction(async () => {
      await driver.put("things", { id: "a" });
      await driver.put("things", { id: "b" });
    });

    expect(await driver.count("things")).toBe(2);
  });

  it("rolls a transaction back when the callback throws", async () => {
    const prefix = uniquePrefix();
    const driver = new PostgresDriver({ connectionString: POSTGRES_URL, tablePrefix: prefix });
    await driver.connect();
    openDrivers.push(driver);

    const table = `${prefix}_rollback_demo`;
    await driver.query(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
    await driver.query(`INSERT INTO ${table} (id) VALUES ('seed')`);

    await expect(
      driver.transaction(async (client) => {
        await client.query(`INSERT INTO ${table} (id) VALUES ('rolled')`);
        // Visible inside the transaction...
        const inside = await client.query(`SELECT id FROM ${table}`);
        expect(inside.rowCount).toBe(2);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    // ...and gone once it unwinds.
    const after = await driver.query<{ id: string }>(`SELECT id FROM ${table}`);
    expect(after.rows.map((row) => row.id)).toEqual(["seed"]);

    await driver.query(`DROP TABLE ${table}`);
  });

  it("does not enrol document writes in an ambient transaction", async () => {
    const prefix = uniquePrefix();
    const driver = new PostgresDriver({ connectionString: POSTGRES_URL, tablePrefix: prefix });
    await driver.connect();
    openDrivers.push(driver);

    // Documented limitation: put/get/find run on the pool, not on the
    // transaction's client, so they are NOT rolled back. Callers needing
    // transactional document writes must use the client passed to the callback.
    await expect(
      driver.transaction(async () => {
        await driver.put("things", { id: "escaped" });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    expect(await driver.get("things", "escaped")).toBeDefined();
  });

  it("applies each migration once", async () => {
    const driver = new PostgresDriver({
      connectionString: POSTGRES_URL,
      tablePrefix: uniquePrefix(),
    });
    await driver.connect();
    openDrivers.push(driver);

    const migrations = [
      { id: "0001_init", up: ["CREATE TABLE IF NOT EXISTS mig_demo (id TEXT PRIMARY KEY)"] },
      { id: "0002_column", up: ["ALTER TABLE mig_demo ADD COLUMN IF NOT EXISTS label TEXT"] },
    ];

    expect(await driver.migrate(migrations)).toEqual(["0001_init", "0002_column"]);
    // Second run is a no-op — this is what makes deploys safe to repeat.
    expect(await driver.migrate(migrations)).toEqual([]);

    await driver.query("DROP TABLE IF EXISTS mig_demo");
  });

  it("rejects an unsafe collection name rather than interpolating it", async () => {
    const driver = new PostgresDriver({
      connectionString: POSTGRES_URL,
      tablePrefix: uniquePrefix(),
    });
    await driver.connect();
    openDrivers.push(driver);

    await expect(driver.get("things; DROP TABLE users --", "a")).rejects.toThrow(
      /not a valid SQL identifier/,
    );
  });

  it("rejects an embedding of the wrong width", async () => {
    const driver = new PostgresDriver({
      connectionString: POSTGRES_URL,
      tablePrefix: uniquePrefix(),
      vectorDimensions: DIMENSIONS,
    });
    await driver.connect();
    openDrivers.push(driver);

    await expect(driver.upsert("docs", [{ id: "a", embedding: [1, 2, 3] }])).rejects.toThrow(
      /expected 8 dimensions/,
    );
  });

  it("throws a clear error when used before connect", async () => {
    const driver = new PostgresDriver({ connectionString: POSTGRES_URL });

    await expect(driver.query("SELECT 1")).rejects.toThrow(/not connected/);
  });
});

describe.skipIf(!REDIS_URL)("Redis driver", () => {
  keyValueConformance("redis", async () => {
    const store = new RedisKeyValueStore({ url: REDIS_URL, keyPrefix: uniquePrefix() });
    await store.connect();
    openDrivers.push(store);
    return store;
  });

  it("reports health", async () => {
    const store = new RedisKeyValueStore({ url: REDIS_URL, keyPrefix: uniquePrefix() });
    await store.connect();
    openDrivers.push(store);

    const health = await store.health();

    expect(health.reachable).toBe(true);
    expect(health.kind).toBe("redis");
  });

  it("isolates keyspaces by prefix", async () => {
    const a = new RedisKeyValueStore({ url: REDIS_URL, keyPrefix: uniquePrefix() });
    const b = new RedisKeyValueStore({ url: REDIS_URL, keyPrefix: uniquePrefix() });
    await a.connect();
    await b.connect();
    openDrivers.push(a, b);

    await a.set("shared", "from-a");

    expect(await b.get("shared")).toBeUndefined();
    expect(await a.get("shared")).toBe("from-a");
  });

  it("throws a clear error when used before connect", async () => {
    const store = new RedisKeyValueStore({ url: REDIS_URL });

    await expect(store.get("a")).rejects.toThrow(/not connected/);
  });
});

describe("vector literal encoding", () => {
  it("round-trips through pgvector's bracketed format", () => {
    expect(toVectorLiteral([1, 0.5, -2])).toBe("[1,0.5,-2]");
    expect(parseVectorLiteral("[1,0.5,-2]")).toEqual([1, 0.5, -2]);
  });

  it("handles an empty vector", () => {
    expect(parseVectorLiteral("[]")).toEqual([]);
  });
});
