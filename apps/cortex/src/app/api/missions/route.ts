import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { orchestrator } from "@/cortex/engine/orchestrator";

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (user.role !== "admin") where.createdById = user.id;

    const missions = await prisma.mission.findMany({
      where,
      include: {
        steps: {
          orderBy: { sequence: "asc" },
          select: {
            id: true, agentId: true, sequence: true, title: true,
            status: true, startedAt: true, completedAt: true,
            approvalRequired: true, error: true,
          },
        },
        merchant: { select: { id: true, businessName: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const types = orchestrator.getMissionTypes();

    const awaitingApproval = await prisma.missionStep.count({
      where: { status: "awaiting_approval" },
    });

    return NextResponse.json({
      missions: missions.map(m => ({
        id: m.id,
        title: m.title,
        type: m.type,
        status: m.status,
        progress: m.progress,
        merchant: m.merchant ? { id: m.merchant.id, name: m.merchant.businessName } : null,
        createdBy: m.createdBy.name,
        createdAt: m.createdAt.toISOString(),
        completedAt: m.completedAt?.toISOString() || null,
        error: m.error,
        steps: m.steps,
        currentStep: m.steps.find(s => s.status === "running" || s.status === "awaiting_approval") || null,
        totalSteps: m.steps.length,
        completedSteps: m.steps.filter(s => s.status === "completed").length,
      })),
      types,
      awaitingApproval,
    });
  } catch (error) {
    console.error("Missions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch missions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    bootstrapCAO();

    const body = await request.json() as Record<string, unknown>;
    const { title, type, config } = body as {
      title?: string;
      type?: string;
      config?: Record<string, unknown>;
    };

    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    const missionTitle = title || `${type.replace(/_/g, " ")} mission`;
    const missionConfig = config || {};

    const missionId = await orchestrator.createMission(
      missionTitle,
      type,
      user.id,
      missionConfig,
    );

    orchestrator.executeMission(missionId).catch(err => {
      console.error(`Mission ${missionId} execution error:`, err);
    });

    return NextResponse.json({ missionId, status: "executing" }, { status: 201 });
  } catch (error) {
    console.error("Mission POST error:", error);
    return NextResponse.json({ error: "Failed to process mission request" }, { status: 500 });
  }
}
