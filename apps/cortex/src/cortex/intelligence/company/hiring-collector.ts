import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { researchService } from "./research-service";

const SYSTEM_PROMPT = `Analyze the following search results about a company's hiring activity and open positions.

Extract evidence for:
- Open engineering roles (title, seniority, team)
- Engineering team size indicators
- Skills and technologies required in job postings
- Team structure signals (e.g. "Join our 50-person engineering team")
- Hiring velocity (multiple roles in same area = rapid growth)
- Remote/hybrid/onsite work model
- Compensation signals if visible

Return JSON array of findings:
[{
  "type": "hiring|team_size|skill_requirement|work_model|compensation",
  "value": "normalized role title or signal",
  "content": "exact text from the job posting or source",
  "confidence": 50-100,
  "source": "linkedin|careers page|indeed|glassdoor",
  "sourceUrl": "URL if available",
  "metadata": { "seniority": "junior|mid|senior|lead|vp", "department": "engineering|data|qa|devops|product" }
}]`;

export class HiringCollector extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "hiring-collector",
    version: "1.0",
    name: "Hiring Evidence Collector",
    description: "Collects evidence about company hiring activity and engineering team",
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
    ctx.addReasoning(`Planning hiring evidence collection for ${input.companyName}`);
    return {
      steps: ["Search for open positions", "Search for team size signals", "Extract hiring evidence", "Persist findings"],
      estimatedDurationMs: 8000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const prospectId = input.prospectId as string;
    const companyName = input.companyName as string;
    const missionId = input.missionId as string | undefined;

    const queries = [
      `"${companyName}" careers engineering jobs`,
      `"${companyName}" hiring software engineer developer`,
      `"${companyName}" linkedin jobs engineering`,
    ];

    const allResults = [];
    for (const q of queries) {
      ctx.addReasoning(`Searching: "${q}"`);
      const results = await researchService.webSearch(q, 5);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      ctx.addReasoning("No hiring-related results found");
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

    ctx.addReasoning(`Found ${allResults.length} results, extracting hiring evidence`);
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
          collector: "hiring",
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

    ctx.addReasoning(`Created ${created} hiring evidence records`);

    return {
      success: true,
      data: { prospectId, evidenceCount: created, findings: findings.map((f) => ({ type: f.type, value: f.value, confidence: f.confidence })) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.collected.v1",
        payload: { prospectId, collector: "hiring", count: created },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    return { valid: result.success, issues: [], confidence: 85 };
  }
}
