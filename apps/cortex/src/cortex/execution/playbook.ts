import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";
import { isEnabled } from "@/lib/features";
import { sendEmail } from "@/cortex/email";
import { createLogger } from "@/lib/logger";
import { executorRegistry } from "./registry";
import type { PlaybookStage, PlaybookDefinition } from "./types";

const log = createLogger("playbook");

class PlaybookRuntime {
  async seedPlaybook(def: PlaybookDefinition): Promise<void> {
    const existing = await prisma.playbook.findUnique({ where: { name: def.id } });
    if (existing) return;
    await prisma.playbook.create({
      data: {
        name: def.id,
        displayName: def.displayName,
        description: def.description,
        version: def.version,
        domain: def.domain,
        stages: JSON.stringify(def.stages),
        triggers: JSON.stringify(def.triggers || []),
      },
    });
  }

  async startMission(
    playbookName: string,
    prospectId: string,
    userId: string,
    context?: Record<string, unknown>,
  ): Promise<string> {
    const playbook = await prisma.playbook.findUnique({ where: { name: playbookName } });
    if (!playbook) throw new Error(`Playbook not found: ${playbookName}`);
    if (!playbook.active) throw new Error(`Playbook is inactive: ${playbookName}`);

    const stages = JSON.parse(playbook.stages) as PlaybookStage[];
    if (stages.length === 0) throw new Error("Playbook has no stages");

    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) throw new Error("Prospect not found");

    const mission = await prisma.mission.create({
      data: {
        title: `${playbook.displayName}: ${prospect.companyName}`,
        type: "playbook_execution",
        status: "planning",
        playbookName: playbook.name,
        currentStage: stages[0].id,
        prospectId,
        createdById: userId,
        config: JSON.stringify({ playbookId: playbook.id, context: context || {} }),
      },
    });

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      await prisma.workItem.create({
        data: {
          missionId: mission.id,
          playbookId: playbook.id,
          stageId: stage.id,
          stageName: stage.name,
          executorType: stage.executorType,
          sequence: i,
          approvalRequired: stage.approvalRequired,
          input: JSON.stringify(stage.config || {}),
        },
      });
    }

    await prisma.mission.update({
      where: { id: mission.id },
      data: { status: "executing" },
    });

    await eventBus.publish({
      type: "mission.playbook.started.v1",
      version: "1",
      source: "execution.playbook",
      payload: {
        missionId: mission.id,
        playbookName,
        prospectId,
        stageCount: stages.length,
      },
    });

    await this.executeNextStage(mission.id);

    return mission.id;
  }

  async executeNextStage(missionId: string): Promise<void> {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        workItems: { orderBy: { sequence: "asc" } },
      },
    });
    if (!mission) return;
    if (mission.status === "completed" || mission.status === "failed") return;

    const nextItem = mission.workItems.find(
      (w) => w.status === "pending" || w.status === "running",
    );
    if (!nextItem) {
      await this.completeMission(missionId);
      return;
    }

    if (nextItem.status === "pending") {
      await this.executeWorkItem(nextItem.id, missionId);
    }
  }

  private async executeWorkItem(workItemId: string, missionId: string): Promise<void> {
    const workItem = await prisma.workItem.findUnique({ where: { id: workItemId } });
    if (!workItem) return;

    const executor = executorRegistry.get(workItem.executorType);
    if (!executor) {
      await prisma.workItem.update({
        where: { id: workItemId },
        data: {
          status: "failed",
          error: `No executor registered for type: ${workItem.executorType}`,
        },
      });
      return;
    }

    const mission = await prisma.mission.findUnique({ where: { id: missionId } });

    await prisma.workItem.update({
      where: { id: workItemId },
      data: { status: "running", startedAt: new Date() },
    });
    await prisma.mission.update({
      where: { id: missionId },
      data: { currentStage: workItem.stageId },
    });

    const startTime = Date.now();

    try {
      const prospectContext = mission?.prospectId
        ? await this.buildProspectContext(mission.prospectId)
        : {};

      const previousOutputs = await this.getPreviousOutputs(missionId, workItem.sequence);

      const result = await executor.execute({
        workItemId,
        missionId,
        prospectId: mission?.prospectId || undefined,
        stageId: workItem.stageId,
        config: safeJSON(workItem.input),
        context: { ...prospectContext, previousOutputs },
      });

      const durationMs = Date.now() - startTime;

      if (result.approvalRequired || workItem.approvalRequired) {
        await prisma.workItem.update({
          where: { id: workItemId },
          data: {
            status: "waiting_approval",
            output: JSON.stringify(result.data),
            durationMs,
          },
        });
        await prisma.mission.update({
          where: { id: missionId },
          data: { status: "awaiting_approval" },
        });

        await eventBus.publish({
          type: "workitem.approval.required.v1",
          version: "1",
          source: `executor.${workItem.executorType}`,
          payload: {
            workItemId,
            missionId,
            stageId: workItem.stageId,
            stageName: workItem.stageName,
            executorType: workItem.executorType,
            summary: result.summary,
          },
        });
        return;
      }

      await prisma.workItem.update({
        where: { id: workItemId },
        data: {
          status: "completed",
          output: JSON.stringify(result.data),
          completedAt: new Date(),
          durationMs,
        },
      });

      await eventBus.publish({
        type: "workitem.completed.v1",
        version: "1",
        source: `executor.${workItem.executorType}`,
        payload: {
          workItemId,
          missionId,
          stageId: workItem.stageId,
          executorType: workItem.executorType,
          durationMs,
        },
      });

      const completedCount = await prisma.workItem.count({
        where: { missionId, status: "completed" },
      });
      const totalCount = await prisma.workItem.count({ where: { missionId } });

      await prisma.mission.update({
        where: { id: missionId },
        data: {
          status: "executing",
          progress: Math.round((completedCount / totalCount) * 100),
        },
      });

      await this.executeNextStage(missionId);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : "Unknown error";

      await prisma.workItem.update({
        where: { id: workItemId },
        data: {
          status: "failed",
          error: message,
          completedAt: new Date(),
          durationMs,
        },
      });

      await eventBus.publish({
        type: "workitem.failed.v1",
        version: "1",
        source: `executor.${workItem.executorType}`,
        payload: { workItemId, missionId, error: message },
      });
    }
  }

  async approveWorkItem(
    workItemId: string,
    opts?: { recipientEmail?: string },
  ): Promise<{ emailSent?: boolean; emailError?: string }> {
    const workItem = await prisma.workItem.findUnique({ where: { id: workItemId } });
    if (!workItem || workItem.status !== "waiting_approval") return {};

    let emailSent = false;
    let emailError: string | undefined;

    if (workItem.executorType === "email" && isEnabled("EMAIL_SENDING_ENABLED")) {
      const output = safeJSON(workItem.output);
      const channels = output.channels as
        Array<{ channel: string; subject: string; body: string }> | undefined;
      const emailChannel = channels?.find((c) => c.channel === "email");

      if (emailChannel && opts?.recipientEmail) {
        const mission = await prisma.mission.findUnique({ where: { id: workItem.missionId } });
        const result = await sendEmail({
          to: opts.recipientEmail,
          subject: emailChannel.subject,
          body: emailChannel.body,
          workItemId,
          prospectId: mission?.prospectId || undefined,
          correlationId: workItem.missionId,
        });
        emailSent = result.success;
        emailError = result.error;

        if (!result.success) {
          log.error({ workItemId, err: result.error }, "email send failed");
        }
      } else if (!opts?.recipientEmail) {
        emailError = "No recipient email provided — email draft approved but not sent";
        log.warn({ workItemId }, emailError);
      }
    }

    await prisma.workItem.update({
      where: { id: workItemId },
      data: { status: "completed", completedAt: new Date() },
    });

    await eventBus.publish({
      type: "workitem.approved.v1",
      version: "1",
      source: "execution.approval",
      payload: {
        workItemId,
        missionId: workItem.missionId,
        stageId: workItem.stageId,
        emailSent,
      },
    });

    const completedCount = await prisma.workItem.count({
      where: { missionId: workItem.missionId, status: "completed" },
    });
    const totalCount = await prisma.workItem.count({ where: { missionId: workItem.missionId } });

    await prisma.mission.update({
      where: { id: workItem.missionId },
      data: {
        status: "executing",
        progress: Math.round((completedCount / totalCount) * 100),
      },
    });

    await this.executeNextStage(workItem.missionId);
    return { emailSent, emailError };
  }

  async skipWorkItem(workItemId: string): Promise<void> {
    const workItem = await prisma.workItem.findUnique({ where: { id: workItemId } });
    if (!workItem) return;

    await prisma.workItem.update({
      where: { id: workItemId },
      data: { status: "skipped", completedAt: new Date() },
    });

    await this.executeNextStage(workItem.missionId);
  }

  private async completeMission(missionId: string): Promise<void> {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      select: { createdAt: true },
    });
    const durationMs = mission ? Date.now() - mission.createdAt.getTime() : null;

    const costAgg = await prisma.llmUsageLog.aggregate({
      where: { correlationId: missionId },
      _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
    });

    await prisma.mission.update({
      where: { id: missionId },
      data: {
        status: "completed",
        progress: 100,
        completedAt: new Date(),
        durationMs,
        totalCostUsd: costAgg._sum.estimatedCost || null,
        inputTokens: costAgg._sum.inputTokens || null,
        outputTokens: costAgg._sum.outputTokens || null,
      },
    });

    log.info(
      {
        missionId,
        durationMs,
        totalCostUsd: costAgg._sum.estimatedCost,
        inputTokens: costAgg._sum.inputTokens,
      },
      "playbook mission completed",
    );

    await eventBus.publish({
      type: "mission.playbook.completed.v1",
      version: "1",
      source: "execution.playbook",
      payload: {
        missionId,
        durationMs,
        totalCostUsd: costAgg._sum.estimatedCost,
      },
    });
  }

  private async buildProspectContext(prospectId: string): Promise<Record<string, unknown>> {
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
            meetingBrief: intelligence.meetingBrief ? JSON.parse(intelligence.meetingBrief) : null,
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

  async getMissionTimeline(missionId: string) {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        workItems: { orderBy: { sequence: "asc" } },
        outcome: true,
      },
    });
    if (!mission) return null;

    return {
      id: mission.id,
      title: mission.title,
      playbookName: mission.playbookName,
      status: mission.status,
      progress: mission.progress,
      createdAt: mission.createdAt,
      completedAt: mission.completedAt,
      workItems: mission.workItems.map((w) => ({
        id: w.id,
        stageId: w.stageId,
        stageName: w.stageName,
        executorType: w.executorType,
        status: w.status,
        output: safeJSON(w.output),
        startedAt: w.startedAt,
        completedAt: w.completedAt,
        durationMs: w.durationMs,
        approvalRequired: w.approvalRequired,
        error: w.error,
      })),
      outcome: mission.outcome,
    };
  }

  async listPlaybooks(domain?: string) {
    return prisma.playbook.findMany({
      where: domain ? { domain, active: true } : { active: true },
      orderBy: { displayName: "asc" },
    });
  }
}

function safeJSON<T = Record<string, unknown>>(str: string, fallback?: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return (fallback || {}) as T;
  }
}

export const playbookRuntime = new PlaybookRuntime();
