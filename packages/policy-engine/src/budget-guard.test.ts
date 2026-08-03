import { describe, expect, it } from "vitest";
import { BudgetGuard } from "./budget-guard.js";

describe("BudgetGuard", () => {
  it("reports spend against a matching limit", () => {
    const guard = new BudgetGuard([
      { id: "acme-daily", scope: { orgId: "acme" }, period: "day", limitUsd: 100 },
    ]);

    guard.record({ orgId: "acme", userId: "u1" }, 30);
    guard.record({ orgId: "acme", userId: "u2" }, 20);

    const status = guard.status("acme-daily");

    expect(status.spentUsd).toBe(50);
    expect(status.remainingUsd).toBe(50);
    expect(status.exceeded).toBe(false);
  });

  it("treats an undefined scope field as a wildcard", () => {
    const guard = new BudgetGuard([
      { id: "org", scope: { orgId: "acme" }, period: "total", limitUsd: 10 },
      { id: "user", scope: { orgId: "acme", userId: "u1" }, period: "total", limitUsd: 10 },
    ]);

    guard.record({ orgId: "acme", userId: "u2" }, 4);

    // The org-wide limit sees u2's spend; the u1-specific limit does not.
    expect(guard.status("org").spentUsd).toBe(4);
    expect(guard.status("user").spentUsd).toBe(0);
  });

  it("ignores spend from another org", () => {
    const guard = new BudgetGuard([
      { id: "acme", scope: { orgId: "acme" }, period: "total", limitUsd: 10 },
    ]);

    guard.record({ orgId: "globex" }, 500);

    expect(guard.status("acme").spentUsd).toBe(0);
  });

  it("counts a projected amount when checking", () => {
    const guard = new BudgetGuard([
      { id: "acme", scope: { orgId: "acme" }, period: "total", limitUsd: 10 },
    ]);

    guard.record({ orgId: "acme" }, 9);

    expect(guard.check({ orgId: "acme" }).some((s) => s.exceeded)).toBe(false);
    expect(guard.check({ orgId: "acme" }, 2).some((s) => s.exceeded)).toBe(true);
  });

  it("orders applicable limits most-constrained first", () => {
    const guard = new BudgetGuard([
      { id: "loose", scope: { orgId: "acme" }, period: "total", limitUsd: 1000 },
      { id: "tight", scope: { orgId: "acme", userId: "u1" }, period: "total", limitUsd: 5 },
    ]);

    const statuses = guard.check({ orgId: "acme", userId: "u1" });

    expect(statuses[0]?.limitId).toBe("tight");
  });

  it("ignores negative and non-finite amounts", () => {
    const guard = new BudgetGuard([
      { id: "acme", scope: { orgId: "acme" }, period: "total", limitUsd: 10 },
    ]);

    guard.record({ orgId: "acme" }, -5);
    guard.record({ orgId: "acme" }, Number.NaN);
    guard.record({ orgId: "acme" }, Number.POSITIVE_INFINITY);

    expect(guard.status("acme").spentUsd).toBe(0);
  });

  it("emits a warning once per limit after the threshold is crossed", () => {
    const guard = new BudgetGuard([
      {
        id: "acme",
        scope: { orgId: "acme" },
        period: "total",
        limitUsd: 100,
        warnAtFraction: 0.5,
      },
    ]);

    guard.record({ orgId: "acme" }, 40);
    expect(guard.takeNewWarnings()).toHaveLength(0);

    guard.record({ orgId: "acme" }, 20);
    expect(guard.takeNewWarnings()).toHaveLength(1);

    // Already reported — not repeated on the next sweep.
    expect(guard.takeNewWarnings()).toHaveLength(0);
  });

  it("does not warn for a limit that is already exceeded", () => {
    const guard = new BudgetGuard([
      { id: "acme", scope: { orgId: "acme" }, period: "total", limitUsd: 10 },
    ]);

    guard.record({ orgId: "acme" }, 50);

    expect(guard.takeNewWarnings()).toHaveLength(0);
    expect(guard.status("acme").exceeded).toBe(true);
  });

  it("rejects malformed limits", () => {
    const guard = new BudgetGuard();

    expect(() => guard.setLimit({ id: "", scope: {}, period: "day", limitUsd: 1 })).toThrow();
    expect(() => guard.setLimit({ id: "x", scope: {}, period: "day", limitUsd: -1 })).toThrow();
  });

  it("throws when asked for an unknown limit", () => {
    expect(() => new BudgetGuard().status("nope")).toThrow();
  });
});
