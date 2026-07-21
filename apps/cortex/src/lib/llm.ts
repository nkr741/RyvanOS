/**
 * LLM client — AIOS adapter layer.
 *
 * Routes through @ryvan/models ModelService when AIOS is available.
 * Falls back to direct Anthropic/Ollama calls for resilience.
 *
 * API surface is UNCHANGED — callers (outreach.ts, report.ts, delegation.ts)
 * continue to import { chat, complete, isLlmAvailable } without modification.
 */

import type { ModelService } from "@ryvan/models";
import { getAIOS } from "./aios";

// ─── Legacy backend (kept for fallback / Ollama dev) ───────────

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
}

export async function isLlmAvailable(): Promise<boolean> {
  try {
    const models = getAIOS().container.resolve<ModelService>("models");
    if (models.status() === "running") return true;
  } catch {
    // AIOS not ready — fall through to legacy check
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
    // AIOS not available — fall through to legacy
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

// ─── AIOS path ─────────────────────────────────────────────────

async function chatViaAIOS(
  models: ModelService,
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<string | null> {
  const { temperature = 0.4, maxTokens = 800 } = opts;

  const response = await models.chat({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    maxTokens,
  });

  const text = response.content.trim();
  return text.length > 0 ? text : null;
}

// ─── Legacy: Anthropic direct ──────────────────────────────────

async function chatViaAnthropic(
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<string | null> {
  const { temperature = 0.4, maxTokens = 800, timeoutMs = 120_000 } = opts;
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: timeoutMs });
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: turns.length ? turns : [{ role: "user" as const, content: "" }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.error("[llm] Anthropic request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Legacy: Ollama direct ─────────────────────────────────────

async function chatViaOllama(messages: ChatMessage[], opts: ChatOptions): Promise<string | null> {
  const { temperature = 0.4, maxTokens = 800, timeoutMs = 120_000, json = false } = opts;
  try {
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
    if (!res.ok) {
      console.error(`[llm] Ollama responded ${res.status}: ${await safeText(res)}`);
      return null;
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch (err) {
    console.error("[llm] Ollama request failed:", err instanceof Error ? err.message : err);
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
