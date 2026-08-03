import { ValidationError } from "@ryvan/common";
import type { WorkflowDefinition, WorkflowStepDefinition } from "./types.js";

const VALID_KINDS = new Set(["action", "conditional", "approval", "schedule", "event"]);

/**
 * Validates a definition before it can be registered. Catching a cycle or a
 * dangling dependency here is far cheaper than discovering it mid-run.
 */
export function validateDefinition(definition: WorkflowDefinition): void {
  if (!definition.id) {
    throw new ValidationError("definition.id", "must not be empty");
  }
  if (!definition.version) {
    throw new ValidationError("definition.version", "must not be empty");
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new ValidationError("definition.steps", "must contain at least one step");
  }

  const ids = new Set<string>();
  for (const step of definition.steps) {
    validateStep(step);
    if (ids.has(step.id)) {
      throw new ValidationError("step.id", `duplicate step id "${step.id}"`);
    }
    ids.add(step.id);
  }

  for (const step of definition.steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        throw new ValidationError(
          `step.${step.id}.dependsOn`,
          `references unknown step "${dependency}"`,
        );
      }
      if (dependency === step.id) {
        throw new ValidationError(`step.${step.id}.dependsOn`, "a step cannot depend on itself");
      }
    }
  }

  const cycle = findCycle(definition.steps);
  if (cycle) {
    throw new ValidationError("definition.steps", `dependency cycle: ${cycle.join(" -> ")}`);
  }
}

function validateStep(step: WorkflowStepDefinition): void {
  if (!step.id) {
    throw new ValidationError("step.id", "must not be empty");
  }
  if (!step.name) {
    throw new ValidationError(`step.${step.id}.name`, "must not be empty");
  }
  if (!VALID_KINDS.has(step.kind)) {
    throw new ValidationError(`step.${step.id}.kind`, `unknown kind "${step.kind}"`);
  }
  if (step.kind === "action" && !step.handler) {
    throw new ValidationError(`step.${step.id}.handler`, 'is required for kind "action"');
  }
  if (step.kind === "conditional" && !step.condition) {
    throw new ValidationError(`step.${step.id}.condition`, 'is required for kind "conditional"');
  }
  if (step.kind === "approval" && !step.approval?.reason) {
    throw new ValidationError(`step.${step.id}.approval.reason`, 'is required for kind "approval"');
  }
  if (step.kind === "event" && !step.event?.type) {
    throw new ValidationError(`step.${step.id}.event.type`, 'is required for kind "event"');
  }
  if (step.kind === "schedule" && !step.schedule?.delayMs && !step.schedule?.resumeAt) {
    throw new ValidationError(
      `step.${step.id}.schedule`,
      'requires "delayMs" or "resumeAt" for kind "schedule"',
    );
  }
  if (step.retry && step.retry.maxAttempts < 1) {
    throw new ValidationError(`step.${step.id}.retry.maxAttempts`, "must be at least 1");
  }
}

/** Returns the first cycle found as a path of step ids, or null when acyclic. */
function findCycle(steps: WorkflowStepDefinition[]): string[] | null {
  const edges = new Map(steps.map((step) => [step.id, step.dependsOn ?? []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const walk = (id: string): string[] | null => {
    if (visited.has(id)) return null;
    if (visiting.has(id)) {
      return [...path.slice(path.indexOf(id)), id];
    }

    visiting.add(id);
    path.push(id);

    for (const dependency of edges.get(id) ?? []) {
      const cycle = walk(dependency);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };

  for (const step of steps) {
    const cycle = walk(step.id);
    if (cycle) return cycle;
  }

  return null;
}
