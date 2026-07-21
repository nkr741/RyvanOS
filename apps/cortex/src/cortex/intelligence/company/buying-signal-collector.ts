import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { researchService } from "./research-service";

const SYSTEM_PROMPT = `Analyze the following search results to identify buying signals — indicators that a company might need engineering services, QA automation, cloud migration, AI engineering, or technology consulting.

Extract evidence for:
- Pain points mentioned publicly (scaling challenges, quality issues, technical debt)
- Growth signals (rapid hiring, expansion, new markets)
- Technology modernization needs (legacy migration, cloud adoption)
- Outsourcing intent (looking for technology partners, RFPs)
- Budget signals (recent funding, revenue growth)
- Competitive pressure (market shifts, new competitors)
- Compliance requirements (GDPR, SOC2, HIPAA — needing engineering help)

Return JSON array of findings:
[{
  "type": "pain|growth|modernization|outsourcing_intent|budget|competition|compliance",
  "value": "short normalized signal description",
  "content": "exact text from the source that proves this buying signal",
  "confidence": 50-100,
  "source": "news|job posting|review site|forum|press release",
  "sourceUrl": "URL if available",
  "metadata": { "urgency": "low|medium|high", "service_fit": "QA Automation|Cloud & DevOps|Enterprise AI|Data Engineering|Software Engineering" }
}]`;

export class BuyingSignalCollector extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "buying-signal-collector",
    version: "1.0",
    name: "Buying Signal Evidence Collector",
    description: "Collects evidence of buying signals — pain points, growth, and outsourcing intent",
    owner: "cortex",
    permissions: ["prospect:read", "evidence:write"],
    subscribes: [],
    publishes: ["evidence.collected.v1"],
    tools: ["research-service"],
    memoryScopes: ["prospect"],
  };

  canHandle(): boolean {
    return true;
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    ctx.addReasoning(`Planning buying signal evidence collection for ${input.companyName}`);
    return {
      steps: ["Search for pain points and challenges", "Search for growth and outsourcing signals", "Extract buying evidence", "Persist findings"],
      estimatedDurationMs: 8000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const prospectId = input.prospectId as string;
    const companyName = input.companyName as string;
    const industry = input.industry as string | undefined;
    const missionId = input.missionId as string | undefined;

    const queries = [
      `"${companyName}" challenges scaling engineering pain points`,
      `"${companyName}" outsourcing technology partner RFP`,
      `"${companyName}" ${industry || "technology"} growth expansion funding`,
    ];

    const allResults = [];
    for (const q of queries) {
      ctx.addReasoning(`Searching: "${q}"`);
      const results = await researchService.webSearch(q, 5);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      ctx.addReasoning("No buying signal results found");
      return {
        success: true,
        data: { prospectId, evidenceCount: 0 },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const rawContent = allResults
      .map((r) => `[${r.title}](${r.link})\n${r.snippet}`)
      .join("\n\n");

    ctx.addReasoning(`Found ${allResults.length} results, extracting buying signals`);
    const findings = await researchService.extractEvidence(
      SYSTEM_PROMPT,
      `Company: ${companyName}\nIndustry: ${industry || "unknown"}\n\nSearch Results:\n${rawContent}`,
      missionId,
    );

    let created = 0;
    for (const f of findings) {
      await prisma.evidence.create({
        data: {
          prospectId,
          collector: "buying_signal",
          type: f.type,
          content: f.content,
          value: f.value,
          confidence: f.confidence,
          source: f.source,
          sourceUrl: f.sourceUrl,
          metadata: JSON.stringify(f.metadata || {}),
          missionId,
        },
      });
      created++;
    }

    ctx.addReasoning(`Created ${created} buying signal evidence records`);

    return {
      success: true,
      data: { prospectId, evidenceCount: created, findings: findings.map((f) => ({ type: f.type, value: f.value, confidence: f.confidence })) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.collected.v1",
        payload: { prospectId, collector: "buying_signal", count: created },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    return { valid: result.success, issues: [], confidence: 85 };
  }
}
