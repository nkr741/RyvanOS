import { EVENTS } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import { ApprovalStore } from "./approvals.js";
import type { RaiseApprovalInput } from "./approvals.js";
import { BudgetGuard } from "./budget-guard.js";
import { PolicyEngine } from "./policy-engine.js";
import type {
  ApprovalRequest,
  ApprovalStatus,
  BudgetScope,
  PolicyDecision,
  PolicyRequest,
  PolicyServiceOptions,
} from "./types.js";

const APPROVAL_SWEEP_INTERVAL_MS = 60_000;

/**
 * Facade over the rule engine, budget guard, and approval store.
 *
 * `enforce()` is the single entry point every other package should call before
 * doing something consequential. Budget ceilings are hard: an exceeded budget
 * denies regardless of what the rules say.
 */
export class PolicyService implements Service {
  readonly name = "policy";

  readonly engine: PolicyEngine;
  readonly budgets: BudgetGuard;
  readonly approvals: ApprovalStore;

  private state: Status = "stopped";
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(options: PolicyServiceOptions = {}) {
    this.logger = options.logger;
    this.eventBus = options.eventBus;

    this.engine = new PolicyEngine({
      defaultEffect: options.defaultEffect,
      rules: options.rules,
    });
    this.budgets = new BudgetGuard(options.budgets);
    this.approvals = new ApprovalStore(options.approvalTtlMs);
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.sweepTimer = setInterval(() => {
      void this.sweepApprovals();
    }, APPROVAL_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
    this.state = "running";
    this.logger?.info("Policy service started", { rules: this.engine.listRules().length });
  }

  async stop(): Promise<void> {
    this.state = "stopping";
    if (this.sweepTimer !== undefined) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    this.state = "stopped";
    this.logger?.info("Policy service stopped");
  }

  status(): Status {
    return this.state;
  }

  /**
   * Evaluates rules and budgets for a request. When the outcome is
   * `require_approval`, a pending approval is raised and its id is returned on
   * the decision — the caller is expected to pause until it is granted.
   */
  async enforce(request: PolicyRequest): Promise<PolicyDecision> {
    const scope: BudgetScope = {
      orgId: request.subject.orgId,
      userId: request.subject.userId,
      agentId: request.subject.agentId,
    };

    const budgetStatuses = this.budgets.check(scope, request.estimatedCostUsd ?? 0);
    const breached = budgetStatuses.find((status) => status.exceeded);

    if (breached) {
      const decision: PolicyDecision = {
        effect: "deny",
        allowed: false,
        reason: `Budget "${breached.limitId}" exceeded: ${breached.spentUsd.toFixed(4)} of ${breached.limitUsd.toFixed(4)} USD per ${breached.period}`,
        matchedRuleIds: [],
        budget: breached,
        evaluatedAt: Date.now(),
      };

      await this.emit(EVENTS.COST_EXCEEDED, {
        action: request.action,
        subject: request.subject,
        budget: breached,
      });
      await this.emitDecision(request, decision);
      return decision;
    }

    for (const warning of this.budgets.takeNewWarnings()) {
      await this.emit(EVENTS.COST_THRESHOLD, { budget: warning });
    }

    const decision = this.engine.evaluate(request);

    if (decision.effect === "require_approval") {
      const approval = this.approvals.raise({
        action: request.action,
        resource: request.resource,
        subject: request.subject,
        reason: decision.reason,
        metadata: request.attributes,
      });
      decision.approvalId = approval.id;

      await this.emit(EVENTS.APPROVAL_REQUESTED, { approval });
      this.logger?.info("Approval required", {
        approvalId: approval.id,
        action: request.action,
      });
    }

    await this.emitDecision(request, decision);
    return decision;
  }

  /**
   * Raises an approval directly, for callers that already know a human must
   * decide and do not need a rule evaluation — a workflow approval step, say.
   * Goes through the service rather than the store so the event still fires.
   */
  async requestApproval(input: RaiseApprovalInput): Promise<ApprovalRequest> {
    const approval = this.approvals.raise(input);
    await this.emit(EVENTS.APPROVAL_REQUESTED, { approval });
    this.logger?.info("Approval requested", {
      approvalId: approval.id,
      action: approval.action,
    });
    return approval;
  }

  /** Current status of an approval. Unknown ids read as "expired", never as granted. */
  approvalStatus(approvalId: string): ApprovalStatus {
    return this.approvals.get(approvalId)?.status ?? "expired";
  }

  async grantApproval(
    approvalId: string,
    decidedBy: string,
    note?: string,
  ): Promise<ApprovalRequest> {
    const approval = this.approvals.grant(approvalId, decidedBy, note);
    await this.emit(EVENTS.APPROVAL_GRANTED, { approval });
    this.logger?.info("Approval granted", { approvalId, decidedBy });
    return approval;
  }

  async denyApproval(
    approvalId: string,
    decidedBy: string,
    note?: string,
  ): Promise<ApprovalRequest> {
    const approval = this.approvals.deny(approvalId, decidedBy, note);
    await this.emit(EVENTS.APPROVAL_DENIED, { approval });
    this.logger?.info("Approval denied", { approvalId, decidedBy });
    return approval;
  }

  /** Records spend against budgets. Bootstrap feeds model usage in through here. */
  recordSpend(scope: BudgetScope, amountUsd: number, reason?: string): void {
    this.budgets.record(scope, amountUsd, reason);
  }

  private async sweepApprovals(): Promise<void> {
    for (const approval of this.approvals.expireStale()) {
      await this.emit(EVENTS.APPROVAL_DENIED, { approval, reason: "expired" });
      this.logger?.warn("Approval expired", { approvalId: approval.id });
    }
  }

  private async emitDecision(request: PolicyRequest, decision: PolicyDecision): Promise<void> {
    await this.emit(EVENTS.POLICY_EVALUATED, {
      action: request.action,
      resource: request.resource,
      subject: request.subject,
      decision,
    });

    if (decision.effect === "deny") {
      await this.emit(EVENTS.POLICY_DENIED, {
        action: request.action,
        resource: request.resource,
        subject: request.subject,
        reason: decision.reason,
      });
      this.logger?.warn("Policy denied action", {
        action: request.action,
        reason: decision.reason,
      });
    }
  }

  private async emit(type: string, data: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit(type, data, { source: this.name });
  }
}
