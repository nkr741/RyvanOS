import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:observability");

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || "unknown";

  try {
    const { searchParams } = request.nextUrl;
    const view = searchParams.get("view") || "summary";
    const days = Math.min(Number(searchParams.get("days")) || 7, 90);
    const since = new Date(Date.now() - days * 86_400_000);

    if (view === "costs") {
      const usageLogs = await prisma.llmUsageLog.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      const totals = await prisma.llmUsageLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
        _count: true,
      });

      const bySource = await prisma.llmUsageLog.groupBy({
        by: ["source"],
        where: { createdAt: { gte: since } },
        _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
        _count: true,
      });

      const byModel = await prisma.llmUsageLog.groupBy({
        by: ["model"],
        where: { createdAt: { gte: since } },
        _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
        _count: true,
      });

      return NextResponse.json({
        period: { days, since: since.toISOString() },
        totals: {
          calls: totals._count,
          estimatedCostUsd: totals._sum.estimatedCost || 0,
          inputTokens: totals._sum.inputTokens || 0,
          outputTokens: totals._sum.outputTokens || 0,
        },
        bySource,
        byModel,
        recentCalls: usageLogs.slice(0, 50),
      });
    }

    if (view === "errors") {
      const failedMissions = await prisma.mission.findMany({
        where: { status: "failed", updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          steps: {
            where: { status: "failed" },
            select: {
              id: true,
              agentId: true,
              title: true,
              error: true,
              completedAt: true,
            },
          },
        },
      });

      const failedWorkItems = await prisma.workItem.findMany({
        where: { status: "failed", completedAt: { gte: since } },
        orderBy: { completedAt: "desc" },
        take: 50,
        select: {
          id: true,
          missionId: true,
          stageName: true,
          executorType: true,
          error: true,
          durationMs: true,
          completedAt: true,
        },
      });

      return NextResponse.json({
        period: { days, since: since.toISOString() },
        failedMissions: failedMissions.map((m) => ({
          id: m.id,
          title: m.title,
          type: m.type,
          error: m.error,
          failedAt: m.updatedAt,
          durationMs: m.durationMs,
          failedSteps: m.steps,
        })),
        failedWorkItems,
        counts: {
          failedMissions: failedMissions.length,
          failedWorkItems: failedWorkItems.length,
        },
      });
    }

    if (view === "latency") {
      const completedMissions = await prisma.mission.findMany({
        where: {
          status: "completed",
          completedAt: { gte: since },
          durationMs: { not: null },
        },
        orderBy: { completedAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          type: true,
          durationMs: true,
          totalCostUsd: true,
          completedAt: true,
        },
      });

      const workItemLatency = await prisma.workItem.groupBy({
        by: ["executorType"],
        where: { status: "completed", durationMs: { not: null } },
        _avg: { durationMs: true },
        _max: { durationMs: true },
        _min: { durationMs: true },
        _count: true,
      });

      return NextResponse.json({
        period: { days, since: since.toISOString() },
        missions: completedMissions,
        workItemLatencyByType: workItemLatency,
      });
    }

    // Default: summary view
    const [missionCounts, totalCost, recentErrors, emailStats] = await Promise.all([
      prisma.mission.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
      prisma.llmUsageLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
        _count: true,
      }),
      prisma.mission.count({
        where: { status: "failed", updatedAt: { gte: since } },
      }),
      prisma.emailLog.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      missions: Object.fromEntries(missionCounts.map((m) => [m.status, m._count])),
      llm: {
        totalCalls: totalCost._count,
        totalCostUsd: totalCost._sum.estimatedCost || 0,
        totalInputTokens: totalCost._sum.inputTokens || 0,
        totalOutputTokens: totalCost._sum.outputTokens || 0,
      },
      errors: { failedMissions: recentErrors },
      email: Object.fromEntries(emailStats.map((e) => [e.status, e._count])),
    });
  } catch (error) {
    log.error(
      { requestId, err: error instanceof Error ? error.message : error },
      "observability query failed",
    );
    return NextResponse.json({ error: "Failed to fetch observability data" }, { status: 500 });
  }
}
