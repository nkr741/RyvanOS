/**
 * Applies schema migrations.
 *
 * The document store creates its own tables on first use, so this is not needed
 * to get started. It exists for the things that must be deliberate: indexes
 * chosen for a real query pattern, the pgvector extension, and any future
 * change that a lazily-created table cannot express.
 *
 * Safe to run repeatedly — each migration records its id in the same
 * transaction as its statements, so a crash halfway leaves it un-recorded and
 * it simply retries.
 */
import { PostgresDriver } from "@ryvan/storage";

const url = process.env.RYVAN_POSTGRES_URL;

if (!url) {
  console.error("RYVAN_POSTGRES_URL is not set — nothing to migrate.");
  process.exit(1);
}

const prefix = process.env.RYVAN_TABLE_PREFIX ?? "ryvan";

const migrations = [
  {
    id: "0001_vector_extension",
    up: ["CREATE EXTENSION IF NOT EXISTS vector"],
  },
  {
    // The document store indexes payloads with a GIN index, which answers
    // containment but not ordering. These cover the reads the console and the
    // engines actually make on every page load.
    id: "0002_hot_path_indexes",
    up: [
      `CREATE INDEX IF NOT EXISTS ${prefix}_missions_created_idx
         ON ${prefix}_missions ((payload->>'createdAt'))`,
      `CREATE INDEX IF NOT EXISTS ${prefix}_missions_status_idx
         ON ${prefix}_missions ((payload->>'status'))`,
      `CREATE INDEX IF NOT EXISTS ${prefix}_workflow_runs_status_idx
         ON ${prefix}_workflow_runs ((payload->>'status'))`,
      `CREATE INDEX IF NOT EXISTS ${prefix}_audit_entries_sequence_idx
         ON ${prefix}_audit_entries (((payload->>'sequence')::bigint))`,
      `CREATE INDEX IF NOT EXISTS ${prefix}_spans_trace_idx
         ON ${prefix}_spans ((payload->>'traceId'))`,
    ],
  },
];

const driver = new PostgresDriver({ connectionString: url, tablePrefix: prefix });
await driver.connect();

try {
  // The index migration assumes the tables exist. They are created lazily on
  // first write, so touch each collection before indexing it.
  for (const collection of [
    "missions",
    "workflow_runs",
    "audit_entries",
    "memory_entries",
    "approvals",
    "users",
    "organizations",
    "projects",
    "api_keys",
    "spans",
    "dead_letters",
    "secrets",
  ]) {
    await driver.count(collection);
  }

  const applied = await driver.migrate(migrations);

  if (applied.length === 0) {
    console.log("Schema is up to date.");
  } else {
    console.log(`Applied ${applied.length} migration(s):`);
    for (const id of applied) console.log(`  ${id}`);
  }
} finally {
  await driver.disconnect();
}
