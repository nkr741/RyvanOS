export type AgentStatus =
  "idle" | "initializing" | "ready" | "executing" | "reflecting" | "error" | "shutdown";

export interface AgentMemoryConfig {
  conversationMaxTurns?: number;
  workingMemoryTTLMs?: number;
  enableLongTermMemory?: boolean;
}

export interface AgentPolicy {
  name: string;
  description: string;
  enforce: (context: AgentExecutionContext) => PolicyResult;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  requiredApproval?: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  version: string;
  model: string;
  systemPrompt: string;
  skills?: string[];
  tools?: string[];
  policies?: AgentPolicy[];
  maxConcurrentTasks?: number;
  timeout?: number;
  memory?: AgentMemoryConfig;
  metadata?: Record<string, unknown>;
}

export interface AgentExecutionContext {
  agentId: string;
  taskId: string;
  goal: string;
  conversationHistory: ConversationEntry[];
  workingMemory: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ConversationEntry {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface AgentCapabilities {
  tools: string[];
  skills: string[];
  models: string[];
  policies: string[];
}

export interface ReflectionResult {
  summary: string;
  lessonsLearned: string[];
  successScore: number;
  improvementSuggestions: string[];
}

export interface AgentEvent {
  agentId: string;
  type: string;
  data: unknown;
  timestamp: number;
}

export type CollaborationRole = "planner" | "researcher" | "executor" | "reviewer" | "critic";

export interface CollaborationMessage {
  id: string;
  from: string;
  to: string | string[];
  role: CollaborationRole;
  content: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface CollaborationProtocol {
  name: string;
  roles: CollaborationRole[];
  flow: Array<{
    from: CollaborationRole;
    to: CollaborationRole;
    description: string;
  }>;
}
