export const PLATFORM_NAME = "Ryvan AI Platform";
export const PLATFORM_VERSION = "1.0.0";
export const PLATFORM_CODENAME = "Genesis";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export enum ServiceStatus {
  Initializing = "initializing",
  Starting = "starting",
  Running = "running",
  Stopping = "stopping",
  Stopped = "stopped",
  Error = "error",
}

export enum AgentLifecycle {
  Initialize = "initialize",
  LoadSkills = "load_skills",
  LoadPolicies = "load_policies",
  LoadMemory = "load_memory",
  ReceiveGoal = "receive_goal",
  Planning = "planning",
  Execution = "execution",
  Reflection = "reflection",
  Learning = "learning",
  Shutdown = "shutdown",
}

/**
 * Step vocabulary for `@ryvan/workflow-engine`.
 *
 * Only Action, Conditional, Approval, Schedule and Event are step *kinds* — a
 * step's `kind` must be one of those. The remaining members describe ordering
 * and error handling, which the engine models differently:
 *   - Sequential / Parallel — expressed by a step's `dependsOn` edges
 *   - Retry / Timeout       — per-step modifiers (`retry`, `timeoutMs`)
 *   - Rollback / Compensation — a step's `compensate` handler, run in reverse
 */
export enum WorkflowStepType {
  Action = "action",
  Sequential = "sequential",
  Parallel = "parallel",
  Conditional = "conditional",
  Approval = "approval",
  Retry = "retry",
  Rollback = "rollback",
  Timeout = "timeout",
  Compensation = "compensation",
  Schedule = "schedule",
  Event = "event",
}

export enum MemoryType {
  Short = "short",
  Long = "long",
  Vector = "vector",
  Semantic = "semantic",
  Business = "business",
  Conversation = "conversation",
  Entity = "entity",
  Working = "working",
}

export enum ModelProvider {
  Claude = "claude",
  GPT = "gpt",
  Gemini = "gemini",
  Llama = "llama",
  DeepSeek = "deepseek",
  Qwen = "qwen",
  Local = "local",
}

export enum SecurityAction {
  Authenticate = "authenticate",
  Authorize = "authorize",
  PromptInjection = "prompt_injection",
  PIIDetection = "pii_detection",
  SecretsDetection = "secrets_detection",
  PolicyCheck = "policy_check",
  ApprovalCheck = "approval_check",
}

export const DEFAULT_CONFIG = {
  logLevel: "info" as LogLevel,
  port: 8080,
  host: "0.0.0.0",
  environment: "development" as const,
  maxConcurrency: 10,
  requestTimeout: 30_000,
  shutdownTimeout: 10_000,
  retryMaxAttempts: 3,
  retryBaseDelay: 1_000,
  retryMaxDelay: 30_000,
  retryBackoffMultiplier: 2,
  rateLimitMaxRequests: 100,
  rateLimitWindowMs: 60_000,
} as const;

export const EVENTS = {
  KERNEL_INITIALIZING: "kernel:initializing",
  KERNEL_STARTING: "kernel:starting",
  KERNEL_STARTED: "kernel:started",
  KERNEL_STOPPING: "kernel:stopping",
  KERNEL_STOPPED: "kernel:stopped",
  KERNEL_ERROR: "kernel:error",

  IDENTITY_USER_CREATED: "identity:user.created",
  IDENTITY_USER_AUTHENTICATED: "identity:user.authenticated",
  IDENTITY_AUTHORIZATION_DENIED: "identity:authorization.denied",
  IDENTITY_ORG_CREATED: "identity:org.created",
  IDENTITY_PROJECT_CREATED: "identity:project.created",

  SERVICE_REGISTERED: "service:registered",
  SERVICE_STARTED: "service:started",
  SERVICE_STOPPED: "service:stopped",
  SERVICE_ERROR: "service:error",

  TASK_CREATED: "task:created",
  TASK_ASSIGNED: "task:assigned",
  TASK_STARTED: "task:started",
  TASK_COMPLETED: "task:completed",
  TASK_FAILED: "task:failed",
  TASK_CANCELLED: "task:cancelled",

  MISSION_CREATED: "mission:created",
  MISSION_PLANNED: "mission:planned",
  MISSION_STARTED: "mission:started",
  MISSION_AWAITING_APPROVAL: "mission:awaiting_approval",
  MISSION_COMPLETED: "mission:completed",
  MISSION_FAILED: "mission:failed",
  MISSION_CANCELLED: "mission:cancelled",

  AGENT_INITIALIZED: "agent:initialized",
  AGENT_ASSIGNED: "agent:assigned",
  AGENT_EXECUTING: "agent:executing",
  AGENT_COMPLETED: "agent:completed",
  AGENT_ERROR: "agent:error",
  AGENT_SHUTDOWN: "agent:shutdown",

  TOOL_EXECUTED: "tool:executed",
  TOOL_ERROR: "tool:error",

  MEMORY_STORED: "memory:stored",
  MEMORY_RETRIEVED: "memory:retrieved",
  MEMORY_CLEARED: "memory:cleared",

  KNOWLEDGE_UPDATED: "knowledge:updated",
  KNOWLEDGE_QUERIED: "knowledge:queried",

  WORKFLOW_STARTED: "workflow:started",
  WORKFLOW_STEP_STARTED: "workflow:step:started",
  WORKFLOW_STEP_COMPLETED: "workflow:step:completed",
  WORKFLOW_STEP_FAILED: "workflow:step:failed",
  WORKFLOW_STEP_SKIPPED: "workflow:step:skipped",
  WORKFLOW_SUSPENDED: "workflow:suspended",
  WORKFLOW_RESUMED: "workflow:resumed",
  WORKFLOW_COMPENSATED: "workflow:compensated",
  WORKFLOW_COMPLETED: "workflow:completed",
  WORKFLOW_FAILED: "workflow:failed",
  WORKFLOW_CANCELLED: "workflow:cancelled",

  MODEL_CALLED: "model:called",
  MODEL_RESPONSE: "model:response",
  MODEL_ERROR: "model:error",

  POLICY_EVALUATED: "policy:evaluated",
  POLICY_DENIED: "policy:denied",

  APPROVAL_REQUESTED: "approval:requested",
  APPROVAL_GRANTED: "approval:granted",
  APPROVAL_DENIED: "approval:denied",

  AUDIT_RECORDED: "audit:recorded",

  COST_THRESHOLD: "cost:threshold",
  COST_EXCEEDED: "cost:exceeded",

  CONNECTOR_REGISTERED: "connector:registered",
  CONNECTOR_CONNECTED: "connector:connected",
  CONNECTOR_DISCONNECTED: "connector:disconnected",
  CONNECTOR_EXECUTED: "connector:executed",
  CONNECTOR_HEALTH_CHANGED: "connector:health_changed",
  CONNECTOR_ERROR: "connector:error",

  PLUGIN_INSTALLED: "plugin:installed",
  PLUGIN_UNINSTALLED: "plugin:uninstalled",
  PLUGIN_ERROR: "plugin:error",

  LEARNING_RECORDED: "learning:recorded",
  LEARNING_REFLECTED: "learning:reflected",
} as const;
