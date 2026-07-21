/**
 * LLM client — AIOS adapter layer.
 *
 * Routes through @ryvan/models ModelService when AIOS is available.
 * Falls back to direct Anthropic/Ollama calls for resilience.
 *
 * API surface is UNCHANGED — callers (outreach.ts, report.ts, delegation.ts)
 * continue to import { chat, complete, isLlmAvailable } without modification.
 */

import type { ModelService, TokenUsage } from "@ryvan/models";
import { getAIOS } from "./aios";
import { createLogger } from "./logger";
import { prisma } from "./prisma";

// ─── Legacy backend (kept for fallback / Ollama dev) ───────────

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

const log = createLogger("llm");

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  correlationId?: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  model: string;
}

export async function isLlmAvailable(): Promise<boolean> {
  try {
    const models = getAIOS().container.resolve<ModelService>("models");
    if (models.status() === "running") return true;
  } catch {
    log.debug("AIOS not ready for LLM availability check");
  }

  if (ANTHROPIC_API_KEY) return true;
  try {
    const res = await fetchWithTimeout(`${OLLAMA_HOST}/api/tags`, { method: "GET" }, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string | null> {
  // Try AIOS path first
  try {
    const models = getAIOS().container.resolve<ModelService>("models");
    if (models.status() === "running") {
      return await chatViaAIOS(models, messages, opts);
    }
  } catch {
    log.debug("AIOS not available for chat, falling back to legacy");
  }

  // Legacy fallback
  if (ANTHROPIC_API_KEY) return chatViaAnthropic(messages, opts);
  return chatViaOllama(messages, opts);
}

export function complete(system: string, user: string, opts?: ChatOptions): Promise<string | null> {
  return chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    opts,
  );
}

export const llmConfig = { host: OLLAMA_HOST, model: OLLAMA_MODEL } as const;

// ─── Usage persistence ────────────────────────────────────────

async function persistUsage(
  usage: LlmUsage,
  source: string,
  correlationId?: string,
): Promise<void> {
  try {
    await prisma.llmUsageLog.create({
      data: {
        model: usage.model,
        provider: "anthropic",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost,
        latencyMs: usage.latencyMs,
        source,
        correlationId,
      },
    });
  } catch (err) {
    log.warn({ err }, "failed to persist LLM usage");
  }
}

// ─── AIOS path ─────────────────────────────────────────────────

async function chatViaAIOS(
  models: ModelService,
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<string | null> {
  const { temperature = 0.4, maxTokens = 800, correlationId } = opts;

  const startTime = performance.now();
  const response = await models.chat({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    maxTokens,
  });
  const latencyMs = Math.round(performance.now() - startTime);

  const usage: LlmUsage = {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.totalTokens,
    estimatedCost: response.usage.estimatedCost,
    latencyMs,
    model: response.model,
  };

  log.info(
    {
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.estimatedCost,
      latencyMs,
    },
    "llm call completed",
  );

  await persistUsage(usage, "chat", correlationId);

  const text = response.content.trim();
  return text.length > 0 ? text : null;
}

// ─── Legacy: Anthropic direct ──────────────────────────────────

async function chatViaAnthropic(
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<string | null> {
  const { temperature = 0.4, maxTokens = 800, timeoutMs = 120_000, correlationId } = opts;
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: timeoutMs });
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const startTime = performance.now();
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: turns.length ? turns : [{ role: "user" as const, content: "" }],
    });
    const latencyMs = Math.round(performance.now() - startTime);

    log.info(
      {
        model: ANTHROPIC_MODEL,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        latencyMs,
      },
      "llm call completed (legacy)",
    );

    await persistUsage(
      {
        model: ANTHROPIC_MODEL,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        totalTokens: res.usage.input_tokens + res.usage.output_tokens,
        estimatedCost: 0,
        latencyMs,
      },
      "chat:legacy",
      correlationId,
    );

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, "Anthropic request failed");
    return null;
  }
}

// ─── Legacy: Ollama direct ─────────────────────────────────────

async function chatViaOllama(messages: ChatMessage[], opts: ChatOptions): Promise<string | null> {
  const { temperature = 0.4, maxTokens = 800, timeoutMs = 120_000, json = false } = opts;
  try {
    const startTime = performance.now();
    const res = await fetchWithTimeout(
      `${OLLAMA_HOST}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
          ...(json ? { format: "json" } : {}),
          options: { temperature, num_predict: maxTokens },
        }),
      },
      timeoutMs,
    );
    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      log.error({ status: res.status, body: await safeText(res) }, "Ollama error response");
      return null;
    }
    const data = (await res.json()) as { message?: { content?: string } };

    log.info({ model: OLLAMA_MODEL, latencyMs }, "llm call completed (ollama)");

    const content = data.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, "Ollama request failed");
    return null;
  }
}

// ─── internals ─────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
