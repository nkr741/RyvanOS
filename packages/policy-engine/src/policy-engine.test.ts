import { describe, expect, it } from "vitest";
import { PolicyEngine } from "./policy-engine.js";
import type { PolicyRequest } from "./types.js";

const subject = { userId: "u1", orgId: "acme", roles: ["org:member"] };

function request(overrides: Partial<PolicyRequest> = {}): PolicyRequest {
  return { action: "tool:send_email", subject, ...overrides };
}

describe("PolicyEngine", () => {
  it("applies the default effect when nothing matches", () => {
    const engine = new PolicyEngine({ defaultEffect: "deny" });

    const decision = engine.evaluate(request());

    expect(decision.effect).toBe("deny");
    expect(decision.allowed).toBe(false);
    expect(decision.matchedRuleIds).toEqual([]);
  });

  it("defaults to allow when no default effect is configured", () => {
    expect(new PolicyEngine().evaluate(request()).effect).toBe("allow");
  });

  it("matches actions by glob", () => {
    const engine = new PolicyEngine({
      rules: [{ id: "r1", name: "No tools", effect: "deny", when: { actions: ["tool:*"] } }],
    });

    expect(engine.evaluate(request({ action: "tool:send_email" })).effect).toBe("deny");
    expect(engine.evaluate(request({ action: "mission:execute" })).effect).toBe("allow");
  });

  it("lets the highest priority rule decide", () => {
    const engine = new PolicyEngine({
      rules: [
        { id: "broad", name: "Deny all tools", effect: "deny", when: { actions: ["tool:*"] } },
        {
          id: "exception",
          name: "Allow email",
          effect: "allow",
          priority: 10,
          when: { actions: ["tool:send_email"] },
        },
      ],
    });

    const decision = engine.evaluate(request());

    expect(decision.effect).toBe("allow");
    expect(decision.matchedRuleIds).toContain("broad");
    expect(decision.matchedRuleIds).toContain("exception");
  });

  it("breaks ties at equal priority in favour of the stronger effect", () => {
    const engine = new PolicyEngine({
      rules: [
        { id: "a", name: "Allow", effect: "allow", priority: 5, when: { actions: ["tool:*"] } },
        { id: "b", name: "Deny", effect: "deny", priority: 5, when: { actions: ["tool:*"] } },
        {
          id: "c",
          name: "Approve",
          effect: "require_approval",
          priority: 5,
          when: { actions: ["tool:*"] },
        },
      ],
    });

    expect(engine.evaluate(request()).effect).toBe("deny");
  });

  it("ignores disabled rules", () => {
    const engine = new PolicyEngine({
      rules: [{ id: "r1", name: "Deny", effect: "deny", when: {} }],
    });

    engine.setEnabled("r1", false);

    expect(engine.evaluate(request()).effect).toBe("allow");
  });

  it("requires every populated condition field to match", () => {
    const engine = new PolicyEngine({
      rules: [
        {
          id: "r1",
          name: "Admin-only high spend",
          effect: "require_approval",
          when: { actions: ["tool:*"], roles: ["org:owner"], costAboveUsd: 5 },
        },
      ],
    });

    // Right action and cost, wrong role.
    expect(engine.evaluate(request({ estimatedCostUsd: 10 })).effect).toBe("allow");

    // All three satisfied.
    const decision = engine.evaluate(
      request({
        estimatedCostUsd: 10,
        subject: { ...subject, roles: ["org:owner"] },
      }),
    );
    expect(decision.effect).toBe("require_approval");
  });

  it("treats costAboveUsd as strictly greater than", () => {
    const engine = new PolicyEngine({
      rules: [{ id: "r1", name: "Costly", effect: "deny", when: { costAboveUsd: 5 } }],
    });

    expect(engine.evaluate(request({ estimatedCostUsd: 5 })).effect).toBe("allow");
    expect(engine.evaluate(request({ estimatedCostUsd: 5.01 })).effect).toBe("deny");
  });

  it("does not match a resource condition when the request has no resource", () => {
    const engine = new PolicyEngine({
      rules: [{ id: "r1", name: "Connectors", effect: "deny", when: { resources: ["*"] } }],
    });

    expect(engine.evaluate(request()).effect).toBe("allow");
    expect(engine.evaluate(request({ resource: "connector:sap" })).effect).toBe("deny");
  });

  it("supports a custom predicate", () => {
    const engine = new PolicyEngine({
      rules: [
        {
          id: "r1",
          name: "Business hours only",
          effect: "deny",
          when: { predicate: (req) => req.attributes?.hour === 3 },
        },
      ],
    });

    expect(engine.evaluate(request({ attributes: { hour: 3 } })).effect).toBe("deny");
    expect(engine.evaluate(request({ attributes: { hour: 11 } })).effect).toBe("allow");
  });

  it("rejects malformed rules", () => {
    const engine = new PolicyEngine();

    expect(() => engine.addRule({ id: "", name: "x", effect: "allow", when: {} })).toThrow();
    expect(() => engine.addRule({ id: "x", name: "", effect: "allow", when: {} })).toThrow();
  });

  it("rejects a request without an action", () => {
    expect(() => new PolicyEngine().evaluate({ action: "", subject })).toThrow();
  });

  it("escapes regex metacharacters in glob patterns", () => {
    const engine = new PolicyEngine({
      rules: [{ id: "r1", name: "Literal dot", effect: "deny", when: { actions: ["a.b"] } }],
    });

    expect(engine.evaluate(request({ action: "a.b" })).effect).toBe("deny");
    expect(engine.evaluate(request({ action: "axb" })).effect).toBe("allow");
  });
});
