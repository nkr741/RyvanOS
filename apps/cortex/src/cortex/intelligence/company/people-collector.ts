import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { researchService } from "./research-service";

const SYSTEM_PROMPT = `Analyze the following search results to identify decision makers and key people at a company.

Extract evidence for:
- C-suite executives (CEO, CTO, CIO, COO, CFO)
- VP-level leaders (VP Engineering, VP Product, VP Sales)
- Directors (Director of Engineering, Director of QA)
- Engineering managers and tech leads
- Their professional background if visible

For each person found, extract:
- Their name and title
- Any evidence of their responsibilities or focus areas
- LinkedIn profile URL if found

Return JSON array of findings:
[{
  "type": "decision_maker",
  "value": "Name — Title",
  "content": "exact text that identifies this person and their role",
  "confidence": 50-100,
  "source": "linkedin|website|news|press release",
  "sourceUrl": "URL if available",
  "metadata": { "name": "full name", "title": "job title", "seniority": "c_suite|vp|director|manager", "department": "engineering|product|sales|operations" }
}]`;

export class PeopleCollector extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "people-collector",
    version: "1.0",
    name: "Decision Maker Evidence Collector",
    description: "Identifies key decision makers, engineering leaders, and contacts at a company",
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
    ctx.addReasoning(`Planning decision maker evidence collection for ${input.companyName}`);
    return {
      steps: ["Search for leadership team", "Search for engineering leaders", "Extract people evidence", "Persist findings"],
      estimatedDurationMs: 8000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const prospectId = input.prospectId as string;
    const companyName = input.companyName as string;
    const website = input.website as string | undefined;
    const missionId = input.missionId as string | undefined;

    const queries = [
      `"${companyName}" CTO "VP Engineering" "Head of Engineering" linkedin`,
      `"${companyName}" leadership team engineering`,
      website ? `site:${website} team leadership about` : `"${companyName}" founders executives`,
    ];

    const allResults = [];
    for (const q of queries) {
      ctx.addReasoning(`Searching: "${q}"`);
      const results = await researchService.webSearch(q, 5);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      ctx.addReasoning("No people-related results found");
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

    ctx.addReasoning(`Found ${allResults.length} results, extracting people evidence`);
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
          collector: "people",
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

    ctx.addReasoning(`Created ${created} people evidence records`);

    return {
      success: true,
      data: { prospectId, evidenceCount: created, findings: findings.map((f) => ({ type: f.type, value: f.value, confidence: f.confidence })) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.collected.v1",
        payload: { prospectId, collector: "people", count: created },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    return { valid: result.success, issues: [], confidence: 85 };
  }
}
