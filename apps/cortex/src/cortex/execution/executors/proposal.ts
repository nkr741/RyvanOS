import type { Executor, ExecutorInput, ExecutorOutput } from "../types";
import {
  RYVAN_IDENTITY, RYVAN_DELIVERY_PHASES, RYVAN_DIFFERENTIATORS,
  matchRyvanServices, OBJECTION_LIBRARY,
} from "../../knowledge/ryvan";

export const proposalExecutor: Executor = {
  type: "proposal",
  displayName: "Proposal Executor",

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const prospect = input.context.prospect as Record<string, unknown> | undefined;
    const intelligence = input.context.intelligence as Record<string, unknown> | undefined;
    const insights = (intelligence?.insights || []) as Array<{ title: string; description: string; confidence: number; recommendedService: string | null }>;

    if (!prospect) {
      return { success: false, data: { error: "No prospect context" } };
    }

    const companyName = prospect.companyName as string;
    const industry = prospect.industry as string || "technology";
    const painPoints = prospect.painPoints as string[] || [];
    const recommendedServices = prospect.recommendedServices as string[] || [];
    const techStack = prospect.techStack as string[] || [];
    const size = prospect.size as string || "mid-market";
    const grade = prospect.qualificationGrade as string || "B";

    const ryvanMatch = matchRyvanServices({
      industry,
      techStack,
      painPoints,
      recommendedServices,
      size,
    });

    const topInsight = insights[0];

    const sections = {
      executiveSummary: [
        `Dear ${companyName} Team,`,
        ``,
        `${RYVAN_IDENTITY.tagline}`,
        ``,
        `Based on our analysis of ${companyName}'s technology landscape, business objectives,`,
        `and ${industry} market dynamics, we've identified ${ryvanMatch.services.length} high-impact areas`,
        `where Ryvan Technologies can deliver immediate, measurable value.`,
        painPoints.length > 0 ? `\nWe understand you're navigating challenges around ${painPoints.slice(0, 2).join(" and ")}.` : "",
        `\n${ryvanMatch.pitch}`,
        `\nCompatibility Score: ${ryvanMatch.compatibility}%`,
      ].filter(Boolean).join("\n"),

      companyUnderstanding: [
        `## Understanding ${companyName}`,
        ``,
        `Industry: ${industry}`,
        `Company Size: ${size}`,
        techStack.length > 0 ? `Technology Stack: ${techStack.join(", ")}` : "",
        painPoints.length > 0 ? `\nKey Challenges Identified:\n${painPoints.map(p => `- ${p}`).join("\n")}` : "",
        insights.length > 0 ? `\nIntelligence Insights:\n${insights.slice(0, 3).map(i => `- ${i.description} (${i.confidence}% confidence)`).join("\n")}` : "",
      ].filter(Boolean).join("\n"),

      proposedServices: ryvanMatch.services.map(service => ({
        name: service.name,
        category: service.category,
        description: service.description,
        technologies: service.technologies.filter(t =>
          techStack.length === 0 || techStack.some(ts =>
            ts.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(ts.toLowerCase())
          ) || service.technologies.indexOf(t) < 3
        ),
        differentiators: service.differentiators,
        idealFor: service.idealFor,
        timeline: size === "enterprise" || size === "large" ? "8-12 weeks" : "4-8 weeks",
        pilotPricing: service.pricingRange.pilot,
        quarterlyPricing: service.pricingRange.quarterly,
      })),

      approach: [
        `## Ryvan Delivery Methodology`,
        ``,
        ...RYVAN_DELIVERY_PHASES.map((p, i) => `${i + 1}. **${p.phase}**: ${p.description}`),
        ``,
        `Every engagement begins with a focused pilot  - proving value before scaling commitment.`,
        `${RYVAN_IDENTITY.delivery} delivery. ${RYVAN_IDENTITY.support} support. ${RYVAN_IDENTITY.uptime} uptime commitment.`,
      ].join("\n"),

      whyRyvan: [
        `## Why Ryvan Technologies`,
        ``,
        ...RYVAN_DIFFERENTIATORS.slice(0, 5).map(d => `- **${d.title}**: ${d.evidence}`),
        ryvanMatch.competitivePosition ? [
          ``,
          `### How We Compare`,
          `${ryvanMatch.competitivePosition.approach}`,
          ``,
          ...ryvanMatch.competitivePosition.advantages.map(a => `- ${a}`),
        ].join("\n") : "",
      ].filter(Boolean).join("\n"),

      pricing: buildPricing(ryvanMatch.services, size, grade, ryvanMatch.estimatedDealRange),

      nextSteps: [
        `## Next Steps`,
        ``,
        `1. **Discovery Call** (30 min): Align on priorities, scope, and success criteria`,
        `2. **Technical Deep-Dive** (60 min): Architecture review with Ryvan engineering leads`,
        `3. **Pilot Proposal**: Detailed scope, timeline, and fixed pricing for a 4-week pilot`,
        ``,
        `We look forward to partnering with ${companyName}.`,
        ``,
        ` - Ryvan Technologies`,
        `${RYVAN_IDENTITY.website}`,
        `${RYVAN_IDENTITY.phone}`,
      ].join("\n"),
    };

    return {
      success: true,
      data: {
        type: "proposal",
        companyName,
        sections,
        recommendedServices: ryvanMatch.services.map(s => s.name),
        compatibility: ryvanMatch.compatibility,
        estimatedDeal: ryvanMatch.estimatedDealRange,
        primaryService: ryvanMatch.services[0]?.name || "Engineering Services",
        confidence: topInsight?.confidence || 70,
        objections: ryvanMatch.objections,
        competitivePosition: ryvanMatch.competitivePosition?.vs || null,
        generatedAt: new Date().toISOString(),
      },
      summary: `Proposal for ${companyName}  - ${ryvanMatch.services.length} services, ${ryvanMatch.compatibility}% compatibility, ${ryvanMatch.estimatedDealRange}`,
      approvalRequired: true,
    };
  },
};

function buildPricing(services: Array<{ name: string; pricingRange: { pilot: string; quarterly: string } }>, size: string, grade: string, dealRange: string): string {
  const lines = [
    `## Investment`,
    ``,
    `| Service | Pilot (4 weeks) | Quarterly |`,
    `|---------|-----------------|-----------|`,
    ...services.map(s => `| ${s.name} | ${s.pricingRange.pilot} | ${s.pricingRange.quarterly} |`),
    ``,
    `Estimated engagement: **${dealRange}**`,
    ``,
    `We recommend starting with a focused **4-week pilot** to demonstrate value`,
    `before committing to a larger engagement. Success criteria are defined upfront.`,
  ];
  if (grade === "A") {
    lines.push(``, `As a high-priority prospect, we can offer flexible engagement terms and founder-level involvement.`);
  }
  return lines.join("\n");
}
