import type { PolicyService } from "@ryvan/policy-engine";
import type { WorkflowService, ApprovalGate, WorkflowRun } from "@ryvan/workflow-engine";
import type { PolicyGate, WorkflowRunHandle, WorkflowRunner } from "@ryvan/mission-engine";
import type { ConnectorPolicyGate, ResilienceGate } from "@ryvan/connector-sdk";
import type { ResilienceService } from "@ryvan/resilience";

/**
 * Port adapters.
 *
 * Domain packages never import one another — each declares the interface it
 * needs and this package supplies the implementation. These functions are the
 * only place in the platform that knows two packages at once, which is exactly
 * where that knowledge belongs.
 */

function toHandle(run: WorkflowRun): WorkflowRunHandle {
  return {
    id: run.id,
    status: run.status,
    outputs: run.outputs,
    error: run.error,
  };
}

/** Lets workflow approval steps raise and poll approvals through policy. */
export function policyApprovalGate(policy: PolicyService): ApprovalGate {
  return {
    async request(input) {
      const approval = await policy.requestApproval({
        action: input.action,
        resource: input.resource,
        subject: input.subject ?? {},
        reason: input.reason,
        ttlMs: input.ttlMs,
        metadata: input.metadata,
      });

      return { approvalId: approval.id, status: approval.status };
    },

    async check(approvalId) {
      return policy.approvalStatus(approvalId);
    },
  };
}

/** Lets the mission engine drive workflows without importing the engine. */
export function workflowRunner(workflows: WorkflowService): WorkflowRunner {
  return {
    async start(workflowId, options) {
      return toHandle(await workflows.run(workflowId, options));
    },

    async get(runId) {
      const run = await workflows.get(runId);
      return run ? toHandle(run) : undefined;
    },

    async cancel(runId) {
      return toHandle(await workflows.cancel(runId));
    },
  };
}

/** Lets the mission engine check policy and approvals. */
export function missionPolicyGate(policy: PolicyService): PolicyGate {
  return {
    async enforce(request) {
      const decision = await policy.enforce(request);

      return {
        effect: decision.effect,
        allowed: decision.allowed,
        reason: decision.reason,
        approvalId: decision.approvalId,
      };
    },

    async checkApproval(approvalId) {
      return policy.approvalStatus(approvalId);
    },
  };
}

/**
 * Lets connector calls retry, circuit-break, and fall back.
 *
 * Unwraps the outcome to the bare result, because the connector service only
 * needs what it asked for — attempt counts and fallback provenance go to the
 * event bus, where the trace picks them up.
 */
export function connectorResilienceGate(resilience: ResilienceService): ResilienceGate {
  return {
    async run(key, fn, options) {
      const outcome = await resilience.execute(key, fn, options);
      return outcome.result;
    },
  };
}

/** Lets the connector service gate mutating operations on policy. */
export function connectorPolicyGate(policy: PolicyService): ConnectorPolicyGate {
  return {
    async enforce(request) {
      const decision = await policy.enforce(request);

      return {
        effect: decision.effect,
        allowed: decision.allowed,
        reason: decision.reason,
      };
    },
  };
}
