export type MissionStatus =
  | "created"
  | "awaiting_approval"
  | "planning"
  | "running"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface MissionSubject {
  userId?: string;
  agentId?: string;
  orgId?: string;
  projectId?: string;
  roles?: string[];
}

export interface Mission {
  id: string;
  /** Product-defined mission type, e.g. "payroll.run", "proposal.generate". */
  type: string;
  name: string;
  /** Plain-language statement of what the mission is meant to achieve. */
  goal: string;
  status: MissionStatus;
  input: Record<string, unknown>;
  subject?: MissionSubject;
  correlationId: string;
  /** Workflow selected by the planner. */
  workflowId?: string;
  workflowVersion?: string;
  /** Run produced by the workflow engine. */
  runId?: string;
  /** Approval blocking the mission, when status is "awaiting_approval". */
  approvalId?: string;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

/** What the planner decided to run. */
export interface MissionPlan {
  workflowId: string;
  workflowVersion?: string;
  /** Input handed to the workflow run — usually the mission input, possibly enriched. */
  input: Record<string, unknown>;
  rationale?: string;
}

/**
 * Chooses the workflow that satisfies a mission. Products supply their own
 * implementation; `TemplateMissionPlanner` covers the common case of a static
 * mission-type to workflow mapping.
 */
export interface MissionPlanner {
  plan(mission: Mission): Promise<MissionPlan> | MissionPlan;
}

// --- ports ------------------------------------------------------------------
// Declared here so this package imports no other domain package. `@ryvan/bootstrap`
// injects the concrete implementations.

export type WorkflowRunStatusLike =
  | "pending"
  | "running"
  | "suspended"
  | "completed"
  | "failed"
  | "compensating"
  | "compensated"
  | "cancelled";

export interface WorkflowRunHandle {
  id: string;
  status: WorkflowRunStatusLike;
  outputs?: Record<string, unknown>;
  error?: string;
}

/** Implemented by `@ryvan/workflow-engine`. */
export interface WorkflowRunner {
  start(
    workflowId: string,
    options: {
      input?: Record<string, unknown>;
      subject?: MissionSubject;
      correlationId?: string;
      missionId?: string;
      version?: string;
    },
  ): Promise<WorkflowRunHandle>;
  get(runId: string): Promise<WorkflowRunHandle | undefined>;
  cancel(runId: string): Promise<WorkflowRunHandle>;
}

export type PolicyEffectLike = "allow" | "deny" | "require_approval";

export interface PolicyVerdict {
  effect: PolicyEffectLike;
  allowed: boolean;
  reason: string;
  approvalId?: string;
}

/** Implemented by `@ryvan/policy-engine`. */
export interface PolicyGate {
  enforce(request: {
    action: string;
    resource?: string;
    subject: MissionSubject;
    attributes?: Record<string, unknown>;
    estimatedCostUsd?: number;
  }): Promise<PolicyVerdict>;
  checkApproval(approvalId: string): Promise<"pending" | "granted" | "denied" | "expired">;
}

export interface MissionStore {
  save(mission: Mission): Promise<void>;
  get(missionId: string): Promise<Mission | undefined>;
  list(filter?: {
    status?: MissionStatus;
    type?: string;
    orgId?: string;
    runId?: string;
  }): Promise<Mission[]>;
}

export interface LaunchMissionInput {
  type: string;
  name?: string;
  goal?: string;
  input?: Record<string, unknown>;
  subject?: MissionSubject;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  /** Projected spend, forwarded to the policy gate for budget checks. */
  estimatedCostUsd?: number;
}

export interface MissionServiceOptions {
  planner?: MissionPlanner;
  workflows?: WorkflowRunner;
  policy?: PolicyGate;
  store?: MissionStore;
  /** Policy action checked before a mission runs. Default "mission:execute". */
  policyAction?: string;
  /** How often awaiting-approval missions are re-checked. Default 5000ms. */
  approvalPollIntervalMs?: number;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}
