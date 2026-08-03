import { ValidationError } from "@ryvan/common";
import { matchesCondition } from "./matcher.js";
import type {
  PolicyDecision,
  PolicyEffect,
  PolicyEngineOptions,
  PolicyRequest,
  PolicyRule,
} from "./types.js";

const EFFECT_STRENGTH: Record<PolicyEffect, number> = {
  allow: 0,
  require_approval: 1,
  deny: 2,
};

/**
 * Rule store and decision procedure.
 *
 * Resolution: collect every enabled rule whose condition matches, then take the
 * highest `priority`. Ties within that priority are broken by effect strength
 * (deny > require_approval > allow), so a deny can never be silently outvoted
 * by an allow written at the same level. When nothing matches, the configured
 * `defaultEffect` applies.
 *
 * This engine answers "is this action permitted?" for agents and workflows.
 * It does not store users, roles, or role assignments — that is `@ryvan/identity`.
 * Callers pass the roles they already resolved.
 */
export class PolicyEngine {
  private readonly rules = new Map<string, PolicyRule>();
  private readonly defaultEffect: PolicyEffect;

  constructor(options: PolicyEngineOptions = {}) {
    this.defaultEffect = options.defaultEffect ?? "allow";
    for (const rule of options.rules ?? []) {
      this.addRule(rule);
    }
  }

  addRule(rule: PolicyRule): void {
    if (!rule.id) {
      throw new ValidationError("rule.id", "must not be empty");
    }
    if (!rule.name) {
      throw new ValidationError("rule.name", "must not be empty");
    }
    if (!(rule.effect in EFFECT_STRENGTH)) {
      throw new ValidationError("rule.effect", `unknown effect "${rule.effect}"`);
    }
    if (!rule.when) {
      throw new ValidationError("rule.when", "condition is required");
    }
    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getRule(ruleId: string): PolicyRule | undefined {
    return this.rules.get(ruleId);
  }

  listRules(): PolicyRule[] {
    return Array.from(this.rules.values());
  }

  setEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new ValidationError("ruleId", `rule "${ruleId}" does not exist`);
    }
    rule.enabled = enabled;
  }

  evaluate(request: PolicyRequest): PolicyDecision {
    if (!request.action) {
      throw new ValidationError("request.action", "must not be empty");
    }
    if (!request.subject) {
      throw new ValidationError("request.subject", "is required");
    }

    const matched = this.matchingRules(request);

    if (matched.length === 0) {
      return {
        effect: this.defaultEffect,
        allowed: this.defaultEffect === "allow",
        reason: `No policy rule matched; default effect "${this.defaultEffect}" applied`,
        matchedRuleIds: [],
        evaluatedAt: Date.now(),
      };
    }

    const topPriority = Math.max(...matched.map((rule) => rule.priority ?? 0));
    const contenders = matched.filter((rule) => (rule.priority ?? 0) === topPriority);

    const decisive = contenders.reduce((strongest, rule) =>
      EFFECT_STRENGTH[rule.effect] > EFFECT_STRENGTH[strongest.effect] ? rule : strongest,
    );

    return {
      effect: decisive.effect,
      allowed: decisive.effect === "allow",
      reason: decisive.reason ?? `Rule "${decisive.name}" applied effect "${decisive.effect}"`,
      matchedRuleIds: matched.map((rule) => rule.id),
      evaluatedAt: Date.now(),
    };
  }

  private matchingRules(request: PolicyRequest): PolicyRule[] {
    const matched: PolicyRule[] = [];
    for (const rule of this.rules.values()) {
      if (rule.enabled === false) continue;
      if (matchesCondition(rule.when, request)) {
        matched.push(rule);
      }
    }
    return matched;
  }
}
