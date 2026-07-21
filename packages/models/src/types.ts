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

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

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
