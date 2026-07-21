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

export enum WorkflowStepType {
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

  MISSION_STARTED: "mission:started",
  MISSION_COMPLETED: "mission:completed",
  MISSION_FAILED: "mission:failed",

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
  WORKFLOW_STEP_COMPLETED: "workflow:step:completed",
  WORKFLOW_COMPLETED: "workflow:completed",
  WORKFLOW_FAILED: "workflow:failed",

  MODEL_CALLED: "model:called",
  MODEL_RESPONSE: "model:response",
  MODEL_ERROR: "model:error",

  APPROVAL_REQUESTED: "approval:requested",
  APPROVAL_GRANTED: "approval:granted",
  APPROVAL_DENIED: "approval:denied",

  COST_THRESHOLD: "cost:threshold",
  COST_EXCEEDED: "cost:exceeded",

  CONNECTOR_CONNECTED: "connector:connected",
  CONNECTOR_DISCONNECTED: "connector:disconnected",
  CONNECTOR_ERROR: "connector:error",

  PLUGIN_INSTALLED: "plugin:installed",
  PLUGIN_UNINSTALLED: "plugin:uninstalled",
  PLUGIN_ERROR: "plugin:error",

  LEARNING_RECORDED: "learning:recorded",
  LEARNING_REFLECTED: "learning:reflected",
} as const;
