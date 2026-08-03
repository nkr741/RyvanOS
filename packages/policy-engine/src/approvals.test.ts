import { describe, expect, it } from "vitest";
import { ApprovalStore } from "./approvals.js";

const subject = { userId: "u1", orgId: "acme" };

function raise(store: ApprovalStore, ttlMs?: number) {
  return store.raise({
    action: "connector:execute",
    resource: "connector:sap",
    subject,
    reason: "Writes to a system of record",
    ttlMs,
  });
}

describe("ApprovalStore", () => {
  it("raises a pending request", () => {
    const store = new ApprovalStore();
    const approval = raise(store);

    expect(approval.status).toBe("pending");
    expect(approval.id).toMatch(/^appr_/);
    expect(store.pending()).toHaveLength(1);
  });

  it("grants and records who decided", () => {
    const store = new ApprovalStore();
    const approval = raise(store);

    const granted = store.grant(approval.id, "u-admin", "checked with finance");

    expect(granted.status).toBe("granted");
    expect(granted.decidedBy).toBe("u-admin");
    expect(granted.decisionNote).toBe("checked with finance");
    expect(store.pending()).toHaveLength(0);
  });

  it("denies", () => {
    const store = new ApprovalStore();
    const approval = raise(store);

    expect(store.deny(approval.id, "u-admin").status).toBe("denied");
  });

  it("refuses to decide the same request twice", () => {
    const store = new ApprovalStore();
    const approval = raise(store);

    store.grant(approval.id, "u-admin");

    expect(() => store.grant(approval.id, "u-admin")).toThrow();
    expect(() => store.deny(approval.id, "u-admin")).toThrow();
  });

  it("throws for an unknown approval", () => {
    expect(() => new ApprovalStore().grant("missing", "u-admin")).toThrow();
  });

  it("expires a request once its TTL passes and refuses to grant it", () => {
    const store = new ApprovalStore();
    const approval = raise(store, -1); // already past its expiry

    expect(store.get(approval.id)?.status).toBe("expired");
    expect(() => store.grant(approval.id, "u-admin")).toThrow();
  });

  it("reports expired requests once from expireStale", () => {
    const store = new ApprovalStore();
    raise(store, -1);

    expect(store.expireStale()).toHaveLength(1);
    expect(store.expireStale()).toHaveLength(0);
  });

  it("requires an action, a reason, and a decider", () => {
    const store = new ApprovalStore();

    expect(() => store.raise({ action: "", subject, reason: "x" })).toThrow();
    expect(() => store.raise({ action: "a", subject, reason: "" })).toThrow();

    const approval = raise(store);
    expect(() => store.grant(approval.id, "")).toThrow();
  });
});
