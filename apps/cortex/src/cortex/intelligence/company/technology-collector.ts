import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { researchService } from "./research-service";

const SYSTEM_PROMPT = `Analyze the following search results about a company's technology stack, engineering practices, and technical infrastructure.

Extract evidence for:
- Programming languages used (from job postings, tech blogs, GitHub)
- Frameworks and libraries (React, Django, Spring Boot, etc.)
- Cloud providers (AWS, Azure, GCP, hybrid, on-premise)
- DevOps tools (Kubernetes, Docker, Terraform, CI/CD)
- Databases (PostgreSQL, MongoDB, Redis, etc.)
- Testing tools (Selenium, Cypress, Playwright, Jest)
- AI/ML technologies (TensorFlow, PyTorch, LLMs)
- Architecture patterns mentioned (microservices, monolith, serverless)

Return JSON array of findings:
[{
  "type": "technology|cloud|devops|database|testing|ai_ml|architecture",
  "value": "short normalized technology name",
  "content": "exact text that proves this technology is used",
  "confidence": 50-100,
  "source": "job posting|tech blog|github|website",
  "sourceUrl": "URL if available"
}]`;

export class TechnologyCollector extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "technology-collector",
    version: "1.0",
    name: "Technology Evidence Collector",
    description: "Collects evidence about company technology stack and engineering practices",
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
    ctx.addReasoning(`Planning technology evidence collection for ${input.companyName}`);
    return {
      steps: ["Search for tech stack signals", "Search for engineering blog/GitHub", "Extract technology evidence", "Persist findings"],
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
      `"${companyName}" engineering tech stack technologies`,
      `"${companyName}" careers software engineer requirements`,
      website ? `site:${website} engineering technology` : `"${companyName}" github open source`,
    ];

    const allResults = [];
    for (const q of queries) {
      ctx.addReasoning(`Searching: "${q}"`);
      const results = await researchService.webSearch(q, 5);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      ctx.addReasoning("No technology-related results found");
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

    ctx.addReasoning(`Found ${allResults.length} results across ${queries.length} queries, extracting evidence`);
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
          collector: "technology",
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

    ctx.addReasoning(`Created ${created} technology evidence records`);

    return {
      success: true,
      data: { prospectId, evidenceCount: created, findings: findings.map((f) => ({ type: f.type, value: f.value, confidence: f.confidence })) },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.collected.v1",
        payload: { prospectId, collector: "technology", count: created },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    return { valid: result.success, issues: [], confidence: 85 };
  }
}
