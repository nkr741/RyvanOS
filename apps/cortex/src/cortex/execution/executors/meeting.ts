import type { Executor, ExecutorInput, ExecutorOutput } from "../types";
import {
  RYVAN_IDENTITY, RYVAN_DIFFERENTIATORS, OBJECTION_LIBRARY,
  matchRyvanServices,
} from "../../knowledge/ryvan";

export const meetingExecutor: Executor = {
  type: "meeting",
  displayName: "Meeting Executor",

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const prospect = input.context.prospect as Record<string, unknown> | undefined;
    const intelligence = input.context.intelligence as Record<string, unknown> | undefined;

    if (!prospect) {
      return { success: false, data: { error: "No prospect context" } };
    }

    const companyName = prospect.companyName as string;
    const industry = prospect.industry as string || "technology";
    const painPoints = prospect.painPoints as string[] || [];
    const recommendedServices = prospect.recommendedServices as string[] || [];
    const techStack = prospect.techStack as string[] || [];
    const size = prospect.size as string || "mid-market";
    const meetingBrief = intelligence?.meetingBrief as Record<string, unknown> | null;
    const insights = (intelligence?.insights || []) as Array<{ title: string; description: string; confidence: number; recommendedService: string | null }>;

    const ryvanMatch = matchRyvanServices({ industry, techStack, painPoints, recommendedServices, size });

    const agenda = {
      title: `Discovery Call: Ryvan x ${companyName}`,
      duration: "30 minutes",
      sections: [
        {
          name: "Opening",
          duration: "5 min",
          notes: [
            `Introduce Ryvan: "${RYVAN_IDENTITY.tagline}"`,
            `Acknowledge ${companyName}'s position in ${industry}.`,
            `Set expectation: understand their needs, share relevant experience, explore fit.`,
            `Mention: ${RYVAN_IDENTITY.model}.`,
          ].join("\n"),
        },
        {
          name: "Discovery",
          duration: "15 min",
          questions: (meetingBrief?.questions as string[]) || [
            `What's driving ${companyName}'s technology investment priorities right now?`,
            painPoints[0]
              ? `How is ${painPoints[0]} affecting your team's velocity?`
              : "What's the biggest engineering bottleneck your team faces today?",
            `Are you evaluating external partners for ${ryvanMatch.services[0]?.name || "engineering"}?`,
            techStack.length > 0
              ? `How is your ${techStack[0]} stack evolving? Any pain points?`
              : "What does your current tech stack look like?",
            "What does your evaluation process look like? Who else is involved?",
            "What would success look like in the first 90 days?",
          ],
        },
        {
          name: "Value Proposition",
          duration: "7 min",
          talkingPoints: [
            ...ryvanMatch.services.slice(0, 3).map(s =>
              `${s.name}: ${s.differentiators[0]}`
            ),
            `Pilot-first approach: ${ryvanMatch.services[0]?.pricingRange.pilot || "Rs 2-5L"} for 4 weeks`,
            `${RYVAN_IDENTITY.flagship}`,
            ...RYVAN_DIFFERENTIATORS.slice(0, 2).map(d => `${d.title}: ${d.evidence}`),
          ],
        },
        {
          name: "Next Steps",
          duration: "3 min",
          notes: "Agree on follow-up: technical deep-dive, pilot scoping, or proposal review. Always close with a specific date.",
        },
      ],
    };

    const riskAssessment = [
      ...insights.filter(i => i.confidence < 70).map(i => ({
        risk: `Low-confidence insight: ${i.title} (${i.confidence}%)`,
        mitigation: "Verify directly during the call. Don't present as fact",
      })),
      painPoints.length === 0 ? {
        risk: "No confirmed pain points. Intelligence may be incomplete",
        mitigation: "Lead with open-ended discovery questions, listen before pitching",
      } : null,
      ryvanMatch.compatibility < 60 ? {
        risk: `Moderate compatibility (${ryvanMatch.compatibility}%). May not be an ideal fit`,
        mitigation: "Focus on highest-fit service only, don't oversell breadth",
      } : null,
    ].filter(Boolean);

    const objectionHandling = OBJECTION_LIBRARY.slice(0, 4).map(o => ({
      objection: o.objection,
      response: o.response,
      evidence: o.evidence,
    }));

    if (ryvanMatch.objections.length > 0) {
      for (const o of ryvanMatch.objections.slice(0, 2)) {
        objectionHandling.push({
          objection: o.objection,
          response: o.response,
          evidence: `Industry-specific (${industry})`,
        });
      }
    }

    return {
      success: true,
      data: {
        type: "meeting_prep",
        companyName,
        agenda,
        riskAssessment,
        objectionHandling,
        pricingGuidance: {
          range: ryvanMatch.estimatedDealRange,
          pilotRange: ryvanMatch.services[0]?.pricingRange.pilot || "Rs 2-5L",
          strategy: "Always lead with pilot. Never quote full engagement on first call. Define success criteria upfront.",
          pilotDetails: `4-week focused engagement. ${RYVAN_IDENTITY.delivery} delivery. Success criteria agreed in advance.`,
        },
        competitivePosition: ryvanMatch.competitivePosition ? {
          vs: ryvanMatch.competitivePosition.vs,
          approach: ryvanMatch.competitivePosition.approach,
          advantages: ryvanMatch.competitivePosition.advantages,
        } : null,
        ryvanMatch: {
          compatibility: ryvanMatch.compatibility,
          services: ryvanMatch.services.map(s => s.name),
          pitch: ryvanMatch.pitch,
          estimatedDeal: ryvanMatch.estimatedDealRange,
        },
        keyIntelligence: insights.slice(0, 3).map(i => `${i.description} (${i.confidence}%)`),
        generatedAt: new Date().toISOString(),
      },
      summary: `Meeting prep for ${companyName}: ${ryvanMatch.compatibility}% match, ${ryvanMatch.services.length} services, objection handling ready`,
    };
  },
};
