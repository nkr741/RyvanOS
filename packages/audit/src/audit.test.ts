import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it } from "vitest";
import { AuditService } from "./audit-service.js";
import { AuditLedger, hashEntry } from "./ledger.js";
import { InMemoryAuditStore } from "./store.js";

describe("AuditLedger", () => {
  it("chains entries and reports a valid chain", async () => {
    const ledger = new AuditLedger();

    const first = await ledger.append({ action: "mission:created" });
    const second = await ledger.append({ action: "mission:completed" });

    expect(first.sequence).toBe(1);
    expect(first.previousHash).toBe("");
    expect(second.sequence).toBe(2);
    expect(second.previousHash).toBe(first.hash);

    expect(await ledger.verify()).toEqual({ valid: true, entryCount: 2, brokenAt: [] });
  });

  it("detects a tampered entry by its content hash", async () => {
    const store = new InMemoryAuditStore();
    const ledger = new AuditLedger(store);

    await ledger.append({ action: "a" });
    await ledger.append({ action: "b" });
    await ledger.append({ action: "c" });

    // Reach past the ledger and rewrite history in place.
    const entries = await store.query();
    const forged = { ...entries[1]!, action: "something-else" };
    store.clear();
    for (const entry of [entries[0]!, forged, entries[2]!]) {
      await store.append(entry);
    }

    const verification = await ledger.verify();

    expect(verification.valid).toBe(false);
    // Only the forged entry breaks: it still carries its original hash, so the
    // entry after it links correctly. The content hash is what catches this.
    expect(verification.brokenAt).toEqual([2]);
  });

  it("detects tampering even when the forger recomputes the hash", async () => {
    const store = new InMemoryAuditStore();
    const ledger = new AuditLedger(store);

    await ledger.append({ action: "a" });
    await ledger.append({ action: "b" });
    await ledger.append({ action: "c" });

    // A forger who knows the scheme rewrites the entry *and* its hash, so the
    // content check passes. The chain link is what catches them: entry 3 still
    // commits to the hash the original entry 2 had.
    const entries = await store.query();
    const content = { ...entries[1]!, action: "something-else" };
    const forged = { ...content, hash: hashEntry(content) };

    store.clear();
    for (const entry of [entries[0]!, forged, entries[2]!]) {
      await store.append(entry);
    }

    const verification = await ledger.verify();

    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toEqual([3]);
  });

  it("detects a removed entry", async () => {
    const store = new InMemoryAuditStore();
    const ledger = new AuditLedger(store);

    await ledger.append({ action: "a" });
    await ledger.append({ action: "b" });
    await ledger.append({ action: "c" });

    const entries = await store.query();
    store.clear();
    for (const entry of [entries[0]!, entries[2]!]) {
      await store.append(entry);
    }

    expect((await ledger.verify()).valid).toBe(false);
  });

  it("keeps sequence numbers unique under concurrent appends", async () => {
    const ledger = new AuditLedger();

    const entries = await Promise.all(
      Array.from({ length: 25 }, (_, i) => ledger.append({ action: `action-${i}` })),
    );

    const sequences = entries.map((entry) => entry.sequence).sort((a, b) => a - b);

    expect(new Set(sequences).size).toBe(25);
    expect(sequences[0]).toBe(1);
    expect(sequences[24]).toBe(25);
    expect((await ledger.verify()).valid).toBe(true);
  });

  it("hashes deterministically", () => {
    const content = {
      id: "aud_1",
      sequence: 1,
      timestamp: 1,
      actor: { userId: "u1" },
      action: "a",
      outcome: "success" as const,
      previousHash: "",
    };

    expect(hashEntry(content)).toBe(hashEntry({ ...content }));
    expect(hashEntry(content)).not.toBe(hashEntry({ ...content, action: "b" }));
  });

  it("rejects an entry with no action", async () => {
    await expect(new AuditLedger().append({ action: "" })).rejects.toThrow();
  });

  it("filters queries", async () => {
    const ledger = new AuditLedger();

    await ledger.append({ action: "a", actor: { orgId: "acme" }, outcome: "success" });
    await ledger.append({ action: "b", actor: { orgId: "globex" }, outcome: "failure" });
    await ledger.append({ action: "a", actor: { orgId: "acme" }, outcome: "denied" });

    expect(await ledger.query({ orgId: "acme" })).toHaveLength(2);
    expect(await ledger.query({ action: "a" })).toHaveLength(2);
    expect(await ledger.query({ outcome: "failure" })).toHaveLength(1);
    expect(await ledger.query({ limit: 1 })).toHaveLength(1);
  });
});

describe("AuditService", () => {
  it("records captured events off the bus", async () => {
    const eventBus = new EventBus();
    const service = new AuditService({ eventBus });
    await service.start();

    await eventBus.emit(
      EVENTS.MISSION_COMPLETED,
      { missionId: "msn_1", subject: { userId: "u1", orgId: "acme" } },
      { correlationId: "corr_1" },
    );

    const entries = await service.query();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: EVENTS.MISSION_COMPLETED,
      resource: "mission:msn_1",
      outcome: "success",
      correlationId: "corr_1",
      actor: { userId: "u1", orgId: "acme", kind: "user" },
    });

    await service.stop();
  });

  it("ignores events it is not configured to capture", async () => {
    const eventBus = new EventBus();
    const service = new AuditService({ eventBus, captureEvents: [EVENTS.MISSION_FAILED] });
    await service.start();

    await eventBus.emit(EVENTS.MISSION_COMPLETED, { missionId: "msn_1" });
    expect(await service.query()).toHaveLength(0);

    await eventBus.emit(EVENTS.MISSION_FAILED, { missionId: "msn_1" });
    expect(await service.query()).toHaveLength(1);

    await service.stop();
  });

  it("infers outcome from the event name", async () => {
    const eventBus = new EventBus();
    const service = new AuditService({ eventBus });
    await service.start();

    await eventBus.emit(EVENTS.MISSION_FAILED, { missionId: "m" });
    await eventBus.emit(EVENTS.POLICY_DENIED, { action: "a" });
    await eventBus.emit(EVENTS.APPROVAL_REQUESTED, { approval: {} });

    const entries = await service.query();
    const outcomes = Object.fromEntries(entries.map((e) => [e.action, e.outcome]));

    expect(outcomes[EVENTS.MISSION_FAILED]).toBe("failure");
    expect(outcomes[EVENTS.POLICY_DENIED]).toBe("denied");
    expect(outcomes[EVENTS.APPROVAL_REQUESTED]).toBe("pending");

    await service.stop();
  });

  it("stops recording once stopped", async () => {
    const eventBus = new EventBus();
    const service = new AuditService({ eventBus });

    await service.start();
    await service.stop();
    await eventBus.emit(EVENTS.MISSION_COMPLETED, { missionId: "msn_1" });

    expect(await service.query()).toHaveLength(0);
  });

  it("skips events the mapper declines", async () => {
    const eventBus = new EventBus();
    const service = new AuditService({
      eventBus,
      mapper: (type) => (type === EVENTS.MISSION_COMPLETED ? undefined : { action: type }),
    });
    await service.start();

    await eventBus.emit(EVENTS.MISSION_COMPLETED, {});
    await eventBus.emit(EVENTS.MISSION_FAILED, {});

    expect(await service.query()).toHaveLength(1);
    await service.stop();
  });

  it("does not let a failing mapper break the emitter", async () => {
    const eventBus = new EventBus();
    const service = new AuditService({
      eventBus,
      mapper: () => {
        throw new Error("mapper exploded");
      },
    });
    await service.start();

    await expect(eventBus.emit(EVENTS.MISSION_COMPLETED, {})).resolves.toBeDefined();
    expect(await service.query()).toHaveLength(0);

    await service.stop();
  });
});
