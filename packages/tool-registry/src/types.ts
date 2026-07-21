export interface ToolDefinition {
  name: string;
  description: string;
  version: string;
  category: string;
  parameters: ToolParameter[];
  returns: ToolReturnSchema;
  permissions: string[];
  timeout: number;
  retryable: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
  schema?: Record<string, unknown>;
}

export interface ToolReturnSchema {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  schema?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  toolName: string;
  input: Record<string, unknown>;
  userId?: string;
  agentId?: string;
  correlationId?: string;
  timeout: number;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
}

export type ToolHandler = (context: ToolExecutionContext) => Promise<ToolResult>;

export type ToolMiddleware = (
  context: ToolExecutionContext,
  next: () => Promise<ToolResult>,
) => Promise<ToolResult>;

export interface ToolStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  lastExecutedAt?: number;
}
