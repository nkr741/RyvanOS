import { ModelError } from "@ryvan/common";
import type {
  ChatMessage,
  ModelConfig,
  ModelProviderAdapter,
  ModelRequest,
  ModelResponse,
} from "../types.js";

/**
 * The slice of `@anthropic-ai/sdk` this adapter uses.
 *
 * Typed structurally so `@ryvan/models` builds and tests without the SDK
 * installed — it is an optional peer dependency, needed only by deployments
 * that actually route to Anthropic. The same arrangement `@ryvan/storage` uses
 * for `pg` and `ioredis`.
 */
interface AnthropicMessagesClient {
  messages: {
    create(params: Record<string, unknown>): Promise<AnthropicResponse>;
  };
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicAdapterOptions {
  /**
   * Injected, never read from the environment (Constitution Article 7).
   * A package reaching for `process.env` cannot be tested twice with different
   * settings, nor embedded in a product that configures things differently.
   */
  apiKey?: string;
  timeoutMs?: number;
  /** Supply a client directly — used by tests, and by callers with their own. */
  client?: AnthropicMessagesClient;
  /** Overrides the built-in catalogue, for pinned or private model ids. */
  models?: ModelConfig[];
}

/**
 * Anthropic's published catalogue.
 *
 * Prices are per token and will drift. They are here rather than fetched
 * because cost enforcement must work offline and in air-gapped installs —
 * a budget that silently stops enforcing when a pricing endpoint is
 * unreachable is worse than no budget.
 */
const DEFAULT_MODELS: ModelConfig[] = [
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

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Anthropic provider adapter.
 *
 * Platform-owned per `OWNERSHIP_MATRIX.md` §7.1: a provider adapter passes
 * every boundary test, so a product shipping its own is a product
 * reimplementing the platform. Products register *credentials*, never adapters.
 */
export class AnthropicAdapter implements ModelProviderAdapter {
  readonly provider = "anthropic" as const;

  private readonly options: AnthropicAdapterOptions;
  private readonly models: ModelConfig[];
  private client?: AnthropicMessagesClient;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.options = options;
    this.models = options.models ?? DEFAULT_MODELS;
    this.client = options.client;
  }

  listModels(): ModelConfig[] {
    return this.models.map((model) => ({ ...model }));
  }

  async chat(request: ModelRequest, config: ModelConfig): Promise<ModelResponse> {
    const client = await this.getClient();
    const { system, turns } = this.toAnthropicMessages(request.messages);

    const tools = request.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: { type: "object" as const, ...tool.parameters },
    }));

    const startedAt = performance.now();

    const response = await client.messages.create({
      model: config.name,
      max_tokens: request.maxTokens ?? config.maxOutputTokens,
      temperature: request.temperature ?? 0.4,
      ...(system ? { system } : {}),
      ...(tools?.length ? { tools } : {}),
      // The API rejects an empty conversation; an empty user turn is the
      // closest valid equivalent and keeps a malformed request from becoming
      // an unhandled exception three layers up.
      messages: turns.length > 0 ? turns : [{ role: "user", content: "" }],
    });

    const latencyMs = Math.round(performance.now() - startedAt);

    const content = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    const toolCalls = response.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id!,
        name: block.name!,
        arguments: JSON.stringify(block.input ?? {}),
      }));

    return {
      id: response.id,
      model: config.id,
      provider: "anthropic",
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: this.toFinishReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        estimatedCost:
          response.usage.input_tokens * config.inputPricePerToken +
          response.usage.output_tokens * config.outputPricePerToken,
      },
      latencyMs,
    };
  }

  /**
   * Reports reachability without calling the model.
   *
   * The previous implementation sent a real one-token completion on every
   * probe. At a thirty-second health interval that is ~2,900 billed calls a
   * day per replica, to answer a question that does not need the model — so
   * this checks only that a client can be constructed.
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const startedAt = performance.now();

    try {
      await this.getClient();
      return { healthy: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { healthy: false, latencyMs: Math.round(performance.now() - startedAt) };
    }
  }

  // --- internals ------------------------------------------------------------

  /**
   * Converts platform messages into Anthropic's shape.
   *
   * Two structural differences have to be reconciled: system prompts are a
   * top-level field rather than a message, and tool results are user-turn
   * content blocks rather than a role of their own.
   */
  private toAnthropicMessages(messages: ChatMessage[]): {
    system: string;
    turns: { role: "user" | "assistant"; content: unknown }[];
  } {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const turns: { role: "user" | "assistant"; content: unknown }[] = [];

    for (const message of messages) {
      if (message.role === "system") continue;

      if (message.role === "assistant" && message.toolCalls?.length) {
        const blocks: Record<string, unknown>[] = [];
        if (message.content) {
          blocks.push({ type: "text", text: message.content });
        }

        for (const call of message.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: this.parseArguments(call.arguments, call.name),
          });
        }

        turns.push({ role: "assistant", content: blocks });
        continue;
      }

      if (message.role === "tool") {
        const result = {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
        };

        // Consecutive tool results belong in one user turn. Appending only
        // when the previous turn is already a block array avoids clobbering a
        // plain-text user message.
        const previous = turns[turns.length - 1];
        if (previous?.role === "user" && Array.isArray(previous.content)) {
          (previous.content as Record<string, unknown>[]).push(result);
        } else {
          turns.push({ role: "user", content: [result] });
        }
        continue;
      }

      turns.push({ role: message.role as "user" | "assistant", content: message.content });
    }

    return { system, turns };
  }

  /** Tool arguments arrive as a JSON string; a malformed one names its tool. */
  private parseArguments(raw: string, toolName: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      throw new ModelError("anthropic", `tool "${toolName}" produced invalid JSON arguments`);
    }
  }

  private toFinishReason(stopReason: string | null): ModelResponse["finishReason"] {
    switch (stopReason) {
      case "tool_use":
        return "tool_calls";
      case "max_tokens":
        return "length";
      default:
        return "stop";
    }
  }

  private async getClient(): Promise<AnthropicMessagesClient> {
    if (this.client) return this.client;

    if (!this.options.apiKey) {
      throw new ModelError(
        "anthropic",
        "apiKey is required (pass it in; it is never read from the environment)",
      );
    }

    // Imported lazily so the package does not hard-depend on the SDK.
    const module = (await import("@anthropic-ai/sdk")) as unknown as {
      default?: new (config: Record<string, unknown>) => AnthropicMessagesClient;
      Anthropic?: new (config: Record<string, unknown>) => AnthropicMessagesClient;
    };

    const Anthropic = module.default ?? module.Anthropic;
    if (!Anthropic) {
      throw new ModelError("anthropic", "'@anthropic-ai/sdk' is installed but exports no client");
    }

    this.client = new Anthropic({
      apiKey: this.options.apiKey,
      timeout: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    return this.client;
  }
}
