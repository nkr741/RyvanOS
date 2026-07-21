import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../runtime/base-agent";
import { type AgentContext } from "../runtime/context";
import { generateSuggestedOffer, generateFollowUpMessage, calculateOpportunityScore } from "@/lib/ai-engine";

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

export class ProposalAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "proposal-agent",
    version: "1.0",
    name: "Proposal Agent",
    description: "Generates merchant proposals with commission analysis, incentives, and follow-up messaging",
    owner: "cortex",
    permissions: ["survey:read", "proposal:create"],
    subscribes: ["merchant.analyzed.v1"],
    publishes: ["proposal.generated.v1"],
    tools: ["ai-engine"],
    memoryScopes: ["merchant", "templates"],
  };

  canHandle(eventType: string): boolean {
    return this.manifest.subscribes.some(s => eventType === s);
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    ctx.addReasoning(`Planning proposal generation for merchant: ${input.merchantId}`);
    return {
      steps: [
        "Load merchant profile",
        "Analyze competitive landscape",
        "Generate commission offer",
        "Draft follow-up message",
        "Compile proposal package",
      ],
      estimatedDurationMs: 800,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const merchantId = input.merchantId as string;
    if (!merchantId) {
      return { success: false, data: { error: "merchantId required" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    ctx.addReasoning(`Loading merchant ${merchantId}`);

    const survey = await prisma.vendorSurvey.findUnique({
      where: { id: merchantId },
      include: { bde: { select: { id: true, name: true } } },
    });

    if (!survey) {
      return { success: false, data: { error: "Merchant not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const merchantData = buildMerchantData(survey as unknown as Record<string, unknown>);

    ctx.addReasoning("Generating commission offer");
    const offer = generateSuggestedOffer(merchantData);

    ctx.addReasoning("Generating follow-up message");
    const message = generateFollowUpMessage(merchantData);

    ctx.addReasoning("Calculating opportunity score");
    const opportunity = calculateOpportunityScore(merchantData);

    let competitorAnalysis: string[] = [];
    try {
      const platforms = JSON.parse(merchantData.onlinePlatforms) as string[];
      const commissions = JSON.parse(merchantData.platformCommissions) as Record<string, number>;
      competitorAnalysis = platforms.map(p => {
        const comm = commissions[p];
        return comm ? `${p}: ${comm}%` : p;
      });
    } catch { /* ignore */ }

    const proposal = {
      merchantId,
      businessName: survey.businessName,
      ownerName: survey.ownerName,
      category: survey.category,
      opportunityGrade: opportunity.grade,
      opportunityScore: opportunity.score,
      currentCommission: merchantData.currentCommission,
      suggestedOffer: offer,
      competitorLandscape: competitorAnalysis,
      followUpMessage: message,
      estimatedMonthlySavings: this.calculateSavings(merchantData, offer),
      generatedAt: new Date().toISOString(),
    };

    ctx.addReasoning(`Proposal generated: ${offer.commissionRate} commission, ${offer.urgency} urgency`);

    await ctx.memory.set(`proposal:${merchantId}`, {
      commission: offer.commissionRate,
      generatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      data: proposal,
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "proposal.generated.v1",
        payload: {
          merchantId,
          businessName: survey.businessName,
          commission: offer.commissionRate,
          urgency: offer.urgency,
          grade: opportunity.grade,
        },
      }],
    };
  }

  async validate(ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    const issues: string[] = [];

    if (!result.data.suggestedOffer) issues.push("No offer generated");
    if (!result.data.followUpMessage) issues.push("No follow-up message");

    const commission = result.data.suggestedOffer as { commissionRate: string } | undefined;
    if (commission) {
      const rate = parseFloat(commission.commissionRate);
      if (rate < 3 || rate > 40) issues.push(`Commission rate ${rate}% outside reasonable range`);
    }

    ctx.addReasoning(`Validation: ${issues.length} issues`);

    return {
      valid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 85 : 30,
    };
  }

  private calculateSavings(
    merchant: { currentCommission: number | null; dailyOrdersOnline: number | null; averageOrderValue: number | null },
    offer: { commissionRate: string },
  ): number {
    const current = merchant.currentCommission ?? 0;
    const suggested = parseFloat(offer.commissionRate);
    const dailyOrders = merchant.dailyOrdersOnline ?? 0;
    const aov = merchant.averageOrderValue ?? 200;

    if (current <= suggested) return 0;
    return Math.round(((current - suggested) / 100) * aov * dailyOrders * 30);
  }
}
