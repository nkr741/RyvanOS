import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../runtime/base-agent";
import { type AgentContext } from "../runtime/context";

function qualifyCompany(company: {
  industry: string;
  size: string | null;
  employees: number | null;
  techStack: string;
  cloudProvider: string | null;
  painPoints: string;
  growthSignals: string;
}): { score: number; grade: string; breakdown: Record<string, number> } {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // Industry fit (max 25)
  const highFitIndustries = ["fintech", "saas", "ecommerce", "healthcare"];
  const medFitIndustries = ["logistics", "education", "retail", "telecom"];
  if (highFitIndustries.includes(company.industry)) { breakdown.industry = 25; }
  else if (medFitIndustries.includes(company.industry)) { breakdown.industry = 15; }
  else { breakdown.industry = 8; }
  score += breakdown.industry;

  // Company size (max 20)
  const sizeScores: Record<string, number> = { enterprise: 20, large: 18, medium: 15, small: 10, startup: 5 };
  breakdown.size = sizeScores[company.size || ""] || 8;
  score += breakdown.size;

  // Tech maturity (max 20)
  let techStack: string[] = [];
  try { techStack = JSON.parse(company.techStack) as string[]; } catch { /* empty */ }
  breakdown.techMaturity = Math.min(20, techStack.length * 4);
  score += breakdown.techMaturity;

  // Cloud readiness (max 15)
  if (company.cloudProvider === "aws" || company.cloudProvider === "azure" || company.cloudProvider === "gcp") {
    breakdown.cloudReadiness = 15;
  } else if (company.cloudProvider === "hybrid") {
    breakdown.cloudReadiness = 10;
  } else {
    breakdown.cloudReadiness = 5;
  }
  score += breakdown.cloudReadiness;

  // Pain points signal (max 10)
  let painPoints: string[] = [];
  try { painPoints = JSON.parse(company.painPoints) as string[]; } catch { /* empty */ }
  breakdown.painSignal = Math.min(10, painPoints.length * 3);
  score += breakdown.painSignal;

  // Growth signals (max 10)
  let signals: string[] = [];
  try { signals = JSON.parse(company.growthSignals) as string[]; } catch { /* empty */ }
  breakdown.growthSignal = Math.min(10, signals.length * 3);
  score += breakdown.growthSignal;

  const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F";

  return { score, grade, breakdown };
}

function recommendServices(company: {
  industry: string;
  techStack: string;
  painPoints: string;
  cloudProvider: string | null;
}): string[] {
  const services: string[] = [];
  let painPoints: string[] = [];
  try { painPoints = JSON.parse(company.painPoints) as string[]; } catch { /* empty */ }
  let techStack: string[] = [];
  try { techStack = JSON.parse(company.techStack) as string[]; } catch { /* empty */ }

  if (painPoints.some(p => p.toLowerCase().includes("testing") || p.toLowerCase().includes("quality"))) {
    services.push("QA Automation");
  }
  if (painPoints.some(p => p.toLowerCase().includes("cloud") || p.toLowerCase().includes("infra") || p.toLowerCase().includes("scaling"))) {
    services.push("Cloud & DevOps");
  }
  if (painPoints.some(p => p.toLowerCase().includes("data") || p.toLowerCase().includes("analytics"))) {
    services.push("Data Engineering");
  }
  if (painPoints.some(p => p.toLowerCase().includes("ai") || p.toLowerCase().includes("automation") || p.toLowerCase().includes("manual"))) {
    services.push("Enterprise AI / BPA");
  }
  if (techStack.some(t => t.toLowerCase().includes("legacy") || t.toLowerCase().includes("monolith"))) {
    services.push("Modernization");
  }
  if (!company.cloudProvider || company.cloudProvider === "on_premise") {
    services.push("Cloud Migration");
  }

  if (services.length === 0) {
    services.push("AI Engineering", "Cloud & DevOps");
  }

  return services;
}

function generateAISummary(company: {
  name: string;
  industry: string;
  size: string | null;
  employees: number | null;
  description: string | null;
  cloudProvider: string | null;
  painPoints: string;
  growthSignals: string;
}, qualScore: number, qualGrade: string, services: string[]): string {
  const sizeLabel = company.size ? `${company.size}-sized` : "";
  const employeeCount = company.employees ? ` (~${company.employees} employees)` : "";
  const painCount = (() => { try { return (JSON.parse(company.painPoints) as string[]).length; } catch { return 0; } })();
  const signalCount = (() => { try { return (JSON.parse(company.growthSignals) as string[]).length; } catch { return 0; } })();

  return `${company.name} is a ${sizeLabel} ${company.industry} company${employeeCount}. ` +
    `Qualification: ${qualGrade} (${qualScore}/100). ` +
    `${painCount} pain point${painCount !== 1 ? "s" : ""} identified, ${signalCount} growth signal${signalCount !== 1 ? "s" : ""}. ` +
    `Cloud: ${company.cloudProvider || "unknown"}. ` +
    `Recommended services: ${services.join(", ")}.`;
}

export class GrowthAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "growth-agent",
    version: "1.0",
    name: "Growth Agent",
    description: "Discovers, qualifies, and researches companies for business development",
    owner: "cortex",
    permissions: ["company:read", "company:write", "contact:read", "contact:write", "opportunity:write", "activity:write"],
    subscribes: ["mission.created.v1", "company.discovered.v1"],
    publishes: ["company.qualified.v1", "company.researched.v1", "opportunity.identified.v1"],
    tools: ["database"],
    memoryScopes: ["company", "industry"],
  };

  canHandle(eventType: string): boolean {
    return this.manifest.subscribes.some(s => eventType === s);
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    const action = (input.action as string) || "research_company";
    ctx.addReasoning(`Planning growth action: ${action}`);

    const planMap: Record<string, { steps: string[]; duration: number }> = {
      research_company: { steps: ["Load company", "Analyze industry", "Score qualification", "Recommend services", "Compile intelligence"], duration: 1000 },
      qualify_company: { steps: ["Load company data", "Run qualification scoring", "Update grade"], duration: 500 },
      discover_opportunities: { steps: ["Scan qualified companies", "Identify service gaps", "Create opportunities"], duration: 1500 },
      growth_review: { steps: ["Load all companies", "Compute pipeline metrics", "Identify top targets", "Generate insights"], duration: 2000 },
      batch_qualify: { steps: ["Load unqualified companies", "Score each", "Rank by grade", "Update all"], duration: 3000 },
    };

    const plan = planMap[action] || planMap.research_company;
    return { steps: plan.steps, estimatedDurationMs: plan.duration, requiresApproval: false };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const action = (input.action as string) || "research_company";

    switch (action) {
      case "research_company": return this.researchCompany(ctx, input);
      case "qualify_company": return this.qualifyCompany(ctx, input);
      case "discover_opportunities": return this.discoverOpportunities(ctx, input);
      case "growth_review": return this.growthReview(ctx);
      case "batch_qualify": return this.batchQualify(ctx);
      default:
        return { success: false, data: { error: `Unknown action: ${action}` }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    if (!result.success) return { valid: false, issues: ["Execution failed"], confidence: 0 };
    return { valid: true, issues: [], confidence: 90 };
  }

  private async researchCompany(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    const companyId = input.companyId as string;
    if (!companyId) {
      return { success: false, data: { error: "companyId required" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    ctx.addReasoning(`Researching company ${companyId}`);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { contacts: true, opportunities: true, growthActivities: { take: 10, orderBy: { createdAt: "desc" } } },
    });

    if (!company) {
      return { success: false, data: { error: "Company not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const qual = qualifyCompany(company);
    const services = recommendServices(company);
    const summary = generateAISummary(company, qual.score, qual.grade, services);

    await prisma.company.update({
      where: { id: companyId },
      data: {
        qualificationScore: qual.score,
        qualificationGrade: qual.grade,
        qualificationData: JSON.stringify(qual.breakdown),
        recommendedServices: JSON.stringify(services),
        aiSummary: summary,
        confidence: qual.score >= 60 ? 85 : 65,
        status: company.status === "discovered" ? "researching" : company.status,
      },
    });

    await prisma.growthActivity.create({
      data: {
        companyId,
        type: "research",
        content: `AI research completed. Score: ${qual.score} (${qual.grade}). Services: ${services.join(", ")}`,
        userId: company.createdById,
        metadata: JSON.stringify({ source: "cao", missionId: ctx.mission.missionId }),
      },
    });

    ctx.addReasoning(`Qualified: ${qual.grade} (${qual.score}/100). Services: ${services.join(", ")}`);

    return {
      success: true,
      data: {
        companyId,
        companyName: company.name,
        industry: company.industry,
        qualification: qual,
        recommendedServices: services,
        aiSummary: summary,
        contactCount: company.contacts.length,
        opportunityCount: company.opportunities.length,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "company.researched.v1",
        payload: {
          companyId,
          companyName: company.name,
          score: qual.score,
          grade: qual.grade,
          services,
        },
      }],
    };
  }

  private async qualifyCompany(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    const companyId = input.companyId as string;
    if (!companyId) {
      return { success: false, data: { error: "companyId required" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return { success: false, data: { error: "Company not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const qual = qualifyCompany(company);
    const services = recommendServices(company);

    await prisma.company.update({
      where: { id: companyId },
      data: {
        qualificationScore: qual.score,
        qualificationGrade: qual.grade,
        qualificationData: JSON.stringify(qual.breakdown),
        recommendedServices: JSON.stringify(services),
        status: qual.score >= 60 ? "qualified" : company.status,
      },
    });

    ctx.addReasoning(`Qualification: ${qual.grade} (${qual.score}/100)`);

    return {
      success: true,
      data: { companyId, companyName: company.name, qualification: qual, services },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "company.qualified.v1",
        payload: { companyId, companyName: company.name, score: qual.score, grade: qual.grade },
      }],
    };
  }

  private async discoverOpportunities(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentResult> {
    ctx.addReasoning("Scanning qualified companies for opportunities");

    const previousOutput = input.previousOutput as Record<string, unknown> | undefined;
    const targetCompanyId = (previousOutput?.companyId || input.companyId) as string | undefined;

    const where = targetCompanyId
      ? { id: targetCompanyId }
      : { qualificationGrade: { in: ["A", "B"] }, status: { notIn: ["won", "lost", "dormant"] } };

    const companies = await prisma.company.findMany({
      where,
      include: { opportunities: true },
    });

    let created = 0;
    const newOpportunities: { companyId: string; companyName: string; title: string; services: string[] }[] = [];

    for (const c of companies) {
      let existingServices: string[] = [];
      for (const opp of c.opportunities) {
        try { existingServices.push(...JSON.parse(opp.services) as string[]); } catch { /* ignore */ }
      }

      let recommended: string[] = [];
      try { recommended = JSON.parse(c.recommendedServices) as string[]; } catch { /* ignore */ }

      const gaps = recommended.filter(s => !existingServices.includes(s));
      if (gaps.length === 0) continue;

      const opp = await prisma.opportunity.create({
        data: {
          companyId: c.id,
          title: `${gaps[0]} for ${c.name}`,
          description: `Opportunity identified by Growth Engine. Services: ${gaps.join(", ")}`,
          services: JSON.stringify(gaps),
          stage: "identified",
          probability: c.qualificationScore && c.qualificationScore >= 70 ? 40 : 20,
          createdById: c.createdById,
        },
      });

      newOpportunities.push({ companyId: c.id, companyName: c.name, title: opp.title, services: gaps });
      created++;
    }

    ctx.addReasoning(`Created ${created} opportunities from ${companies.length} companies`);

    return {
      success: true,
      data: { companiesScanned: companies.length, opportunitiesCreated: created, opportunities: newOpportunities },
      reasoning: ctx.getReasoning(),
      eventsToPublish: newOpportunities.map(o => ({
        type: "opportunity.identified.v1",
        payload: { companyId: o.companyId, companyName: o.companyName, title: o.title, services: o.services },
      })),
    };
  }

  private async growthReview(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Running growth pipeline review");

    const companies = await prisma.company.findMany({
      include: { opportunities: true, _count: { select: { contacts: true, growthActivities: true } } },
    });

    const byStatus: Record<string, number> = {};
    const byGrade: Record<string, number> = {};
    const byIndustry: Record<string, number> = {};
    let totalOpps = 0;
    let totalValue = 0;

    for (const c of companies) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      if (c.qualificationGrade) byGrade[c.qualificationGrade] = (byGrade[c.qualificationGrade] || 0) + 1;
      byIndustry[c.industry] = (byIndustry[c.industry] || 0) + 1;
      totalOpps += c.opportunities.length;
      for (const o of c.opportunities) {
        if (o.estimatedValue) totalValue += o.estimatedValue;
      }
    }

    const topTargets = companies
      .filter(c => c.qualificationScore !== null && c.qualificationScore >= 60)
      .sort((a, b) => (b.qualificationScore || 0) - (a.qualificationScore || 0))
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: c.name,
        industry: c.industry,
        score: c.qualificationScore,
        grade: c.qualificationGrade,
        status: c.status,
        contacts: c._count.contacts,
        activities: c._count.growthActivities,
      }));

    ctx.addReasoning(`Pipeline: ${companies.length} companies, ${totalOpps} opportunities, ₹${Math.round(totalValue)} estimated value`);

    return {
      success: true,
      data: {
        totalCompanies: companies.length,
        totalOpportunities: totalOpps,
        totalPipelineValue: totalValue,
        byStatus,
        byGrade,
        byIndustry,
        topTargets,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "growth.reviewed.v1",
        payload: { totalCompanies: companies.length, totalOpps, pipelineValue: totalValue },
      }],
    };
  }

  private async batchQualify(ctx: AgentContext): Promise<AgentResult> {
    ctx.addReasoning("Batch qualifying unscored companies");

    const companies = await prisma.company.findMany({
      where: { qualificationScore: null },
    });

    let qualified = 0;
    const results: { id: string; name: string; score: number; grade: string }[] = [];

    for (const c of companies) {
      const qual = qualifyCompany(c);
      const services = recommendServices(c);
      const summary = generateAISummary(c, qual.score, qual.grade, services);

      await prisma.company.update({
        where: { id: c.id },
        data: {
          qualificationScore: qual.score,
          qualificationGrade: qual.grade,
          qualificationData: JSON.stringify(qual.breakdown),
          recommendedServices: JSON.stringify(services),
          aiSummary: summary,
          confidence: qual.score >= 60 ? 85 : 65,
          status: qual.score >= 60 ? "qualified" : c.status,
        },
      });

      results.push({ id: c.id, name: c.name, score: qual.score, grade: qual.grade });
      qualified++;
    }

    ctx.addReasoning(`Qualified ${qualified} companies`);

    return {
      success: true,
      data: { qualified, results: results.sort((a, b) => b.score - a.score) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "growth.batch_qualified.v1",
        payload: { count: qualified },
      }],
    };
  }
}
