import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../runtime/base-agent";
import { type AgentContext } from "../runtime/context";
import {
  calculateOpportunityScore,
  assessDealHealth,
  predictStageProgression,
  forecastRevenue,
  generateNextActions,
  analyzeTerritories,
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

async function loadActivitiesMap(): Promise<Map<string, { id: string; type: string; content: string; createdAt: string }[]>> {
  const activities = await prisma.activity.findMany({
    where: { vendorSurveyId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, content: true, createdAt: true, vendorSurveyId: true },
  });

  const map = new Map<string, { id: string; type: string; content: string; createdAt: string }[]>();
  for (const a of activities) {
    const key = a.vendorSurveyId!;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ id: a.id, type: a.type, content: a.content, createdAt: a.createdAt.toISOString() });
  }
  return map;
}

export class ResearchAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "research-agent",
    version: "1.0",
    name: "Research Agent",
    description: "Analyzes merchants, territories, pipeline health, and revenue forecasts using the AI Decision Engine",
    owner: "cortex",
    permissions: ["survey:read", "activity:read", "transition:read"],
    subscribes: ["mission.created.v1"],
    publishes: ["merchant.analyzed.v1", "pipeline.reviewed.v1", "territory.analyzed.v1", "forecast.generated.v1"],
    tools: ["ai-engine", "database"],
    memoryScopes: ["merchant", "territory"],
  };

  canHandle(eventType: string): boolean {
    return this.manifest.subscribes.some(s => eventType === s);
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    const scope = (input.scope as string) || "merchant";

    if (input.merchantId) {
      ctx.addReasoning(`Planning merchant analysis for ID: ${input.merchantId}`);
      return {
        steps: ["Load merchant data", "Calculate opportunity score", "Assess deal health", "Predict stage progression"],
        estimatedDurationMs: 500,
        requiresApproval: false,
      };
    }

    const scopeSteps: Record<string, string[]> = {
      stalled_deals: ["Query pipeline", "Identify stalled merchants", "Generate re-engagement list"],
      territory: ["Load territory merchants", "Analyze territory metrics", "Generate recommendations"],
      rank_merchants: ["Load area merchants", "Score all merchants", "Rank by opportunity"],
      pipeline_health: ["Load full pipeline", "Assess each deal", "Compute health metrics"],
      revenue_forecast: ["Load pipeline", "Calculate stage probabilities", "Generate forecast"],
      overnight_summary: ["Load recent activities", "Identify changes", "Compile summary"],
      daily_priorities: ["Load all merchants", "Generate next actions", "Rank by priority"],
    };

    ctx.addReasoning(`Planning scope: ${scope}`);
    return {
      steps: scopeSteps[scope] || ["Analyze data"],
      estimatedDurationMs: 1000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const scope = (input.scope as string) || "merchant";

    if (input.merchantId) {
      return this.analyzeMerchant(ctx, input.merchantId as string);
    }

    switch (scope) {
      case "stalled_deals":
        return this.findStalledDeals(ctx);
      case "territory":
        return this.analyzeTerritory(ctx, input.area as string | undefined);
      case "rank_merchants":
        return this.rankMerchants(ctx, input.area as string | undefined);
      case "pipeline_health":
        return this.pipelineHealth(ctx);
      case "revenue_forecast":
        return this.revenueForecast(ctx);
      case "overnight_summary":
        return this.overnightSummary(ctx);
      case "daily_priorities":
        return this.dailyPriorities(ctx);
      default:
        return { success: false, data: { error: `Unknown scope: ${scope}` }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    if (!result.success) {
      return { valid: false, issues: ["Execution failed"], confidence: 0 };
    }
    return { valid: true, issues: [], confidence: 90 };
  }

  private async analyzeMerchant(ctx: AgentContext, merchantId: string): Promise<AgentResult> {
    ctx.addReasoning(`Loading merchant ${merchantId} from database`);

    const survey = await prisma.vendorSurvey.findUnique({
      where: { id: merchantId },
      include: { bde: { select: { id: true, name: true } } },
    });

    if (!survey) {
      return { success: false, data: { error: "Merchant not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const [activities, transitions] = await Promise.all([
      prisma.activity.findMany({
        where: { vendorSurveyId: merchantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, type: true, content: true, createdAt: true },
      }),
      prisma.stageTransition.findMany({
        where: { surveyId: merchantId },
        orderBy: { createdAt: "desc" },
        select: { fromStage: true, toStage: true, createdAt: true },
      }),
    ]);

    const merchantData = buildMerchantData(survey as unknown as Record<string, unknown>);
    const activityData = activities.map(a => ({ id: a.id, type: a.type, content: a.content, createdAt: a.createdAt.toISOString() }));
    const transitionData = transitions.map(t => ({ fromStage: t.fromStage, toStage: t.toStage, createdAt: t.createdAt.toISOString() }));

    const opportunity = calculateOpportunityScore(merchantData);
    const dealHealth = assessDealHealth(merchantData, activityData);
    const prediction = predictStageProgression(merchantData, transitionData);

    ctx.addReasoning(`Score: ${opportunity.score} (${opportunity.grade}), Health: ${dealHealth.status}, Prediction: ${prediction?.nextStage || "none"}`);

    await ctx.memory.set(`merchant:${merchantId}`, {
      score: opportunity.score,
      grade: opportunity.grade,
      health: dealHealth.status,
      analyzedAt: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        merchantId,
        businessName: survey.businessName,
        opportunity,
        dealHealth,
        prediction,
        activityCount: activityData.length,
        transitionCount: transitionData.length,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "merchant.analyzed.v1",
        payload: {
          merchantId,
          businessName: survey.businessName,
          score: opportunity.score,
          grade: opportunity.grade,
          health: dealHealth.status,
          prediction: prediction?.nextStage || null,
        },
      }],
    };
  }

  private async findStalledDeals(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Scanning pipeline for stalled deals");

    const surveys = await prisma.vendorSurvey.findMany({
      where: { leadStatus: { notIn: ["not_interested", "active_merchant"] } },
      include: { bde: { select: { id: true, name: true } } },
    });

    const activitiesMap = await loadActivitiesMap();
    const merchants = surveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));

    const stalled = merchants
      .map(m => {
        const acts = activitiesMap.get(m.id) || [];
        const health = assessDealHealth(m, acts);
        return { merchant: m, health };
      })
      .filter(r => r.health.status !== "healthy")
      .sort((a, b) => a.health.score - b.health.score);

    ctx.addReasoning(`Found ${stalled.length} stalled/at-risk deals out of ${merchants.length} active`);

    return {
      success: true,
      data: {
        totalActive: merchants.length,
        stalledCount: stalled.length,
        merchants: stalled.map(s => ({
          id: s.merchant.id,
          businessName: s.merchant.businessName,
          stage: s.merchant.leadStatus,
          healthStatus: s.health.status,
          healthScore: s.health.score,
          daysSinceActivity: s.health.daysSinceActivity,
          recommendation: s.health.recommendation,
          bde: s.merchant.bde?.name || "Unassigned",
        })),
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "pipeline.stalled_identified.v1",
        payload: { stalledCount: stalled.length, totalActive: merchants.length },
      }],
    };
  }

  private async analyzeTerritory(ctx: AgentContext, area?: string): Promise<AgentResult> {
    ctx.addReasoning(`Analyzing territory${area ? `: ${area}` : ": all"}`);

    const surveys = await prisma.vendorSurvey.findMany({
      include: { bde: { select: { id: true, name: true } } },
    });

    const activitiesMap = await loadActivitiesMap();
    const merchants = surveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));
    const territories = analyzeTerritories(merchants, activitiesMap);

    const filtered = area ? territories.filter(t => t.area.toLowerCase().includes(area.toLowerCase())) : territories;

    ctx.addReasoning(`Found ${filtered.length} territories with 2+ merchants`);

    return {
      success: true,
      data: { territories: filtered, totalTerritories: territories.length },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "territory.analyzed.v1",
        payload: { count: filtered.length, topArea: filtered[0]?.area || "none" },
      }],
    };
  }

  private async rankMerchants(ctx: AgentContext, area?: string): Promise<AgentResult> {
    ctx.addReasoning(`Ranking merchants${area ? ` in area: ${area}` : ""}`);

    let surveys;
    if (area) {
      surveys = await prisma.vendorSurvey.findMany({
        where: { address: { contains: area } },
        include: { bde: { select: { id: true, name: true } } },
      });
    } else {
      surveys = await prisma.vendorSurvey.findMany({
        where: { leadStatus: { notIn: ["not_interested", "active_merchant"] } },
        include: { bde: { select: { id: true, name: true } } },
      });
    }

    const merchants = surveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));
    const ranked = merchants
      .map(m => ({ merchant: m, score: calculateOpportunityScore(m) }))
      .sort((a, b) => b.score.score - a.score.score);

    ctx.addReasoning(`Ranked ${ranked.length} merchants`);

    return {
      success: true,
      data: {
        ranked: ranked.map(r => ({
          id: r.merchant.id,
          businessName: r.merchant.businessName,
          score: r.score.score,
          grade: r.score.grade,
          stage: r.merchant.leadStatus,
          bde: r.merchant.bde?.name || "Unassigned",
        })),
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [],
    };
  }

  private async pipelineHealth(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Running pipeline health check");

    const surveys = await prisma.vendorSurvey.findMany({
      include: { bde: { select: { id: true, name: true } } },
    });

    const activitiesMap = await loadActivitiesMap();
    const merchants = surveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));

    let healthy = 0, stalled = 0, atRisk = 0;
    const active = merchants.filter(m => !["not_interested", "active_merchant"].includes(m.leadStatus));

    for (const m of active) {
      const acts = activitiesMap.get(m.id) || [];
      const h = assessDealHealth(m, acts);
      if (h.status === "healthy") healthy++;
      else if (h.status === "stalled") stalled++;
      else atRisk++;
    }

    ctx.addReasoning(`Pipeline: ${healthy} healthy, ${stalled} stalled, ${atRisk} at-risk`);

    return {
      success: true,
      data: {
        totalMerchants: merchants.length,
        activePipeline: active.length,
        healthy,
        stalled,
        atRisk,
        healthRate: active.length > 0 ? Math.round((healthy / active.length) * 100) : 0,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "pipeline.reviewed.v1",
        payload: { healthy, stalled, atRisk, total: active.length },
      }],
    };
  }

  private async revenueForecast(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Generating revenue forecast");

    const surveys = await prisma.vendorSurvey.findMany({
      include: { bde: { select: { id: true, name: true } } },
    });

    const merchants = surveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));
    const forecast = forecastRevenue(merchants);

    ctx.addReasoning(`Forecast: ₹${Math.round(forecast.expectedRevenue / 100000)}L expected, ${forecast.confidence}% confidence`);

    return {
      success: true,
      data: { forecast },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "forecast.generated.v1",
        payload: { expectedRevenue: forecast.expectedRevenue, confidence: forecast.confidence },
      }],
    };
  }

  private async overnightSummary(ctx: AgentContext): Promise<AgentResult> {
    const since = new Date();
    since.setHours(since.getHours() - 16);

    ctx.addReasoning(`Looking for activities since ${since.toISOString()}`);

    const recentActivities = await prisma.activity.findMany({
      where: { createdAt: { gte: since } },
      include: { user: { select: { name: true } }, vendorSurvey: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const recentTransitions = await prisma.stageTransition.findMany({
      where: { createdAt: { gte: since } },
      include: { user: { select: { name: true } }, survey: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
    });

    ctx.addReasoning(`Found ${recentActivities.length} activities, ${recentTransitions.length} transitions`);

    return {
      success: true,
      data: {
        period: `${since.toISOString()} to now`,
        activities: recentActivities.map(a => ({
          type: a.type,
          content: a.content,
          user: a.user.name,
          merchant: a.vendorSurvey?.businessName || "N/A",
          at: a.createdAt.toISOString(),
        })),
        transitions: recentTransitions.map(t => ({
          from: t.fromStage,
          to: t.toStage,
          user: t.user.name,
          merchant: t.survey.businessName,
          at: t.createdAt.toISOString(),
        })),
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [],
    };
  }

  private async dailyPriorities(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Generating daily priority actions");

    const surveys = await prisma.vendorSurvey.findMany({
      include: { bde: { select: { id: true, name: true } } },
    });

    const activitiesMap = await loadActivitiesMap();
    const merchants = surveys.map(s => buildMerchantData(s as unknown as Record<string, unknown>));
    const actions = generateNextActions(merchants, activitiesMap, 15);

    ctx.addReasoning(`Generated ${actions.length} priority actions`);

    return {
      success: true,
      data: { actions, generatedAt: new Date().toISOString() },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [],
    };
  }
}
