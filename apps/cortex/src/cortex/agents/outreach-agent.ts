import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../runtime/base-agent";
import { type AgentContext } from "../runtime/context";

function generateEmailDraft(company: {
  name: string;
  industry: string;
  aiSummary: string | null;
  recommendedServices: string;
}, contact: { name: string; title: string | null }, stepOrder: number): { subject: string; content: string } {
  let services: string[] = [];
  try { services = JSON.parse(company.recommendedServices) as string[]; } catch { /* empty */ }
  const primaryService = services[0] || "AI Engineering";

  if (stepOrder === 1) {
    return {
      subject: `${primaryService} for ${company.name}`,
      content: `Hi ${contact.name},\n\n` +
        `I'm reaching out from Ryvan Technologies regarding ${primaryService} services that could benefit ${company.name}.\n\n` +
        `${company.aiSummary || `We specialize in ${services.join(", ")} and work with leading ${company.industry} companies.`}\n\n` +
        `Would you be open to a brief call to discuss how we can help?\n\n` +
        `Best regards,\nRyvan Technologies`,
    };
  }

  if (stepOrder === 2) {
    return {
      subject: `Re: ${primaryService} for ${company.name}`,
      content: `Hi ${contact.name},\n\n` +
        `I wanted to follow up on my previous email about ${primaryService} for ${company.name}.\n\n` +
        `We've helped similar ${company.industry} companies achieve significant improvements through our ${services.slice(0, 2).join(" and ")} capabilities.\n\n` +
        `Would 15 minutes this week work for a quick conversation?\n\n` +
        `Best regards,\nRyvan Technologies`,
    };
  }

  return {
    subject: `Quick follow-up — ${company.name} + Ryvan`,
    content: `Hi ${contact.name},\n\n` +
      `I understand you're busy — I'll keep this short.\n\n` +
      `If ${primaryService} is something ${company.name} is exploring, I'd love to share a few insights from our work with similar ${company.industry} companies.\n\n` +
      `If the timing isn't right, no worries at all. Happy to reconnect whenever it makes sense.\n\n` +
      `Best regards,\nRyvan Technologies`,
  };
}

export class OutreachAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "outreach-agent",
    version: "1.0",
    name: "Outreach Agent",
    description: "Creates and manages outreach sequences for qualified companies",
    owner: "cortex",
    permissions: ["outreach:read", "outreach:write", "contact:read", "company:read"],
    subscribes: ["company.qualified.v1", "company.researched.v1"],
    publishes: ["outreach.created.v1", "outreach.step_drafted.v1"],
    tools: ["database"],
    memoryScopes: ["outreach", "company"],
  };

  canHandle(eventType: string): boolean {
    return this.manifest.subscribes.some(s => eventType === s);
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    const action = (input.action as string) || "create_sequence";
    ctx.addReasoning(`Planning outreach action: ${action}`);

    const planMap: Record<string, { steps: string[]; duration: number }> = {
      create_sequence: { steps: ["Load company & contacts", "Plan sequence steps", "Generate email drafts", "Create sequence"], duration: 1500 },
      draft_emails: { steps: ["Load sequence", "Load company intel", "Generate personalized drafts"], duration: 1000 },
      outreach_review: { steps: ["Load all sequences", "Analyze status", "Compute metrics", "Identify actions"], duration: 2000 },
    };

    const plan = planMap[action] || planMap.create_sequence;
    return { steps: plan.steps, estimatedDurationMs: plan.duration, requiresApproval: false };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const action = (input.action as string) || "create_sequence";

    switch (action) {
      case "create_sequence": return this.createSequence(ctx, input);
      case "draft_emails": return this.draftEmails(ctx, input);
      case "outreach_review": return this.outreachReview(ctx);
      default:
        return { success: false, data: { error: `Unknown action: ${action}` }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    if (!result.success) return { valid: false, issues: ["Execution failed"], confidence: 0 };

    const data = result.data;
    if (data.sequenceId && data.stepsCreated === 0) {
      return { valid: false, issues: ["Sequence created with no steps"], confidence: 30 };
    }

    return { valid: true, issues: [], confidence: 85 };
  }

  private async createSequence(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    const companyId = (input.companyId || (input.previousOutput as Record<string, unknown>)?.companyId) as string;
    if (!companyId) {
      return { success: false, data: { error: "companyId required" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    ctx.addReasoning(`Creating outreach sequence for company ${companyId}`);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { contacts: true },
    });

    if (!company) {
      return { success: false, data: { error: "Company not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const decisionMakers = company.contacts.filter(c => c.role === "decision_maker" || c.role === "champion");
    const targets = decisionMakers.length > 0 ? decisionMakers : company.contacts.slice(0, 3);

    if (targets.length === 0) {
      ctx.addReasoning("No contacts found — creating sequence without contact-specific steps");
    }

    const sequence = await prisma.outreachSequence.create({
      data: {
        companyId,
        type: "email",
        status: "draft",
        missionId: ctx.mission.missionId,
        createdById: company.createdById,
      },
    });

    let stepsCreated = 0;
    const stepDetails: { stepOrder: number; type: string; contactName: string | null; subject: string }[] = [];

    for (const contact of targets) {
      for (let step = 1; step <= 3; step++) {
        const draft = generateEmailDraft(company, contact, step);
        const scheduledAt = new Date();
        scheduledAt.setDate(scheduledAt.getDate() + (step === 1 ? 1 : step === 2 ? 4 : 8));
        scheduledAt.setHours(9, 0, 0, 0);

        await prisma.outreachStep.create({
          data: {
            sequenceId: sequence.id,
            contactId: contact.id,
            stepOrder: stepsCreated + 1,
            type: step === 1 ? "email" : "follow_up",
            subject: draft.subject,
            content: draft.content,
            status: "pending",
            scheduledAt,
            approvalRequired: true,
          },
        });

        stepDetails.push({ stepOrder: stepsCreated + 1, type: step === 1 ? "email" : "follow_up", contactName: contact.name, subject: draft.subject });
        stepsCreated++;
      }
    }

    if (targets.length === 0) {
      const genericDraft = generateEmailDraft(company, { name: "Team", title: null }, 1);
      await prisma.outreachStep.create({
        data: {
          sequenceId: sequence.id,
          stepOrder: 1,
          type: "email",
          subject: genericDraft.subject,
          content: genericDraft.content,
          status: "pending",
          approvalRequired: true,
        },
      });
      stepDetails.push({ stepOrder: 1, type: "email", contactName: null, subject: genericDraft.subject });
      stepsCreated = 1;
    }

    await prisma.growthActivity.create({
      data: {
        companyId,
        type: "outreach",
        content: `Outreach sequence created with ${stepsCreated} steps for ${targets.length} contacts`,
        userId: company.createdById,
        metadata: JSON.stringify({ source: "cao", sequenceId: sequence.id, missionId: ctx.mission.missionId }),
      },
    });

    ctx.addReasoning(`Sequence ${sequence.id}: ${stepsCreated} steps for ${targets.length} contacts`);

    return {
      success: true,
      data: {
        sequenceId: sequence.id,
        companyId,
        companyName: company.name,
        stepsCreated,
        contactsTargeted: targets.length,
        steps: stepDetails,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "outreach.created.v1",
        payload: {
          sequenceId: sequence.id,
          companyId,
          companyName: company.name,
          steps: stepsCreated,
          contacts: targets.length,
        },
      }],
    };
  }

  private async draftEmails(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    const sequenceId = input.sequenceId as string;
    if (!sequenceId) {
      return { success: false, data: { error: "sequenceId required" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const sequence = await prisma.outreachSequence.findUnique({
      where: { id: sequenceId },
      include: {
        company: true,
        steps: { include: { contact: true }, orderBy: { stepOrder: "asc" } },
      },
    });

    if (!sequence) {
      return { success: false, data: { error: "Sequence not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    let drafted = 0;
    for (const step of sequence.steps) {
      if (step.content) continue;

      const contact = step.contact || { name: "Team", title: null };
      const draft = generateEmailDraft(sequence.company, contact, step.stepOrder);

      await prisma.outreachStep.update({
        where: { id: step.id },
        data: { subject: draft.subject, content: draft.content },
      });
      drafted++;
    }

    ctx.addReasoning(`Drafted ${drafted} emails for sequence ${sequenceId}`);

    return {
      success: true,
      data: { sequenceId, drafted, totalSteps: sequence.steps.length },
      reasoning: ctx.getReasoning(),
      eventsToPublish: drafted > 0 ? [{
        type: "outreach.step_drafted.v1",
        payload: { sequenceId, drafted },
      }] : [],
    };
  }

  private async outreachReview(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Reviewing all outreach sequences");

    const sequences = await prisma.outreachSequence.findMany({
      include: {
        company: { select: { name: true, industry: true } },
        steps: true,
        _count: { select: { steps: true } },
      },
    });

    const byStatus: Record<string, number> = {};
    let totalSteps = 0;
    let sentSteps = 0;
    let repliedSteps = 0;

    for (const seq of sequences) {
      byStatus[seq.status] = (byStatus[seq.status] || 0) + 1;
      for (const step of seq.steps) {
        totalSteps++;
        if (step.sentAt) sentSteps++;
        if (step.repliedAt) repliedSteps++;
      }
    }

    const activeSequences = sequences
      .filter(s => s.status === "active" || s.status === "draft")
      .map(s => ({
        id: s.id,
        company: s.company.name,
        industry: s.company.industry,
        status: s.status,
        steps: s._count.steps,
        sent: s.steps.filter(st => st.sentAt).length,
        replied: s.steps.filter(st => st.repliedAt).length,
      }));

    ctx.addReasoning(`${sequences.length} sequences, ${totalSteps} steps, ${sentSteps} sent, ${repliedSteps} replied`);

    return {
      success: true,
      data: {
        totalSequences: sequences.length,
        byStatus,
        totalSteps,
        sentSteps,
        repliedSteps,
        replyRate: sentSteps > 0 ? Math.round((repliedSteps / sentSteps) * 100) : 0,
        activeSequences,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "outreach.reviewed.v1",
        payload: { sequences: sequences.length, steps: totalSteps, sent: sentSteps, replied: repliedSteps },
      }],
    };
  }
}
