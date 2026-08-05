import type { ChatMessage } from "@ryvan/contracts";
import { describe, expect, it } from "vitest";
import { NaiveContextAssembler, estimateTokens } from "./naive-assembler.js";
import type { RecalledMemory } from "./types.js";

const assembler = new NaiveContextAssembler();

const memory = (id: string, content: string, score = 0.5): RecalledMemory => ({
  id,
  namespace: "acme",
  content,
  score,
});

const turn = (role: ChatMessage["role"], content: string): ChatMessage => ({ role, content });

describe("estimateTokens", () => {
  it("approximates four characters per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("never reports zero for non-empty text", () => {
    expect(estimateTokens("a")).toBe(1);
  });
});

describe("NaiveContextAssembler", () => {
  it("always includes the instruction", async () => {
    const context = await assembler.assemble({ instruction: "Summarise payroll." });

    expect(context.messages[0]).toEqual({ role: "system", content: "Summarise payroll." });
  });

  it("refuses to assemble without an instruction", async () => {
    // An agent with no instruction is a bug, not an empty context.
    await expect(assembler.assemble({ instruction: "" })).rejects.toThrow();
  });

  it("renders input as the final user turn", async () => {
    const context = await assembler.assemble({
      instruction: "Do the thing.",
      input: { month: 7 },
    });

    const last = context.messages[context.messages.length - 1]!;
    expect(last.role).toBe("user");
    expect(last.content).toContain('"month": 7');
  });

  it("orders history oldest first, before the current input", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      input: { now: true },
      history: [turn("user", "first"), turn("assistant", "second")],
    });

    expect(context.messages.map((m) => m.content)).toEqual([
      "i",
      "first",
      "second",
      JSON.stringify({ now: true }, null, 2),
    ]);
  });

  it("is deterministic — the same request assembles identically", async () => {
    const request = {
      instruction: "i",
      input: { a: 1 },
      history: [turn("user", "x")],
      memories: [memory("m1", "alpha", 0.9), memory("m2", "beta", 0.4)],
    };

    // Evaluation compares runs; if assembly varies, it compares runs that
    // differed for a reason nobody recorded.
    const first = await assembler.assemble(request);
    const second = await assembler.assemble(request);

    expect(first).toEqual(second);
  });

  it("orders memories by score, highest first", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      memories: [memory("low", "low", 0.1), memory("high", "high", 0.9)],
    });

    expect(context.memoryRefs.map((ref) => ref.id)).toEqual(["high", "low"]);
  });

  it("puts memories in their own system turn, leaving the instruction untouched", async () => {
    const context = await assembler.assemble({
      instruction: "Exact instruction.",
      memories: [memory("m1", "a fact")],
    });

    // The instruction stays byte-identical across runs, so it stays diffable.
    expect(context.messages[0]!.content).toBe("Exact instruction.");
    expect(context.messages[1]!.content).toContain("a fact");
  });

  it("omits the memory turn entirely when nothing was recalled", async () => {
    const context = await assembler.assemble({ instruction: "i" });

    expect(context.messages).toHaveLength(1);
    expect(context.included.memories).toBe(0);
  });

  it("keeps the most recent turns when a turn limit binds", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      history: [turn("user", "oldest"), turn("user", "middle"), turn("user", "newest")],
      budget: { maxHistoryTurns: 2 },
    });

    expect(context.messages.map((m) => m.content)).toEqual(["i", "middle", "newest"]);
    expect(context.included.historyTurns).toBe(2);
  });

  it("keeps the highest-scored memories when a memory limit binds", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      memories: [memory("a", "a", 0.1), memory("b", "b", 0.9), memory("c", "c", 0.5)],
      budget: { maxMemories: 2 },
    });

    expect(context.memoryRefs.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("reports every drop, with its reason", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      history: [turn("user", "a"), turn("user", "b"), turn("user", "c")],
      memories: [memory("m1", "x"), memory("m2", "y")],
      budget: { maxHistoryTurns: 1, maxMemories: 1 },
    });

    // Silent loss produces a wrong answer that looks like a reasoning failure,
    // and nobody can tell the difference afterwards.
    expect(context.dropped).toEqual(
      expect.arrayContaining([
        { kind: "history", ref: expect.any(String), reason: "turn_limit" },
        { kind: "memory", ref: "m2", reason: "memory_limit" },
      ]),
    );
    expect(context.dropped).toHaveLength(3);
  });

  it("drops memories before history when the token budget binds", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      history: [turn("user", "keep me")],
      memories: [memory("big", "x".repeat(4000))],
      budget: { maxTokens: 60 },
    });

    // History outranks memory: the conversation is the task, memory is support.
    expect(context.included.historyTurns).toBe(1);
    expect(context.included.memories).toBe(0);
    expect(context.dropped).toContainEqual({
      kind: "memory",
      ref: "big",
      reason: "token_budget",
    });
  });

  it("keeps newer turns over older ones when the token budget binds", async () => {
    // instruction 5 + "recent" 6 = 11 used; the 400-char turn costs 104 more,
    // so a 100-token budget admits the newer turn and excludes the older one.
    const context = await assembler.assemble({
      instruction: "i",
      history: [turn("user", "x".repeat(400)), turn("user", "recent")],
      budget: { maxTokens: 100 },
    });

    expect(context.messages.map((m) => m.content)).toEqual(["i", "recent"]);
    expect(context.dropped).toContainEqual({
      kind: "history",
      ref: "0",
      reason: "token_budget",
    });
  });

  it("never drops the instruction, even past the budget", async () => {
    const context = await assembler.assemble({
      instruction: "x".repeat(4000),
      history: [turn("user", "dropped")],
      budget: { maxTokens: 10 },
    });

    // Better to exceed the budget than to send an agent with no task.
    expect(context.messages[0]!.content).toHaveLength(4000);
    expect(context.tokenEstimate).toBeGreaterThan(10);
  });

  it("produces memory references suitable for a trace", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      memories: [memory("m1", "y".repeat(300), 0.7)],
    });

    // References, not content: a trace must not become a second, unaudited
    // copy of the memory store.
    expect(context.memoryRefs[0]).toEqual({
      id: "m1",
      namespace: "acme",
      score: 0.7,
      preview: "y".repeat(120),
    });
  });

  it("counts tools without rendering them into messages", async () => {
    const context = await assembler.assemble({
      instruction: "i",
      tools: [{ name: "search", description: "Searches", parameters: {} }],
    });

    // Tools go to the provider as a separate field, not as prose.
    expect(context.included.tools).toBe(1);
    expect(context.messages).toHaveLength(1);
  });

  it("applies a default budget supplied at construction", async () => {
    const strict = new NaiveContextAssembler({ maxHistoryTurns: 1 });

    const context = await strict.assemble({
      instruction: "i",
      history: [turn("user", "a"), turn("user", "b")],
    });

    expect(context.included.historyTurns).toBe(1);
  });

  it("lets a request override the default budget", async () => {
    const strict = new NaiveContextAssembler({ maxHistoryTurns: 1 });

    const context = await strict.assemble({
      instruction: "i",
      history: [turn("user", "a"), turn("user", "b")],
      budget: { maxHistoryTurns: 5 },
    });

    expect(context.included.historyTurns).toBe(2);
  });
});
