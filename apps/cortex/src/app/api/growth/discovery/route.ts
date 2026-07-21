import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { discoveryEngine } from "@/cortex/discovery";
import { generateFitReport } from "@/cortex/analysis/report";
import { generateOutreach } from "@/cortex/analysis/outreach";

bootstrapCAO();

/** Pick the best available accurate B2B source, falling back to web search. */
function preferredDiscoveryProvider(): string {
  if (process.env.THE_COMPANIES_API_KEY) return "thecompaniesapi";
  if (process.env.APOLLO_API_KEY) return "apollo";
  return "autonomous_search";
}

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "dashboard";

    if (view === "providers") {
      const providers = discoveryEngine.listProviders();
      const sources = await prisma.discoverySource.findMany({
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ providers, sources });
    }

    if (view === "runs") {
      const runs = await prisma.discoveryRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          source: { select: { name: true, displayName: true } },
          _count: { select: { candidates: true } },
        },
      });
      return NextResponse.json({ runs });
    }

    if (view === "candidates") {
      const status = searchParams.get("status") || undefined;
      const candidates = await prisma.companyCandidate.findMany({
        where: status ? { status } : { status: { notIn: ["rejected", "archived"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          source: { select: { name: true, displayName: true, trustScore: true } },
          signals: { orderBy: { importance: "desc" } },
          run: { select: { id: true, triggeredBy: true } },
        },
      });
      return NextResponse.json({ candidates });
    }

    if (view === "prospects") {
      const status = searchParams.get("status") || undefined;
      const prospects = await prisma.prospect.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          signals: { orderBy: { importance: "desc" } },
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });
      return NextResponse.json({ prospects });
    }

    // Dashboard view: funnel stats
    const [
      totalCandidates,
      newCandidates,
      qualifiedCandidates,
      promotedCandidates,
      rejectedCandidates,
      totalProspects,
      totalSignals,
      recentRuns,
      topSources,
    ] = await Promise.all([
      prisma.companyCandidate.count(),
      prisma.companyCandidate.count({ where: { status: "new" } }),
      prisma.companyCandidate.count({ where: { status: "qualified" } }),
      prisma.companyCandidate.count({ where: { status: "promoted" } }),
      prisma.companyCandidate.count({ where: { status: "rejected" } }),
      prisma.prospect.count(),
      prisma.discoverySignal.count(),
      prisma.discoveryRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          source: { select: { displayName: true } },
          _count: { select: { candidates: true } },
        },
      }),
      prisma.discoverySource.findMany({
        include: { _count: { select: { candidates: true, runs: true } } },
        orderBy: { lastRunAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      funnel: {
        discovered: totalCandidates,
        new: newCandidates,
        qualified: qualifiedCandidates,
        promoted: promotedCandidates,
        rejected: rejectedCandidates,
        prospects: totalProspects,
        signals: totalSignals,
      },
      recentRuns,
      sources: topSources,
    });
  } catch (error) {
    console.error("Discovery GET error:", error);
    return NextResponse.json({ error: "Failed to fetch discovery data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action: string;
      provider?: string;
      config?: Record<string, unknown>;
      candidateId?: string;
      candidateIds?: string[];
      /** Force a fresh outreach draft instead of reusing the stored one. */
      regenerate?: boolean;
      /** batch_qualify: re-score every live candidate, not just new ones. */
      all?: boolean;
    };

    if (body.action === "discover") {
      if (!body.provider) {
        return NextResponse.json({ error: "Provider is required" }, { status: 400 });
      }
      const result = await discoveryEngine.runDiscovery(
        body.provider,
        body.config || {},
        "manual"
      );
      return NextResponse.json(result, { status: 201 });
    }

    if (body.action === "extract_signals") {
      if (!body.candidateId) {
        return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
      }
      const count = await discoveryEngine.extractSignals(body.candidateId);
      return NextResponse.json({ signalsExtracted: count });
    }

    if (body.action === "qualify") {
      if (!body.candidateId) {
        return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
      }
      const result = await discoveryEngine.qualifyCandidate(body.candidateId);
      return NextResponse.json(result);
    }

    if (body.action === "promote") {
      if (!body.candidateId) {
        return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
      }
      const prospectId = await discoveryEngine.promoteToProspect(
        body.candidateId,
        user.id
      );
      return NextResponse.json({ prospectId }, { status: 201 });
    }

    if (body.action === "reject") {
      if (!body.candidateId) {
        return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
      }
      await prisma.companyCandidate.update({
        where: { id: body.candidateId },
        data: { status: "rejected", rejectionReason: (body.config?.reason as string) || "Manually rejected" },
      });
      return NextResponse.json({ status: "rejected" });
    }

    // Autonomous pipeline: discover (Serper) → extract signals → qualify.
    // Fast path only (no LLM) so it returns promptly; reports are generated
    // per-candidate via the "analyze" action.
    if (body.action === "autonomous_run") {
      // Prefer accurate B2B data when configured; else fall back to web search.
      const provider = body.provider || preferredDiscoveryProvider();
      const result = await discoveryEngine.runDiscovery(
        provider,
        body.config || {},
        "autonomous",
      );
      const newCandidates = await prisma.companyCandidate.findMany({
        where: { runId: result.runId },
        select: { id: true },
      });
      let qualified = 0;
      for (const c of newCandidates) {
        try {
          await discoveryEngine.extractSignals(c.id);
          await discoveryEngine.qualifyCandidate(c.id);
          qualified++;
        } catch { /* skip a candidate that fails to qualify */ }
      }
      return NextResponse.json({ ...result, qualified }, { status: 201 });
    }

    // Generate the LLM (Ollama) fit report for a single candidate.
    if (body.action === "analyze") {
      if (!body.candidateId) {
        return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
      }
      const report = await generateFitReport(body.candidateId);
      return NextResponse.json(report);
    }

    // Generate a personalized cold-outreach draft (AI SDR).
    if (body.action === "outreach") {
      if (!body.candidateId) {
        return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
      }
      // Existing drafts are reused for free; `regenerate: true` forces a rewrite.
      const draft = await generateOutreach(body.candidateId, body.regenerate === true);
      return NextResponse.json(draft);
    }

    if (body.action === "batch_qualify") {
      // Grades are only recomputed when qualifyCandidate() runs, so a scoring
      // change leaves existing rows on their old grade forever. `all: true`
      // re-scores everything still in play, not just untouched candidates.
      const candidates = await prisma.companyCandidate.findMany({
        where: body.all === true ? { status: { notIn: ["rejected", "archived"] } } : { status: "new" },
        select: { id: true },
      });
      const results = [];
      for (const c of candidates) {
        await discoveryEngine.extractSignals(c.id);
        const result = await discoveryEngine.qualifyCandidate(c.id);
        results.push({ candidateId: c.id, ...result });
      }
      return NextResponse.json({ qualified: results.length, results });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Discovery POST error:", error);
    return NextResponse.json({ error: "Failed to process discovery request" }, { status: 500 });
  }
}
