import { prisma } from "@/lib/prisma";
import { eventBus } from "../runtime/event";
import { agentRegistry } from "../runtime/registry";
import { executionEngine } from "../execution/engine";
import { agentAdapter } from "../execution/adapters";
import { createLogger } from "@/lib/logger";

const log = createLogger("orchestrator");

const ORCHESTRATOR_OPTIONS = {
  failurePolicy: "fail-fast" as const,
  source: "orchestrator",
};

// ─── Mission Plan ───────────────────────────────────────────────

export interface MissionStepPlan {
  agentId: string;
  title: string;
  input: Record<string, unknown>;
  approvalRequired: boolean;
}

// ─── Mission Templates ──────────────────────────────────────────
// The Orchestrator decomposes mission types into step plans.
// No business logic here — only coordination.

const MISSION_TEMPLATES: Record<string, (config: Record<string, unknown>) => MissionStepPlan[]> = {
  merchant_acquisition: (config) => [
    {
      agentId: "research-agent",
      title: "Research & Analyze Merchant",
      input: { merchantId: config.merchantId },
      approvalRequired: false,
    },
    {
      agentId: "proposal-agent",
      title: "Generate Proposal",
      input: { merchantId: config.merchantId },
      approvalRequired: false,
    },
    {
      agentId: "crm-agent",
      title: "Create Follow-up Plan",
      input: { merchantId: config.merchantId, action: "create_followup" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Notify BDE",
      input: { merchantId: config.merchantId, action: "notify_bde" },
      approvalRequired: false,
    },
  ],

  follow_up_campaign: (config) => [
    {
      agentId: "research-agent",
      title: "Identify Stalled Deals",
      input: { scope: "stalled_deals" },
      approvalRequired: false,
    },
    {
      agentId: "crm-agent",
      title: "Create Follow-up Tasks",
      input: { action: "batch_followups", scope: "stalled" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Alert BDEs",
      input: {
        action: "batch_notify",
        scope: "stalled",
        ...(config.bdeId ? { bdeId: config.bdeId } : {}),
      },
      approvalRequired: false,
    },
  ],

  territory_blitz: (config) => [
    {
      agentId: "research-agent",
      title: "Analyze Territory",
      input: { scope: "territory", area: config.area },
      approvalRequired: false,
    },
    {
      agentId: "research-agent",
      title: "Rank Merchants by Opportunity",
      input: { scope: "rank_merchants", area: config.area },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Send Territory Briefing",
      input: { action: "territory_briefing", area: config.area },
      approvalRequired: false,
    },
  ],

  pipeline_review: () => [
    {
      agentId: "research-agent",
      title: "Pipeline Health Check",
      input: { scope: "pipeline_health" },
      approvalRequired: false,
    },
    {
      agentId: "research-agent",
      title: "Revenue Forecast",
      input: { scope: "revenue_forecast" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Deliver Insights",
      input: { action: "pipeline_report" },
      approvalRequired: false,
    },
  ],

  morning_briefing: () => [
    {
      agentId: "research-agent",
      title: "Compile Overnight Changes",
      input: { scope: "overnight_summary" },
      approvalRequired: false,
    },
    {
      agentId: "research-agent",
      title: "Today's Priority Actions",
      input: { scope: "daily_priorities" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Send Morning Brief",
      input: { action: "morning_brief" },
      approvalRequired: false,
    },
  ],

  // ─── Growth Engine Mission Types ────────────────────────────────

  company_research: (config) => [
    {
      agentId: "growth-agent",
      title: "Research & Qualify Company",
      input: { companyId: config.companyId, action: "research_company" },
      approvalRequired: false,
    },
    {
      agentId: "growth-agent",
      title: "Discover Opportunities",
      input: { companyId: config.companyId, action: "discover_opportunities" },
      approvalRequired: false,
    },
    {
      agentId: "outreach-agent",
      title: "Create Outreach Sequence",
      input: { companyId: config.companyId, action: "create_sequence" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Notify Team",
      input: { companyId: config.companyId, action: "notify_company", scope: "company_research" },
      approvalRequired: false,
    },
  ],

  outreach_sequence: (config) => [
    {
      agentId: "growth-agent",
      title: "Research Company Intelligence",
      input: { companyId: config.companyId, action: "research_company" },
      approvalRequired: false,
    },
    {
      agentId: "outreach-agent",
      title: "Create & Draft Sequence",
      input: { companyId: config.companyId, action: "create_sequence" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Alert for Approval",
      input: { companyId: config.companyId, action: "notify_company", scope: "outreach_ready" },
      approvalRequired: false,
    },
  ],

  growth_review: () => [
    {
      agentId: "growth-agent",
      title: "Batch Qualify Companies",
      input: { action: "batch_qualify" },
      approvalRequired: false,
    },
    {
      agentId: "growth-agent",
      title: "Growth Pipeline Review",
      input: { action: "growth_review" },
      approvalRequired: false,
    },
    {
      agentId: "outreach-agent",
      title: "Outreach Status Review",
      input: { action: "outreach_review" },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Deliver Growth Report",
      input: { action: "batch_notify", scope: "growth_review" },
      approvalRequired: false,
    },
  ],

  opportunity_hunt: (config) => [
    {
      agentId: "growth-agent",
      title: "Batch Qualify All Companies",
      input: { action: "batch_qualify" },
      approvalRequired: false,
    },
    {
      agentId: "growth-agent",
      title: "Discover Opportunities",
      input: { action: "discover_opportunities", industry: config.industry },
      approvalRequired: false,
    },
    {
      agentId: "notification-agent",
      title: "Report Findings",
      input: { action: "batch_notify", scope: "opportunities" },
      approvalRequired: false,
    },
  ],

  // ─── Company Intelligence Mission ────────────────────────────────
  // Evidence Collectors → Synthesis → Inference → Report
  // Each collector produces Evidence records. Synthesis converts to
  // DiscoverySignals and triggers the existing intelligence pipeline.

  company_intelligence: (config) => [
    {
      agentId: "website-collector",
      title: "Collect Website Evidence",
      input: { prospectId: config.prospectId, companyName: config.companyName, website: config.website },
      approvalRequired: false,
    },
    {
      agentId: "technology-collector",
      title: "Collect Technology Evidence",
      input: { prospectId: config.prospectId, companyName: config.companyName, website: config.website },
      approvalRequired: false,
    },
    {
      agentId: "hiring-collector",
      title: "Collect Hiring Evidence",
      input: { prospectId: config.prospectId, companyName: config.companyName },
      approvalRequired: false,
    },
    {
      agentId: "news-collector",
      title: "Collect News Evidence",
      input: { prospectId: config.prospectId, companyName: config.companyName },
      approvalRequired: false,
    },
    {
      agentId: "people-collector",
      title: "Collect Decision Maker Evidence",
      input: { prospectId: config.prospectId, companyName: config.companyName, website: config.website },
      approvalRequired: false,
    },
    {
      agentId: "buying-signal-collector",
      title: "Collect Buying Signal Evidence",
      input: { prospectId: config.prospectId, companyName: config.companyName, industry: config.industry },
      approvalRequired: false,
    },
    {
      agentId: "evidence-synthesis",
      title: "Synthesize Evidence → Intelligence Report",
      input: { prospectId: config.prospectId },
      approvalRequired: false,
    },
  ],
};

// ─── Orchestrator ───────────────────────────────────────────────
// Receives Mission → Builds Execution Plan → Wakes Agents → Tracks Progress
// Retries failures. Pauses for approval. Resumes on grant.
// NEVER contains business rules. Only coordinates.

class OrchestratorImpl {
  async createMission(
    title: string,
    type: string,
    createdById: string,
    config: Record<string, unknown> = {},
  ): Promise<string> {
    const template = MISSION_TEMPLATES[type];
    if (!template) {
      throw new Error(
        `Unknown mission type: ${type}. Available: ${Object.keys(MISSION_TEMPLATES).join(", ")}`,
      );
    }

    const stepPlans = template(config);

    for (const sp of stepPlans) {
      if (!agentRegistry.has(sp.agentId)) {
        throw new Error(
          `Agent '${sp.agentId}' not registered. Register all agents before creating missions.`,
        );
      }
    }

    const mission = await prisma.mission.create({
      data: {
        title,
        type,
        status: "planning",
        config: JSON.stringify(config),
        merchantId: (config.merchantId as string) || null,
        createdById,
        steps: {
          create: stepPlans.map((sp, i) => ({
            agentId: sp.agentId,
            sequence: i + 1,
            title: sp.title,
            input: JSON.stringify(sp.input),
            approvalRequired: sp.approvalRequired,
          })),
        },
      },
      include: { steps: true },
    });

    log.info({ missionId: mission.id, type, stepCount: stepPlans.length }, "mission created");

    await eventBus.publish({
      type: "mission.created.v1",
      version: "1",
      payload: {
        missionId: mission.id,
        title,
        type,
        stepCount: stepPlans.length,
      },
      source: "orchestrator",
      missionId: mission.id,
      correlationId: mission.id,
    });

    return mission.id;
  }

  async executeMission(missionId: string): Promise<void> {
    await executionEngine.run(missionId, agentAdapter, ORCHESTRATOR_OPTIONS);
  }

  async resumeMission(missionId: string): Promise<void> {
    await executionEngine.resume(missionId, agentAdapter, ORCHESTRATOR_OPTIONS);
  }

  async cancelMission(missionId: string): Promise<void> {
    await executionEngine.cancel(missionId, agentAdapter, ORCHESTRATOR_OPTIONS);
  }

  async retryMission(missionId: string): Promise<void> {
    await executionEngine.retry(missionId, agentAdapter, ORCHESTRATOR_OPTIONS);
  }

  getMissionTypes(): { type: string; description: string }[] {
    return [
      {
        type: "merchant_acquisition",
        description: "Full acquisition workflow: research → proposal → follow-up → notify",
      },
      { type: "follow_up_campaign", description: "Re-engage stalled deals across the pipeline" },
      { type: "territory_blitz", description: "Deep analysis and prioritization of a territory" },
      {
        type: "pipeline_review",
        description: "Health check and revenue forecast for entire pipeline",
      },
      { type: "morning_briefing", description: "Daily priority briefing with overnight changes" },
      {
        type: "company_research",
        description: "Research, qualify, discover opportunities, and create outreach for a company",
      },
      {
        type: "outreach_sequence",
        description: "Research company and create personalized outreach sequence",
      },
      {
        type: "growth_review",
        description: "Full growth pipeline review: qualify, analyze, outreach status",
      },
      {
        type: "opportunity_hunt",
        description: "Batch qualify companies and discover new opportunities",
      },
      {
        type: "company_intelligence",
        description: "Deep company research: 6 evidence collectors → inference → intelligence report",
      },
    ];
  }

}

export const orchestrator = new OrchestratorImpl();
