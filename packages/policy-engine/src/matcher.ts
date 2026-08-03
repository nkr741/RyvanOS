import type { PolicyCondition, PolicyRequest } from "./types.js";

const REGEX_SPECIALS = /[.+?^${}()|[\]\\]/g;

/**
 * Converts a glob pattern into an anchored RegExp. Only `*` is special —
 * it matches any run of characters, including none.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(REGEX_SPECIALS, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesGlob(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

/**
 * Evaluates a condition against a request. Every populated field must match;
 * an empty condition matches every request.
 */
export function matchesCondition(condition: PolicyCondition, request: PolicyRequest): boolean {
  if (condition.actions && !matchesGlob(request.action, condition.actions)) {
    return false;
  }

  if (condition.resources) {
    if (!request.resource || !matchesGlob(request.resource, condition.resources)) {
      return false;
    }
  }

  if (condition.roles) {
    const held = request.subject.roles ?? [];
    if (!condition.roles.some((role) => held.includes(role))) {
      return false;
    }
  }

  if (condition.agentIds) {
    if (!request.subject.agentId || !condition.agentIds.includes(request.subject.agentId)) {
      return false;
    }
  }

  if (condition.orgIds) {
    if (!request.subject.orgId || !condition.orgIds.includes(request.subject.orgId)) {
      return false;
    }
  }

  if (condition.costAboveUsd !== undefined) {
    const cost = request.estimatedCostUsd ?? 0;
    if (cost <= condition.costAboveUsd) {
      return false;
    }
  }

  if (condition.attributes) {
    const attributes = request.attributes ?? {};
    for (const [key, expected] of Object.entries(condition.attributes)) {
      if (attributes[key] !== expected) {
        return false;
      }
    }
  }

  if (condition.predicate && !condition.predicate(request)) {
    return false;
  }

  return true;
}
