export type ModelProvider = "anthropic" | "openai" | "google" | "ollama" | "deepseek" | "local";

export type ModelCapability =
  "text" | "vision" | "code" | "reasoning" | "embedding" | "function_calling";

export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerToken: number;
  outputPricePerToken: number;
  capabilities: ModelCapability[];
  isLocal: boolean;
  endpoint?: string;
}

// Conversation shapes are defined once, in @ryvan/contracts, because they
// cross package and SDK boundaries (Constitution Article 3). Re-exported here
// so existing importers keep working.
export type { ChatMessage, ToolCall, ToolSchema } from "@ryvan/contracts";

import type { ChatMessage, ToolCall, ToolSchema } from "@ryvan/contracts";

/**
 * @deprecated Use `ToolSchema`. Renamed because `@ryvan/tool-registry` also
 * exports a `ToolDefinition` describing something different — a tool as
 * *registered* (validation, timeouts, permissions) rather than as *described
 * to a model*. One name meaning two things reads as a bug in whichever package
 * you know less well.
 *
 * Removed at Beta (Constitution Article 17).
 */
export type ToolDefinition = ToolSchema;

export interface RoutingHints {
  preferLocal?: boolean;
  maxCostPerCall?: number;
  maxLatencyMs?: number;
  requiredCapabilities?: ModelCapability[];
  privacySensitive?: boolean;
  estimatedInputTokens?: number;
}

export interface ModelRequest {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  routingHints?: RoutingHints;
  /**
   * Ties this call to the work that caused it. Emitted on `model:called` and
   * `model:response`, which is what lets a trace attribute model spend to the
   * mission that incurred it. Without it a model call is unattributable.
   */
  correlationId?: string;
  /** Tenant the call is made on behalf of, for per-organisation cost rollups. */
  tenant?: { orgId?: string; userId?: string; agentId?: string };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface ModelResponse {
  id: string;
  model: string;
  provider: ModelProvider;
  content: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "content_filter";
  usage: TokenUsage;
  latencyMs: number;
}

export interface ModelProviderAdapter {
  readonly provider: ModelProvider;
  chat(request: ModelRequest, config: ModelConfig): Promise<ModelResponse>;
  listModels(): ModelConfig[];
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}
