import Anthropic from "@anthropic-ai/sdk";
import type { ModelProviderAdapter, ModelConfig, ModelRequest, ModelResponse } from "@ryvan/models";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export class AnthropicAdapter implements ModelProviderAdapter {
  readonly provider = "anthropic" as const;

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: ANTHROPIC_API_KEY,
        timeout: 120_000,
      });
    }
    return this.client;
  }

  async chat(request: ModelRequest, config: ModelConfig): Promise<ModelResponse> {
    const client = this.getClient();

    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const turns: Anthropic.MessageParam[] = [];
    for (const m of request.messages) {
      if (m.role === "system") continue;

      if (m.role === "assistant" && m.toolCalls?.length) {
        const content: Anthropic.ContentBlockParam[] = [];
        if (m.content) {
          content.push({ type: "text", text: m.content });
        }
        for (const tc of m.toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
        turns.push({ role: "assistant", content });
      } else if (m.role === "tool") {
        const lastTurn = turns[turns.length - 1];
        if (lastTurn?.role === "user" && Array.isArray(lastTurn.content)) {
          (lastTurn.content as Anthropic.ToolResultBlockParam[]).push({
            type: "tool_result",
            tool_use_id: m.toolCallId!,
            content: m.content,
          });
        } else {
          turns.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.toolCallId!,
                content: m.content,
              },
            ],
          });
        }
      } else {
        turns.push({
          role: m.role as "user" | "assistant",
          content: m.content,
        });
      }
    }

    const anthropicTools: Anthropic.Tool[] | undefined = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object" as const,
        ...(t.parameters as Record<string, unknown>),
      },
    }));

    const startTime = performance.now();

    const res = await client.messages.create({
      model: config.name,
      max_tokens: request.maxTokens ?? config.maxOutputTokens,
      temperature: request.temperature ?? 0.4,
      ...(system ? { system } : {}),
      ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
      messages: turns.length ? turns : [{ role: "user" as const, content: "" }],
    });

    const latencyMs = Math.round(performance.now() - startTime);

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const toolCalls = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({
        id: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input),
      }));

    let finishReason: ModelResponse["finishReason"];
    if (res.stop_reason === "tool_use") {
      finishReason = "tool_calls";
    } else if (res.stop_reason === "max_tokens") {
      finishReason = "length";
    } else {
      finishReason = "stop";
    }

    return {
      id: res.id,
      model: config.id,
      provider: "anthropic",
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        totalTokens: res.usage.input_tokens + res.usage.output_tokens,
        estimatedCost:
          res.usage.input_tokens * config.inputPricePerToken +
          res.usage.output_tokens * config.outputPricePerToken,
      },
      latencyMs,
    };
  }

  listModels(): ModelConfig[] {
    return [
      {
        id: "claude-haiku-4-5",
        provider: "anthropic",
        name: "claude-haiku-4-5",
        contextWindow: 200_000,
        maxOutputTokens: 8192,
        inputPricePerToken: 0.000001,
        outputPricePerToken: 0.000005,
        capabilities: ["text", "vision", "code", "function_calling"],
        isLocal: false,
      },
      {
        id: "claude-sonnet-4-5",
        provider: "anthropic",
        name: "claude-sonnet-4-5",
        contextWindow: 200_000,
        maxOutputTokens: 8192,
        inputPricePerToken: 0.000003,
        outputPricePerToken: 0.000015,
        capabilities: ["text", "vision", "code", "reasoning", "function_calling"],
        isLocal: false,
      },
    ];
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    if (!ANTHROPIC_API_KEY) {
      return { healthy: false, latencyMs: 0 };
    }
    const start = performance.now();
    try {
      const client = this.getClient();
      await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return { healthy: true, latencyMs: Math.round(performance.now() - start) };
    } catch {
      return { healthy: false, latencyMs: Math.round(performance.now() - start) };
    }
  }
}
