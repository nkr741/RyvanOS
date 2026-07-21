import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { relationshipEngine } from "@/cortex/intelligence";

bootstrapCAO();

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "stats";

    if (view === "stats") {
      const stats = await relationshipEngine.getGraphStats();
      return NextResponse.json({ stats });
    }

    if (view === "graph") {
      const prospectId = searchParams.get("prospectId");
      if (!prospectId) {
        return NextResponse.json({ error: "prospectId required" }, { status: 400 });
      }
      const graph = await relationshipEngine.getProspectGraph(prospectId);
      return NextResponse.json({ graph });
    }

    if (view === "insights") {
      const prospectId = searchParams.get("prospectId") || undefined;
      const insights = await relationshipEngine.getEcosystemInsights(prospectId);
      return NextResponse.json({ insights });
    }

    if (view === "shared") {
      const a = searchParams.get("prospectA");
      const b = searchParams.get("prospectB");
      if (!a || !b) {
        return NextResponse.json({ error: "prospectA and prospectB required" }, { status: 400 });
      }
      const shared = await relationshipEngine.getSharedConnections(a, b);
      return NextResponse.json({ shared });
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (err) {
    console.error("[api/growth/relationships] GET error:", err);
    return NextResponse.json({ error: "Failed to load relationships" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "build_graph") {
      const { prospectId } = body;
      if (!prospectId) {
        return NextResponse.json({ error: "prospectId required" }, { status: 400 });
      }
      const result = await relationshipEngine.buildGraph(prospectId);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "detect_patterns") {
      const insightsCreated = await relationshipEngine.detectCrossCompanyPatterns();
      return NextResponse.json({ success: true, insightsCreated });
    }

    if (action === "build_all") {
      const { prisma } = await import("@/lib/prisma");
      const prospects = await prisma.prospect.findMany({ select: { id: true } });
      let totalNodes = 0;
      let totalEdges = 0;
      for (const p of prospects) {
        const result = await relationshipEngine.buildGraph(p.id);
        totalNodes += result.nodesCreated;
        totalEdges += result.edgesCreated;
      }
      const insightsCreated = await relationshipEngine.detectCrossCompanyPatterns();
      return NextResponse.json({
        success: true,
        totalNodes,
        totalEdges,
        insightsCreated,
        prospectsProcessed: prospects.length,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[api/growth/relationships] POST error:", err);
    return NextResponse.json({ error: "Failed to update relationships" }, { status: 500 });
  }
}
