import { describe, expect, it, vi } from "vitest";
import { AnthropicAdapter } from "./anthropic.js";
import type { ModelConfig, ModelRequest } from "../types.js";

const config: ModelConfig = {
  id: "claude-haiku-4-5",
  provider: "anthropic",
  name: "claude-haiku-4-5",
  contextWindow: 200_000,
  maxOutputTokens: 8192,
  inputPricePerToken: 0.000001,
  outputPricePerToken: 0.000005,
  capabilities: ["text", "function_calling"],
  isLocal: false,
};

/** A client whose response and captured request the test controls. */
function fakeClient(response: Partial<Parameters<typeof reply>[0]> = {}) {
  const captured: Record<string, unknown>[] = [];

  const client = {
    messages: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        captured.push(params);
        return reply(response);
      }),
    },
  };

  return { client, captured };
}

function reply(
  overrides: {
    id?: string;
    content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
    stop_reason?: string | null;
    usage?: { input_tokens: number; output_tokens: number };
  } = {},
) {
  return {
    id: overrides.id ?? "msg_1",
    content: overrides.content ?? [{ type: "text", text: "hello" }],
    stop_reason: overrides.stop_reason ?? "end_turn",
    usage: overrides.usage ?? { input_tokens: 100, output_tokens: 20 },
  };
}

const request = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  messages: [{ role: "user", content: "hi" }],
  ...overrides,
});

describe("AnthropicAdapter", () => {
  it("returns content, usage and cost", async () => {
    const { client } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    const response = await adapter.chat(request(), config);

    expect(response.content).toBe("hello");
    expect(response.finishReason).toBe("stop");
    expect(response.usage.totalTokens).toBe(120);
    // 100 × 0.000001 + 20 × 0.000005
    expect(response.usage.estimatedCost).toBeCloseTo(0.0002, 10);
  });

  it("lifts system messages out of the conversation", async () => {
    const { client, captured } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    await adapter.chat(
      request({
        messages: [
          { role: "system", content: "You are precise." },
          { role: "system", content: "Answer briefly." },
          { role: "user", content: "hi" },
        ],
      }),
      config,
    );

    // Anthropic takes system as a top-level field, not a message.
    expect(captured[0]!.system).toBe("You are precise.\n\nAnswer briefly.");
    expect(captured[0]!.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("converts assistant tool calls into tool_use blocks", async () => {
    const { client, captured } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    await adapter.chat(
      request({
        messages: [
          { role: "user", content: "look it up" },
          {
            role: "assistant",
            content: "checking",
            toolCalls: [{ id: "call_1", name: "search", arguments: '{"q":"x"}' }],
          },
        ],
      }),
      config,
    );

    const turns = captured[0]!.messages as { role: string; content: unknown }[];
    expect(turns[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "checking" },
        { type: "tool_use", id: "call_1", name: "search", input: { q: "x" } },
      ],
    });
  });

  it("merges consecutive tool results into one user turn", async () => {
    const { client, captured } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    await adapter.chat(
      request({
        messages: [
          { role: "assistant", content: "", toolCalls: [{ id: "a", name: "t", arguments: "{}" }] },
          { role: "tool", content: "first", toolCallId: "a" },
          { role: "tool", content: "second", toolCallId: "b" },
        ],
      }),
      config,
    );

    const turns = captured[0]!.messages as { role: string; content: unknown[] }[];
    const results = turns[turns.length - 1]!;

    expect(results.role).toBe("user");
    expect(results.content).toHaveLength(2);
  });

  it("does not append a tool result onto a plain-text user turn", async () => {
    const { client, captured } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    await adapter.chat(
      request({
        messages: [
          { role: "user", content: "plain text" },
          { role: "tool", content: "result", toolCallId: "a" },
        ],
      }),
      config,
    );

    const turns = captured[0]!.messages as { role: string; content: unknown }[];

    // Clobbering the user's text with a block array would lose their message.
    expect(turns).toHaveLength(2);
    expect(turns[0]!.content).toBe("plain text");
    expect(Array.isArray(turns[1]!.content)).toBe(true);
  });

  it("extracts tool calls from the response", async () => {
    const { client } = fakeClient({
      content: [
        { type: "text", text: "calling" },
        { type: "tool_use", id: "call_1", name: "search", input: { q: "x" } },
      ],
      stop_reason: "tool_use",
    });

    const response = await new AnthropicAdapter({ client }).chat(request(), config);

    expect(response.finishReason).toBe("tool_calls");
    expect(response.toolCalls).toEqual([{ id: "call_1", name: "search", arguments: '{"q":"x"}' }]);
  });

  it("maps stop reasons", async () => {
    for (const [stop, expected] of [
      ["end_turn", "stop"],
      ["max_tokens", "length"],
      ["tool_use", "tool_calls"],
      [null, "stop"],
    ] as const) {
      const { client } = fakeClient({ stop_reason: stop });
      const response = await new AnthropicAdapter({ client }).chat(request(), config);
      expect(response.finishReason).toBe(expected);
    }
  });

  it("omits toolCalls entirely when there are none", async () => {
    const { client } = fakeClient();

    expect(
      (await new AnthropicAdapter({ client }).chat(request(), config)).toolCalls,
    ).toBeUndefined();
  });

  it("sends a valid conversation even when given no messages", async () => {
    const { client, captured } = fakeClient();

    await new AnthropicAdapter({ client }).chat(request({ messages: [] }), config);

    // The API rejects an empty conversation; this must not surface as an
    // unhandled exception three layers up.
    expect(captured[0]!.messages).toEqual([{ role: "user", content: "" }]);
  });

  it("names the tool when its arguments are not valid JSON", async () => {
    const { client } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    await expect(
      adapter.chat(
        request({
          messages: [
            {
              role: "assistant",
              content: "",
              toolCalls: [{ id: "a", name: "search", arguments: "{not json" }],
            },
          ],
        }),
        config,
      ),
    ).rejects.toThrow(/search/);
  });

  it("passes tools through with an object schema", async () => {
    const { client, captured } = fakeClient();

    await new AnthropicAdapter({ client }).chat(
      request({
        tools: [{ name: "search", description: "Searches", parameters: { properties: {} } }],
      }),
      config,
    );

    expect(captured[0]!.tools).toEqual([
      {
        name: "search",
        description: "Searches",
        input_schema: { type: "object", properties: {} },
      },
    ]);
  });

  it("publishes its model catalogue defensively", () => {
    const adapter = new AnthropicAdapter();
    const models = adapter.listModels();

    models[0]!.inputPricePerToken = 999;

    // A caller mutating the returned catalogue must not corrupt pricing that
    // budget enforcement depends on.
    expect(adapter.listModels()[0]!.inputPricePerToken).not.toBe(999);
  });

  it("accepts an overridden catalogue", () => {
    const custom: ModelConfig = { ...config, id: "private-model" };

    expect(new AnthropicAdapter({ models: [custom] }).listModels()).toHaveLength(1);
  });

  it("requires an injected api key rather than reading the environment", async () => {
    const adapter = new AnthropicAdapter();

    // Article 7: configuration is injected, never read.
    await expect(adapter.chat(request(), config)).rejects.toThrow(/apiKey is required/);
  });

  it("reports health without calling the model", async () => {
    const { client } = fakeClient();
    const adapter = new AnthropicAdapter({ client });

    const health = await adapter.healthCheck();

    expect(health.healthy).toBe(true);
    // A probe every 30s that bills a completion is ~2,900 calls/day/replica to
    // answer a question the model is not needed for.
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("reports unhealthy when no client can be built", async () => {
    expect((await new AnthropicAdapter().healthCheck()).healthy).toBe(false);
  });
});
