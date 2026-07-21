import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  calculateOpportunityScore,
  assessDealHealth,
  predictStageProgression,
  forecastRevenue,
  generateNextActions,
  analyzeTerritories,
  generateSuggestedOffer,
  generateFollowUpMessage,
} from "@/lib/ai-engine";

function buildMerchantData(survey: Record<string, unknown>) {
  return {
    id: survey.id as string,
    businessName: survey.businessName as string,
    ownerName: survey.ownerName as string,
    mobile: survey.mobile as string,
    category: survey.category as string,
    address: survey.address as string,
    leadScore: survey.leadScore as number | null,
    leadStatus: survey.leadStatus as string,
    interestLevel: survey.interestLevel as string | null,
    potentialRevenue: survey.potentialRevenue as number | null,
    monthlyRevenue: survey.monthlyRevenue as number | null,
    currentCommission: survey.currentCommission as number | null,
    dailyOrdersOnline: survey.dailyOrdersOnline as number | null,
    dailyOrdersWalkIn: survey.dailyOrdersWalkIn as number | null,
    averageOrderValue: survey.averageOrderValue as number | null,
    yearsInBusiness: survey.yearsInBusiness as number | null,
    wouldJoinRynOne: survey.wouldJoinRynOne as string | null,
    painPoints: (survey.painPoints as string) || "{}",
    platformCommissions: (survey.platformCommissions as string) || "{}",
    onlinePlatforms: (survey.onlinePlatforms as string) || "[]",
    businessSentiment: survey.businessSentiment as string | null,
    stageChangedAt: survey.stageChangedAt ? (survey.stageChangedAt as Date).toISOString() : null,
    createdAt: (survey.createdAt as Date).toISOString(),
    bde: survey.bde as { id: string; name: string } | null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    // ─── Merchant-level insights ───────────────────────────────
    if (type === "merchant") {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }

      const survey = await prisma.vendorSurvey.findUnique({
        where: { id },
        include: { bde: { select: { id: true, name: true } } },
      });
      if (!survey) {
        return NextResponse.json({ error: "Survey not found" }, { status: 404 });
      }

      const [activities, transitions] = await Promise.all([
        prisma.activity.findMany({
          where: { vendorSurveyId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, type: true, content: true, createdAt: true },
        }),
        prisma.stageTransition.findMany({
          where: { surveyId: id },
          orderBy: { createdAt: "desc" },
          select: { fromStage: true, toStage: true, createdAt: true },
        }),
      ]);

      const merchantData = buildMerchantData(survey as unknown as Record<string, unknown>);
      const activityData = activities.map(a => ({
        id: a.id,
        type: a.type,
        content: a.content,
        createdAt: a.createdAt.toISOString(),
      }));
      const transitionData = transitions.map(t => ({
        fromStage: t.fromStage,
        toStage: t.toStage,
        createdAt: t.createdAt.toISOString(),
      }));

      const opportunity = calculateOpportunityScore(merchantData);
      const dealHealth = assessDealHealth(merchantData, activityData);
      const prediction = predictStageProgression(merchantData, transitionData);
      const suggestedOffer = generateSuggestedOffer(merchantData);
      const followUpMessage = generateFollowUpMessage(merchantData);

      return NextResponse.json({
        opportunity,
        dealHealth,
        prediction,
        suggestedOffer,
        followUpMessage,
      });
    }

    // ─── Founder dashboard insights ────────────────────────────
    if (type === "founder") {
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const allSurveys = await prisma.vendorSurvey.findMany({
        include: { bde: { select: { id: true, name: true } } },
      });

      const allActivities = await prisma.activity.findMany({
        where: { vendorSurveyId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, content: true, createdAt: true, vendorSurveyId: true },
      });

      const activitiesMap = new Map<string, { id: string; type: string; content: string; createdAt: string }[]>();
      for (const a of allActivities) {
        const key = a.vendorSurveyId!;
        if (!activitiesMap.has(key)) activitiesMap.set(key, []);
        activitiesMap.get(key)!.push({
          id: a.id,
          type: a.type,
          content: a.content,
          createdAt: a.createdAt.toISOString(),
        });
      }

      const merchants = allSurveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));

      // Revenue forecast
      const forecast = forecastRevenue(merchants);

      // Next best actions
      const actions = generateNextActions(merchants, activitiesMap, 10);

      // Territory intelligence (top 5)
      const territories = analyzeTerritories(merchants, activitiesMap).slice(0, 5);

      // Pipeline summary
      const stageCounts: Record<string, number> = {};
      for (const m of merchants) {
        const status = m.leadStatus === "follow_up" ? "qualified" : m.leadStatus;
        stageCounts[status] = (stageCounts[status] ?? 0) + 1;
      }

      // Risk summary
      const atRiskMerchants = merchants
        .filter(m => m.leadStatus !== "not_interested" && m.leadStatus !== "active_merchant")
        .map(m => {
          const acts = activitiesMap.get(m.id) || [];
          const health = assessDealHealth(m, acts);
          return { merchant: m, health };
        })
        .filter(r => r.health.status === "at_risk")
        .sort((a, b) => a.health.score - b.health.score)
        .slice(0, 5)
        .map(r => ({
          id: r.merchant.id,
          businessName: r.merchant.businessName,
          ownerName: r.merchant.ownerName,
          stage: r.merchant.leadStatus,
          daysSinceActivity: r.health.daysSinceActivity,
          daysInStage: r.health.daysInStage,
          healthScore: r.health.score,
          recommendation: r.health.recommendation,
        }));

      // High-priority count (at-risk + stalled in active stages)
      const highPriority = merchants.filter(m => {
        if (m.leadStatus === "not_interested" || m.leadStatus === "active_merchant") return false;
        const acts = activitiesMap.get(m.id) || [];
        const health = assessDealHealth(m, acts);
        return health.status !== "healthy";
      }).length;

      // Today's follow-ups
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todayFollowUps = await prisma.followUp.count({
        where: {
          scheduledAt: { gte: today, lt: tomorrow },
          status: "pending",
        },
      });

      // Pipeline value
      const pipelineValue = merchants
        .filter(m => m.leadStatus !== "not_interested")
        .reduce((sum, m) => sum + (m.potentialRevenue ?? m.monthlyRevenue ?? 0), 0);

      // Negotiations count
      const negotiations = stageCounts["negotiation"] ?? 0;
      const onboardings = stageCounts["onboarded"] ?? 0;

      return NextResponse.json({
        pipelineValue,
        forecast,
        actions,
        territories,
        stageCounts,
        atRiskMerchants,
        highPriority,
        todayFollowUps,
        negotiations,
        onboardings,
        totalMerchants: merchants.length,
        activePipeline: merchants.filter(m => m.leadStatus !== "not_interested").length,
      });
    }

    // ─── Territory view ────────────────────────────────────────
    if (type === "territory") {
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const allSurveys = await prisma.vendorSurvey.findMany({
        include: { bde: { select: { id: true, name: true } } },
      });

      const allActivities = await prisma.activity.findMany({
        where: { vendorSurveyId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, content: true, createdAt: true, vendorSurveyId: true },
      });

      const activitiesMap = new Map<string, { id: string; type: string; content: string; createdAt: string }[]>();
      for (const a of allActivities) {
        const key = a.vendorSurveyId!;
        if (!activitiesMap.has(key)) activitiesMap.set(key, []);
        activitiesMap.get(key)!.push({
          id: a.id,
          type: a.type,
          content: a.content,
          createdAt: a.createdAt.toISOString(),
        });
      }

      const merchants = allSurveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));
      const territories = analyzeTerritories(merchants, activitiesMap);

      return NextResponse.json({ territories });
    }

    return NextResponse.json({ error: "Invalid type. Use: merchant, founder, territory" }, { status: 400 });
  } catch (error) {
    console.error("AI insights error:", error);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}
