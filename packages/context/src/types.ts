import type { ChatMessage, MemoryRef, ToolSchema } from "@ryvan/contracts";

/**
 * What an agent asks to be assembled.
 *
 * The agent supplies the *materials*; it never assembles them itself. That
 * separation is the whole point of this package — an agent that builds its own
 * context means every agent invents its own strategy, and none of them can be
 * changed centrally.
 */
export interface ContextRequest {
  /** Resolved instruction text. From `@ryvan/prompts` once that exists. */
  instruction: string;
  /** The immediate task. Rendered into the first user turn. */
  input?: Record<string, unknown>;
  /** Conversation so far, oldest first. */
  history?: ChatMessage[];
  /** Recalled memories, most relevant first. */
  memories?: RecalledMemory[];
  /** Tools the agent may call, passed through to the model. */
  tools?: ToolSchema[];
  budget?: ContextBudget;
}

export interface RecalledMemory extends MemoryRef {
  content: string;
}

export interface ContextBudget {
  /**
   * Ceiling for the assembled context. Not the model's window — leave room for
   * the response, or the model truncates mid-answer.
   */
  maxTokens?: number;
  /** Cap on history turns, applied before the token budget. */
  maxHistoryTurns?: number;
  /** Cap on recalled memories, applied before the token budget. */
  maxMemories?: number;
}

/** Why something did not make it into the context. */
export type DropReason = "token_budget" | "turn_limit" | "memory_limit";

export interface DroppedItem {
  kind: "history" | "memory";
  /** Message index or memory id. */
  ref: string;
  reason: DropReason;
}

/**
 * The assembled result.
 *
 * `dropped` is not diagnostics — it is part of the contract. An agent that
 * silently loses half its context produces a wrong answer that looks like a
 * reasoning failure, and nobody can tell the difference after the fact.
 */
export interface AssembledContext {
  messages: ChatMessage[];
  /** Estimated, and named as such. See `estimateTokens`. */
  tokenEstimate: number;
  included: { historyTurns: number; memories: number; tools: number };
  dropped: DroppedItem[];
  /** References for everything that made it in, for the trace. */
  memoryRefs: MemoryRef[];
}

/**
 * Port implemented by this package and injected into agents.
 *
 * Declared here so `@ryvan/agents` can depend on the interface rather than the
 * implementation, and swap in a smarter assembler without changing an agent.
 */
export interface ContextAssembler {
  assemble(request: ContextRequest): Promise<AssembledContext>;
}
