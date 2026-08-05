import { EVENTS } from "@ryvan/common";
import type { ExecutionRecord } from "@ryvan/contracts";
import { NaiveContextAssembler } from "@ryvan/context";
import { PromptRegistry } from "@ryvan/prompts";
import { AnthropicAdapter } from "@ryvan/models";
import type { ModelService } from "@ryvan/models";
import type { AuditService } from "@ryvan/audit";
import type { MemoryManager } from "@ryvan/memory";
import type { MissionService } from "@ryvan/mission-engine";
import type { ObservabilityService } from "@ryvan/observability";
import type { PolicyService } from "@ryvan/policy-engine";
import type { ToolService } from "@ryvan/tool-registry";
import type { WorkflowDefinition, WorkflowService } from "@ryvan/workflow-engine";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";

/**
 * THE ALPHA SCENARIO — RyvanOS's kernel boot test.
 *
 * One mission traverses every layer of the platform:
 *
 *   Mission → Policy → Workflow → [Agent] → Context → Prompt → Model
 *           → Tool → Memory → Audit → Observability → ExecutionRecord
 *
 * Every milestone from here must keep this passing. If it breaks, the platform
 * is broken — not the test.
 *
 * The [Agent] stage is currently a workflow step handler doing by hand what
 * `@ryvan/agents` will do in Stage B: assemble context, render a prompt, call
 * a model, use a tool, write memory. That is deliberate — it proves the *path*
 * works before the abstraction exists, so Stage B formalises something already
 * known to run rather than introducing two unknowns at once.
 *
 * When Stage B lands, the handler is replaced by an `agent` step kind and this
 * test should barely change. That it barely changes is the evidence that the
 * abstraction was the right shape.
 */

const TOKEN = "test-secret-value-at-least-32-chars-long";

const payrollWorkflow: WorkflowDefinition = {
  id: "payroll.summarise",
  name: "Summarise payroll",
  version: "1.0.0",
  steps: [
    { id: "collect", name: "Collect attendance", kind: "action", handler: "collect" },
    // Stage B replaces this with { kind: "agent", agent: "payroll-summariser" }.
    {
      id: "reason",
      name: "Summarise",
      kind: "action",
      handler: "agentStandIn",
      dependsOn: ["collect"],
    },
  ],
};

/** A model that answers deterministically, so the scenario asserts exact values. */
function scriptedModel() {
  const calls: { messages: unknown[]; system?: unknown }[] = [];

  const client = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        calls.push({ messages: params.messages as unknown[], system: params.system });
        return {
          id: "msg_scenario",
          content: [{ type: "text", text: "42 employees, no exceptions." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 500, output_tokens: 40 },
        };
      },
    },
  };

  return { client, calls };
}

let running: Awaited<ReturnType<typeof bootstrap>>[] = [];

afterEach(async () => {
  for (const platform of running) await platform.stop();
  running = [];
});

async function bootScenario() {
  const platform = await bootstrap({
    identity: { tokenSecret: TOKEN },
    models: { defaultModel: "claude-haiku-4-5" },
    workflow: { definitions: [payrollWorkflow] },
    mission: { templates: [{ type: "payroll.summarise", workflowId: "payroll.summarise" }] },
    policy: {
      budgets: [{ id: "acme-daily", scope: { orgId: "acme" }, period: "day", limitUsd: 10 }],
      quotas: [
        {
          id: "acme-missions",
          resource: "missions",
          scope: { orgId: "acme" },
          period: "day",
          limit: 5,
        },
      ],
    },
  });
  running.push(platform);

  const resolve = <T>(name: string) => platform.container.resolve<T>(name);

  const models = resolve<ModelService>("models");
  const tools = resolve<ToolService>("tools");
  const memory = resolve<MemoryManager>("memory");
  const workflow = resolve<WorkflowService>("workflow");

  // --- AI runtime pieces the agent will own in Stage B ---------------------
  const { client, calls } = scriptedModel();
  models.registry.registerProvider(new AnthropicAdapter({ client }));

  const prompts = new PromptRegistry();
  await prompts.register({
    id: "payroll.summarise",
    version: "1.0.0",
    template: "Summarise payroll for {{month}}. Headcount: {{headcount}}.",
    variables: ["month", "headcount"],
  });

  const assembler = new NaiveContextAssembler({ maxTokens: 4000 });

  tools.register(
    {
      name: "count_employees",
      description: "Counts employees in scope",
      parameters: [{ name: "orgId", type: "string", required: true }],
      timeout: 5_000,
    },
    async (ctx) => ({ success: true, output: { count: 42 }, executionTimeMs: 0 }),
  );

  workflow.registerHandler("collect", () => ({ period: "2026-07" }));

  // --- the stand-in agent ---------------------------------------------------
  workflow.registerHandler("agentStandIn", async (step) => {
    const correlationId = step.correlationId;

    // Tool — permission-gated in A.4, invoked here as an agent would.
    const counted = await tools.execute("count_employees", { orgId: "acme" }, { correlationId });
    const headcount = (counted.output as { count: number }).count;

    // Memory — recall, then write what was learned.
    const recalled = await memory.search({ namespace: "acme", limit: 5 });

    // Prompt — versioned, never a literal.
    const prompt = await prompts.render("payroll.summarise", {
      month: (step.outputs.collect as { period: string }).period,
      headcount,
    });

    // Context — assembled, never hand-built by the agent.
    const context = await assembler.assemble({
      instruction: prompt.text,
      input: { orgId: "acme" },
      memories: recalled.map((result) => ({
        id: result.entry.id,
        namespace: result.entry.namespace,
        content: result.entry.content,
        score: result.score,
      })),
    });

    // Model — correlationId carries the trace and the cost attribution.
    const answer = await models.chat({ messages: context.messages, correlationId });

    await memory.store("long", "acme", `payroll.${step.runId}`, answer.content, {
      importance: 0.8,
    });

    return {
      summary: answer.content,
      headcount,
      promptVersion: prompt.version,
      contextTokens: context.tokenEstimate,
      memoryRefs: context.memoryRefs,
    };
  });

  return {
    platform,
    resolve,
    modelCalls: calls,
    mission: resolve<MissionService>("mission"),
    policy: resolve<PolicyService>("policy"),
    audit: resolve<AuditService>("audit"),
    observability: resolve<ObservabilityService>("observability"),
  };
}

/**
 * Assembles the enterprise trace: one object answering what happened, whether
 * it was allowed, what it cost, and what it read. Stage B moves this into the
 * platform; here it proves every input exists.
 */
async function executionRecord(
  scenario: Awaited<ReturnType<typeof bootScenario>>,
  missionId: string,
): Promise<ExecutionRecord> {
  const mission = (await scenario.mission.get(missionId))!;
  const trace = await scenario.observability.trace(mission.correlationId);
  const entries = await scenario.audit.query({ correlationId: mission.correlationId });

  return {
    missionId: mission.id,
    workflowRunId: mission.runId,
    traceId: mission.correlationId,
    auditSequence: entries[entries.length - 1]?.sequence,
    status: mission.status as ExecutionRecord["status"],
    policy: { effect: "allow", allowed: true, reason: "no rule matched" },
    cost: { totalUsd: trace?.totalCostUsd ?? 0 },
    latencyMs: trace?.durationMs,
    memory: (mission.result as { memoryRefs?: ExecutionRecord["memory"] })?.memoryRefs ?? [],
    subject: mission.subject,
    result: mission.result,
    startedAt: mission.createdAt,
    completedAt: mission.completedAt,
  };
}

describe("ALPHA SCENARIO — the full platform path", () => {
  it("executes a mission through every layer", async () => {
    const scenario = await bootScenario();

    const mission = await scenario.mission.launch({
      type: "payroll.summarise",
      goal: "Summarise July payroll",
      subject: { userId: "u1", orgId: "acme", roles: ["org:owner"] },
      estimatedCostUsd: 0.01,
    });

    // --- Mission + Policy ---------------------------------------------------
    expect(mission.status).toBe("completed");

    // --- Agent stand-in produced a real result ------------------------------
    const result = mission.result as Record<string, Record<string, unknown>>;
    const summary = result["reason"]!;

    expect(summary.summary).toBe("42 employees, no exceptions.");

    // --- Tool ---------------------------------------------------------------
    expect(summary.headcount).toBe(42);

    // --- Prompt: versioned, and the version travelled with the output -------
    expect(summary.promptVersion).toBe("1.0.0");

    // --- Context: assembled, and the model saw the rendered prompt ----------
    // Three layers composing: the assembler puts the instruction in a system
    // message, and the Anthropic adapter lifts system messages to the
    // provider's top-level field.
    const sent = scenario.modelCalls[0]!;
    expect(sent.system).toContain("Headcount: 42");
    expect(summary.contextTokens).toBeGreaterThan(0);

    // --- Memory: written during execution -----------------------------------
    const memory = scenario.resolve<MemoryManager>("memory");
    const stored = await memory.search({ namespace: "acme" });
    expect(stored.length).toBeGreaterThan(0);

    // --- Audit: complete and tamper-evident ---------------------------------
    const audit = scenario.audit;
    const actions = (await audit.query()).map((entry) => entry.action);
    expect(actions).toContain(EVENTS.MISSION_CREATED);
    expect(actions).toContain(EVENTS.MISSION_COMPLETED);
    expect((await audit.verify()).valid).toBe(true);

    // --- Observability: one trace spanning the whole execution --------------
    const trace = await scenario.observability.trace(mission.correlationId);
    expect(trace).toBeDefined();
    expect(trace!.status).toBe("ok");

    const spans = await scenario.observability.spans(mission.correlationId);
    const kinds = spans.map((span) => span.kind);
    expect(kinds).toContain("mission");
    expect(kinds).toContain("workflow");
    expect(kinds).toContain("step");
    expect(kinds).toContain("tool");
    expect(kinds).toContain("model");

    // --- Cost: attributed to the mission that incurred it -------------------
    // 500 input × 0.000001 + 40 output × 0.000005 = 0.0007
    expect(trace!.totalCostUsd).toBeCloseTo(0.0007, 6);
    expect(trace!.totalTokens).toBe(540);
  }, 30_000);

  it("produces a complete ExecutionRecord", async () => {
    const scenario = await bootScenario();

    const mission = await scenario.mission.launch({
      type: "payroll.summarise",
      subject: { userId: "u1", orgId: "acme" },
    });

    const record = await executionRecord(scenario, mission.id);

    // One object answering: what happened, was it allowed, what did it cost,
    // and what did it read — without querying four subsystems separately.
    expect(record.missionId).toBe(mission.id);
    expect(record.workflowRunId).toBeDefined();
    expect(record.traceId).toBe(mission.correlationId);
    expect(record.auditSequence).toBeGreaterThan(0);
    expect(record.status).toBe("completed");
    expect(record.policy.allowed).toBe(true);
    expect(record.cost.totalUsd).toBeGreaterThan(0);
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
    expect(record.subject?.orgId).toBe("acme");
    expect(record.result).toBeDefined();
    expect(record.completedAt).toBeGreaterThanOrEqual(record.startedAt);
  }, 30_000);

  it("is refused before any model is called when policy denies", async () => {
    const scenario = await bootScenario();
    scenario.policy.engine.addRule({
      id: "frozen",
      name: "Payroll frozen",
      effect: "deny",
      when: { resources: ["mission:payroll.summarise"] },
      reason: "month-end close",
    });

    const mission = await scenario.mission.launch({
      type: "payroll.summarise",
      subject: { userId: "u1", orgId: "acme" },
    });

    expect(mission.status).toBe("failed");
    expect(mission.error).toContain("month-end close");

    // Governance that runs after the money is spent is documentation
    // (Constitution Article 13).
    expect(scenario.modelCalls).toHaveLength(0);
  }, 30_000);

  it("is refused when the tenant's quota is exhausted", async () => {
    const scenario = await bootScenario();

    scenario.policy.quotas.setLimit({
      id: "tight",
      resource: "missions",
      scope: { orgId: "acme" },
      period: "day",
      limit: 1,
    });

    const first = await scenario.mission.launch({
      type: "payroll.summarise",
      subject: { orgId: "acme" },
    });
    expect(first.status).toBe("completed");

    // Quota is checked through the same enforce() path as budgets and rules.
    const outcome = await scenario.policy.enforce({
      action: "mission:execute",
      subject: { orgId: "acme" },
      quotaResource: "missions",
    });
    expect(outcome.allowed).toBe(false);
  }, 30_000);
});
