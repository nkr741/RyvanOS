import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";
import { isEnabled } from "@/lib/features";
import { sendEmail } from "@/cortex/email";
import { createLogger } from "@/lib/logger";
import { executionEngine } from "./engine";
import { playbookAdapter } from "./adapters";
import type { PlaybookStage, PlaybookDefinition } from "./types";

const log = createLogger("playbook");

const PLAYBOOK_OPTIONS = {
  failurePolicy: "continue-on-error" as const,
  source: "execution.playbook",
};

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

    await executionEngine.run(mission.id, playbookAdapter, PLAYBOOK_OPTIONS);

    return mission.id;
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

    await executionEngine.run(workItem.missionId, playbookAdapter, PLAYBOOK_OPTIONS);
    return { emailSent, emailError };
  }

  async skipWorkItem(workItemId: string): Promise<void> {
    const workItem = await prisma.workItem.findUnique({ where: { id: workItemId } });
    if (!workItem) return;

    await prisma.workItem.update({
      where: { id: workItemId },
      data: { status: "skipped", completedAt: new Date() },
    });

    await executionEngine.run(workItem.missionId, playbookAdapter, PLAYBOOK_OPTIONS);
  }

  async retryMission(missionId: string): Promise<void> {
    await executionEngine.retry(missionId, playbookAdapter, PLAYBOOK_OPTIONS);
  }

  async cancelMission(missionId: string): Promise<void> {
    await executionEngine.cancel(missionId, playbookAdapter, PLAYBOOK_OPTIONS);
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
