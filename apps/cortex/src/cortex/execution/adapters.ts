import { prisma } from "@/lib/prisma";
import { AgentContext, type MissionContext } from "../runtime/context";
import { agentRegistry } from "../runtime/registry";
import { approvalGateway } from "../engine/approval";
import { executorRegistry } from "./registry";
import type { ExecutionAdapter, ExecutionUnit, UnitResult } from "./engine";

// ─── Agent Adapter ──────────────────────────────────────────────
// Wraps BaseAgent.run() as an ExecutionAdapter for the orchestrator.
// Maps MissionStep records to ExecutionUnit, dispatches to AgentRegistry.

export class AgentAdapter implements ExecutionAdapter {
  async loadUnits(missionId: string): Promise<ExecutionUnit[]> {
    const steps = await prisma.missionStep.findMany({
      where: { missionId },
      orderBy: { sequence: "asc" },
    });

    return steps.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      status: s.status,
      handlerId: s.agentId,
      approvalRequired: s.approvalRequired,
      input: s.input,
      output: s.output,
    }));
  }

  async executeUnit(
    unit: ExecutionUnit,
    input: Record<string, unknown>,
    missionId: string,
  ): Promise<UnitResult> {
    const agent = agentRegistry.get(unit.handlerId);
    if (!agent) {
      return {
        success: false,
        data: { error: `Agent '${unit.handlerId}' not found` },
      };
    }

    const mission = await prisma.mission.findUnique({ where: { id: missionId } });
    const config = mission ? safeJSON(mission.config) : {};

    const missionCtx: MissionContext = {
      missionId,
      missionType: mission?.type || "unknown",
      correlationId: missionId,
      stepId: unit.id,
      stepSequence: unit.sequence,
      merchantId: config.merchantId as string | undefined,
    };

    const ctx = new AgentContext(unit.handlerId, missionCtx);
    const result = await agent.run(ctx, input);

    return {
      success: result.success,
      data: result.data,
      reasoning: result.reasoning,
    };
  }

  buildInput(
    unit: ExecutionUnit,
    previousOutput: Record<string, unknown>,
    missionConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...safeJSON(unit.input),
      previousOutput,
      missionConfig,
    };
  }

  async updateUnit(unitId: string, data: Record<string, unknown>): Promise<void> {
    await prisma.missionStep.update({
      where: { id: unitId },
      data: data as Parameters<typeof prisma.missionStep.update>[0]["data"],
    });
  }

  async cancelPendingUnits(missionId: string): Promise<void> {
    await prisma.missionStep.updateMany({
      where: { missionId, status: { in: ["pending", "running", "awaiting_approval"] } },
      data: { status: "skipped" },
    });
  }

  async checkPreApproval(
    missionId: string,
    unit: ExecutionUnit,
    _input: Record<string, unknown>,
  ): Promise<{ approved: boolean }> {
    const result = await approvalGateway.requestApproval({
      missionId,
      stepId: unit.id,
      action: `${unit.handlerId}.execute`,
      agentId: unit.handlerId,
      description: `Step ${unit.sequence}`,
      payload: _input,
    });

    return { approved: result.approved || result.autoApproved };
  }
}

// ─── Playbook Adapter ───────────────────────────────────────────
// Wraps Executor.execute() as an ExecutionAdapter for the playbook runtime.
// Maps WorkItem records to ExecutionUnit, builds prospect context,
// dispatches to ExecutorRegistry.

export class PlaybookAdapter implements ExecutionAdapter {
  async loadUnits(missionId: string): Promise<ExecutionUnit[]> {
    const items = await prisma.workItem.findMany({
      where: { missionId },
      orderBy: { sequence: "asc" },
    });

    return items.map((w) => ({
      id: w.id,
      sequence: w.sequence,
      status: w.status,
      handlerId: w.executorType,
      approvalRequired: w.approvalRequired,
      input: w.input,
      output: w.output,
    }));
  }

  async executeUnit(
    unit: ExecutionUnit,
    input: Record<string, unknown>,
    missionId: string,
  ): Promise<UnitResult> {
    const executor = executorRegistry.get(unit.handlerId);
    if (!executor) {
      return {
        success: false,
        data: { error: `No executor registered for type: ${unit.handlerId}` },
      };
    }

    const mission = await prisma.mission.findUnique({ where: { id: missionId } });

    const prospectContext = mission?.prospectId
      ? await this.buildProspectContext(mission.prospectId)
      : {};

    const previousOutputs = await this.getPreviousOutputs(missionId, unit.sequence);

    const result = await executor.execute({
      workItemId: unit.id,
      missionId,
      prospectId: mission?.prospectId || undefined,
      stageId: unit.id,
      config: safeJSON(unit.input),
      context: { ...prospectContext, previousOutputs },
    });

    return {
      success: result.success,
      data: result.data,
      approvalRequired: result.approvalRequired,
    };
  }

  async buildInput(
    unit: ExecutionUnit,
    previousOutput: Record<string, unknown>,
    missionConfig: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return {
      ...safeJSON(unit.input),
      previousOutput,
      missionConfig,
    };
  }

  async updateUnit(unitId: string, data: Record<string, unknown>): Promise<void> {
    await prisma.workItem.update({
      where: { id: unitId },
      data: data as Parameters<typeof prisma.workItem.update>[0]["data"],
    });
  }

  async cancelPendingUnits(missionId: string): Promise<void> {
    await prisma.workItem.updateMany({
      where: { missionId, status: { in: ["pending", "running", "waiting_approval"] } },
      data: { status: "skipped" },
    });
  }

  // No checkPreApproval — playbook uses post-execution approval pattern

  private async buildProspectContext(
    prospectId: string,
  ): Promise<Record<string, unknown>> {
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { signals: { orderBy: { importance: "desc" } } },
    });
    if (!prospect) return {};

    const intelligence = await prisma.accountIntelligence.findFirst({
      where: { prospectId, status: "published" },
      orderBy: { version: "desc" },
      include: {
        sections: true,
        insights: { orderBy: { confidence: "desc" } },
      },
    });

    return {
      prospect: {
        id: prospect.id,
        companyName: prospect.companyName,
        website: prospect.website,
        industry: prospect.industry,
        size: prospect.size,
        employees: prospect.employees,
        location: prospect.location,
        country: prospect.country,
        description: prospect.description,
        techStack: safeJSON<string[]>(prospect.techStack, []),
        cloudProvider: prospect.cloudProvider,
        painPoints: safeJSON<string[]>(prospect.painPoints, []),
        growthSignals: safeJSON<string[]>(prospect.growthSignals, []),
        qualificationScore: prospect.qualificationScore,
        qualificationGrade: prospect.qualificationGrade,
        recommendedServices: safeJSON<string[]>(prospect.recommendedServices, []),
        aiSummary: prospect.aiSummary,
      },
      signals: prospect.signals.map((s) => ({
        type: s.type,
        value: s.value,
        confidence: s.confidence,
        importance: s.importance,
        evidence: s.evidence,
      })),
      intelligence: intelligence
        ? {
            id: intelligence.id,
            version: intelligence.version,
            overallConfidence: intelligence.overallConfidence,
            meetingBrief: intelligence.meetingBrief
              ? JSON.parse(intelligence.meetingBrief)
              : null,
            sections: intelligence.sections.map((s) => ({
              type: s.type,
              title: s.title,
              content: JSON.parse(s.content),
              confidence: s.confidence,
            })),
            insights: intelligence.insights.map((i) => ({
              title: i.title,
              description: i.description,
              confidence: i.confidence,
              recommendedService: i.recommendedService,
            })),
          }
        : null,
    };
  }

  private async getPreviousOutputs(
    missionId: string,
    beforeSequence: number,
  ): Promise<Record<string, unknown>> {
    const completed = await prisma.workItem.findMany({
      where: { missionId, sequence: { lt: beforeSequence }, status: "completed" },
      orderBy: { sequence: "asc" },
    });
    const outputs: Record<string, unknown> = {};
    for (const item of completed) {
      outputs[item.stageId] = safeJSON(item.output);
    }
    return outputs;
  }
}

function safeJSON<T = Record<string, unknown>>(str: string, fallback?: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return (fallback || {}) as T;
  }
}

export const agentAdapter = new AgentAdapter();
export const playbookAdapter = new PlaybookAdapter();
