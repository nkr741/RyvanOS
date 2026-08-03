import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { afterEach, describe, expect, it } from "vitest";
import { PolicyService } from "./policy-service.js";

const subject = { userId: "u1", orgId: "acme", roles: ["org:member"] };

function setup(options: ConstructorParameters<typeof PolicyService>[0] = {}) {
  const eventBus = new EventBus();
  const service = new PolicyService({ ...options, eventBus });
  return { service, eventBus };
}

function emitted(eventBus: EventBus, type: string): unknown[] {
  return eventBus
    .history(undefined, 1000)
    .filter((event) => event.type === type)
    .map((event) => event.data);
}

let started: PolicyService[] = [];

afterEach(async () => {
  for (const service of started) await service.stop();
  started = [];
});

describe("PolicyService", () => {
  it("reports its lifecycle", async () => {
    const { service } = setup();
    started.push(service);

    expect(service.status()).toBe("stopped");
    await service.start();
    expect(service.status()).toBe("running");
    await service.stop();
    expect(service.status()).toBe("stopped");
  });

  it("allows an action no rule objects to", async () => {
    const { service, eventBus } = setup();

    const decision = await service.enforce({ action: "mission:execute", subject });

    expect(decision.allowed).toBe(true);
    expect(emitted(eventBus, EVENTS.POLICY_EVALUATED)).toHaveLength(1);
    expect(emitted(eventBus, EVENTS.POLICY_DENIED)).toHaveLength(0);
  });

  it("raises an approval and returns its id when a rule requires one", async () => {
    const { service, eventBus } = setup({
      rules: [
        {
          id: "sap",
          name: "SAP writes need sign-off",
          effect: "require_approval",
          when: { resources: ["connector:sap"] },
        },
      ],
    });

    const decision = await service.enforce({
      action: "connector:execute",
      resource: "connector:sap",
      subject,
    });

    expect(decision.effect).toBe("require_approval");
    expect(decision.allowed).toBe(false);
    expect(decision.approvalId).toBeDefined();
    expect(service.approvals.pending()).toHaveLength(1);
    expect(emitted(eventBus, EVENTS.APPROVAL_REQUESTED)).toHaveLength(1);
  });

  it("emits on grant and deny", async () => {
    const { service, eventBus } = setup({
      rules: [{ id: "r", name: "Approve", effect: "require_approval", when: {} }],
    });

    const first = await service.enforce({ action: "a", subject });
    await service.grantApproval(first.approvalId!, "u-admin");

    const second = await service.enforce({ action: "a", subject });
    await service.denyApproval(second.approvalId!, "u-admin");

    expect(emitted(eventBus, EVENTS.APPROVAL_GRANTED)).toHaveLength(1);
    expect(emitted(eventBus, EVENTS.APPROVAL_DENIED)).toHaveLength(1);
  });

  it("denies once a budget is exceeded, whatever the rules say", async () => {
    const { service, eventBus } = setup({
      budgets: [{ id: "acme", scope: { orgId: "acme" }, period: "total", limitUsd: 10 }],
      rules: [{ id: "open", name: "Allow all", effect: "allow", when: {} }],
    });

    service.recordSpend({ orgId: "acme" }, 9.5);

    const under = await service.enforce({ action: "model:call", subject, estimatedCostUsd: 0.2 });
    expect(under.allowed).toBe(true);

    const over = await service.enforce({ action: "model:call", subject, estimatedCostUsd: 5 });
    expect(over.effect).toBe("deny");
    expect(over.budget?.limitId).toBe("acme");
    expect(over.reason).toContain("acme");
    expect(emitted(eventBus, EVENTS.COST_EXCEEDED)).toHaveLength(1);
    expect(emitted(eventBus, EVENTS.POLICY_DENIED)).toHaveLength(1);
  });

  it("emits a cost threshold warning once", async () => {
    const { service, eventBus } = setup({
      budgets: [
        {
          id: "acme",
          scope: { orgId: "acme" },
          period: "total",
          limitUsd: 100,
          warnAtFraction: 0.5,
        },
      ],
    });

    service.recordSpend({ orgId: "acme" }, 60);

    await service.enforce({ action: "model:call", subject });
    await service.enforce({ action: "model:call", subject });

    expect(emitted(eventBus, EVENTS.COST_THRESHOLD)).toHaveLength(1);
  });

  it("does not raise an approval for a denied action", async () => {
    const { service } = setup({
      rules: [{ id: "no", name: "Deny", effect: "deny", when: {} }],
    });

    const decision = await service.enforce({ action: "a", subject });

    expect(decision.effect).toBe("deny");
    expect(decision.approvalId).toBeUndefined();
    expect(service.approvals.pending()).toHaveLength(0);
  });

  it("works without an event bus", async () => {
    const service = new PolicyService({
      rules: [{ id: "no", name: "Deny", effect: "deny", when: {} }],
    });

    await expect(service.enforce({ action: "a", subject })).resolves.toMatchObject({
      effect: "deny",
    });
  });
});
