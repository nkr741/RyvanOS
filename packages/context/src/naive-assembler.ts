import { ValidationError } from "@ryvan/common";
import type { ChatMessage, MemoryRef } from "@ryvan/contracts";
import type {
  AssembledContext,
  ContextAssembler,
  ContextBudget,
  ContextRequest,
  DroppedItem,
  RecalledMemory,
} from "./types.js";

const DEFAULT_MAX_TOKENS = 8_000;
const CHARS_PER_TOKEN = 4;

/**
 * Rough token count.
 *
 * Four characters per token is the widely-used English approximation. It is
 * wrong for code, wrong for other languages, and wrong for every specific
 * tokeniser — which is why the result is named `tokenEstimate` everywhere and
 * never `tokenCount`. A real tokeniser replaces this without changing any
 * caller, because nothing treats the number as exact.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function messageTokens(message: ChatMessage): number {
  // Role, delimiters and tool metadata cost tokens too; four is a flat
  // allowance that keeps the estimate on the safe side rather than under.
  return estimateTokens(message.content) + 4;
}

/**
 * Assembles context by a fixed, documented priority.
 *
 * Deliberately simple, and deliberately **deterministic**: the same request
 * must produce the same context every time, or evaluation compares runs that
 * differed for reasons nobody recorded.
 *
 * Priority, highest first:
 *   1. the instruction — without it the agent has no task
 *   2. the current input — the thing actually being asked
 *   3. recent history — nearest turns first
 *   4. recalled memories — highest scored first
 *
 * When the budget binds, the *lowest* priority material is dropped first, and
 * every drop is reported. This is the naive implementation the Alpha needs;
 * the seam is what matters, and a smarter assembler replaces it behind the
 * same port.
 */
export class NaiveContextAssembler implements ContextAssembler {
  private readonly defaultBudget: ContextBudget;

  constructor(defaultBudget: ContextBudget = {}) {
    this.defaultBudget = defaultBudget;
  }

  async assemble(request: ContextRequest): Promise<AssembledContext> {
    if (!request.instruction) {
      // An agent with no instruction is a bug, not an empty context.
      throw new ValidationError("instruction", "must not be empty");
    }

    const budget = { ...this.defaultBudget, ...request.budget };
    const maxTokens = budget.maxTokens ?? DEFAULT_MAX_TOKENS;

    const dropped: DroppedItem[] = [];

    // --- fixed cost: instruction and input always go in -------------------
    const system: ChatMessage = { role: "system", content: request.instruction };

    const userContent = request.input ? JSON.stringify(request.input, null, 2) : "";
    const user: ChatMessage | undefined = userContent
      ? { role: "user", content: userContent }
      : undefined;

    let used = messageTokens(system) + (user ? messageTokens(user) : 0);

    // --- select memories --------------------------------------------------
    const memories = this.applyCountLimit(
      [...(request.memories ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      budget.maxMemories,
      (memory) => ({ kind: "memory" as const, ref: memory.id, reason: "memory_limit" as const }),
      dropped,
    );

    // --- select history ---------------------------------------------------
    // Reversed so the *most recent* turns survive a turn limit.
    const history = [...(request.history ?? [])];
    const historyLimited = this.applyCountLimit(
      [...history].reverse(),
      budget.maxHistoryTurns,
      (_message, index) => ({
        kind: "history" as const,
        ref: String(history.length - 1 - index),
        reason: "turn_limit" as const,
      }),
      dropped,
    ).reverse();

    // --- fit history within the token budget, newest first ----------------
    const keptHistory: ChatMessage[] = [];
    for (let i = historyLimited.length - 1; i >= 0; i--) {
      const message = historyLimited[i]!;
      const cost = messageTokens(message);

      if (used + cost > maxTokens) {
        dropped.push({
          kind: "history",
          ref: String(history.indexOf(message)),
          reason: "token_budget",
        });
        continue;
      }

      used += cost;
      keptHistory.unshift(message);
    }

    // --- fit memories within what remains ---------------------------------
    const keptMemories: RecalledMemory[] = [];
    for (const memory of memories) {
      const cost = estimateTokens(memory.content) + 8;

      if (used + cost > maxTokens) {
        dropped.push({ kind: "memory", ref: memory.id, reason: "token_budget" });
        continue;
      }

      used += cost;
      keptMemories.push(memory);
    }

    // --- render -----------------------------------------------------------
    const messages: ChatMessage[] = [system];

    if (keptMemories.length > 0) {
      // A separate system turn rather than appended to the instruction, so the
      // instruction stays byte-identical across runs and stays diffable.
      messages.push({
        role: "system",
        content: `Relevant context from memory:\n${keptMemories
          .map((memory) => `- ${memory.content}`)
          .join("\n")}`,
      });
    }

    messages.push(...keptHistory);
    if (user) messages.push(user);

    return {
      messages,
      tokenEstimate: used,
      included: {
        historyTurns: keptHistory.length,
        memories: keptMemories.length,
        tools: request.tools?.length ?? 0,
      },
      dropped,
      memoryRefs: keptMemories.map((memory): MemoryRef => ({
        id: memory.id,
        namespace: memory.namespace,
        score: memory.score,
        preview: memory.content.slice(0, 120),
      })),
    };
  }

  /** Trims to `limit`, recording what was removed. */
  private applyCountLimit<T>(
    items: T[],
    limit: number | undefined,
    describe: (item: T, index: number) => DroppedItem,
    dropped: DroppedItem[],
  ): T[] {
    if (limit === undefined || items.length <= limit) return items;

    items.slice(limit).forEach((item, offset) => dropped.push(describe(item, limit + offset)));
    return items.slice(0, limit);
  }
}
