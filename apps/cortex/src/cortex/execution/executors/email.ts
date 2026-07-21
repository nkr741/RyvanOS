import type { Executor, ExecutorInput, ExecutorOutput } from "../types";
import { RYVAN_IDENTITY, matchRyvanServices } from "../../knowledge/ryvan";

export const emailExecutor: Executor = {
  type: "email",
  displayName: "Email Executor",

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
    const insights = (intelligence?.insights || []) as Array<{ title: string; description: string; recommendedService: string | null }>;

    const ryvanMatch = matchRyvanServices({ industry, techStack, painPoints, recommendedServices, size });
    const topService = ryvanMatch.services[0];
    const topPain = painPoints[0];
    const topInsight = insights[0];

    const subject = topPain
      ? `${companyName} + Ryvan: Addressing ${topPain}`
      : `${companyName} + Ryvan: ${topService?.name || "Engineering"} Partnership`;

    const body = [
      `Hi,`,
      ``,
      `I'm Naveen from Ryvan Technologies  - ${RYVAN_IDENTITY.tagline.toLowerCase()}`,
      ``,
      `I'm reaching out because we've been studying the ${industry} space and ${companyName} stood out.`,
      ``,
      topInsight
        ? `Our research shows ${topInsight.description.charAt(0).toLowerCase() + topInsight.description.slice(1)}.`
        : `We see strong alignment between your technology direction and our capabilities.`,
      ``,
      topPain
        ? `We understand that ${topPain.toLowerCase()} is a challenge. We've helped similar teams through our ${topService?.name || "engineering"} practice  - ${topService?.description || ""}.`
        : ryvanMatch.pitch,
      ``,
      `What we bring:`,
      ...ryvanMatch.services.slice(0, 3).map(s => `• ${s.name}  - ${s.differentiators[0] || s.description.split(".")[0]}`),
      ``,
      topService ? `Pilot investment: ${topService.pricingRange.pilot} for 4 weeks  - prove value before any larger commitment.` : "",
      ``,
      `Would it make sense to schedule a 20-minute call this week?`,
      ``,
      `Best regards,`,
      `Naveen Kumar`,
      `Founder, Ryvan Technologies`,
      `${RYVAN_IDENTITY.phone} | ${RYVAN_IDENTITY.website}`,
    ].filter(Boolean).join("\n");

    const followUp = [
      `Hi,`,
      ``,
      `Following up on my previous note about ${topService?.name || "engineering services"} for ${companyName}.`,
      ``,
      topInsight
        ? `I wanted to share a quick insight: ${topInsight.description}.`
        : `Companies in ${industry} are increasingly investing in ${topService?.name || "AI engineering"}  - I thought it might resonate with your team.`,
      ``,
      `We typically start with a focused 4-week pilot:`,
      `• Senior engineers only  - no handoffs or junior staffing`,
      `• Success criteria defined upfront`,
      `• Measurable results within the first sprint`,
      ``,
      `Would a brief call work?`,
      ``,
      `Best,`,
      `Naveen | Ryvan Technologies`,
    ].join("\n");

    const linkedin = [
      `Hi! I'm Naveen from Ryvan Technologies (${RYVAN_IDENTITY.website}).`,
      ``,
      `I noticed ${companyName} is doing interesting work in ${industry}.`,
      topPain
        ? `We specialize in helping teams address ${topPain.toLowerCase()}  - our ${topService?.name || "engineering"} practice delivers production-grade results with a pilot-first model.`
        : `${ryvanMatch.pitch}`,
      ``,
      `Would love to connect and share perspectives. Open to a quick chat?`,
    ].join("\n");

    return {
      success: true,
      data: {
        type: "outreach",
        companyName,
        channels: [
          { channel: "email", subject, body },
          { channel: "follow_up_email", subject: `Re: ${subject}`, body: followUp },
          { channel: "linkedin", body: linkedin },
        ],
        targetService: topService?.name || "Engineering Services",
        compatibility: ryvanMatch.compatibility,
        estimatedDeal: ryvanMatch.estimatedDealRange,
        generatedAt: new Date().toISOString(),
      },
      summary: `Outreach for ${companyName}  - ${ryvanMatch.services.length} services, ${ryvanMatch.compatibility}% match, ${ryvanMatch.estimatedDealRange}`,
      approvalRequired: true,
    };
  },
};
