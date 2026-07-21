import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { agentRegistry } from "@/cortex/runtime/registry";
import { toolRegistry } from "@/cortex/runtime/tool";
import { approvalGateway } from "@/cortex/engine/approval";
import { orchestrator } from "@/cortex/engine/orchestrator";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:cao:status");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    bootstrapCAO();

    const [allMissions, eventCount, approvalPolicies] = await Promise.all([
      prisma.mission.findMany({ select: { status: true } }),
      prisma.cortexEvent.count(),
      approvalGateway.listPolicies(),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const m of allMissions) {
      statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
    }

    const agents = agentRegistry.list();
    const tools = toolRegistry.list();
    const missionTypes = orchestrator.getMissionTypes();

    return NextResponse.json({
      system: {
        version: "1.0",
        status: "operational",
        uptime: process.uptime(),
      },
      agents: agents.map(a => ({
        id: a.id,
        name: a.manifest.name,
        version: a.manifest.version,
        description: a.manifest.description,
        state: a.state,
        subscribes: a.manifest.subscribes,
        publishes: a.manifest.publishes,
        tools: a.manifest.tools,
        permissions: a.manifest.permissions,
      })),
      tools: tools.map(t => ({
        id: t.id,
        name: t.name,
        version: t.version,
        description: t.description,
      })),
      missions: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        byStatus: statusCounts,
        types: missionTypes,
      },
      events: {
        total: eventCount,
      },
      approvalPolicies,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "CAO status error");
    return NextResponse.json({ error: "Failed to get system status" }, { status: 500 });
  }
});
