import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { researchService } from "./research-service";

const SYSTEM_PROMPT = `Analyze the following news and press coverage about a company.

Extract evidence for:
- Funding rounds (Series A/B/C, amount, investors)
- Acquisitions (buyer, target, reason)
- Expansion signals (new offices, markets, countries)
- Product launches or major releases
- Partnerships and strategic alliances
- Leadership changes (new CEO, CTO, VP Engineering)
- Awards, recognition, industry rankings
- Regulatory or compliance news

Return JSON array of findings:
[{
  "type": "funding|acquisition|expansion|product_launch|partnership|leadership|award|regulatory",
  "value": "short normalized description",
  "content": "exact text from the news source",
  "confidence": 50-100,
  "source": "press release|news article|blog post",
  "sourceUrl": "URL if available",
  "metadata": { "date": "approximate date if mentioned", "amount": "funding amount if applicable" }
}]`;

export class NewsCollector extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "news-collector",
    version: "1.0",
    name: "News Evidence Collector",
    description: "Collects evidence from company news, press releases, and public announcements",
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
    ctx.addReasoning(`Planning news evidence collection for ${input.companyName}`);
    return {
      steps: ["Search for recent news", "Search for funding/growth", "Extract news evidence", "Persist findings"],
      estimatedDurationMs: 8000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const prospectId = input.prospectId as string;
    const companyName = input.companyName as string;
    const missionId = input.missionId as string | undefined;

    const queries = [
      `"${companyName}" funding series acquisition news`,
      `"${companyName}" expansion partnership announcement`,
      `"${companyName}" company news press release 2025 2026`,
    ];

    const allResults = [];
    for (const q of queries) {
      ctx.addReasoning(`Searching: "${q}"`);
      const results = await researchService.webSearch(q, 5);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      ctx.addReasoning("No news results found");
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

    ctx.addReasoning(`Found ${allResults.length} results, extracting news evidence`);
    const findings = await researchService.extractEvidence(
      SYSTEM_PROMPT,
      `Company: ${companyName}\n\nSearch Results:\n${rawContent}`,
      missionId,
    );

    let created = 0;
    for (const f of findings) {
      await prisma.evidence.create({
        data: {
          prospectId,
          collector: "news",
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

    ctx.addReasoning(`Created ${created} news evidence records`);

    return {
      success: true,
      data: { prospectId, evidenceCount: created, findings: findings.map((f) => ({ type: f.type, value: f.value, confidence: f.confidence })) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.collected.v1",
        payload: { prospectId, collector: "news", count: created },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    return { valid: result.success, issues: [], confidence: 85 };
  }
}
