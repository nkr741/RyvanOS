import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../runtime/base-agent";
import { type AgentContext } from "../runtime/context";
import { assessDealHealth } from "@/lib/ai-engine";

export class CRMAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "crm-agent",
    version: "1.0",
    name: "CRM Agent",
    description: "Creates follow-ups, logs activities, and manages pipeline engagement",
    owner: "cortex",
    permissions: ["followup:create", "activity:create", "survey:read"],
    subscribes: ["proposal.generated.v1", "merchant.analyzed.v1"],
    publishes: ["followup.created.v1", "activity.logged.v1"],
    tools: ["database"],
    memoryScopes: ["merchant"],
  };

  canHandle(eventType: string): boolean {
    return this.manifest.subscribes.some(s => eventType === s);
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    const action = (input.action as string) || "create_followup";
    ctx.addReasoning(`Planning CRM action: ${action}`);

    if (action === "batch_followups") {
      return {
        steps: ["Load stalled deals from previous step", "Create follow-up for each", "Log activities"],
        estimatedDurationMs: 2000,
        requiresApproval: false,
      };
    }

    return {
      steps: ["Load merchant data", "Determine optimal follow-up", "Create follow-up task", "Log activity"],
      estimatedDurationMs: 500,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const action = (input.action as string) || "create_followup";

    switch (action) {
      case "create_followup":
        return this.createFollowUp(ctx, input);
      case "batch_followups":
        return this.batchFollowUps(ctx, input);
      default:
        return { success: false, data: { error: `Unknown action: ${action}` }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    if (!result.success) return { valid: false, issues: ["Execution failed"], confidence: 0 };
    return { valid: true, issues: [], confidence: 90 };
  }

  private async createFollowUp(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    const merchantId = input.merchantId as string;
    if (!merchantId) {
      return { success: false, data: { error: "merchantId required" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    ctx.addReasoning(`Creating follow-up for merchant ${merchantId}`);

    const survey = await prisma.vendorSurvey.findUnique({
      where: { id: merchantId },
      select: { id: true, businessName: true, ownerName: true, leadStatus: true, bdeId: true },
    });

    if (!survey) {
      return { success: false, data: { error: "Merchant not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    const proposalData = previousOutput?.suggestedOffer as Record<string, unknown> | undefined;

    const categoryMap: Record<string, string> = {
      new: "call",
      qualified: "call",
      interested: "demo",
      negotiation: "negotiation",
      onboarded: "onboarding",
    };

    const priorityMap: Record<string, string> = {
      new: "medium",
      qualified: "medium",
      interested: "high",
      negotiation: "high",
      onboarded: "urgent",
    };

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + (survey.leadStatus === "negotiation" ? 1 : 2));
    scheduledAt.setHours(10, 0, 0, 0);

    let notes = `Auto-created by Cortex Mission. Stage: ${survey.leadStatus}.`;
    if (proposalData) {
      notes += ` Proposal: ${proposalData.commissionRate} commission.`;
    }

    const followUp = await prisma.followUp.create({
      data: {
        surveyId: merchantId,
        bdeId: survey.bdeId,
        scheduledAt,
        notes,
        priority: priorityMap[survey.leadStatus] || "medium",
        category: categoryMap[survey.leadStatus] || "follow_up",
      },
    });

    await prisma.activity.create({
      data: {
        type: "note",
        content: `Cortex created follow-up: ${categoryMap[survey.leadStatus] || "follow_up"} scheduled for ${scheduledAt.toLocaleDateString("en-IN")}`,
        userId: survey.bdeId,
        vendorSurveyId: merchantId,
        metadata: JSON.stringify({ source: "cao", missionId: ctx.mission.missionId, agentId: "crm-agent" }),
      },
    });

    ctx.addReasoning(`Follow-up created: ${followUp.id}, category=${followUp.category}, priority=${followUp.priority}`);

    return {
      success: true,
      data: {
        followUpId: followUp.id,
        merchantId,
        businessName: survey.businessName,
        scheduledAt: scheduledAt.toISOString(),
        category: followUp.category,
        priority: followUp.priority,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "followup.created.v1",
        payload: {
          followUpId: followUp.id,
          merchantId,
          businessName: survey.businessName,
          category: followUp.category,
          scheduledAt: scheduledAt.toISOString(),
        },
      }],
    };
  }

  private async batchFollowUps(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    ctx.addReasoning("Creating batch follow-ups for stalled deals");

    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    let merchants = (previousOutput?.merchants as Array<Record<string, unknown>>) || [];

    if (merchants.length === 0) {
      const surveys = await prisma.vendorSurvey.findMany({
        where: { leadStatus: { notIn: ["not_interested", "active_merchant"] } },
        select: {
          id: true, businessName: true, ownerName: true, leadStatus: true, bdeId: true,
          stageChangedAt: true, createdAt: true, currentCommission: true,
          dailyOrdersOnline: true, dailyOrdersWalkIn: true, averageOrderValue: true,
          potentialRevenue: true, monthlyRevenue: true, interestLevel: true,
          leadScore: true, yearsInBusiness: true, wouldJoinRynOne: true,
          painPoints: true, platformCommissions: true, onlinePlatforms: true,
          businessSentiment: true, category: true, address: true, mobile: true,
        },
      });

      const activities = await prisma.activity.findMany({
        where: { vendorSurveyId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, content: true, createdAt: true, vendorSurveyId: true },
      });

      const actMap = new Map<string, { id: string; type: string; content: string; createdAt: string }[]>();
      for (const a of activities) {
        const key = a.vendorSurveyId!;
        if (!actMap.has(key)) actMap.set(key, []);
        actMap.get(key)!.push({ id: a.id, type: a.type, content: a.content, createdAt: a.createdAt.toISOString() });
      }

      merchants = surveys
        .filter(s => {
          const acts = actMap.get(s.id) || [];
          const merchantData = {
            id: s.id, businessName: s.businessName, ownerName: s.ownerName, mobile: s.mobile,
            category: s.category, address: s.address, leadScore: s.leadScore, leadStatus: s.leadStatus,
            interestLevel: s.interestLevel, potentialRevenue: s.potentialRevenue,
            monthlyRevenue: s.monthlyRevenue, currentCommission: s.currentCommission,
            dailyOrdersOnline: s.dailyOrdersOnline, dailyOrdersWalkIn: s.dailyOrdersWalkIn,
            averageOrderValue: s.averageOrderValue, yearsInBusiness: s.yearsInBusiness,
            wouldJoinRynOne: s.wouldJoinRynOne, painPoints: s.painPoints,
            platformCommissions: s.platformCommissions, onlinePlatforms: s.onlinePlatforms,
            businessSentiment: s.businessSentiment,
            stageChangedAt: s.stageChangedAt?.toISOString() || null,
            createdAt: s.createdAt.toISOString(), bde: null,
          };
          const health = assessDealHealth(merchantData, acts);
          return health.status !== "healthy";
        })
        .map(s => ({
          id: s.id, businessName: s.businessName, stage: s.leadStatus, bdeId: s.bdeId,
        }));
    }

    let created = 0;
    for (const m of merchants.slice(0, 10)) {
      const survey = await prisma.vendorSurvey.findUnique({
        where: { id: m.id as string },
        select: { bdeId: true },
      });
      if (!survey) continue;

      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 1);
      scheduledAt.setHours(10, 0, 0, 0);

      await prisma.followUp.create({
        data: {
          surveyId: m.id as string,
          bdeId: survey.bdeId,
          scheduledAt,
          notes: `Auto-created: ${m.businessName} needs re-engagement. Stage: ${m.stage}`,
          priority: "high",
          category: "follow_up",
        },
      });
      created++;
    }

    ctx.addReasoning(`Created ${created} follow-ups from ${merchants.length} candidates`);

    return {
      success: true,
      data: { created, totalCandidates: merchants.length },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "followup.batch_created.v1",
        payload: { count: created },
      }],
    };
  }
}
