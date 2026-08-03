import { describe, expect, it } from "vitest";
import { approvalStoreConformance } from "./approval-conformance.js";
import {
  InMemoryApprovalStore,
  buildApproval,
  decideApproval,
  expireIfLapsed,
} from "./approvals.js";

approvalStoreConformance("in-memory", async () => new InMemoryApprovalStore());

const subject = { userId: "u1", orgId: "acme" };

describe("approval helpers", () => {
  it("applies the store's default ttl when the caller gives none", () => {
    const approval = buildApproval({ action: "a", subject, reason: "r" }, 5_000);

    expect(approval.expiresAt - approval.requestedAt).toBe(5_000);
  });

  it("prefers an explicit ttl over the default", () => {
    const approval = buildApproval({ action: "a", subject, reason: "r", ttlMs: 100 }, 5_000);

    expect(approval.expiresAt - approval.requestedAt).toBe(100);
  });

  it("does not mutate the request it decides", () => {
    const approval = buildApproval({ action: "a", subject, reason: "r" }, 5_000);
    const decided = decideApproval(approval, "granted", "u-cfo");

    expect(approval.status).toBe("pending");
    expect(decided.status).toBe("granted");
  });

  it("leaves an unexpired request alone", () => {
    const approval = buildApproval({ action: "a", subject, reason: "r" }, 5_000);

    expect(expireIfLapsed(approval)).toBeUndefined();
  });

  it("never expires a request that was already decided", () => {
    const approval = buildApproval({ action: "a", subject, reason: "r", ttlMs: -1 }, 5_000);
    const granted = decideApproval(approval, "granted", "u-cfo");

    // A granted approval whose TTL has passed stays granted — the window is
    // for deciding, not for how long the decision holds.
    expect(expireIfLapsed(granted)).toBeUndefined();
  });
});

describe("InMemoryApprovalStore specifics", () => {
  it("uses its constructor ttl for requests that do not set one", async () => {
    const store = new InMemoryApprovalStore(-1);
    const approval = await store.raise({ action: "a", subject, reason: "r" });

    expect((await store.get(approval.id))?.status).toBe("expired");
  });
});
