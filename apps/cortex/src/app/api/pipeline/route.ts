import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const PIPELINE_STAGES = [
  "new",
  "qualified",
  "interested",
  "negotiation",
  "onboarded",
  "active_merchant",
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["qualified", "not_interested"],
  qualified: ["interested", "new", "not_interested"],
  interested: ["negotiation", "qualified", "not_interested"],
  negotiation: ["onboarded", "interested", "not_interested"],
  onboarded: ["active_merchant", "negotiation"],
  active_merchant: ["onboarded"],
  follow_up: ["qualified", "interested", "negotiation", "not_interested"],
  not_interested: ["new", "qualified"],
};

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "board";

    if (view === "board") {
      const bdeId = searchParams.get("bdeId");
      const category = searchParams.get("category");
      const search = searchParams.get("search");

      const where: Record<string, unknown> = {};
      if (bdeId) where.bdeId = bdeId;
      if (category) where.category = category;
      if (search) {
        where.OR = [
          { businessName: { contains: search } },
          { ownerName: { contains: search } },
          { mobile: { contains: search } },
        ];
      }

      const surveys = await prisma.vendorSurvey.findMany({
        where,
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          mobile: true,
          category: true,
          leadScore: true,
          leadStatus: true,
          interestLevel: true,
          potentialRevenue: true,
          stageChangedAt: true,
          createdAt: true,
          bde: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const columns: Record<string, typeof surveys> = {};
      for (const stage of PIPELINE_STAGES) {
        columns[stage] = [];
      }
      columns["not_interested"] = [];

      for (const s of surveys) {
        const status = s.leadStatus;
        if (status === "follow_up") {
          columns["qualified"].push(s);
        } else if (columns[status]) {
          columns[status].push(s);
        } else {
          columns["new"].push(s);
        }
      }

      const bdes = await prisma.user.findMany({
        where: { role: "bde", active: true },
        select: { id: true, name: true },
      });

      return NextResponse.json({ columns, bdes, total: surveys.length });
    }

    if (view === "stats") {
      const allSurveys = await prisma.vendorSurvey.findMany({
        select: {
          leadStatus: true,
          potentialRevenue: true,
          stageChangedAt: true,
          createdAt: true,
        },
      });

      const stageCounts: Record<string, number> = {};
      let totalRevenue = 0;
      for (const stage of PIPELINE_STAGES) {
        stageCounts[stage] = 0;
      }
      stageCounts["not_interested"] = 0;

      for (const s of allSurveys) {
        const status = s.leadStatus === "follow_up" ? "qualified" : s.leadStatus;
        if (stageCounts[status] !== undefined) {
          stageCounts[status]++;
        } else {
          stageCounts["new"]++;
        }
        if (s.potentialRevenue) totalRevenue += s.potentialRevenue;
      }

      const transitions = await prisma.stageTransition.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          survey: { select: { id: true, businessName: true } },
          user: { select: { id: true, name: true } },
        },
      });

      const totalActive = allSurveys.length - (stageCounts["not_interested"] || 0);
      const onboardedPlus = (stageCounts["onboarded"] || 0) + (stageCounts["active_merchant"] || 0);
      const conversionRate = totalActive > 0 ? Math.round((onboardedPlus / totalActive) * 100) : 0;

      return NextResponse.json({
        stageCounts,
        totalRevenue,
        totalActive,
        conversionRate,
        recentTransitions: transitions,
      });
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (error) {
    console.error("Pipeline GET error:", error);
    return NextResponse.json({ error: "Failed to fetch pipeline" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { surveyId, toStage, notes } = body;

    if (!surveyId || !toStage) {
      return NextResponse.json(
        { error: "surveyId and toStage are required" },
        { status: 400 }
      );
    }

    const survey = await prisma.vendorSurvey.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const fromStage = survey.leadStatus;
    const allowed = VALID_TRANSITIONS[fromStage];
    if (!allowed || !allowed.includes(toStage)) {
      return NextResponse.json(
        {
          error: `Cannot move from "${fromStage}" to "${toStage}"`,
          allowedTransitions: allowed || [],
        },
        { status: 400 }
      );
    }

    const [updatedSurvey, transition] = await Promise.all([
      prisma.vendorSurvey.update({
        where: { id: surveyId },
        data: { leadStatus: toStage, stageChangedAt: new Date() },
      }),
      prisma.stageTransition.create({
        data: {
          surveyId,
          userId: user.id,
          fromStage,
          toStage,
          notes: notes || null,
        },
      }),
    ]);

    await prisma.activity.create({
      data: {
        type: "status_change",
        content: `Pipeline stage changed from "${fromStage}" to "${toStage}"${notes ? `: ${notes}` : ""}`,
        userId: user.id,
        vendorSurveyId: surveyId,
        metadata: JSON.stringify({ fromStage, toStage, transitionId: transition.id }),
      },
    });

    return NextResponse.json({
      survey: updatedSurvey,
      transition,
    });
  } catch (error) {
    console.error("Pipeline POST error:", error);
    return NextResponse.json({ error: "Failed to move pipeline stage" }, { status: 500 });
  }
}
