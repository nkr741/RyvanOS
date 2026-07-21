import { prisma } from "@/lib/prisma";
import { BaseAgent, type AgentManifest, type AgentPlan, type AgentResult, type AgentValidation } from "../../runtime/base-agent";
import { type AgentContext } from "../../runtime/context";
import { intelligenceEngine } from "../engine";
import { createLogger } from "@/lib/logger";

const log = createLogger("evidence-synthesis");

const EVIDENCE_TYPE_TO_SIGNAL: Record<string, string> = {
  technology: "technology",
  cloud: "cloud",
  devops: "technology",
  database: "technology",
  testing: "technology",
  ai_ml: "technology",
  architecture: "technology",
  hiring: "hiring",
  team_size: "hiring",
  skill_requirement: "technology",
  work_model: "hiring",
  compensation: "hiring",
  funding: "funding",
  acquisition: "growth",
  expansion: "expansion",
  product_launch: "growth",
  partnership: "partnership",
  leadership: "hiring",
  award: "growth",
  regulatory: "pain",
  decision_maker: "hiring",
  product: "growth",
  pricing: "growth",
  culture: "growth",
  industry: "growth",
  size: "growth",
  pain: "pain",
  growth: "growth",
  modernization: "pain",
  outsourcing_intent: "pain",
  budget: "funding",
  competition: "pain",
  compliance: "pain",
};

const EVIDENCE_TYPE_TO_IMPORTANCE: Record<string, string> = {
  decision_maker: "critical",
  funding: "critical",
  outsourcing_intent: "critical",
  pain: "high",
  expansion: "high",
  hiring: "high",
  technology: "medium",
  cloud: "medium",
  growth: "medium",
};

export class EvidenceSynthesis extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: "evidence-synthesis",
    version: "1.0",
    name: "Evidence Synthesis",
    description: "Converts collected evidence into DiscoverySignals and triggers the intelligence pipeline",
    owner: "cortex",
    permissions: ["prospect:read", "evidence:read", "signal:write", "intelligence:write"],
    subscribes: [],
    publishes: ["evidence.synthesized.v1", "account.intelligence.completed.v1"],
    tools: [],
    memoryScopes: ["prospect"],
  };

  canHandle(): boolean {
    return true;
  }

  async plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan> {
    ctx.addReasoning(`Planning evidence synthesis for prospect ${input.prospectId}`);
    return {
      steps: ["Load evidence", "Convert to DiscoverySignals", "Run inference pipeline", "Build intelligence report"],
      estimatedDurationMs: 3000,
      requiresApproval: false,
    };
  }

  async execute(ctx: AgentContext, _plan: AgentPlan, input: Record<string, unknown>): Promise<AgentResult> {
    const prospectId = input.prospectId as string;
    const missionId = input.missionId as string | undefined;

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { candidates: { take: 1, orderBy: { createdAt: "desc" } } },
    });
    if (!prospect) {
      return { success: false, data: { error: "Prospect not found" }, reasoning: ctx.getReasoning(), eventsToPublish: [] };
    }

    const evidence = await prisma.evidence.findMany({
      where: { prospectId, ...(missionId ? { missionId } : {}) },
      orderBy: { confidence: "desc" },
    });

    if (evidence.length === 0) {
      ctx.addReasoning("No evidence found to synthesize");
      return {
        success: true,
        data: { prospectId, signalsCreated: 0, evidenceCount: 0 },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }

    ctx.addReasoning(`Found ${evidence.length} evidence records to synthesize`);

    const candidateId = prospect.candidates[0]?.id;
    let signalsCreated = 0;

    for (const ev of evidence) {
      const signalType = EVIDENCE_TYPE_TO_SIGNAL[ev.type] || "growth";
      const importance = EVIDENCE_TYPE_TO_IMPORTANCE[ev.type] || "medium";

      try {
        await prisma.discoverySignal.create({
          data: {
            candidateId: candidateId || null,
            prospectId,
            type: signalType,
            source: `${ev.collector}_collector`,
            value: ev.value,
            confidence: ev.confidence,
            importance,
            evidence: ev.content,
            evidenceUrl: ev.sourceUrl,
            metadata: ev.metadata,
          },
        });
        signalsCreated++;
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : err, evidenceId: ev.id }, "failed to create signal from evidence");
      }
    }

    ctx.addReasoning(`Created ${signalsCreated} DiscoverySignals from evidence`);

    const techEvidence = evidence.filter((e) => ["technology", "cloud", "devops", "database", "testing", "ai_ml"].includes(e.type));
    if (techEvidence.length > 0) {
      const techStack = [...new Set(techEvidence.map((e) => e.value))];
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { techStack: JSON.stringify(techStack) },
      });
      ctx.addReasoning(`Updated prospect tech stack with ${techStack.length} technologies`);
    }

    const painEvidence = evidence.filter((e) => ["pain", "modernization", "compliance", "competition"].includes(e.type));
    if (painEvidence.length > 0) {
      const painPoints = [...new Set(painEvidence.map((e) => e.value))];
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { painPoints: JSON.stringify(painPoints) },
      });
    }

    const growthEvidence = evidence.filter((e) => ["growth", "expansion", "funding", "acquisition"].includes(e.type));
    if (growthEvidence.length > 0) {
      const growthSignals = [...new Set(growthEvidence.map((e) => e.value))];
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { growthSignals: JSON.stringify(growthSignals) },
      });
    }

    ctx.addReasoning("Triggering intelligence pipeline (inference → relationships → report)");
    try {
      await intelligenceEngine.requestIntelligence(prospectId, "company_intelligence_mission");
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : err, prospectId }, "intelligence pipeline failed — evidence is persisted, report can be retried");
    }

    return {
      success: true,
      data: {
        prospectId,
        evidenceCount: evidence.length,
        signalsCreated,
        techSignals: techEvidence.length,
        painSignals: painEvidence.length,
        growthSignals: growthEvidence.length,
      },
      reasoning: ctx.getReasoning(),
      eventsToPublish: [{
        type: "evidence.synthesized.v1",
        payload: { prospectId, evidenceCount: evidence.length, signalsCreated, missionId },
      }],
    };
  }

  async validate(_ctx: AgentContext, result: AgentResult): Promise<AgentValidation> {
    if (!result.success) return { valid: false, issues: ["Synthesis failed"], confidence: 0 };
    const count = (result.data.signalsCreated as number) || 0;
    return { valid: true, issues: [], confidence: count > 0 ? 90 : 60 };
  }
}
