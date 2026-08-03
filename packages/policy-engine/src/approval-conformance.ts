import { describe, expect, it } from "vitest";
import type { ApprovalStore } from "./approvals.js";

/**
 * Shared conformance suite for `ApprovalStore`.
 *
 * The in-memory and durable stores must behave identically, or "approvals
 * survive a restart" would quietly change semantics along with storage. Not
 * named `*.test.ts` so vitest does not collect it on its own.
 */
export function approvalStoreConformance(name: string, create: () => Promise<ApprovalStore>): void {
  const subject = { userId: "u1", orgId: "acme" };

  const raise = (store: ApprovalStore, ttlMs?: number) =>
    store.raise({
      action: "connector:execute",
      resource: "connector:sap",
      subject,
      reason: "Writes to a system of record",
      ttlMs,
    });

  describe(`ApprovalStore conformance: ${name}`, () => {
    it("raises a pending request", async () => {
      const store = await create();
      const approval = await raise(store);

      expect(approval.status).toBe("pending");
      expect(approval.id).toMatch(/^appr_/);
      expect(approval.reason).toBe("Writes to a system of record");
      expect(await store.pending()).toHaveLength(1);
    });

    it("reads a request back by id", async () => {
      const store = await create();
      const approval = await raise(store);

      expect(await store.get(approval.id)).toMatchObject({
        id: approval.id,
        resource: "connector:sap",
        subject: { userId: "u1", orgId: "acme" },
      });
    });

    it("returns undefined for an unknown id", async () => {
      expect(await (await create()).get("appr_missing")).toBeUndefined();
    });

    it("grants and records who decided", async () => {
      const store = await create();
      const approval = await raise(store);

      const granted = await store.grant(approval.id, "u-cfo", "checked with finance");

      expect(granted.status).toBe("granted");
      expect(granted.decidedBy).toBe("u-cfo");
      expect(granted.decisionNote).toBe("checked with finance");
      expect(granted.decidedAt).toBeGreaterThan(0);
      expect(await store.pending()).toHaveLength(0);
    });

    it("persists the decision, not just the returned copy", async () => {
      const store = await create();
      const approval = await raise(store);
      await store.grant(approval.id, "u-cfo");

      expect((await store.get(approval.id))?.status).toBe("granted");
    });

    it("denies", async () => {
      const store = await create();
      const approval = await raise(store);

      expect((await store.deny(approval.id, "u-cfo")).status).toBe("denied");
    });

    it("refuses to decide the same request twice", async () => {
      const store = await create();
      const approval = await raise(store);

      await store.grant(approval.id, "u-cfo");

      await expect(store.grant(approval.id, "u-cfo")).rejects.toThrow();
      await expect(store.deny(approval.id, "u-cfo")).rejects.toThrow();
    });

    it("throws for an unknown approval", async () => {
      await expect((await create()).grant("appr_missing", "u-cfo")).rejects.toThrow();
    });

    it("expires a lapsed request on read and refuses to grant it", async () => {
      const store = await create();
      const approval = await raise(store, -1);

      expect((await store.get(approval.id))?.status).toBe("expired");
      await expect(store.grant(approval.id, "u-cfo")).rejects.toThrow();
    });

    it("reports expired requests once from expireStale", async () => {
      const store = await create();
      await raise(store, -1);

      expect(await store.expireStale()).toHaveLength(1);
      expect(await store.expireStale()).toHaveLength(0);
    });

    it("excludes a lapsed request from pending", async () => {
      const store = await create();
      await raise(store, -1);
      await raise(store, 60_000);

      expect(await store.pending()).toHaveLength(1);
    });

    it("filters by status", async () => {
      const store = await create();
      const granted = await raise(store);
      const denied = await raise(store);
      await raise(store);

      await store.grant(granted.id, "u-cfo");
      await store.deny(denied.id, "u-cfo");

      expect(await store.list("granted")).toHaveLength(1);
      expect(await store.list("denied")).toHaveLength(1);
      expect(await store.list("pending")).toHaveLength(1);
      expect(await store.list()).toHaveLength(3);
    });

    it("requires an action, a reason, and a decider", async () => {
      const store = await create();

      await expect(store.raise({ action: "", subject, reason: "x" })).rejects.toThrow();
      await expect(store.raise({ action: "a", subject, reason: "" })).rejects.toThrow();

      const approval = await raise(store);
      await expect(store.grant(approval.id, "")).rejects.toThrow();
    });
  });
}
