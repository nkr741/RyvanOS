import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";
import { runInference } from "./inference";

type Signal = {
  id: string;
  type: string;
  value: string;
  confidence: number;
  importance: string;
  evidence: string | null;
  evidenceUrl: string | null;
};

interface SectionInput {
  type: string;
  title: string;
  content: Record<string, unknown>;
  confidence: number;
  evidenceCount: number;
}

class AccountIntelligenceEngine {
  async requestIntelligence(
    prospectId: string,
    triggeringEvent?: string
  ): Promise<string> {
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { signals: true },
    });
    if (!prospect) throw new Error("Prospect not found");

    const latestVersion = await prisma.accountIntelligence.findFirst({
      where: { prospectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version || 0) + 1;

    const intel = await prisma.accountIntelligence.create({
      data: {
        prospectId,
        version: nextVersion,
        status: "requested",
        triggeringEvent: triggeringEvent || "manual",
      },
    });

    await eventBus.publish({
      type: "account.intelligence.requested.v1",
      version: "1",
      source: "intelligence.engine",
      payload: { intelligenceId: intel.id, prospectId, version: nextVersion },
    });

    await this.buildIntelligence(intel.id);

    return intel.id;
  }

  async buildIntelligence(intelligenceId: string): Promise<void> {
    const intel = await prisma.accountIntelligence.findUnique({
      where: { id: intelligenceId },
      include: {
        prospect: { include: { signals: true } },
      },
    });
    if (!intel) return;

    const prospect = intel.prospect;
    const signals = prospect.signals;

    // Phase 1: Collecting
    await this.updateStatus(intelligenceId, "collecting");

    const sections: SectionInput[] = [];

    sections.push(this.buildExecutiveSummary(prospect, signals));
    sections.push(this.buildTechnologySection(prospect, signals));
    sections.push(this.buildBusinessSection(prospect, signals));
    sections.push(this.buildPeopleSection(signals));
    sections.push(this.buildPainAnalysis(prospect, signals));

    // Phase 2: Correlating
    await this.updateStatus(intelligenceId, "correlating");
    sections.push(this.buildRelationshipsSection(signals));

    // Phase 3: Inferring
    await this.updateStatus(intelligenceId, "inferring");
    const inferences = await runInference(signals);

    const insights = inferences.map((inf) => ({
      intelligenceId,
      prospectId: prospect.id,
      type: "inference" as const,
      title: inf.ruleName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: inf.insight,
      confidence: inf.confidence,
      importance: inf.confidence >= 85 ? "critical" : inf.confidence >= 70 ? "high" : "medium",
      derivedFrom: JSON.stringify(inf.matchedSignals),
      evidence: inf.evidence.slice(0, 3).join(" | ") || null,
      recommendation: inf.insight,
      recommendedService: inf.recommendedService,
    }));

    for (const insight of insights) {
      await prisma.insight.create({ data: insight });
    }

    const recommendedServices = [
      ...new Set(inferences.filter((i) => i.recommendedService).map((i) => i.recommendedService!)),
    ];

    sections.push(
      this.buildRecommendationsSection(inferences, recommendedServices)
    );
    sections.push(this.buildRisksSection(prospect, signals, inferences));
    sections.push(this.buildCompetitiveSection(signals));

    // Save sections
    for (const section of sections) {
      await prisma.intelligenceSection.create({
        data: {
          intelligenceId,
          type: section.type,
          title: section.title,
          content: JSON.stringify(section.content),
          confidence: section.confidence,
          evidenceCount: section.evidenceCount,
        },
      });
    }

    // Build meeting brief
    const meetingBrief = this.buildMeetingBrief(prospect, signals, inferences, recommendedServices);

    // Calculate overall confidence
    const totalConfidence = sections.reduce((sum, s) => sum + s.confidence, 0);
    const overallConfidence = Math.round(totalConfidence / sections.length);

    // Compute diff from previous version
    const diff = await this.computeDiff(prospect.id, intel.version);

    // Phase 4: Reviewing → Published
    await this.updateStatus(intelligenceId, "reviewing");

    await prisma.accountIntelligence.update({
      where: { id: intelligenceId },
      data: {
        status: "published",
        overallConfidence,
        meetingBrief: JSON.stringify(meetingBrief),
        diffFromPrevious: diff ? JSON.stringify(diff) : null,
        publishedAt: new Date(),
      },
    });

    // Update prospect
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        recommendedServices: JSON.stringify(recommendedServices),
        aiSummary: (sections.find((s) => s.type === "executive_summary")?.content as Record<string, unknown>)?.summary as string || null,
        freshness: 100,
        lastRefreshedAt: new Date(),
        refreshRequired: false,
      },
    });

    await eventBus.publish({
      type: "account.intelligence.completed.v1",
      version: "1",
      source: "intelligence.engine",
      payload: {
        intelligenceId,
        prospectId: prospect.id,
        version: intel.version,
        overallConfidence,
        sectionCount: sections.length,
        insightCount: insights.length,
        recommendedServices,
      },
    });
  }

  private buildExecutiveSummary(
    prospect: { companyName: string; industry: string | null; size: string | null; employees: number | null; location: string | null; country: string; description: string | null; qualificationScore: number | null; qualificationGrade: string | null },
    signals: Signal[]
  ): SectionInput {
    const signalCount = signals.length;
    const topSignals = signals
      .filter((s) => s.importance === "critical" || s.importance === "high")
      .slice(0, 5)
      .map((s) => s.value);

    const summary = [
      `${prospect.companyName} is a${prospect.size ? ` ${prospect.size}` : ""} ${prospect.industry || "technology"} company`,
      prospect.employees ? ` with approximately ${prospect.employees} employees` : "",
      prospect.location ? `, based in ${prospect.location}` : "",
      `. Qualification: Grade ${prospect.qualificationGrade || "N/A"} (${prospect.qualificationScore || 0}/100).`,
      signalCount > 0 ? ` ${signalCount} intelligence signals detected.` : "",
      topSignals.length > 0 ? ` Key signals: ${topSignals.join(", ")}.` : "",
    ].join("");

    return {
      type: "executive_summary",
      title: "Executive Summary",
      content: {
        summary,
        companyName: prospect.companyName,
        industry: prospect.industry,
        size: prospect.size,
        employees: prospect.employees,
        location: prospect.location,
        country: prospect.country,
        qualificationScore: prospect.qualificationScore,
        qualificationGrade: prospect.qualificationGrade,
        signalCount,
        topSignals,
      },
      confidence: Math.min(95, 60 + signalCount * 3),
      evidenceCount: signals.filter((s) => s.evidence).length,
    };
  }

  private buildTechnologySection(
    prospect: { techStack: string; cloudProvider: string | null },
    signals: Signal[]
  ): SectionInput {
    const techStack = safeJSON<string[]>(prospect.techStack, []);
    const techSignals = signals.filter((s) => s.type === "technology");
    const cloudSignals = signals.filter((s) => s.type === "cloud");

    const allTech = [...new Set([...techStack, ...techSignals.map((s) => s.value)])];
    const cloud = prospect.cloudProvider || cloudSignals[0]?.value || "Unknown";

    const categories: Record<string, string[]> = {
      languages: [], frameworks: [], devops: [], databases: [], testing: [], other: [],
    };

    const catMap: Record<string, string> = {
      Python: "languages", Java: "languages", "Node.js": "languages", Go: "languages",
      React: "frameworks", Angular: "frameworks", "Vue.js": "frameworks", Django: "frameworks",
      "Spring Boot": "frameworks", Flask: "frameworks", ".NET": "frameworks", "Next.js": "frameworks",
      Kubernetes: "devops", Docker: "devops", Terraform: "devops", Jenkins: "devops",
      Ansible: "devops", "GitHub Actions": "devops", "CI/CD": "devops",
      PostgreSQL: "databases", MongoDB: "databases", Redis: "databases",
      Kafka: "databases", Elasticsearch: "databases",
      Selenium: "testing", Cypress: "testing", Playwright: "testing",
    };

    for (const tech of allTech) {
      const cat = catMap[tech] || "other";
      categories[cat].push(tech);
    }

    const evidenceItems = techSignals.filter((s) => s.evidence).map((s) => ({
      signal: s.value, evidence: s.evidence, confidence: s.confidence,
    }));

    return {
      type: "technology",
      title: "Technology Landscape",
      content: { cloud, techStack: allTech, categories, evidenceItems },
      confidence: allTech.length > 0 ? Math.min(95, 60 + allTech.length * 5) : 30,
      evidenceCount: evidenceItems.length,
    };
  }

  private buildBusinessSection(
    prospect: { industry: string | null; size: string | null; employees: number | null; growthSignals: string },
    signals: Signal[]
  ): SectionInput {
    const growthSignals = safeJSON<string[]>(prospect.growthSignals, []);
    const growthSigs = signals.filter((s) => ["growth", "expansion", "funding"].includes(s.type));
    const hiringSigs = signals.filter((s) => s.type === "hiring");

    const allGrowth = [...new Set([...growthSignals, ...growthSigs.map((s) => s.value)])];
    const hiringActivity = hiringSigs.map((s) => ({
      role: s.value, evidence: s.evidence, confidence: s.confidence,
    }));

    return {
      type: "business",
      title: "Business Signals",
      content: { growthSignals: allGrowth, hiringActivity, industry: prospect.industry, size: prospect.size, employees: prospect.employees },
      confidence: allGrowth.length + hiringActivity.length > 0 ? Math.min(90, 50 + (allGrowth.length + hiringActivity.length) * 8) : 25,
      evidenceCount: growthSigs.filter((s) => s.evidence).length + hiringSigs.filter((s) => s.evidence).length,
    };
  }

  private buildPeopleSection(signals: Signal[]): SectionInput {
    const hiringSignals = signals.filter((s) => s.type === "hiring");
    const roles = hiringSignals.map((s) => ({
      title: s.value, evidence: s.evidence, confidence: s.confidence,
    }));

    return {
      type: "people",
      title: "People & Hiring",
      content: { knownRoles: roles, decisionMakers: [], contactStrategy: roles.length > 0 ? "Hiring signals suggest engineering leadership is actively building — approach via VP Engineering or CTO" : "No hiring signals — consider LinkedIn research for decision makers" },
      confidence: roles.length > 0 ? Math.min(80, 40 + roles.length * 10) : 20,
      evidenceCount: hiringSignals.filter((s) => s.evidence).length,
    };
  }

  private buildPainAnalysis(
    prospect: { painPoints: string },
    signals: Signal[]
  ): SectionInput {
    const painPoints = safeJSON<string[]>(prospect.painPoints, []);
    const painSignals = signals.filter((s) => s.type === "pain");
    const allPains = [...new Set([...painPoints, ...painSignals.map((s) => s.value)])];

    const painEvidence = painSignals.map((s) => ({
      pain: s.value, evidence: s.evidence, confidence: s.confidence,
    }));

    return {
      type: "pain_analysis",
      title: "Pain Analysis",
      content: { painPoints: allPains, evidenceItems: painEvidence, opportunityCount: allPains.length },
      confidence: allPains.length > 0 ? Math.min(85, 40 + allPains.length * 12) : 15,
      evidenceCount: painEvidence.length,
    };
  }

  private buildRelationshipsSection(signals: Signal[]): SectionInput {
    const partnerSignals = signals.filter((s) => s.type === "partnership");
    const cloudSignals = signals.filter((s) => s.type === "cloud");
    const certSignals = signals.filter((s) => s.type === "certification");

    const relationships: Array<{ type: string; entity: string; evidence: string | null }> = [];

    for (const s of cloudSignals) {
      relationships.push({ type: "Cloud Provider", entity: s.value, evidence: s.evidence });
    }
    for (const s of partnerSignals) {
      relationships.push({ type: "Partner", entity: s.value, evidence: s.evidence });
    }
    for (const s of certSignals) {
      relationships.push({ type: "Certification", entity: s.value, evidence: s.evidence });
    }

    return {
      type: "relationships",
      title: "Relationships & Ecosystem",
      content: { relationships, ecosystemSize: relationships.length },
      confidence: relationships.length > 0 ? Math.min(80, 40 + relationships.length * 10) : 15,
      evidenceCount: relationships.filter((r) => r.evidence).length,
    };
  }

  private buildRecommendationsSection(
    inferences: Array<{ insight: string; recommendedService: string | null; confidence: number; evidence: string[] }>,
    services: string[]
  ): SectionInput {
    const recommendations = inferences.map((inf) => ({
      insight: inf.insight,
      service: inf.recommendedService,
      confidence: inf.confidence,
      evidenceCount: inf.evidence.length,
    }));

    return {
      type: "recommendations",
      title: "Recommendations",
      content: { recommendations, recommendedServices: services, primaryService: services[0] || null },
      confidence: recommendations.length > 0 ? Math.round(recommendations.reduce((s, r) => s + r.confidence, 0) / recommendations.length) : 20,
      evidenceCount: recommendations.reduce((s, r) => s + r.evidenceCount, 0),
    };
  }

  private buildRisksSection(
    prospect: { qualificationScore: number | null; qualificationGrade: string | null },
    signals: Signal[],
    inferences: Array<{ confidence: number }>
  ): SectionInput {
    const risks: Array<{ risk: string; severity: string; mitigation: string }> = [];

    if (signals.length < 3) {
      risks.push({ risk: "Low signal coverage — intelligence may be incomplete", severity: "medium", mitigation: "Request additional research or manual enrichment" });
    }
    if (!prospect.qualificationScore || prospect.qualificationScore < 40) {
      risks.push({ risk: "Low qualification score — may not be a strong fit", severity: "high", mitigation: "Verify pain points directly before investing outreach effort" });
    }
    if (inferences.length === 0) {
      risks.push({ risk: "No service recommendations generated — signals insufficient for inference", severity: "medium", mitigation: "Gather more company intelligence before outreach" });
    }
    const lowConfidence = signals.filter((s) => s.confidence < 50);
    if (lowConfidence.length > signals.length * 0.3) {
      risks.push({ risk: "Many low-confidence signals — intelligence reliability is reduced", severity: "medium", mitigation: "Prioritize verification of key signals before acting" });
    }

    return {
      type: "risks",
      title: "Risk Assessment",
      content: { risks, riskCount: risks.length },
      confidence: 90,
      evidenceCount: 0,
    };
  }

  private buildCompetitiveSection(signals: Signal[]): SectionInput {
    const techSignals = signals.filter((s) => s.type === "technology");
    const cloudSignals = signals.filter((s) => s.type === "cloud");

    const possibleVendors: string[] = [];
    if (cloudSignals.some((s) => ["AWS", "Azure", "GCP"].includes(s.value))) {
      possibleVendors.push("Cloud consulting firms");
    }
    if (techSignals.some((s) => ["Selenium", "Cypress", "Playwright"].includes(s.value))) {
      possibleVendors.push("QA/Testing service providers");
    }

    return {
      type: "competitive",
      title: "Competitive Landscape",
      content: { possibleVendors, differentiators: ["AI-first engineering approach", "End-to-end automation capability", "Cortex-powered intelligence"] },
      confidence: possibleVendors.length > 0 ? 60 : 30,
      evidenceCount: 0,
    };
  }

  private buildMeetingBrief(
    prospect: { companyName: string; industry: string | null; painPoints: string },
    signals: Signal[],
    inferences: Array<{ insight: string; recommendedService: string | null; confidence: number }>,
    services: string[]
  ): Record<string, unknown> {
    const pains = safeJSON<string[]>(prospect.painPoints, []);
    const topInference = inferences[0];

    const questions = [
      `What's driving ${prospect.companyName}'s current technology investment priorities?`,
      pains.length > 0 ? `We noticed signals around ${pains[0]} — how is that affecting your team?` : "What's the biggest engineering bottleneck your team faces today?",
      services.length > 0 ? `Have you evaluated external partners for ${services[0]}?` : "Are you considering outsourcing any engineering functions?",
      "What does your evaluation process look like for technology partners?",
      "What would a successful engagement look like in the first 90 days?",
    ];

    const objections = [
      { objection: "We handle everything in-house", response: "Many of our clients started that way — we complement internal teams by handling specialized workloads so your core team stays focused on product" },
      { objection: "We're already working with another vendor", response: "That's great — we often work alongside existing partners. Our strength is in AI-first engineering which is a different capability" },
      { objection: "Budget is tight right now", response: "We can start with a focused pilot — most clients see ROI within the first sprint" },
    ];

    return {
      objective: topInference ? `Present Ryvan's ${topInference.recommendedService || "engineering"} capabilities and understand ${prospect.companyName}'s specific needs` : `Understand ${prospect.companyName}'s technology landscape and identify partnership opportunities`,
      questions,
      likelyObjections: objections,
      suggestedServices: services,
      expectedBudgetRange: prospect.industry === "enterprise" || prospect.industry === "fintech" ? "₹15-50L/quarter" : "₹5-25L/quarter",
      competitors: ["In-house teams", "Big 4 consulting", "Boutique dev shops"],
      nextBestAction: topInference ? `Lead with ${topInference.recommendedService} — ${topInference.confidence}% confidence fit` : "Discovery call to understand needs",
      followUpStrategy: "Send personalized proposal within 48 hours of meeting. Schedule follow-up call for 1 week later.",
    };
  }

  private async computeDiff(
    prospectId: string,
    currentVersion: number
  ): Promise<Record<string, unknown> | null> {
    if (currentVersion <= 1) return null;

    const previousIntel = await prisma.accountIntelligence.findFirst({
      where: { prospectId, version: currentVersion - 1 },
      include: { sections: true, insights: true },
    });
    if (!previousIntel) return null;

    const currentInsights = await prisma.insight.findMany({
      where: { intelligenceId: undefined },
      orderBy: { createdAt: "desc" },
      take: 0,
    });

    return {
      previousVersion: currentVersion - 1,
      previousConfidence: previousIntel.overallConfidence,
      previousSections: previousIntel.sections.length,
      previousInsights: previousIntel.insights.length,
      previousPublishedAt: previousIntel.publishedAt?.toISOString(),
    };
  }

  private async updateStatus(id: string, status: string): Promise<void> {
    await prisma.accountIntelligence.update({
      where: { id },
      data: { status },
    });
  }

  async getLatestIntelligence(prospectId: string) {
    return prisma.accountIntelligence.findFirst({
      where: { prospectId, status: "published" },
      orderBy: { version: "desc" },
      include: {
        sections: { orderBy: { type: "asc" } },
        insights: { orderBy: { confidence: "desc" } },
        prospect: {
          include: {
            signals: { orderBy: { importance: "desc" } },
          },
        },
      },
    });
  }

  async listVersions(prospectId: string) {
    return prisma.accountIntelligence.findMany({
      where: { prospectId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        status: true,
        overallConfidence: true,
        publishedAt: true,
        triggeringEvent: true,
        _count: { select: { sections: true, insights: true } },
      },
    });
  }
}

function safeJSON<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

export const intelligenceEngine = new AccountIntelligenceEngine();
