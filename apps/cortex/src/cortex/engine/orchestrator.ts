import { prisma } from "@/lib/prisma";
import { AgentContext, type MissionContext } from "../runtime/context";
import { eventBus } from "../runtime/event";
import { agentRegistry } from "../runtime/registry";
import { approvalGateway } from "./approval";

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
    const mission = await prisma.mission.update({
      where: { id: missionId },
      data: { status: "executing" },
      include: { steps: { orderBy: { sequence: "asc" } } },
    });

    await eventBus.publish({
      type: "mission.started.v1",
      version: "1",
      payload: { missionId },
      source: "orchestrator",
      missionId,
      correlationId: missionId,
    });

    const config = JSON.parse(mission.config) as Record<string, unknown>;
    let lastOutput: Record<string, unknown> = {};
    let completedSteps = 0;

    for (const step of mission.steps) {
      if (step.status === "completed" || step.status === "skipped") {
        completedSteps++;
        if (step.output) {
          try {
            lastOutput = JSON.parse(step.output) as Record<string, unknown>;
          } catch {
            /* ignore */
          }
        }
        continue;
      }

      const stepInput = {
        ...(JSON.parse(step.input) as Record<string, unknown>),
        previousOutput: lastOutput,
        missionConfig: config,
      };

      // Check approval
      if (step.approvalRequired) {
        const approval = await approvalGateway.requestApproval({
          missionId,
          stepId: step.id,
          action: `${step.agentId}.execute`,
          agentId: step.agentId,
          description: step.title,
          payload: stepInput,
        });

        if (!approval.approved && !approval.autoApproved) {
          await prisma.missionStep.update({
            where: { id: step.id },
            data: { status: "awaiting_approval" },
          });
          await prisma.mission.update({
            where: { id: missionId },
            data: {
              status: "awaiting_approval",
              progress: Math.round((completedSteps / mission.steps.length) * 100),
            },
          });

          await eventBus.publish({
            type: "mission.paused.v1",
            version: "1",
            payload: { missionId, stepId: step.id, reason: "Awaiting approval" },
            source: "orchestrator",
            missionId,
            correlationId: missionId,
          });
          return;
        }
      }

      // Execute step
      await prisma.missionStep.update({
        where: { id: step.id },
        data: { status: "running", startedAt: new Date() },
      });

      const agent = agentRegistry.get(step.agentId);
      if (!agent) {
        await this.failStep(step.id, missionId, `Agent '${step.agentId}' not found`);
        await this.failMission(
          missionId,
          `Agent '${step.agentId}' not found at step ${step.sequence}`,
        );
        return;
      }

      const missionCtx: MissionContext = {
        missionId,
        missionType: mission.type,
        correlationId: missionId,
        stepId: step.id,
        stepSequence: step.sequence,
        merchantId: config.merchantId as string | undefined,
      };

      const ctx = new AgentContext(step.agentId, missionCtx);
      const result = await agent.run(ctx, stepInput);

      if (!result.success) {
        await this.failStep(
          step.id,
          missionId,
          (result.data?.error as string) || "Agent execution failed",
        );
        await this.failMission(missionId, `Step ${step.sequence} (${step.title}) failed`);
        return;
      }

      await prisma.missionStep.update({
        where: { id: step.id },
        data: {
          status: "completed",
          output: JSON.stringify(result.data),
          reasoning: result.reasoning,
          completedAt: new Date(),
        },
      });

      lastOutput = result.data;
      completedSteps++;

      await prisma.mission.update({
        where: { id: missionId },
        data: { progress: Math.round((completedSteps / mission.steps.length) * 100) },
      });

      await eventBus.publish({
        type: "mission.step_completed.v1",
        version: "1",
        payload: {
          missionId,
          stepId: step.id,
          agentId: step.agentId,
          sequence: step.sequence,
          progress: Math.round((completedSteps / mission.steps.length) * 100),
        },
        source: "orchestrator",
        missionId,
        correlationId: missionId,
      });
    }

    const allOutputs = mission.steps.map((s) => {
      if (s.output) {
        try {
          return JSON.parse(s.output);
        } catch {
          return null;
        }
      }
      return null;
    });

    await prisma.mission.update({
      where: { id: missionId },
      data: {
        status: "completed",
        progress: 100,
        result: JSON.stringify({ steps: allOutputs, finalOutput: lastOutput }),
        completedAt: new Date(),
      },
    });

    await eventBus.publish({
      type: "mission.completed.v1",
      version: "1",
      payload: { missionId, title: mission.title },
      source: "orchestrator",
      missionId,
      correlationId: missionId,
    });
  }

  async resumeMission(missionId: string): Promise<void> {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: { steps: { orderBy: { sequence: "asc" } } },
    });

    if (!mission || mission.status !== "awaiting_approval") {
      throw new Error("Mission not found or not awaiting approval");
    }

    await this.executeMission(missionId);
  }

  async cancelMission(missionId: string): Promise<void> {
    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "cancelled", completedAt: new Date() },
    });

    await prisma.missionStep.updateMany({
      where: { missionId, status: { in: ["pending", "running", "awaiting_approval"] } },
      data: { status: "skipped" },
    });

    await eventBus.publish({
      type: "mission.cancelled.v1",
      version: "1",
      payload: { missionId },
      source: "orchestrator",
      missionId,
      correlationId: missionId,
    });
  }

  async retryMission(missionId: string): Promise<void> {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: { steps: { orderBy: { sequence: "asc" } } },
    });

    if (!mission || mission.status !== "failed") {
      throw new Error("Mission not found or not in failed state");
    }

    const failedStep = mission.steps.find((s) => s.status === "failed");
    if (failedStep) {
      await prisma.missionStep.update({
        where: { id: failedStep.id },
        data: { status: "pending", error: null, startedAt: null, completedAt: null },
      });
    }

    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "executing", error: null },
    });

    await eventBus.publish({
      type: "mission.retried.v1",
      version: "1",
      payload: { missionId, retriedStepId: failedStep?.id },
      source: "orchestrator",
      missionId,
      correlationId: missionId,
    });

    await this.executeMission(missionId);
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
    ];
  }

  private async failStep(stepId: string, missionId: string, error: string): Promise<void> {
    await prisma.missionStep.update({
      where: { id: stepId },
      data: { status: "failed", error, completedAt: new Date() },
    });

    await eventBus.publish({
      type: "mission.step_failed.v1",
      version: "1",
      payload: { missionId, stepId, error },
      source: "orchestrator",
      missionId,
      correlationId: missionId,
    });
  }

  private async failMission(missionId: string, error: string): Promise<void> {
    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "failed", error },
    });

    await eventBus.publish({
      type: "mission.failed.v1",
      version: "1",
      payload: { missionId, error },
      source: "orchestrator",
      missionId,
      correlationId: missionId,
    });
  }
}

export const orchestrator = new OrchestratorImpl();
