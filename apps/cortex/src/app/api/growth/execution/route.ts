import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import {
  playbookRuntime,
  outcomeEngine,
  matchPlaybook,
  executorRegistry,
} from "@/cortex/execution";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:growth:execution");

bootstrapCAO();

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "dashboard";

    if (view === "playbooks") {
      const domain = searchParams.get("domain") || undefined;
      const playbooks = await playbookRuntime.listPlaybooks(domain);
      return NextResponse.json({
        playbooks: playbooks.map((p) => ({
          ...p,
          stages: JSON.parse(p.stages),
          triggers: JSON.parse(p.triggers),
          metrics: JSON.parse(p.metrics),
        })),
      });
    }

    if (view === "executors") {
      const executors = executorRegistry.list().map((e) => ({
        type: e.type,
        displayName: e.displayName,
      }));
      return NextResponse.json({ executors });
    }

    if (view === "missions") {
      const missions = await prisma.mission.findMany({
        where: { type: "playbook_execution" },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          workItems: { orderBy: { sequence: "asc" } },
          outcome: true,
        },
      });
      return NextResponse.json({ missions: missions.map(formatMission) });
    }

    if (view === "mission") {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const timeline = await playbookRuntime.getMissionTimeline(id);
      if (!timeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ mission: timeline });
    }

    if (view === "metrics") {
      const metrics = await outcomeEngine.getPlaybookMetrics();
      return NextResponse.json({ metrics });
    }

    if (view === "outcomes") {
      const outcomes = await outcomeEngine.getOutcomeHistory();
      return NextResponse.json({ outcomes });
    }

    if (view === "match") {
      const prospectId = searchParams.get("prospectId");
      if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });
      const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
      if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

      const playbookName = await matchPlaybook({
        qualificationGrade: prospect.qualificationGrade,
        qualificationScore: prospect.qualificationScore,
        industry: prospect.industry,
        size: prospect.size,
        cloudProvider: prospect.cloudProvider,
        recommendedServices: safeJSON<string[]>(prospect.recommendedServices, []),
        techStack: safeJSON<string[]>(prospect.techStack, []),
      });

      return NextResponse.json({
        prospectId,
        companyName: prospect.companyName,
        matchedPlaybook: playbookName,
      });
    }

    if (view === "dashboard") {
      const [totalMissions, activeMissions, completedMissions, totalOutcomes, playbooks, rules] =
        await Promise.all([
          prisma.mission.count({ where: { type: "playbook_execution" } }),
          prisma.mission.count({
            where: {
              type: "playbook_execution",
              status: { in: ["executing", "awaiting_approval"] },
            },
          }),
          prisma.mission.count({ where: { type: "playbook_execution", status: "completed" } }),
          prisma.outcome.count(),
          prisma.playbook.count({ where: { active: true } }),
          prisma.executionRule.count({ where: { active: true } }),
        ]);
      return NextResponse.json({
        dashboard: {
          totalMissions,
          activeMissions,
          completedMissions,
          totalOutcomes,
          playbooks,
          activeRules: rules,
        },
      });
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Execution GET error");
    return NextResponse.json({ error: "Failed to load execution data" }, { status: 500 });
  }
});

export const POST = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "start_mission") {
      const { playbookName, prospectId } = body;
      if (!playbookName || !prospectId) {
        return NextResponse.json(
          { error: "playbookName and prospectId required" },
          { status: 400 },
        );
      }
      const missionId = await playbookRuntime.startMission(playbookName, prospectId, user.id);
      const timeline = await playbookRuntime.getMissionTimeline(missionId);
      return NextResponse.json({ success: true, missionId, mission: timeline });
    }

    if (action === "auto_execute") {
      const { prospectId } = body;
      if (!prospectId) {
        return NextResponse.json({ error: "prospectId required" }, { status: 400 });
      }
      const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
      if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

      const playbookName = await matchPlaybook({
        qualificationGrade: prospect.qualificationGrade,
        qualificationScore: prospect.qualificationScore,
        industry: prospect.industry,
        size: prospect.size,
        cloudProvider: prospect.cloudProvider,
        recommendedServices: safeJSON<string[]>(prospect.recommendedServices, []),
        techStack: safeJSON<string[]>(prospect.techStack, []),
      });

      if (!playbookName) {
        return NextResponse.json(
          { error: "No matching playbook for this prospect" },
          { status: 404 },
        );
      }

      const missionId = await playbookRuntime.startMission(playbookName, prospectId, user.id);
      const timeline = await playbookRuntime.getMissionTimeline(missionId);
      return NextResponse.json({ success: true, playbookName, missionId, mission: timeline });
    }

    if (action === "approve") {
      const { workItemId, recipientEmail } = body;
      if (!workItemId) return NextResponse.json({ error: "workItemId required" }, { status: 400 });
      const result = await playbookRuntime.approveWorkItem(workItemId, { recipientEmail });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "skip") {
      const { workItemId } = body;
      if (!workItemId) return NextResponse.json({ error: "workItemId required" }, { status: 400 });
      await playbookRuntime.skipWorkItem(workItemId);
      return NextResponse.json({ success: true });
    }

    if (action === "record_outcome") {
      const { missionId, result, reason, evidence, revenue, lessons, recommendations } = body;
      if (!missionId || !result) {
        return NextResponse.json({ error: "missionId and result required" }, { status: 400 });
      }
      const outcomeId = await outcomeEngine.recordOutcome(
        missionId,
        { result, reason, evidence, revenue, lessons, recommendations },
        user.id,
      );
      return NextResponse.json({ success: true, outcomeId });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Execution POST error");
    return NextResponse.json({ error: "Failed to process execution request" }, { status: 500 });
  }
});

function formatMission(m: {
  id: string;
  title: string;
  status: string;
  progress: number;
  playbookName: string | null;
  prospectId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  workItems: Array<{
    id: string;
    stageId: string;
    stageName: string;
    executorType: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
  }>;
  outcome: { id: string; result: string; revenue: number | null; reason: string | null } | null;
}) {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    progress: m.progress,
    playbookName: m.playbookName,
    prospectId: m.prospectId,
    createdAt: m.createdAt,
    completedAt: m.completedAt,
    workItems: m.workItems.map((w) => ({
      id: w.id,
      stageId: w.stageId,
      stageName: w.stageName,
      executorType: w.executorType,
      status: w.status,
      startedAt: w.startedAt,
      completedAt: w.completedAt,
      durationMs: w.durationMs,
    })),
    outcome: m.outcome,
  };
}

function safeJSON<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
