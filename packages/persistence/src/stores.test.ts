import { AuditLedger } from "@ryvan/audit";
import { InMemoryDocumentStore, InMemoryVectorStore } from "@ryvan/storage";
import type { WorkflowRun } from "@ryvan/workflow-engine";
import type { Mission } from "@ryvan/mission-engine";
import type { MemoryEntry } from "@ryvan/memory";
import { describe, expect, it } from "vitest";
import { DocumentMemoryBackend } from "./memory-backend.js";
import { DocumentAuditStore, DocumentMissionStore, DocumentWorkflowStore } from "./stores.js";

function run(id: string, overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    definitionId: "payroll",
    definitionVersion: "1.0.0",
    status: "running",
    input: {},
    outputs: {},
    steps: {},
    correlationId: `corr_${id}`,
    createdAt: Date.now(),
    ...overrides,
  };
}

function mission(id: string, overrides: Partial<Mission> = {}): Mission {
  return {
    id,
    type: "payroll.run",
    name: "Run payroll",
    goal: "Run payroll",
    status: "running",
    input: {},
    correlationId: `corr_${id}`,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("DocumentWorkflowStore", () => {
  it("round-trips a run", async () => {
    const store = new DocumentWorkflowStore(new InMemoryDocumentStore());
    await store.save(run("r1", { outputs: { step: 42 } }));

    expect(await store.get("r1")).toMatchObject({ id: "r1", outputs: { step: 42 } });
  });

  it("returns undefined for an unknown run", async () => {
    expect(
      await new DocumentWorkflowStore(new InMemoryDocumentStore()).get("ghost"),
    ).toBeUndefined();
  });

  it("filters by status, definition, and mission", async () => {
    const store = new DocumentWorkflowStore(new InMemoryDocumentStore());
    await store.save(run("r1", { status: "suspended", missionId: "m1" }));
    await store.save(run("r2", { status: "completed", missionId: "m1" }));
    await store.save(run("r3", { status: "suspended", definitionId: "other" }));

    expect((await store.list({ status: "suspended" })).map((r) => r.id).sort()).toEqual([
      "r1",
      "r3",
    ]);
    expect((await store.list({ missionId: "m1" })).map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect((await store.list({ definitionId: "other" })).map((r) => r.id)).toEqual(["r3"]);
  });

  it("overwrites on repeat save", async () => {
    const store = new DocumentWorkflowStore(new InMemoryDocumentStore());
    await store.save(run("r1", { status: "running" }));
    await store.save(run("r1", { status: "completed" }));

    expect(await store.list()).toHaveLength(1);
    expect((await store.get("r1"))?.status).toBe("completed");
  });
});

describe("DocumentMissionStore", () => {
  it("filters by nested org id", async () => {
    const store = new DocumentMissionStore(new InMemoryDocumentStore());
    await store.save(mission("m1", { subject: { orgId: "acme" } }));
    await store.save(mission("m2", { subject: { orgId: "globex" } }));

    expect((await store.list({ orgId: "acme" })).map((m) => m.id)).toEqual(["m1"]);
  });

  it("filters by status, type, and run id", async () => {
    const store = new DocumentMissionStore(new InMemoryDocumentStore());
    await store.save(mission("m1", { status: "awaiting_approval", runId: "r1" }));
    await store.save(mission("m2", { status: "completed", type: "other.type" }));

    expect((await store.list({ status: "awaiting_approval" })).map((m) => m.id)).toEqual(["m1"]);
    expect((await store.list({ type: "other.type" })).map((m) => m.id)).toEqual(["m2"]);
    expect((await store.list({ runId: "r1" })).map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("DocumentAuditStore", () => {
  it("keeps the hash chain verifiable through the document store", async () => {
    const ledger = new AuditLedger(new DocumentAuditStore(new InMemoryDocumentStore()));

    await ledger.append({ action: "mission:created" });
    await ledger.append({ action: "approval:granted" });
    await ledger.append({ action: "mission:completed" });

    expect(await ledger.verify()).toEqual({ valid: true, entryCount: 3, brokenAt: [] });
  });

  it("returns entries in sequence order even when filtered", async () => {
    const documents = new InMemoryDocumentStore();
    const ledger = new AuditLedger(new DocumentAuditStore(documents));

    for (let i = 0; i < 5; i++) {
      await ledger.append({ action: "act", actor: { orgId: "acme" } });
    }

    const entries = await ledger.query({ orgId: "acme" });

    expect(entries.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it("chains correctly across a restart", async () => {
    // Same underlying documents, a brand new ledger — as after a process restart.
    const documents = new InMemoryDocumentStore();

    const before = new AuditLedger(new DocumentAuditStore(documents));
    await before.append({ action: "a" });
    await before.append({ action: "b" });

    const after = new AuditLedger(new DocumentAuditStore(documents));
    const resumed = await after.append({ action: "c" });

    expect(resumed.sequence).toBe(3);
    expect((await after.verify()).valid).toBe(true);
  });

  it("limits to the most recent entries without breaking chain order", async () => {
    const ledger = new AuditLedger(new DocumentAuditStore(new InMemoryDocumentStore()));

    for (let i = 0; i < 5; i++) await ledger.append({ action: `a${i}` });

    expect((await ledger.query({ limit: 2 })).map((e) => e.sequence)).toEqual([4, 5]);
  });
});

describe("DocumentMemoryBackend", () => {
  const entry = (id: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id,
    type: "long",
    namespace: "acme",
    key: id,
    content: `content for ${id}`,
    metadata: {},
    importance: 0.5,
    accessCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  it("stores and retrieves", async () => {
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore());
    await backend.store(entry("e1"));

    expect(await backend.retrieve("e1")).toMatchObject({ id: "e1" });
    expect(await backend.retrieve("ghost")).toBeNull();
  });

  it("does not recall an expired entry", async () => {
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore());
    await backend.store(entry("e1", { expiresAt: Date.now() - 1 }));

    expect(await backend.retrieve("e1")).toBeNull();
    expect(await backend.search({ namespace: "acme" })).toHaveLength(0);
  });

  it("filters by namespace, type, importance, and metadata", async () => {
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore());
    await backend.store(entry("e1", { importance: 0.9, metadata: { source: "crm" } }));
    await backend.store(entry("e2", { importance: 0.2 }));
    await backend.store(entry("e3", { namespace: "globex" }));

    expect((await backend.search({ namespace: "acme" })).map((r) => r.entry.id).sort()).toEqual([
      "e1",
      "e2",
    ]);

    // minImportance is inclusive: e1 (0.9) and e3 (0.5, the default) qualify,
    // e2 (0.2) does not.
    expect((await backend.search({ minImportance: 0.5 })).map((r) => r.entry.id).sort()).toEqual([
      "e1",
      "e3",
    ]);

    expect(await backend.search({ metadata: { source: "crm" } })).toHaveLength(1);
  });

  it("updates without letting id drift", async () => {
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore());
    await backend.store(entry("e1"));

    const updated = await backend.update("e1", {
      id: "hijacked",
      importance: 0.99,
    } as Partial<MemoryEntry>);

    expect(updated?.id).toBe("e1");
    expect(updated?.importance).toBe(0.99);
    expect(await backend.retrieve("hijacked")).toBeNull();
  });

  it("deletes by namespace", async () => {
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore());
    await backend.store(entry("e1"));
    await backend.store(entry("e2"));
    await backend.store(entry("e3", { namespace: "globex" }));

    expect(await backend.deleteByNamespace("acme")).toBe(2);
    expect(await backend.count()).toBe(1);
  });

  it("ranks by embedding similarity when a vector store is present", async () => {
    const vectors = new InMemoryVectorStore();
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore(), vectors);

    await backend.store(entry("near", { embedding: [1, 0, 0], content: "payroll policy" }));
    await backend.store(entry("far", { embedding: [0, 0, 1], content: "office snacks" }));

    const results = await backend.searchByEmbedding([1, 0, 0], { topK: 2 });

    expect(results.map((r) => r.entry.id)).toEqual(["near", "far"]);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("scopes embedding search to a namespace", async () => {
    const backend = new DocumentMemoryBackend(
      new InMemoryDocumentStore(),
      new InMemoryVectorStore(),
    );

    await backend.store(entry("acme", { embedding: [1, 0, 0] }));
    await backend.store(entry("globex", { embedding: [1, 0, 0], namespace: "globex" }));

    const results = await backend.searchByEmbedding([1, 0, 0], { namespace: "acme" });

    expect(results.map((r) => r.entry.id)).toEqual(["acme"]);
  });

  it("drops a vector row whose document is gone rather than surfacing it", async () => {
    const documents = new InMemoryDocumentStore();
    const vectors = new InMemoryVectorStore();
    const backend = new DocumentMemoryBackend(documents, vectors);

    await backend.store(entry("e1", { embedding: [1, 0, 0] }));
    // Delete behind the backend's back, as an out-of-band cleanup would.
    await documents.delete("memory_entries", "e1");

    expect(await backend.searchByEmbedding([1, 0, 0])).toHaveLength(0);
  });

  it("returns nothing from embedding search with no vector store configured", async () => {
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore());
    await backend.store(entry("e1", { embedding: [1, 0, 0] }));

    expect(await backend.searchByEmbedding([1, 0, 0])).toEqual([]);
  });

  it("removes the vector row when an entry is deleted", async () => {
    const vectors = new InMemoryVectorStore();
    const backend = new DocumentMemoryBackend(new InMemoryDocumentStore(), vectors);

    await backend.store(entry("e1", { embedding: [1, 0, 0] }));
    expect(await vectors.count("memory")).toBe(1);

    await backend.delete("e1");
    expect(await vectors.count("memory")).toBe(0);
  });
});
