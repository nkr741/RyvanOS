import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it } from "vitest";
import { PolicyService } from "./policy-service.js";
import { QuotaGuard } from "./quota-guard.js";

const acme = { orgId: "acme" };

describe("QuotaGuard", () => {
  it("allows consumption below the limit", async () => {
    const quotas = new QuotaGuard([
      { id: "acme-missions", resource: "missions", scope: acme, period: "day", limit: 3 },
    ]);

    const outcome = await quotas.consume("missions", acme);

    expect(outcome.allowed).toBe(true);
    expect(outcome.statuses[0]).toMatchObject({ used: 1, limit: 3, remaining: 2 });
  });

  it("denies once the limit is passed", async () => {
    const quotas = new QuotaGuard([
      { id: "acme", resource: "missions", scope: acme, period: "day", limit: 2 },
    ]);

    expect((await quotas.consume("missions", acme)).allowed).toBe(true);
    expect((await quotas.consume("missions", acme)).allowed).toBe(true);

    const third = await quotas.consume("missions", acme);
    expect(third.allowed).toBe(false);
    expect(third.exceeded?.limitId).toBe("acme");
  });

  it("consumes before deciding, so concurrent callers cannot both slip through", async () => {
    const quotas = new QuotaGuard([
      { id: "acme", resource: "missions", scope: acme, period: "day", limit: 5 },
    ]);

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => quotas.consume("missions", acme)),
    );

    // Exactly five may proceed, however they interleave.
    expect(outcomes.filter((o) => o.allowed)).toHaveLength(5);
  });

  it("ignores resources it has no limit for", async () => {
    const quotas = new QuotaGuard([
      { id: "acme", resource: "missions", scope: acme, period: "day", limit: 1 },
    ]);

    expect((await quotas.consume("something-else", acme)).allowed).toBe(true);
    expect((await quotas.consume("missions", { orgId: "globex" })).allowed).toBe(true);
  });

  it("keeps tenants separate", async () => {
    const quotas = new QuotaGuard([
      { id: "per-org", resource: "missions", scope: {}, period: "day", limit: 1 },
    ]);

    // A wildcard scope applies to everyone, but counters are keyed per tenant,
    // so one org exhausting its allowance does not starve another.
    expect((await quotas.consume("missions", { orgId: "acme" })).allowed).toBe(true);
    expect((await quotas.consume("missions", { orgId: "acme" })).allowed).toBe(false);
    expect((await quotas.consume("missions", { orgId: "globex" })).allowed).toBe(true);
  });

  it("reports usage without consuming", async () => {
    const quotas = new QuotaGuard([
      { id: "acme", resource: "missions", scope: acme, period: "day", limit: 5 },
    ]);

    await quotas.consume("missions", acme, 2);

    const before = await quotas.status("missions", acme);
    const after = await quotas.status("missions", acme);

    expect(before[0]?.used).toBe(2);
    expect(after[0]?.used).toBe(2);
  });

  it("consumes more than one at a time", async () => {
    const quotas = new QuotaGuard([
      { id: "acme", resource: "tokens", scope: acme, period: "hour", limit: 100 },
    ]);

    const outcome = await quotas.consume("tokens", acme, 40);

    expect(outcome.statuses[0]?.used).toBe(40);
    expect(outcome.statuses[0]?.remaining).toBe(60);
  });

  it("raises a warning before the ceiling", async () => {
    const quotas = new QuotaGuard([
      {
        id: "acme",
        resource: "missions",
        scope: acme,
        period: "day",
        limit: 10,
        warnAtFraction: 0.5,
      },
    ]);

    const under = await quotas.consume("missions", acme, 4);
    expect(quotas.warnings(under.statuses)).toHaveLength(0);

    const over = await quotas.consume("missions", acme, 2);
    expect(quotas.warnings(over.statuses)).toHaveLength(1);
  });

  it("reports when the window resets", async () => {
    const quotas = new QuotaGuard([
      { id: "acme", resource: "missions", scope: acme, period: "hour", limit: 1 },
    ]);

    const [status] = (await quotas.consume("missions", acme)).statuses;

    // Fixed windows, so everyone on a plan resets on the same boundary.
    expect(status!.resetsAt).toBeGreaterThan(Date.now());
    expect(status!.resetsAt % 3_600_000).toBe(0);
  });

  it("applies several limits to one resource", async () => {
    const quotas = new QuotaGuard([
      { id: "burst", resource: "calls", scope: acme, period: "minute", limit: 2 },
      { id: "daily", resource: "calls", scope: acme, period: "day", limit: 100 },
    ]);

    await quotas.consume("calls", acme);
    await quotas.consume("calls", acme);

    // The tighter window bites first.
    const third = await quotas.consume("calls", acme);
    expect(third.allowed).toBe(false);
    expect(third.exceeded?.limitId).toBe("burst");
  });

  it("rejects malformed limits", () => {
    const quotas = new QuotaGuard();

    expect(() =>
      quotas.setLimit({ id: "", resource: "r", scope: {}, period: "day", limit: 1 }),
    ).toThrow();
    expect(() =>
      quotas.setLimit({ id: "x", resource: "", scope: {}, period: "day", limit: 1 }),
    ).toThrow();
    expect(() =>
      quotas.setLimit({ id: "x", resource: "r", scope: {}, period: "day", limit: -1 }),
    ).toThrow();
  });
});

describe("PolicyService quota enforcement", () => {
  it("denies an action that exhausts its quota", async () => {
    const eventBus = new EventBus();
    const service = new PolicyService({
      eventBus,
      quotas: [{ id: "acme", resource: "missions", scope: acme, period: "day", limit: 1 }],
    });

    const subject = { userId: "u1", orgId: "acme" };

    const first = await service.enforce({
      action: "mission:execute",
      subject,
      quotaResource: "missions",
    });
    expect(first.allowed).toBe(true);

    const second = await service.enforce({
      action: "mission:execute",
      subject,
      quotaResource: "missions",
    });

    expect(second.effect).toBe("deny");
    expect(second.quota?.limitId).toBe("acme");
    expect(second.reason).toContain("Quota");
    expect(eventBus.history(EVENTS.QUOTA_EXCEEDED)).toHaveLength(1);
  });

  it("skips the quota check when the caller names no resource", async () => {
    const service = new PolicyService({
      quotas: [{ id: "acme", resource: "missions", scope: acme, period: "day", limit: 0 }],
    });

    // No quotaResource, so a zero limit is irrelevant.
    const decision = await service.enforce({
      action: "mission:execute",
      subject: { orgId: "acme" },
    });

    expect(decision.allowed).toBe(true);
  });

  it("emits a warning as a tenant approaches its ceiling", async () => {
    const eventBus = new EventBus();
    const service = new PolicyService({
      eventBus,
      quotas: [
        {
          id: "acme",
          resource: "missions",
          scope: acme,
          period: "day",
          limit: 10,
          warnAtFraction: 0.5,
        },
      ],
    });

    await service.enforce({
      action: "a",
      subject: { orgId: "acme" },
      quotaResource: "missions",
      quotaAmount: 6,
    });

    expect(eventBus.history(EVENTS.QUOTA_WARNING)).toHaveLength(1);
  });
});
