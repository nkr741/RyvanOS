/**
 * Cortex Assistant — JARVIS, the founder's conversational agent.
 *
 * Sprint 3: Fully on AIOS infrastructure.
 * Sprint 4.3: Cost/latency persistence, structured logging.
 */

import type { ModelService, ChatMessage, ToolDefinition, TokenUsage } from "@ryvan/models";
import type { ToolService } from "@ryvan/tool-registry";
import type { MemoryManager } from "@ryvan/memory";
import type { EventBus } from "@ryvan/events";
import { getAIOS } from "@/lib/aios";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { getOrgStatus, DEPARTMENTS } from "@/cortex/org";
import { delegate, getRecentMessages, fieldActivity } from "@/cortex/org/delegation";
import { locateBde } from "@/cortex/org/field";

// ─── Legacy fallback ───────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const MAX_STEPS = 6;

const log = createLogger("assistant");

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ─── System prompt (business logic — unchanged) ────────────────

const DEPT_SUMMARY = DEPARTMENTS.map(
  (d) =>
    `- ${d.name} — led by ${d.head.name} (${d.head.title}). Team: ` +
    d.agents.map((a) => `${a.name} (${a.title})`).join(", "),
).join("\n");

const DEPT_IDS = DEPARTMENTS.map((d) => d.id);

const SYSTEM =
  `You are Cortex, the Delivery Manager (the top AI manager) for Ryvan Technologies, reporting to the founder Naveen Kumar Reddy. ` +
  `You run an org of named AI "employees" grouped into departments:\n${DEPT_SUMMARY}\n\n` +
  `Refer to your people by name (e.g. "Aarav is on it", "Diya found 8 companies") — they are named employees, not job slots.\n\n` +
  `Ryvan also has HUMAN field staff (BDEs) who run vendor/rider surveys on the ground. They are people, not your agents — you ` +
  `report on them to the founder, you do not task them. Use locate_bde when the founder asks where someone is or what they are ` +
  `doing (it returns their area, today's surveys, and whether the GPS corroborates them), and get_field_activity for the whole ` +
  `team. Report a location as the area name, then what they surveyed.\n` +
  `When integrity flags come back, state them factually and say what would explain them innocently — a flag means the evidence ` +
  `is missing, NOT that the person cheated. Never accuse a named employee of fraud; give the founder the gap and let him judge.\n\n` +
  `You break the founder's goals into work, oversee the departments, and report status back — like a real IT delivery manager. ` +
  `The Growth & Sales department is fully operational (the autonomous AI-SDR: QA prospects = software/SaaS companies to sell QA ` +
  `automation to; partner firms = IT-services/outsourcing companies to partner with). Delivery and Operations departments are ` +
  `staffed and ready but not yet running live client work — say so honestly if asked; do not fabricate their activity.\n\n` +
  `CHAIN OF COMMAND — this is how you work:\n` +
  `- You do NOT execute department work yourself. You have no tools to run discovery or write emails, exactly like a real ` +
  `  manager. To get work DONE (find leads, draft outreach, anything a department owns), call "delegate" with the right ` +
  `  department and a clear brief. The task goes you → department lead → agent, and the lead's report comes back up. ` +
  `  Every hop is logged.\n` +
  `- If the founder says "ask the growth team", "have marketing do X", or names any team, you MUST delegate to that ` +
  `  department — never answer from your own read-only data instead.\n` +
  `- Your read-only tools (get_stats, list_leads, get_org_status, get_comms) are your dashboard. Use them for a plain ` +
  `  status question, and to answer "who is working on what" / "what has the team been doing".\n` +
  `- When delegate returns "deliverables", that is the actual work your team produced (a post, a proposal, a briefing). ` +
  `  Show it to the founder in full — do not summarise it away. Add only a one-line note about who wrote it.\n\n` +
  `Use your tools to fetch real data or take actions — NEVER invent numbers, company names, grades, department activity, or email ` +
  `content. Be concise, direct, and action-oriented. When asked about the team/departments/a workflow, call get_org_status and ` +
  `report what's really happening. When you run discovery or draft an email, confirm what you did and the result. ` +
  `If a tool errors, explain it plainly and suggest the fix.`;

// ─── Tool definitions (AIOS format) ───────────────────────────

const isPartner = (industry: string | null) =>
  /it-services|information-technology-and-services|it-and-it-consulting|outsourc|business-process|consulting/i.test(
    industry || "",
  );

const JARVIS_TOOLS: Array<{
  definition: ToolDefinition;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}> = [
  {
    definition: {
      name: "get_org_status",
      description:
        "Status of the whole agent org: every department, its head, its agents, and what each is actively working on.",
      parameters: { properties: {}, additionalProperties: false },
    },
    handler: async () => getOrgStatus(),
  },
  {
    definition: {
      name: "get_stats",
      description:
        "Summary of the lead pipeline: total leads, breakdown by grade (A-F), QA prospects vs partner firms, and how many already have a drafted email.",
      parameters: { properties: {}, additionalProperties: false },
    },
    handler: async () => {
      const cands = await prisma.companyCandidate.findMany({
        where: { status: { notIn: ["rejected", "archived"] } },
        select: { qualificationGrade: true, industry: true, analyzedAt: true },
      });
      const byGrade: Record<string, number> = {};
      let partner = 0,
        qa = 0,
        drafted = 0;
      for (const c of cands) {
        const g = c.qualificationGrade || "?";
        byGrade[g] = (byGrade[g] || 0) + 1;
        if (isPartner(c.industry)) partner++;
        else qa++;
        if (c.analyzedAt) drafted++;
      }
      return {
        totalLeads: cands.length,
        byGrade,
        partnerFirms: partner,
        qaProspects: qa,
        withDrafts: drafted,
      };
    },
  },
  {
    definition: {
      name: "list_leads",
      description: "List discovered leads, newest first, optionally filtered by type or grade.",
      parameters: {
        properties: {
          type: {
            type: "string",
            enum: ["qa", "partner", "any"],
            description: "Filter by lead type",
          },
          grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
          limit: { type: "integer", description: "Max leads to return (default 10, max 25)" },
        },
        additionalProperties: false,
      },
    },
    handler: async (input) => {
      const where: Record<string, unknown> = { status: { notIn: ["rejected", "archived"] } };
      if (typeof input.grade === "string") where.qualificationGrade = input.grade;
      const cands = await prisma.companyCandidate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(input.limit) || 10, 25),
        select: {
          companyName: true,
          industry: true,
          qualificationGrade: true,
          qualificationScore: true,
          website: true,
          location: true,
          analyzedAt: true,
        },
      });
      let list = cands.map(
        (c: {
          companyName: string;
          industry: string | null;
          qualificationGrade: string | null;
          qualificationScore: number | null;
          website: string | null;
          location: string | null;
          analyzedAt: Date | null;
        }) => ({
          name: c.companyName,
          grade: c.qualificationGrade,
          score: c.qualificationScore,
          type: isPartner(c.industry) ? "partner" : "qa",
          website: c.website,
          location: c.location,
          hasDraft: !!c.analyzedAt,
        }),
      );
      if (input.type === "qa" || input.type === "partner")
        list = list.filter((l: { type: string }) => l.type === input.type);
      return { count: list.length, leads: list };
    },
  },
  {
    definition: {
      name: "delegate",
      description: `Delegate a task down the chain of command to a department lead. Departments: ${DEPARTMENTS.map((d) => `${d.id} = ${d.name}`).join("; ")}.`,
      parameters: {
        properties: {
          department: {
            type: "string",
            enum: DEPT_IDS,
            description: "Department id to delegate to",
          },
          task: {
            type: "string",
            description: "The task, written as you would brief a human department lead",
          },
        },
        required: ["department", "task"],
        additionalProperties: false,
      },
    },
    handler: async (input) => {
      const dept = DEPARTMENTS.find((d) => d.id === input.department);
      if (!dept)
        return { error: `No department "${input.department}". Valid: ${DEPT_IDS.join(", ")}` };
      const run = await delegate(String(input.department), String(input.task));
      return {
        delegatedTo: `${dept.head.name} (${dept.head.title})`,
        department: dept.name,
        reportBack: run.report,
        deliverables: run.artifacts,
      };
    },
  },
  {
    definition: {
      name: "locate_bde",
      description:
        "Where a specific BDE is right now (area + coordinates), today's surveys, and GPS corroboration.",
      parameters: {
        properties: {
          name: { type: "string", description: "BDE name or part of it" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    handler: async (input) => locateBde(String(input.name)),
  },
  {
    definition: {
      name: "get_field_activity",
      description:
        "What the human field team (BDEs) has been doing: surveys, calls/visits, daily reports, and who has gone quiet.",
      parameters: {
        properties: {
          days: { type: "integer", description: "Look-back window in days (default 7)" },
        },
        additionalProperties: false,
      },
    },
    handler: async (input) => fieldActivity(Number(input.days) || 7),
  },
  {
    definition: {
      name: "get_comms",
      description: "Recent chain-of-command messages between agents (assignments and reports).",
      parameters: {
        properties: {
          limit: { type: "integer", description: "How many messages (default 20, max 50)" },
        },
        additionalProperties: false,
      },
    },
    handler: async (input) => {
      const msgs = await getRecentMessages(Math.min(Number(input.limit) || 20, 50));
      return {
        count: msgs.length,
        messages: msgs.map((m: Awaited<ReturnType<typeof getRecentMessages>>[number]) => ({
          at: m.createdAt.toISOString(),
          from: m.fromAgent,
          to: m.toAgent,
          direction: m.direction,
          department: m.department,
          content: m.content.slice(0, 300),
        })),
      };
    },
  },
];

// ─── AIOS tool registration ───────────────────────────────────

let toolsRegistered = false;

function ensureToolsRegistered(toolService: ToolService): void {
  if (toolsRegistered) return;
  toolsRegistered = true;

  for (const t of JARVIS_TOOLS) {
    try {
      toolService.register(
        {
          name: t.definition.name,
          description: t.definition.description,
          version: "1.0",
          category: "jarvis",
          parameters: [],
          returns: { type: "object", description: "Tool result" },
          permissions: [],
          timeout: 60000,
          retryable: false,
        },
        async (ctx) => {
          const startTime = performance.now();
          const result = await t.handler(ctx.input);
          return {
            success: true,
            output: result,
            executionTimeMs: Math.round(performance.now() - startTime),
          };
        },
      );
    } catch {
      // Already registered — skip
    }
  }
}

// ─── Tool handler map (for direct execution in the loop) ──────

const toolHandlers = new Map(JARVIS_TOOLS.map((t) => [t.definition.name, t.handler]));

// ─── Main entry point ─────────────────────────────────────────

export async function chatWithAssistant(history: ChatTurn[]): Promise<string> {
  try {
    const platform = getAIOS();
    const models = platform.container.resolve<ModelService>("models");
    if (models.status() === "running") {
      return await chatViaAIOS(history);
    }
  } catch {
    // AIOS not available — fall through to legacy
  }

  return chatViaLegacy(history);
}

// ─── AIOS path (Sprint 3 + Sprint 4.3 cost tracking) ─────────

async function chatViaAIOS(history: ChatTurn[]): Promise<string> {
  const platform = getAIOS();
  const models = platform.container.resolve<ModelService>("models");
  const toolService = platform.container.resolve<ToolService>("tools");
  const memory = platform.container.resolve<MemoryManager>("memory");
  const eventBus = platform.container.resolve<EventBus>("events");

  ensureToolsRegistered(toolService);

  const totalStart = performance.now();
  let modelTimeMs = 0;
  let toolTimeMs = 0;
  let toolCallCount = 0;

  // Accumulate usage across all model calls in this turn
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  const userMessage = history[history.length - 1]?.content || "";
  await eventBus.emit(
    "assistant:query",
    {
      userMessage: userMessage.slice(0, 200),
      historyLength: history.length,
    },
    { source: "jarvis" },
  );

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    ...history
      .filter((t) => t.content?.trim())
      .map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
  ];

  const modelTools: ToolDefinition[] = JARVIS_TOOLS.map((t) => t.definition);

  for (let step = 0; step < MAX_STEPS; step++) {
    const modelStart = performance.now();
    const response = await models.chat({
      model: MODEL,
      messages,
      tools: modelTools,
      maxTokens: 1024,
      temperature: 0.4,
    });
    const modelElapsed = performance.now() - modelStart;
    modelTimeMs += modelElapsed;

    // Accumulate cost
    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;
    totalCostUsd += response.usage.estimatedCost;

    log.info(
      {
        step: step + 1,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.estimatedCost,
        latencyMs: Math.round(modelElapsed),
      },
      "assistant model call",
    );

    // Persist each model call's usage
    await persistAssistantUsage(response.usage, Math.round(modelElapsed), response.model);

    if (response.finishReason !== "tool_calls" || !response.toolCalls?.length) {
      const text = response.content.trim();
      const reply = text || "(no reply)";

      await memory.store(
        "conversation",
        "jarvis",
        `turn-${Date.now()}`,
        JSON.stringify({
          user: userMessage.slice(0, 500),
          assistant: reply.slice(0, 500),
          toolsUsed: toolCallCount,
        }),
        { importance: 0.6 },
      );

      const totalMs = Math.round(performance.now() - totalStart);
      await eventBus.emit(
        "assistant:response",
        {
          replyLength: reply.length,
          steps: step + 1,
          toolCallCount,
          latency: {
            modelMs: Math.round(modelTimeMs),
            toolMs: Math.round(toolTimeMs),
            totalMs,
          },
          cost: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            estimatedCostUsd: totalCostUsd,
          },
        },
        { source: "jarvis" },
      );

      log.info(
        {
          totalMs,
          steps: step + 1,
          toolCallCount,
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd,
        },
        "assistant turn completed",
      );

      return reply;
    }

    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    });

    for (const tc of response.toolCalls) {
      const handler = toolHandlers.get(tc.name);
      let output: unknown;

      const toolStart = performance.now();
      try {
        if (handler) {
          const input = JSON.parse(tc.arguments);
          output = await handler(input);
        } else {
          output = { error: `Unknown tool: ${tc.name}` };
        }
      } catch (e) {
        output = { error: e instanceof Error ? e.message : "tool failed" };
        log.error(
          { tool: tc.name, err: e instanceof Error ? e.message : e },
          "tool execution failed",
        );
      }
      const toolElapsed = performance.now() - toolStart;
      toolTimeMs += toolElapsed;
      toolCallCount++;

      await eventBus.emit(
        "assistant:tool_called",
        {
          tool: tc.name,
          latencyMs: Math.round(toolElapsed),
          success: !(output && typeof output === "object" && "error" in output),
        },
        { source: "jarvis" },
      );

      messages.push({
        role: "tool",
        content: JSON.stringify(output),
        toolCallId: tc.id,
      });
    }
  }

  const totalMs = Math.round(performance.now() - totalStart);
  await eventBus.emit(
    "assistant:response",
    {
      replyLength: 0,
      steps: MAX_STEPS,
      toolCallCount,
      latency: { modelMs: Math.round(modelTimeMs), toolMs: Math.round(toolTimeMs), totalMs },
      cost: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        estimatedCostUsd: totalCostUsd,
      },
      maxStepsReached: true,
    },
    { source: "jarvis" },
  );

  return "I've done a few steps but hit my limit — could you narrow that down a bit?";
}

async function persistAssistantUsage(
  usage: TokenUsage,
  latencyMs: number,
  model: string,
): Promise<void> {
  try {
    await prisma.llmUsageLog.create({
      data: {
        model,
        provider: "anthropic",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost,
        latencyMs,
        source: "assistant",
      },
    });
  } catch (err) {
    log.warn({ err }, "failed to persist assistant usage");
  }
}

// ─── Legacy path (direct Anthropic SDK — fallback) ────────────

async function chatViaLegacy(history: ChatTurn[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "The assistant needs the Claude API configured (ANTHROPIC_API_KEY). It looks like it's not set in this environment.";
  }
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = history
    .filter((t) => t.content?.trim())
    .map((t) => ({ role: t.role, content: t.content }));
  if (messages.length === 0) return "How can I help?";

  const legacyTools: Anthropic.Tool[] = JARVIS_TOOLS.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    input_schema: {
      type: "object" as const,
      ...(t.definition.parameters as Record<string, unknown>),
    },
  }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: legacyTools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return text || "(no reply)";
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const handler = toolHandlers.get(block.name);
        let out: unknown;
        try {
          out = handler
            ? await handler(block.input as Record<string, unknown>)
            : { error: `Unknown tool: ${block.name}` };
        } catch (e) {
          out = { error: e instanceof Error ? e.message : "tool failed" };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(out),
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return "I've done a few steps but hit my limit — could you narrow that down a bit?";
}
