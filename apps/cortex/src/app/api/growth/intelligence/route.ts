import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { intelligenceEngine } from "@/cortex/intelligence";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:growth:intelligence");

bootstrapCAO();

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "latest";
    const prospectId = searchParams.get("prospectId");

    if (view === "latest" && prospectId) {
      const intel = await intelligenceEngine.getLatestIntelligence(prospectId);
      if (!intel) {
        return NextResponse.json({ intelligence: null });
      }
      return NextResponse.json({ intelligence: formatIntelligence(intel) });
    }

    if (view === "versions" && prospectId) {
      const versions = await intelligenceEngine.listVersions(prospectId);
      return NextResponse.json({ versions });
    }

    if (view === "version") {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      const intel = await prisma.accountIntelligence.findUnique({
        where: { id },
        include: {
          sections: { orderBy: { type: "asc" } },
          insights: { orderBy: { confidence: "desc" } },
          prospect: { include: { signals: { orderBy: { importance: "desc" } } } },
        },
      });
      if (!intel) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ intelligence: formatIntelligence(intel) });
    }

    if (view === "rules") {
      const rules = await prisma.inferenceRule.findMany({
        orderBy: { name: "asc" },
      });
      return NextResponse.json({
        rules: rules.map((r) => ({
          ...r,
          conditions: JSON.parse(r.conditions),
        })),
      });
    }

    if (view === "insights") {
      const pid = searchParams.get("prospectId");
      const insights = await prisma.insight.findMany({
        where: pid ? { prospectId: pid } : {},
        orderBy: { confidence: "desc" },
        take: 50,
        include: { prospect: { select: { companyName: true } } },
      });
      return NextResponse.json({ insights });
    }

    if (view === "dashboard") {
      const [totalIntel, published, prospects, insights, rules] = await Promise.all([
        prisma.accountIntelligence.count(),
        prisma.accountIntelligence.count({ where: { status: "published" } }),
        prisma.prospect.count(),
        prisma.insight.count(),
        prisma.inferenceRule.count({ where: { active: true } }),
      ]);

      return NextResponse.json({
        dashboard: { totalIntel, published, prospects, insights, activeRules: rules },
      });
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "GET error");
    return NextResponse.json({ error: "Failed to load intelligence" }, { status: 500 });
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

    if (action === "generate") {
      const { prospectId } = body;
      if (!prospectId) {
        return NextResponse.json({ error: "prospectId required" }, { status: 400 });
      }
      const intelligenceId = await intelligenceEngine.requestIntelligence(prospectId, "manual");
      const intel = await intelligenceEngine.getLatestIntelligence(prospectId);
      return NextResponse.json({
        success: true,
        intelligenceId,
        intelligence: intel ? formatIntelligence(intel) : null,
      });
    }

    if (action === "refresh") {
      const { prospectId } = body;
      if (!prospectId) {
        return NextResponse.json({ error: "prospectId required" }, { status: 400 });
      }
      const intelligenceId = await intelligenceEngine.requestIntelligence(prospectId, "refresh");
      const intel = await intelligenceEngine.getLatestIntelligence(prospectId);
      return NextResponse.json({
        success: true,
        intelligenceId,
        intelligence: intel ? formatIntelligence(intel) : null,
      });
    }

    if (action === "update_rule") {
      const { ruleId, updates } = body;
      if (!ruleId) {
        return NextResponse.json({ error: "ruleId required" }, { status: 400 });
      }
      const data: Record<string, unknown> = {};
      if (updates.active !== undefined) data.active = updates.active;
      if (updates.confidenceBase !== undefined) data.confidenceBase = updates.confidenceBase;
      if (updates.description !== undefined) data.description = updates.description;
      if (updates.conditions !== undefined) data.conditions = JSON.stringify(updates.conditions);

      const rule = await prisma.inferenceRule.update({
        where: { id: ruleId },
        data,
      });
      return NextResponse.json({
        success: true,
        rule: { ...rule, conditions: JSON.parse(rule.conditions) },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "POST error");
    return NextResponse.json({ error: "Failed to process intelligence request" }, { status: 500 });
  }
});

function formatIntelligence(intel: {
  id: string;
  version: number;
  status: string;
  overallConfidence: number | null;
  overallFreshness: number;
  meetingBrief: string | null;
  diffFromPrevious: string | null;
  triggeringEvent: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  sections: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
    confidence: number;
    freshness: number;
    evidenceCount: number;
  }>;
  insights: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    confidence: number;
    importance: string;
    derivedFrom: string;
    evidence: string | null;
    recommendation: string | null;
    recommendedService: string | null;
  }>;
  prospect: {
    id: string;
    companyName: string;
    signals: Array<{
      id: string;
      type: string;
      value: string;
      confidence: number;
      importance: string;
      evidence: string | null;
    }>;
  };
}) {
  return {
    id: intel.id,
    version: intel.version,
    status: intel.status,
    overallConfidence: intel.overallConfidence,
    overallFreshness: intel.overallFreshness,
    triggeringEvent: intel.triggeringEvent,
    createdAt: intel.createdAt,
    publishedAt: intel.publishedAt,
    meetingBrief: intel.meetingBrief ? JSON.parse(intel.meetingBrief) : null,
    diffFromPrevious: intel.diffFromPrevious ? JSON.parse(intel.diffFromPrevious) : null,
    sections: intel.sections.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      content: JSON.parse(s.content),
      confidence: s.confidence,
      freshness: s.freshness,
      evidenceCount: s.evidenceCount,
    })),
    insights: intel.insights.map((i) => ({
      ...i,
      derivedFrom: JSON.parse(i.derivedFrom),
    })),
    prospect: intel.prospect,
  };
}
