import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:growth:analytics");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [
      totalCompanies,
      companiesByStatus,
      companiesByGrade,
      companiesByIndustry,
      totalOpportunities,
      opportunitiesByStage,
      pipelineValue,
      totalContacts,
      totalSequences,
      sequencesByStatus,
      recentActivities,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.groupBy({ by: ["status"], _count: true }),
      prisma.company.groupBy({ by: ["qualificationGrade"], _count: true, where: { qualificationGrade: { not: null } } }),
      prisma.company.groupBy({ by: ["industry"], _count: true, orderBy: { _count: { industry: "desc" } }, take: 10 }),
      prisma.opportunity.count(),
      prisma.opportunity.groupBy({ by: ["stage"], _count: true, _sum: { estimatedValue: true } }),
      prisma.opportunity.aggregate({ _sum: { estimatedValue: true }, where: { stage: { notIn: ["lost"] } } }),
      prisma.contact.count(),
      prisma.outreachSequence.count(),
      prisma.outreachSequence.groupBy({ by: ["status"], _count: true }),
      prisma.growthActivity.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          company: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    const qualified = companiesByGrade
      .filter(g => g.qualificationGrade === "A" || g.qualificationGrade === "B")
      .reduce((sum, g) => sum + g._count, 0);

    const funnel = {
      discovered: companiesByStatus.find(s => s.status === "discovered")?._count || 0,
      researching: companiesByStatus.find(s => s.status === "researching")?._count || 0,
      qualified: companiesByStatus.find(s => s.status === "qualified")?._count || 0,
      outreach: companiesByStatus.find(s => s.status === "outreach")?._count || 0,
      engaged: companiesByStatus.find(s => s.status === "engaged")?._count || 0,
      meeting: companiesByStatus.find(s => s.status === "meeting")?._count || 0,
      proposal: companiesByStatus.find(s => s.status === "proposal")?._count || 0,
      won: companiesByStatus.find(s => s.status === "won")?._count || 0,
      lost: companiesByStatus.find(s => s.status === "lost")?._count || 0,
    };

    return NextResponse.json({
      summary: {
        totalCompanies,
        qualified,
        totalOpportunities,
        pipelineValue: pipelineValue._sum.estimatedValue || 0,
        totalContacts,
        totalSequences,
        conversionRate: totalCompanies > 0
          ? Math.round((funnel.won / totalCompanies) * 100)
          : 0,
      },
      funnel,
      companiesByGrade: companiesByGrade.map(g => ({
        grade: g.qualificationGrade,
        count: g._count,
      })),
      companiesByIndustry: companiesByIndustry.map(i => ({
        industry: i.industry,
        count: i._count,
      })),
      opportunitiesByStage: opportunitiesByStage.map(s => ({
        stage: s.stage,
        count: s._count,
        value: s._sum.estimatedValue || 0,
      })),
      outreachByStatus: sequencesByStatus.map(s => ({
        status: s.status,
        count: s._count,
      })),
      recentActivities: recentActivities.map(a => ({
        id: a.id,
        type: a.type,
        content: a.content,
        company: a.company,
        user: a.user,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Growth analytics error");
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
});
