import { prisma } from "@/lib/prisma";
import type { Executor, ExecutorInput, ExecutorOutput } from "../types";

export const crmExecutor: Executor = {
  type: "crm",
  displayName: "CRM Executor",

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const prospect = input.context.prospect as Record<string, unknown> | undefined;
    const previousOutputs = input.context.previousOutputs as Record<string, Record<string, unknown>> | undefined;

    if (!prospect) {
      return { success: false, data: { error: "No prospect context" } };
    }

    const companyName = prospect.companyName as string;
    const recommendedServices = prospect.recommendedServices as string[] || [];
    const qualificationScore = prospect.qualificationScore as number || 0;
    const grade = prospect.qualificationGrade as string || "C";

    const proposalOutput = previousOutputs?.proposal as Record<string, unknown> | undefined;
    const emailOutput = previousOutputs?.outreach as Record<string, unknown> | undefined;

    const tasks = [
      {
        title: `Send initial outreach to ${companyName}`,
        type: "outreach",
        priority: grade === "A" ? "high" : "medium",
        dueInDays: 1,
        notes: emailOutput ? "Email and LinkedIn drafts ready  - review and send" : "Draft outreach based on intelligence",
      },
      {
        title: `Follow up with ${companyName}`,
        type: "follow_up",
        priority: "medium",
        dueInDays: 4,
        notes: "Send follow-up email if no response",
      },
      {
        title: `Schedule discovery call with ${companyName}`,
        type: "meeting",
        priority: grade === "A" ? "high" : "medium",
        dueInDays: 7,
        notes: "If positive response, schedule 30-min discovery call",
      },
    ];

    if (proposalOutput) {
      tasks.push({
        title: `Review and customize proposal for ${companyName}`,
        type: "proposal",
        priority: "high",
        dueInDays: 2,
        notes: "Proposal draft generated  - review, customize, and prepare for delivery",
      });
    }

    const opportunity = {
      title: `${recommendedServices[0] || "Engineering Services"}  - ${companyName}`,
      services: recommendedServices,
      estimatedValue: estimateValue(grade, prospect.size as string || "mid-market"),
      probability: qualificationScore || 50,
      stage: "identified",
    };

    let opportunityId: string | undefined;
    if (input.prospectId) {
      const existingCompany = await prisma.company.findFirst({
        where: { name: companyName },
      });
      if (existingCompany) {
        const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
        if (adminUser) {
          const opp = await prisma.opportunity.create({
            data: {
              companyId: existingCompany.id,
              title: opportunity.title,
              services: JSON.stringify(opportunity.services),
              estimatedValue: opportunity.estimatedValue,
              probability: opportunity.probability,
              stage: "identified",
              source: "cortex_execution",
              createdById: adminUser.id,
            },
          });
          opportunityId = opp.id;
        }
      }
    }

    return {
      success: true,
      data: {
        type: "crm_setup",
        companyName,
        tasks,
        opportunity,
        opportunityId,
        followUpSchedule: [
          { day: 1, action: "Send initial outreach" },
          { day: 4, action: "Follow-up email" },
          { day: 7, action: "Phone call / second follow-up" },
          { day: 14, action: "Final outreach or close" },
        ],
        generatedAt: new Date().toISOString(),
      },
      summary: `CRM setup for ${companyName}  - ${tasks.length} tasks, opportunity created${opportunityId ? ` (${opportunityId})` : ""}`,
    };
  },
};

function estimateValue(grade: string, size: string): number {
  const sizeMultiplier: Record<string, number> = {
    enterprise: 4, large: 3, "mid-market": 2, medium: 1.5, small: 1, startup: 0.5,
  };
  const gradeMultiplier: Record<string, number> = {
    A: 1, B: 0.7, C: 0.4, D: 0.2,
  };
  const base = 500000;
  return base * (sizeMultiplier[size] || 1) * (gradeMultiplier[grade] || 0.5);
}
