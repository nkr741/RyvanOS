import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { researchService } from "./research-service";

const SYSTEM_PROMPT = `Analyze the following web search results about a company's website and online presence.

Extract evidence for:
- What the company does (products, services, industry)
- Company size indicators (team page, office locations, global presence)
- Technology signals visible on their website (frameworks, platforms mentioned)
- Customer segments they serve
- Any pricing information visible
- Company culture signals (values, mission statements)

Return JSON array of findings:
[{
  "type": "product|culture|pricing|technology|industry|size",
  "value": "short normalized label",
  "content": "exact text from the source that proves this",
  "confidence": 50-100,
  "source": "website",
  "sourceUrl": "URL if available"
}]`;

export class WebsiteCollector extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "website-collector",
    version: "1.0",
    name: "Website Evidence Collector",
    description: "Collects evidence from company website and online presence",
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
    ctx.addReasoning(`Planning website evidence collection for ${input.companyName}`);
    return {
      steps: ["Search for company website", "Extract evidence from results", "Persist findings"],
      estimatedDurationMs: 5000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const prospectId = input.prospectId as string;
    const companyName = input.companyName as string;
    const website = input.website as string | undefined;
    const missionId = input.missionId as string | undefined;

    const query = website
      ? `site:${website} ${companyName} about`
      : `${companyName} company website about services`;

    ctx.addReasoning(`Searching: "${query}"`);
    const results = await researchService.webSearch(query, 10);

    if (results.length === 0) {
      ctx.addReasoning("No web results found");
      return {
        success: true,
        data: { prospectId, evidenceCount: 0 },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    const rawContent = results
      .map((r) => `[${r.title}](${r.link})\n${r.snippet}`)
      .join("\n\n");

    ctx.addReasoning(`Found ${results.length} results, extracting evidence`);
    const findings = await researchService.extractEvidence(
      SYSTEM_PROMPT,
      `Company: ${companyName}\nWebsite: ${website || "unknown"}\n\nSearch Results:\n${rawContent}`,
      missionId,
    );

    let created = 0;
    for (const f of findings) {
      await prisma.evidence.create({
        data: {
          prospectId,
          collector: "website",
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

    ctx.addReasoning(`Created ${created} evidence records from website analysis`);

    return {
      success: true,
      data: { prospectId, evidenceCount: created, findings: findings.map((f) => ({ type: f.type, value: f.value, confidence: f.confidence })) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.collected.v1",
        payload: { prospectId, collector: "website", count: created },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    return { valid: result.success, issues: [], confidence: 85 };
  }
}
