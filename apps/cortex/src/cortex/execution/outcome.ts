import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";
import type { OutcomeData } from "./types";

class OutcomeEngine {
  async recordOutcome(missionId: string, data: OutcomeData, ownerId?: string): Promise<string> {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: { outcome: true },
    });
    if (!mission) throw new Error("Mission not found");
    if (mission.outcome) throw new Error("Outcome already recorded");

    const duration = mission.completedAt
      ? Math.ceil((mission.completedAt.getTime() - mission.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const outcome = await prisma.outcome.create({
      data: {
        missionId,
        result: data.result,
        reason: data.reason,
        evidence: data.evidence,
        revenue: data.revenue,
        duration,
        ownerId,
        lessons: JSON.stringify(data.lessons || []),
        recommendations: JSON.stringify(data.recommendations || []),
      },
    });

    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "completed" },
    });

    await eventBus.publish({
      type: "mission.outcome.recorded.v1",
      version: "1",
      source: "execution.outcome",
      payload: {
        missionId,
        outcomeId: outcome.id,
        result: data.result,
        revenue: data.revenue,
        playbookName: mission.playbookName,
        prospectId: mission.prospectId,
      },
    });

    if (mission.playbookName) {
      await this.updatePlaybookMetrics(mission.playbookName);
    }

    if (data.result === "won" || data.result === "lost") {
      await this.applyLearning(mission, data);
    }

    return outcome.id;
  }

  private async updatePlaybookMetrics(playbookName: string): Promise<void> {
    const missions = await prisma.mission.findMany({
      where: { playbookName },
      include: { outcome: true },
    });

    const withOutcome = missions.filter((m) => m.outcome);
    const won = withOutcome.filter((m) => m.outcome!.result === "won");
    const totalRevenue = won.reduce((sum, m) => sum + (m.outcome!.revenue || 0), 0);
    const avgDuration = withOutcome.length > 0
      ? Math.round(withOutcome.reduce((sum, m) => sum + (m.outcome!.duration || 0), 0) / withOutcome.length)
      : 0;

    const metrics = {
      totalRuns: missions.length,
      completedRuns: withOutcome.length,
      conversionRate: withOutcome.length > 0 ? Math.round((won.length / withOutcome.length) * 100) : 0,
      totalRevenue,
      avgDuration,
      wonCount: won.length,
      lostCount: withOutcome.filter((m) => m.outcome!.result === "lost").length,
    };

    await prisma.playbook.update({
      where: { name: playbookName },
      data: { metrics: JSON.stringify(metrics) },
    });
  }

  private async applyLearning(
    mission: { prospectId: string | null; playbookName: string | null },
    data: OutcomeData
  ): Promise<void> {
    if (!mission.prospectId) return;

    const prospect = await prisma.prospect.findUnique({
      where: { id: mission.prospectId },
      include: { signals: true },
    });
    if (!prospect) return;

    const insights = await prisma.insight.findMany({
      where: { prospectId: mission.prospectId },
    });

    for (const insight of insights) {
      if (!insight.recommendedService) continue;

      const matchingRules = await prisma.inferenceRule.findMany({
        where: { recommendedService: insight.recommendedService, active: true },
      });

      for (const rule of matchingRules) {
        const adjustment = data.result === "won" ? 2 : -1;
        const newBase = Math.max(50, Math.min(100, rule.confidenceBase + adjustment));

        if (newBase !== rule.confidenceBase) {
          await prisma.inferenceRule.update({
            where: { id: rule.id },
            data: { confidenceBase: newBase },
          });
        }
      }
    }

    await eventBus.publish({
      type: "learning.applied.v1",
      version: "1",
      source: "execution.outcome",
      payload: {
        missionId: mission.playbookName,
        prospectId: mission.prospectId,
        result: data.result,
        rulesAdjusted: insights.filter((i) => i.recommendedService).length,
      },
    });
  }

  async getPlaybookMetrics(playbookName?: string) {
    if (playbookName) {
      const playbook = await prisma.playbook.findUnique({ where: { name: playbookName } });
      if (!playbook) return null;
      return { name: playbook.name, displayName: playbook.displayName, ...JSON.parse(playbook.metrics) };
    }

    const playbooks = await prisma.playbook.findMany({ where: { active: true } });
    return playbooks.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      ...JSON.parse(p.metrics),
    }));
  }

  async getOutcomeHistory(limit = 20) {
    return prisma.outcome.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        mission: { select: { title: true, playbookName: true, prospectId: true, createdAt: true } },
      },
    });
  }
}

export const outcomeEngine = new OutcomeEngine();
