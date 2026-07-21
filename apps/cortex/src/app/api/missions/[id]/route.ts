import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { orchestrator } from "@/cortex/engine/orchestrator";
import { approvalGateway } from "@/cortex/engine/approval";
import { replayMission } from "@/cortex/engine/replay";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:missions:detail");

export const GET = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "replay") {
      const replay = await replayMission(id);
      return NextResponse.json(replay);
    }

    const mission = await prisma.mission.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { sequence: "asc" },
          include: {
            approvedBy: { select: { name: true } },
          },
        },
        merchant: {
          select: { id: true, businessName: true, ownerName: true, leadStatus: true },
        },
        createdBy: { select: { name: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!mission) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: mission.id,
      title: mission.title,
      type: mission.type,
      status: mission.status,
      progress: mission.progress,
      config: JSON.parse(mission.config),
      result: mission.result ? JSON.parse(mission.result) : null,
      error: mission.error,
      merchant: mission.merchant,
      createdBy: mission.createdBy.name,
      createdAt: mission.createdAt.toISOString(),
      completedAt: mission.completedAt?.toISOString() || null,
      steps: mission.steps.map(s => ({
        id: s.id,
        agentId: s.agentId,
        sequence: s.sequence,
        title: s.title,
        status: s.status,
        input: JSON.parse(s.input),
        output: s.output ? JSON.parse(s.output) : null,
        reasoning: s.reasoning,
        startedAt: s.startedAt?.toISOString() || null,
        completedAt: s.completedAt?.toISOString() || null,
        error: s.error,
        approvalRequired: s.approvalRequired,
        approvedBy: s.approvedBy?.name || null,
        approvedAt: s.approvedAt?.toISOString() || null,
        durationMs: s.startedAt && s.completedAt
          ? new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()
          : null,
      })),
      events: mission.events.map(e => ({
        id: e.id,
        type: e.type,
        source: e.source,
        payload: JSON.parse(e.payload),
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Mission GET error");
    return NextResponse.json({ error: "Failed to fetch mission" }, { status: 500 });
  }
});

export const POST = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    bootstrapCAO();

    const { id } = await ctx.params;
    const body = await request.json() as Record<string, unknown>;
    const action = body.action as string;

    switch (action) {
      case "approve": {
        const stepId = body.stepId as string;
        if (!stepId) {
          return NextResponse.json({ error: "stepId required" }, { status: 400 });
        }
        await approvalGateway.grantApproval(stepId, user.id);
        orchestrator.resumeMission(id).catch(err => {
          log.error({ err: err instanceof Error ? err.message : String(err) }, `Mission ${id} resume error`);
        });
        return NextResponse.json({ status: "approved" });
      }

      case "deny": {
        const stepId = body.stepId as string;
        const reason = (body.reason as string) || "Denied by admin";
        if (!stepId) {
          return NextResponse.json({ error: "stepId required" }, { status: 400 });
        }
        await approvalGateway.denyApproval(stepId, user.id, reason);
        return NextResponse.json({ status: "denied" });
      }

      case "cancel":
        await orchestrator.cancelMission(id);
        return NextResponse.json({ status: "cancelled" });

      case "retry":
        await orchestrator.retryMission(id);
        return NextResponse.json({ status: "retrying" });

      default:
        return NextResponse.json({ error: "Unknown action. Use: approve, deny, cancel, retry" }, { status: 400 });
    }
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Mission POST error");
    return NextResponse.json({ error: "Failed to process mission" }, { status: 500 });
  }
});
