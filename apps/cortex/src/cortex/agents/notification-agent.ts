import { prisma } from "@/lib/prisma";
import {
  BaseAgent,
  type AgentManifest,
  type AgentPlan,
  type AgentResult,
  type AgentValidation,
} from "../runtime/base-agent";
import { type AgentContext } from "../runtime/context";

export class NotificationAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "notification-agent",
    version: "1.0",
    name: "Notification Agent",
    description: "Delivers internal notifications, briefings, and alerts to users",
    owner: "cortex",
    permissions: ["notification:create"],
    subscribes: ["proposal.generated.v1", "followup.created.v1", "pipeline.reviewed.v1"],
    publishes: ["notification.sent.v1"],
    tools: ["database"],
    memoryScopes: ["notifications"],
  };

  canHandle(eventType: string): boolean {
    return this.manifest.subscribes.some((s) => eventType === s);
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    const action = (input.action as string) || "notify_bde";
    ctx.addReasoning(`Planning notification: ${action}`);
    return {
      steps: ["Determine recipients", "Build notification content", "Send notifications"],
      estimatedDurationMs: 300,
      requiresApproval: false,
    };
  }

  async execute(
    ctx: AgentContext,
    _plan: AgentPlan,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    const action = (input.action as string) || "notify_bde";

    switch (action) {
      case "notify_bde":
        return this.notifyBDE(ctx, input);
      case "notify_company":
        return this.notifyCompany(ctx, input);
      case "batch_notify":
        return this.batchNotify(ctx, input);
      case "territory_briefing":
        return this.territoryBriefing(ctx, input);
      case "pipeline_report":
        return this.pipelineReport(ctx, input);
      case "morning_brief":
        return this.morningBrief(ctx, input);
      default:
        return {
          success: false,
          data: { error: `Unknown action: ${action}` },
          reasoning: ctx.getReasoning(),
          eventsToPublish: [],
        };
    }
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    if (!result.success) return { valid: false, issues: ["Execution failed"], confidence: 0 };
    return { valid: true, issues: [], confidence: 95 };
  }

  private async notifyBDE(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    const merchantId = input.merchantId as string;
    if (!merchantId) {
      return {
        success: false,
        data: { error: "merchantId required" },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const survey = await prisma.vendorSurvey.findUnique({
      where: { id: merchantId },
      select: { businessName: true, bdeId: true, leadStatus: true },
    });

    if (!survey) {
      return {
        success: false,
        data: { error: "Merchant not found" },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    let message = `Cortex has completed analysis and prepared materials for ${survey.businessName}.`;

    if (previousOutput?.suggestedOffer) {
      const offer = previousOutput.suggestedOffer as Record<string, unknown>;
      message += ` Suggested commission: ${offer.commissionRate}.`;
    }
    if (previousOutput?.followUpId) {
      message += ` A follow-up has been scheduled.`;
    }

    const notification = await prisma.notification.create({
      data: {
        userId: survey.bdeId,
        title: `Mission Complete: ${survey.businessName}`,
        message,
        type: "system",
        actionUrl: `/admin/surveys/vendor/${merchantId}`,
      },
    });

    ctx.addReasoning(`Notification sent to BDE: ${notification.id}`);

    return {
      success: true,
      data: { notificationId: notification.id, recipient: survey.bdeId },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [
        {
          type: "notification.sent.v1",
          payload: { notificationId: notification.id, merchantId, action: "notify_bde" },
        },
      ],
    };
  }

  private async notifyCompany(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    const companyId = input.companyId as string;
    const scope = (input.scope as string) || "company_update";
    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;

    const admin = await prisma.user.findFirst({
      where: { role: "admin", active: true },
      select: { id: true },
    });

    if (!admin) {
      return {
        success: false,
        data: { error: "No admin user found" },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    let companyName = (previousOutput?.companyName as string) || "Company";
    let message = `Cortex has completed ${scope} workflow.`;

    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });
      if (company) companyName = company.name;
    }

    if (scope === "company_research") {
      const opCount = (previousOutput?.opportunitiesFound as number) || 0;
      message = `Research complete for ${companyName}. ${opCount > 0 ? `${opCount} opportunities identified.` : "Outreach sequence created."}`;
    } else if (scope === "outreach_ready") {
      const stepsCreated = (previousOutput?.stepsCreated as number) || 0;
      message = `Outreach sequence ready for ${companyName}. ${stepsCreated} steps pending approval.`;
    }

    const notification = await prisma.notification.create({
      data: {
        userId: admin.id,
        title: `Growth: ${companyName}`,
        message,
        type: "system",
        actionUrl: companyId ? `/admin/growth/${companyId}` : "/admin/growth",
      },
    });

    ctx.addReasoning(`Company notification sent: ${notification.id}`);

    return {
      success: true,
      data: { notificationId: notification.id, companyName },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [
        {
          type: "notification.sent.v1",
          payload: { notificationId: notification.id, companyId, action: "notify_company", scope },
        },
      ],
    };
  }

  private async batchNotify(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    ctx.addReasoning("Sending batch notifications to BDEs");

    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    const created = (previousOutput?.created as number) || 0;

    const bdes = await prisma.user.findMany({
      where: { role: "bde", active: true },
      select: { id: true, name: true },
    });

    let sent = 0;
    for (const bde of bdes) {
      if (input.bdeId && bde.id !== input.bdeId) continue;

      await prisma.notification.create({
        data: {
          userId: bde.id,
          title: "Follow-up Campaign Active",
          message: `Cortex has identified stalled deals and created ${created} follow-up tasks. Check your CRM for new priorities.`,
          type: "system",
          actionUrl: "/dashboard/followups",
        },
      });
      sent++;
    }

    ctx.addReasoning(`Notified ${sent} BDEs`);

    return {
      success: true,
      data: { sent, totalBDEs: bdes.length },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [
        {
          type: "notification.batch_sent.v1",
          payload: { sent, action: "batch_notify" },
        },
      ],
    };
  }

  private async territoryBriefing(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    const territories = (previousOutput?.territories as Array<Record<string, unknown>>) || [];

    const admin = await prisma.user.findFirst({
      where: { role: "admin", active: true },
      select: { id: true },
    });

    if (!admin) {
      return {
        success: false,
        data: { error: "No admin user found" },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const area = input.area || (territories[0] as Record<string, unknown>)?.area || "Territory";
    const summary =
      territories.length > 0
        ? `${territories.length} territories analyzed. Top: ${(territories[0] as Record<string, unknown>)?.area} (${(territories[0] as Record<string, unknown>)?.totalMerchants} merchants).`
        : "Territory analysis complete.";

    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: `Territory Briefing: ${area}`,
        message: summary,
        type: "system",
        actionUrl: "/admin/missions",
      },
    });

    ctx.addReasoning(`Territory briefing sent for ${area}`);

    return {
      success: true,
      data: { area, summary },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [
        {
          type: "notification.sent.v1",
          payload: { action: "territory_briefing", area },
        },
      ],
    };
  }

  private async pipelineReport(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;

    const admin = await prisma.user.findFirst({
      where: { role: "admin", active: true },
      select: { id: true },
    });

    if (!admin) {
      return {
        success: false,
        data: { error: "No admin user found" },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const healthy = previousOutput?.healthy || 0;
    const stalled = previousOutput?.stalled || 0;
    const atRisk = previousOutput?.atRisk || 0;
    const forecast = previousOutput?.forecast as Record<string, unknown> | undefined;

    let message = `Pipeline Review: ${healthy} healthy, ${stalled} stalled, ${atRisk} at-risk.`;
    if (forecast) {
      const revenue = (forecast.expectedRevenue as number) || 0;
      message += ` Expected revenue: ₹${Math.round(revenue / 100000)}L.`;
    }

    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "Pipeline Review Complete",
        message,
        type: "system",
        actionUrl: "/admin/missions",
      },
    });

    ctx.addReasoning("Pipeline report notification sent");

    return {
      success: true,
      data: { message },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [
        {
          type: "notification.sent.v1",
          payload: { action: "pipeline_report" },
        },
      ],
    };
  }

  private async morningBrief(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    const actions = (previousOutput?.actions as Array<Record<string, unknown>>) || [];

    const admin = await prisma.user.findFirst({
      where: { role: "admin", active: true },
      select: { id: true },
    });

    if (!admin) {
      return {
        success: false,
        data: { error: "No admin user found" },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const topActions = actions.slice(0, 3);
    const actionText =
      topActions.length > 0
        ? topActions.map((a, i) => `${i + 1}. ${a.title}`).join(". ")
        : "No urgent actions today.";

    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "Morning Briefing",
        message: `Today's priorities: ${actionText}. Total actions: ${actions.length}.`,
        type: "system",
        actionUrl: "/admin/missions",
      },
    });

    ctx.addReasoning(`Morning brief sent with ${actions.length} actions`);

    return {
      success: true,
      data: { actionCount: actions.length, topActions: topActions.map((a) => a.title) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [
        {
          type: "notification.sent.v1",
          payload: { action: "morning_brief", actionCount: actions.length },
        },
      ],
    };
  }
}
