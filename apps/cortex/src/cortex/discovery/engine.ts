import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";
import type {
  DiscoveryProvider,
  CompanyCandidateData,
  SignalData,
  DiscoveryProviderManifest,
} from "./types";

class DiscoveryEngine {
  private providers = new Map<string, DiscoveryProvider>();

  register(provider: DiscoveryProvider): void {
    this.providers.set(provider.manifest.name, provider);
  }

  getProvider(name: string): DiscoveryProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): DiscoveryProviderManifest[] {
    return Array.from(this.providers.values()).map((p) => p.manifest);
  }

  async ensureSource(manifest: DiscoveryProviderManifest): Promise<string> {
    const existing = await prisma.discoverySource.findUnique({
      where: { name: manifest.name },
    });
    if (existing) return existing.id;

    const source = await prisma.discoverySource.create({
      data: {
        name: manifest.name,
        displayName: manifest.displayName,
        type: manifest.type,
        trustScore: manifest.trustScore,
        schedule: manifest.defaultSchedule || null,
        capabilities: JSON.stringify(manifest.capabilities),
      },
    });
    return source.id;
  }

  async runDiscovery(
    providerName: string,
    config: Record<string, unknown>,
    triggeredBy: string
  ): Promise<{
    runId: string;
    discovered: number;
    signals: number;
    duplicates: number;
    errors: string[];
  }> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);

    const sourceId = await this.ensureSource(provider.manifest);

    const run = await prisma.discoveryRun.create({
      data: {
        sourceId,
        status: "running",
        triggeredBy,
      },
    });

    let discovered = 0;
    let signalCount = 0;
    let duplicates = 0;
    const errors: string[] = [];

    try {
      const result = await provider.discover(config);

      for (const raw of result.candidates) {
        const normalized = raw.companyName
          ? raw
          : provider.normalize(raw.rawData || (raw as unknown as Record<string, unknown>));
        const validation = provider.validate(normalized);

        if (!validation.valid) {
          errors.push(
            `Skipped ${normalized.companyName}: ${validation.reason}`
          );
          continue;
        }

        const isDuplicate = await this.checkDuplicate(normalized);
        if (isDuplicate) {
          duplicates++;
          continue;
        }

        const candidate = await prisma.companyCandidate.create({
          data: {
            sourceId,
            runId: run.id,
            companyName: normalized.companyName,
            website: normalized.website,
            industry: normalized.industry,
            size: normalized.size,
            employees: normalized.employees,
            location: normalized.location,
            country: normalized.country || "India",
            description: normalized.description,
            rawData: JSON.stringify(normalized.rawData || {}),
            confidence:
              normalized.confidence ||
              Math.round(provider.manifest.trustScore * 0.8),
          },
        });

        discovered++;

        await eventBus.publish({
          type: "candidate.discovered.v1",
          version: "1",
          source: `discovery.${providerName}`,
          payload: {
            candidateId: candidate.id,
            companyName: candidate.companyName,
            sourceId,
            runId: run.id,
          },
        });

        if (normalized.signals && normalized.signals.length > 0) {
          const created = await this.createSignals(
            candidate.id,
            normalized.signals,
            providerName
          );
          signalCount += created;
        }
      }

      errors.push(...result.errors);

      await prisma.discoveryRun.update({
        where: { id: run.id },
        data: {
          status: errors.length > 0 && discovered === 0 ? "failed" : "completed",
          completedAt: new Date(),
          stats: JSON.stringify({
            discovered,
            signals: signalCount,
            duplicates,
            failed: errors.length,
          }),
          error:
            errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
        },
      });

      await prisma.discoverySource.update({
        where: { id: sourceId },
        data: { lastRunAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.discoveryRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          error: message,
          stats: JSON.stringify({ discovered, signals: signalCount, duplicates, failed: 1 }),
        },
      });
      errors.push(message);
    }

    return { runId: run.id, discovered, signals: signalCount, duplicates, errors };
  }

  async createSignals(
    candidateId: string,
    signals: SignalData[],
    source: string
  ): Promise<number> {
    let count = 0;
    for (const signal of signals) {
      await prisma.discoverySignal.create({
        data: {
          candidateId,
          type: signal.type,
          source,
          value: signal.value,
          category: signal.category,
          confidence: signal.confidence || 70,
          importance: signal.importance || "medium",
          evidence: signal.evidence,
          evidenceUrl: signal.evidenceUrl,
          metadata: JSON.stringify(signal.metadata || {}),
        },
      });
      count++;
    }

    if (count > 0) {
      await eventBus.publish({
        type: "signals.extracted.v1",
        version: "1",
        source: `discovery.${source}`,
        payload: { candidateId, signalCount: count },
      });
    }

    return count;
  }

  async extractSignals(candidateId: string): Promise<number> {
    const candidate = await prisma.companyCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) return 0;

    const raw = JSON.parse(candidate.rawData || "{}") as Record<string, unknown>;
    const signals = detectSignals(candidate, raw);

    if (signals.length === 0) return 0;

    return this.createSignals(candidateId, signals, "signal_engine");
  }

  async qualifyCandidate(candidateId: string): Promise<{ score: number; grade: string }> {
    const candidate = await prisma.companyCandidate.findUnique({
      where: { id: candidateId },
      include: { signals: true },
    });
    if (!candidate) throw new Error("Candidate not found");

    const signals = candidate.signals;
    let score = 0;

    score += scoreIndustry(candidate.industry);
    score += scoreSize(candidate.size);

    const techSignals = signals.filter((s) => s.type === "technology");
    score += Math.min(techSignals.length * 4, 15);

    const cloudSignals = signals.filter((s) => s.type === "cloud");
    if (cloudSignals.length > 0) {
      const cloudValues = cloudSignals.map((s) => s.value.toLowerCase());
      if (cloudValues.some((v) => ["aws", "azure", "gcp"].includes(v))) score += 15;
      else score += 8;
    }

    const painSignals = signals.filter((s) => s.type === "pain");
    score += Math.min(painSignals.length * 3, 10);

    const growthSignals = signals.filter((s) => s.type === "growth" || s.type === "expansion" || s.type === "funding");
    score += Math.min(growthSignals.length * 3, 10);

    const hiringSignals = signals.filter((s) => s.type === "hiring");
    score += Math.min(hiringSignals.length * 2, 5);

    // Core ICP for Ryvan: companies with partner programs / outcome-based
    // outsourcing engagements. Weighted heavily — this is what "fit" means.
    const partnershipSignals = signals.filter((s) => s.type === "partnership");
    score += Math.min(partnershipSignals.length * 12, 30);

    score = Math.min(score, 100);

    const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F";

    await prisma.companyCandidate.update({
      where: { id: candidateId },
      data: {
        qualificationScore: score,
        qualificationGrade: grade,
        status: "qualified",
      },
    });

    await eventBus.publish({
      type: "candidate.qualified.v1",
      version: "1",
      source: "discovery.qualification",
      payload: { candidateId, score, grade, companyName: candidate.companyName },
    });

    return { score, grade };
  }

  async promoteToProspect(
    candidateId: string,
    userId: string
  ): Promise<string> {
    const candidate = await prisma.companyCandidate.findUnique({
      where: { id: candidateId },
      include: { signals: true, source: true },
    });
    if (!candidate) throw new Error("Candidate not found");

    const techSignals = candidate.signals.filter((s) => s.type === "technology").map((s) => s.value);
    const painSignals = candidate.signals.filter((s) => s.type === "pain").map((s) => s.value);
    const growthSigs = candidate.signals
      .filter((s) => ["growth", "expansion", "funding", "hiring"].includes(s.type))
      .map((s) => s.value);
    const cloudSig = candidate.signals.find((s) => s.type === "cloud");

    const prospect = await prisma.prospect.create({
      data: {
        companyName: candidate.companyName,
        website: candidate.website,
        industry: candidate.industry,
        size: candidate.size,
        employees: candidate.employees,
        location: candidate.location,
        country: candidate.country,
        description: candidate.description,
        techStack: JSON.stringify(techSignals),
        cloudProvider: cloudSig?.value || null,
        painPoints: JSON.stringify(painSignals),
        growthSignals: JSON.stringify(growthSigs),
        qualificationScore: candidate.qualificationScore,
        qualificationGrade: candidate.qualificationGrade,
        confidence: candidate.confidence,
        source: candidate.source.name,
        status: "new",
        createdById: userId,
      },
    });

    await prisma.companyCandidate.update({
      where: { id: candidateId },
      data: { status: "promoted", prospectId: prospect.id },
    });

    for (const signal of candidate.signals) {
      await prisma.discoverySignal.update({
        where: { id: signal.id },
        data: { prospectId: prospect.id },
      });
    }

    await eventBus.publish({
      type: "prospect.created.v1",
      version: "1",
      source: "discovery.promotion",
      payload: {
        prospectId: prospect.id,
        candidateId,
        companyName: prospect.companyName,
        grade: prospect.qualificationGrade,
        score: prospect.qualificationScore,
      },
    });

    return prospect.id;
  }

  private async checkDuplicate(
    candidate: CompanyCandidateData
  ): Promise<boolean> {
    if (candidate.website) {
      const domain = candidate.website
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "")
        .toLowerCase();

      const existing = await prisma.companyCandidate.findFirst({
        where: {
          website: { contains: domain },
          status: { notIn: ["rejected", "archived"] },
        },
      });
      if (existing) return true;

      const existingProspect = await prisma.prospect.findFirst({
        where: { website: { contains: domain } },
      });
      if (existingProspect) return true;

      const existingCompany = await prisma.company.findFirst({
        where: { website: { contains: domain } },
      });
      if (existingCompany) return true;
    }

    const nameMatch = await prisma.companyCandidate.findFirst({
      where: {
        companyName: candidate.companyName,
        status: { notIn: ["rejected", "archived"] },
      },
    });
    return !!nameMatch;
  }
}

function extractEvidence(text: string, keyword: string): string | undefined {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + keyword.length + 40);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

function detectSignals(
  candidate: { industry?: string | null; size?: string | null; description?: string | null },
  raw: Record<string, unknown>
): SignalData[] {
  const signals: SignalData[] = [];
  const desc = candidate.description || "";
  const rawStr = JSON.stringify(raw);
  const fullText = `${desc} ${rawStr}`;
  const lower = fullText.toLowerCase();

  const techKeywords: Record<string, string> = {
    react: "React", angular: "Angular", vue: "Vue.js", python: "Python",
    java: "Java", nodejs: "Node.js", "node.js": "Node.js", kubernetes: "Kubernetes",
    docker: "Docker", terraform: "Terraform", selenium: "Selenium",
    jenkins: "Jenkins", "ci/cd": "CI/CD", microservices: "Microservices",
    graphql: "GraphQL", mongodb: "MongoDB", postgresql: "PostgreSQL",
    redis: "Redis", kafka: "Kafka", elasticsearch: "Elasticsearch",
  };
  for (const [keyword, label] of Object.entries(techKeywords)) {
    if (lower.includes(keyword)) {
      signals.push({ type: "technology", value: label, confidence: 80, evidence: extractEvidence(fullText, keyword) });
    }
  }

  const cloudKeywords: Record<string, string> = {
    aws: "AWS", "amazon web services": "AWS", azure: "Azure",
    "google cloud": "GCP", gcp: "GCP", "on-premise": "On-Premise",
  };
  for (const [keyword, label] of Object.entries(cloudKeywords)) {
    if (lower.includes(keyword)) {
      signals.push({ type: "cloud", value: label, confidence: 85, evidence: extractEvidence(fullText, keyword) });
    }
  }

  const hiringKeywords = [
    "hiring", "looking for", "job opening", "we're recruiting",
    "open position", "career", "join our team",
  ];
  for (const keyword of hiringKeywords) {
    if (lower.includes(keyword)) {
      signals.push({ type: "hiring", value: "Active Hiring", importance: "high", confidence: 75, evidence: extractEvidence(fullText, keyword) });
      break;
    }
  }

  const qaKeywords = ["qa", "quality assurance", "testing", "automation testing", "selenium", "cypress"];
  for (const keyword of qaKeywords) {
    if (lower.includes(keyword)) {
      signals.push({ type: "hiring", value: "QA/Testing Roles", importance: "critical", confidence: 80, evidence: extractEvidence(fullText, keyword) });
      break;
    }
  }

  const growthKeywords: Record<string, string> = {
    "series a": "Series A Funding", "series b": "Series B Funding",
    "series c": "Series C Funding", fundraise: "Fundraising",
    expansion: "Expanding", "new office": "New Office",
    acquisition: "Acquisition Activity", ipo: "IPO Plans",
  };
  for (const [keyword, label] of Object.entries(growthKeywords)) {
    if (lower.includes(keyword)) {
      signals.push({ type: "growth", value: label, importance: "high", confidence: 70, evidence: extractEvidence(fullText, keyword) });
    }
  }

  const painKeywords: Record<string, string> = {
    "legacy system": "Legacy Systems", "technical debt": "Technical Debt",
    migration: "Migration Needed", "cost reduction": "Cost Optimization",
    scalability: "Scalability Issues", compliance: "Compliance Requirements",
    "data security": "Security Concerns", modernization: "Modernization Needed",
  };
  for (const [keyword, label] of Object.entries(painKeywords)) {
    if (lower.includes(keyword)) {
      signals.push({ type: "pain", value: label, importance: "high", confidence: 65, evidence: extractEvidence(fullText, keyword) });
    }
  }

  return signals;
}

/**
 * Industry fit for Ryvan, 8-25 points.
 *
 * Matched by pattern, NOT by exact key. Providers use their own taxonomies —
 * The Companies API returns slugs like "software-development" and
 * "computer-and-network-security", while the original seed data used short
 * names like "saas". An exact-key map silently fell through to the 8-point
 * default for every real lead, costing ~17 points each and capping the whole
 * pipeline at grade C. Patterns tolerate both, and any new provider's slugs.
 *
 * Weighting follows the two ICPs: software/SaaS firms who would buy QA
 * automation, and IT-services/outsourcing firms who would partner.
 */
export function scoreIndustry(raw: string | null | undefined): number {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return 8;

  // Prime: builds software, so it has tests to automate.
  if (/software-development|computer-software|internet-software|^saas$|application-development/.test(s)) return 25;
  // Prime: outsources delivery — the partner-program ICP.
  if (/it-services|information-technology-and-services|it-and-it-consulting|outsourc|business-process|staffing-and-recruiting/.test(s)) return 25;
  // Strong: technical products with real QA surface.
  if (/technology-information-and-internet|information-services|computer-and-network-security|data-infrastructure|computer-networking|it-system/.test(s)) return 22;
  // Strong: regulated, high cost of defects.
  if (/financial-services|fintech|banking|insurance|capital-markets|payments/.test(s)) return 22;
  if (/e-?commerce|retail/.test(s)) return 20;
  if (/gaming|computer-games|mobile-gaming/.test(s)) return 18;
  if (/health|biotech|pharma|medical|hospital/.test(s)) return 18;
  if (/logistics|transportation|supply-chain/.test(s)) return 15;
  if (/education|e-?learning/.test(s)) return 15;
  if (/telecom/.test(s)) return 12;
  if (/media|broadcast|publishing|entertainment|advertising/.test(s)) return 12;
  if (/manufactur|industrial|energy|utilities|oil|mining|construction/.test(s)) return 10;
  return 8;
}

/**
 * Company-size fit for Ryvan, 3-20 points.
 *
 * Accepts both the provider's headcount ranges ("50-200") and the legacy seed
 * labels ("medium"). Mid-size scores highest: big enough to have a QA budget,
 * small enough to outsource rather than run an in-house QA org. Giants score
 * low — they already have QA teams and are near-impossible for a two-person
 * studio to reach.
 */
export function scoreSize(raw: string | null | undefined): number {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return 8;

  const legacy: Record<string, number> = { enterprise: 20, large: 18, medium: 15, small: 10, startup: 5 };
  if (legacy[s] !== undefined) return legacy[s];

  const ranges: Record<string, number> = {
    "200-500": 20,
    "50-200": 18,
    "500-1k": 15,
    "1k-5k": 10,
    "10-50": 8,
    "5k-10k": 5,
    "over-10k": 4,
    "10k+": 4,
    "1-10": 3,
  };
  return ranges[s] ?? 8;
}

export const discoveryEngine = new DiscoveryEngine();
