/**
 * Shared data contracts.
 *
 * Everything that crosses a package boundary or the SDK boundary is defined
 * here, once. A DTO defined twice is a boundary that has already leaked
 * (Constitution Article 3).
 *
 * This package depends on nothing — not even `@ryvan/common` — so that any
 * package, and any product, can import it without pulling in behaviour. It
 * contains **types only**: no classes, no functions, no runtime code.
 *
 * Owner: `@platform-core`.
 */

// --- conversation -----------------------------------------------------------

export type MessageRole = "system" | "user" | "assistant" | "tool";

/** One turn of a model conversation, in the platform's canonical shape. */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  /** Set on a `tool` message, linking it to the call it answers. */
  toolCallId?: string;
  /** Set on an `assistant` message that requested tools. */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments. A string, because that is what providers emit. */
  arguments: string;
}

/**
 * A tool as described *to a model*.
 *
 * Deliberately distinct from `@ryvan/tool-registry`'s `ToolDefinition`, which
 * describes a tool as *registered by the platform* — validation rules,
 * timeouts, permissions. Both were previously called `ToolDefinition` in
 * different packages, which is worse than duplication: one name meaning two
 * things reads as a bug in whichever package you know less well.
 */
export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  parameters: Record<string, unknown>;
}

// --- identity and tenancy ---------------------------------------------------

/**
 * Who an action is performed on behalf of.
 *
 * Carried on missions, policy checks, connector calls, spans and audit
 * entries — the single shape every layer scopes by.
 */
export interface Subject {
  userId?: string;
  agentId?: string;
  orgId?: string;
  projectId?: string;
  roles?: string[];
}

// --- memory -----------------------------------------------------------------

/**
 * A reference to a recalled memory, not the memory itself.
 *
 * Contexts and traces carry references so that what an agent *saw* can be
 * reconstructed later without copying the content into every span — and
 * without a trace becoming a second, unaudited copy of the memory store.
 */
export interface MemoryRef {
  id: string;
  namespace: string;
  /** Similarity or importance, depending on how it was recalled. 0..1. */
  score?: number;
  /** Enough to make a trace readable without dereferencing. */
  preview?: string;
}

// --- cost -------------------------------------------------------------------

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// --- outcomes ---------------------------------------------------------------

export type PolicyEffectName = "allow" | "deny" | "require_approval";

/** A policy outcome as it appears outside the policy engine. */
export interface PolicyOutcome {
  effect: PolicyEffectName;
  allowed: boolean;
  reason: string;
  approvalId?: string;
}

/**
 * The enterprise trace: one object describing a complete execution.
 *
 * This is what a product, an auditor or a support engineer receives to answer
 * "what happened, was it allowed, what did it cost, and what did it read?"
 * without querying four subsystems separately.
 */
export interface ExecutionRecord {
  missionId: string;
  workflowRunId?: string;
  traceId: string;
  /** Sequence of the final audit entry for this execution. */
  auditSequence?: number;
  status: "completed" | "failed" | "cancelled" | "running" | "awaiting_approval";
  policy: PolicyOutcome;
  cost: { totalUsd: number; usage?: TokenUsage };
  latencyMs?: number;
  /** What the execution read, by reference. */
  memory: MemoryRef[];
  subject?: Subject;
  result?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
}
