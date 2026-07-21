export type TaskStatus =
  | "pending"
  | "planning"
  | "queued"
  | "running"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface Task {
  id: string;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  agentId?: string;
  parentTaskId?: string;
  plan?: ExecutionPlan;
  result?: TaskResult;
  error?: string;
  attempts: number;
  maxAttempts: number;
  timeout: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface ExecutionPlan {
  id: string;
  taskId: string;
  steps: PlanStep[];
  strategy: "sequential" | "parallel" | "adaptive";
  estimatedDuration?: number;
  createdAt: number;
}

export interface PlanStep {
  id: string;
  name: string;
  description: string;
  type: "model_call" | "tool_call" | "sub_task" | "decision" | "verify";
  config: Record<string, unknown>;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskResult {
  output: unknown;
  summary: string;
  confidence: number;
  tokensUsed: number;
  costUsd: number;
  stepsCompleted: number;
  stepsTotal: number;
  duration: number;
}

export interface PlannerStrategy {
  name: string;
  plan(goal: string, context?: Record<string, unknown>): Promise<ExecutionPlan>;
}

export interface WorkerConfig {
  maxConcurrency: number;
  pollIntervalMs: number;
  shutdownTimeoutMs: number;
}

export interface AgentAssignment {
  taskId: string;
  agentId: string;
  assignedAt: number;
}

export interface RuntimeStats {
  activeTasks: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTasksProcessed: number;
  averageDurationMs: number;
  workerUtilization: number;
}
