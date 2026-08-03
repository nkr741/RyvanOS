/**
 * The five step kinds the engine executes. Ordering is expressed with
 * `dependsOn`, not with a step kind — see `WorkflowStepType` in `@ryvan/common`.
 */
export type WorkflowStepKind = "action" | "conditional" | "approval" | "schedule" | "event";

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "suspended"
  | "completed"
  | "failed"
  | "compensating"
  | "compensated"
  | "cancelled";

export type StepStatus =
  "pending" | "running" | "waiting" | "completed" | "failed" | "skipped" | "compensated";

export interface RetryPolicy {
  maxAttempts: number;
  /** Delay before the first retry. Default 1000ms. */
  baseDelayMs?: number;
  /** Multiplier applied per attempt. Default 2. */
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

export interface ApprovalSpec {
  /** Policy action recorded on the approval, e.g. "workflow:step:execute". */
  action?: string;
  resource?: string;
  reason: string;
  /** How long the approval may stay pending before the step fails. */
  ttlMs?: number;
}

export interface ScheduleSpec {
  /** Resume this many milliseconds after the step becomes ready. */
  delayMs?: number;
  /** Absolute epoch millisecond timestamp to resume at. Takes precedence. */
  resumeAt?: number;
}

export interface EventWaitSpec {
  /** Event type to wait for, e.g. "connector:executed". */
  type: string;
  /** Fail the step if the event has not arrived within this window. */
  timeoutMs?: number;
  /** Only accept events whose correlationId matches the run's. */
  matchCorrelationId?: boolean;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  kind: WorkflowStepKind;
  description?: string;
  /** Step ids that must finish before this one becomes ready. */
  dependsOn?: string[];
  /** Registered handler name. Required for "action" steps. */
  handler?: string;
  /** Static input merged into the handler's context. */
  input?: Record<string, unknown>;
  /** Registered handler name to invoke when the run compensates past this step. */
  compensate?: string;
  /** Required for "conditional" steps — dependents are skipped when it returns false. */
  condition?: (context: WorkflowContext) => boolean | Promise<boolean>;
  approval?: ApprovalSpec;
  schedule?: ScheduleSpec;
  event?: EventWaitSpec;
  retry?: RetryPolicy;
  timeoutMs?: number;
  /** When true a failure marks the step failed but lets the run continue. */
  continueOnError?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  steps: WorkflowStepDefinition[];
  /** Applied to any step without its own retry policy. */
  retry?: RetryPolicy;
  /** Applied to any step without its own timeout. */
  stepTimeoutMs?: number;
}

export interface WorkflowSubject {
  userId?: string;
  agentId?: string;
  orgId?: string;
  projectId?: string;
  roles?: string[];
}

export interface StepState {
  id: string;
  status: StepStatus;
  attempts: number;
  output?: unknown;
  error?: string;
  approvalId?: string;
  /** Epoch ms a suspended schedule step becomes ready again. */
  resumeAt?: number;
  /** Monotonic completion order within the run — drives reverse compensation. */
  sequence?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface WorkflowRun {
  id: string;
  definitionId: string;
  definitionVersion: string;
  status: WorkflowRunStatus;
  input: Record<string, unknown>;
  /** Outputs of completed steps, keyed by step id. */
  outputs: Record<string, unknown>;
  steps: Record<string, StepState>;
  subject?: WorkflowSubject;
  correlationId: string;
  missionId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

/** What a step handler sees. */
export interface WorkflowContext {
  runId: string;
  definitionId: string;
  correlationId: string;
  input: Record<string, unknown>;
  outputs: Record<string, unknown>;
  subject?: WorkflowSubject;
  metadata?: Record<string, unknown>;
}

export interface StepContext extends WorkflowContext {
  stepId: string;
  stepName: string;
  /** The step's static `input` from the definition. */
  stepInput: Record<string, unknown>;
  attempt: number;
  signal?: AbortSignal;
}

export type StepHandler = (context: StepContext) => Promise<unknown> | unknown;

/**
 * Durability seam. The in-memory implementation ships with this package;
 * a Postgres-backed one implements the same three methods.
 */
export interface WorkflowStore {
  save(run: WorkflowRun): Promise<void>;
  get(runId: string): Promise<WorkflowRun | undefined>;
  list(filter?: {
    status?: WorkflowRunStatus;
    definitionId?: string;
    missionId?: string;
  }): Promise<WorkflowRun[]>;
}

export interface ApprovalGateRequest {
  action: string;
  resource?: string;
  reason: string;
  ttlMs?: number;
  subject?: WorkflowSubject;
  metadata?: Record<string, unknown>;
}

export type ApprovalGateStatus = "pending" | "granted" | "denied" | "expired";

/**
 * Port implemented by `@ryvan/policy-engine` and injected by `@ryvan/bootstrap`.
 * Declared locally so this package never imports another domain package.
 */
export interface ApprovalGate {
  request(input: ApprovalGateRequest): Promise<{ approvalId: string; status: ApprovalGateStatus }>;
  check(approvalId: string): Promise<ApprovalGateStatus>;
}

export interface WorkflowEngineOptions {
  store?: WorkflowStore;
  approvalGate?: ApprovalGate;
  /** Steps executed concurrently within one run. Default 5. */
  maxStepConcurrency?: number;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}

export interface WorkflowServiceOptions extends WorkflowEngineOptions {
  /** How often suspended runs are polled for resumption. Default 1000ms. */
  resumeIntervalMs?: number;
  definitions?: WorkflowDefinition[];
}

export interface StartRunOptions {
  input?: Record<string, unknown>;
  subject?: WorkflowSubject;
  correlationId?: string;
  missionId?: string;
  metadata?: Record<string, unknown>;
}
