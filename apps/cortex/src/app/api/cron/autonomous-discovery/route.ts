import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { discoveryEngine } from "@/cortex/discovery";
import { generateOutreach } from "@/cortex/analysis/outreach";
import { isEnabled } from "@/lib/features";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:cron:autonomous-discovery");

/**
 * Autonomous discovery cron.
 *
 * Runs the full unattended pipeline: for each configured ICP target →
 * Serper discovery → signal extraction → heuristic qualification, then
 * generates LLM fit-reports for the top-N newly qualified candidates.
 *
 * Triggered by an external scheduler (host crontab / systemd timer) that hits
 * this endpoint daily. Auth is a shared secret (CRON_SECRET), NOT a user token,
 * so no human session is needed.
 *
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cortex.ryvanai.com/api/cron/autonomous-discovery
 *
 * Gated by the CONTINUOUS_MONITORING feature flag so it can be turned off
 * without removing the schedule.
 */

type ScanTarget = Record<string, unknown>;

// The Companies API (accurate B2B) — QA-automation ICP: SMB/mid software
// companies (US/UK) that lack in-house QA and would outsource to a studio.
const TCA_TARGETS: ScanTarget[] = [
  // QA prospects — software/product companies (US/UK)
  {
    industries: ["software-development"],
    countries: ["us", "gb"],
    employeeRanges: ["10-50", "50-200", "200-500"],
    limit: 8,
  },
  {
    industries: ["saas"],
    countries: ["us", "gb"],
    employeeRanges: ["10-50", "50-200", "200-500"],
    limit: 6,
  },
  // Partner firms — IT-services/outsourcing companies (India) that subcontract overflow work
  {
    industries: [
      "information-technology-and-services",
      "it-services-and-it-consulting",
      "outsourcing",
    ],
    countries: ["in"],
    employeeRanges: ["50-200", "200-500", "500-1k"],
    limit: 8,
  },
];

// Apollo targets (if that key is used instead).
const APOLLO_TARGETS: ScanTarget[] = [
  {
    keywords: ["software development", "product engineering"],
    locations: ["United States", "United Kingdom"],
    employeeRanges: ["51,200", "201,500"],
    limit: 15,
  },
];

// Web-search fallback (used only when no B2B data key at all).
const SERPER_TARGETS: ScanTarget[] = [
  { mode: "b2b", query: "software product companies hiring QA engineers", limit: 15 },
];

/** Prefer The Companies API, then Apollo, then web search. */
function getProviderAndTargets(): { provider: string; targets: ScanTarget[] } {
  let provider = "autonomous_search";
  let defaults = SERPER_TARGETS;
  if (process.env.THE_COMPANIES_API_KEY) {
    provider = "thecompaniesapi";
    defaults = TCA_TARGETS;
  } else if (process.env.APOLLO_API_KEY) {
    provider = "apollo";
    defaults = APOLLO_TARGETS;
  }

  const raw = process.env.CRON_SCAN_TARGETS;
  let targets = defaults;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ScanTarget[];
      if (Array.isArray(parsed) && parsed.length > 0) targets = parsed;
    } catch {
      /* keep defaults */
    }
  }
  return { provider, targets };
}

function describeTarget(t: ScanTarget): string {
  if (typeof t.query === "string") return t.query;
  if (Array.isArray(t.keywords)) return (t.keywords as string[]).join(", ");
  return JSON.stringify(t).slice(0, 80);
}

export const POST = withApi(async (request) => {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEnabled("CONTINUOUS_MONITORING_ENABLED")) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "CONTINUOUS_MONITORING is disabled (set FEATURE_CONTINUOUS_MONITORING=true)",
      },
      { status: 200 },
    );
  }

  bootstrapCAO();

  const startedAt = new Date();
  const scans: Array<{ target: string; discovered: number; qualified: number; errors: string[] }> =
    [];
  const { provider, targets } = getProviderAndTargets();

  for (const target of targets) {
    const label = describeTarget(target);
    try {
      const result = await discoveryEngine.runDiscovery(provider, target, "cron");
      const newCandidates = await prisma.companyCandidate.findMany({
        where: { runId: result.runId },
        select: { id: true },
      });
      let qualified = 0;
      const qualifyErrors: string[] = [];
      for (const c of newCandidates) {
        try {
          await discoveryEngine.extractSignals(c.id);
          await discoveryEngine.qualifyCandidate(c.id);
          qualified++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "qualification failed";
          qualifyErrors.push(`candidate ${c.id}: ${msg}`);
          log.error({ err: msg, candidateId: c.id }, "Failed to qualify candidate");
        }
      }
      if (qualifyErrors.length > 0) {
        result.errors.push(...qualifyErrors.slice(0, 5));
      }
      scans.push({
        target: label,
        discovered: result.discovered,
        qualified,
        errors: result.errors,
      });
    } catch (err) {
      scans.push({
        target: label,
        discovered: 0,
        qualified: 0,
        errors: [err instanceof Error ? err.message : "scan failed"],
      });
    }
  }

  // Generate outreach DRAFTS for the top-N highest-scoring new leads.
  // Bounded per run so a slow local LLM can't stall the job indefinitely.
  const perRun = Number(process.env.CRON_REPORTS_PER_RUN || 5);
  const toDraft = await prisma.companyCandidate.findMany({
    where: {
      analyzedAt: null,
      qualificationScore: { not: null },
      status: { notIn: ["rejected", "archived"] },
    },
    orderBy: { qualificationScore: "desc" },
    take: Math.max(0, perRun),
    select: { id: true },
  });

  let draftsGenerated = 0;
  const draftErrors: string[] = [];
  for (const c of toDraft) {
    try {
      await generateOutreach(c.id);
      draftsGenerated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "draft generation failed";
      draftErrors.push(`candidate ${c.id}: ${msg}`);
      log.error({ err: msg, candidateId: c.id }, "Failed to generate outreach");
    }
  }

  return NextResponse.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    scans,
    draftsGenerated,
    draftErrors: draftErrors.slice(0, 5),
  });
});
