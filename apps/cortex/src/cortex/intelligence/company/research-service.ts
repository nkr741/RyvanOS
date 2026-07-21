import { complete } from "@/lib/llm";
import { createLogger } from "@/lib/logger";

const log = createLogger("research-service");

const SERPER_URL = "https://google.serper.dev/search";

export interface ResearchQuery {
  topic: string;
  companyName: string;
  website?: string;
  context?: string;
}

export interface ResearchFinding {
  type: string;
  value: string;
  content: string;
  confidence: number;
  source: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

const EXTRACTION_SYSTEM = `You are a company intelligence analyst for Ryvan Technologies.
Your job is to extract structured evidence from raw text about a company.

RULES:
- Only report what you can directly observe or infer from the provided text
- Every finding must include the exact text that supports it
- Assign confidence 90+ only when evidence is explicit and unambiguous
- Assign confidence 70-89 when evidence is strong but requires minor inference
- Assign confidence 50-69 when evidence is indirect or implied
- Never fabricate evidence — if the text doesn't support a finding, don't report it
- Return valid JSON only, no markdown fences`;

async function webSearch(query: string, limit: number = 10): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    log.warn("SERPER_API_KEY not set — web search unavailable");
    return [];
  }

  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: limit, gl: "in", hl: "en" }),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "serper search failed");
      return [];
    }
    const data = await res.json();
    const organic = (data.organic || []) as Array<{ title?: string; link?: string; snippet?: string }>;
    return organic.map((r) => ({
      title: r.title || "",
      link: r.link || "",
      snippet: r.snippet || "",
    }));
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : err }, "web search error");
    return [];
  }
}

async function extractEvidence(
  systemPrompt: string,
  rawContent: string,
  correlationId?: string,
): Promise<ResearchFinding[]> {
  const result = await complete(
    `${EXTRACTION_SYSTEM}\n\n${systemPrompt}`,
    rawContent,
    { temperature: 0.2, maxTokens: 2000, json: true, correlationId },
  );
  if (!result) return [];

  try {
    const parsed = JSON.parse(result);
    const findings: unknown[] = Array.isArray(parsed) ? parsed : parsed.findings || parsed.evidence || [];
    return findings
      .filter((f): f is Record<string, unknown> => f !== null && typeof f === "object")
      .map((f) => ({
        type: String(f.type || "unknown"),
        value: String(f.value || ""),
        content: String(f.content || f.evidence || ""),
        confidence: clamp(Number(f.confidence) || 50, 0, 100),
        source: String(f.source || "ai_extraction"),
        sourceUrl: f.sourceUrl ? String(f.sourceUrl) : undefined,
        metadata: typeof f.metadata === "object" && f.metadata !== null ? f.metadata as Record<string, unknown> : undefined,
      }))
      .filter((f) => f.value.length > 0 && f.content.length > 0);
  } catch {
    log.warn("failed to parse LLM evidence extraction response");
    return [];
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export const researchService = {
  webSearch,
  extractEvidence,
};
