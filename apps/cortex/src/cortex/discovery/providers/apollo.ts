import type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  DiscoveryResult,
  CompanyCandidateData,
  SignalData,
} from "../types";

/**
 * Apollo.io discovery provider — accurate, structured B2B firmographic data.
 *
 * Unlike web search (which returns vendor blogs and directories), Apollo returns
 * real companies with verified industry, headcount, location, and technographic
 * data, filterable by ICP. This is the "no compromise" accurate source.
 *
 * Requires APOLLO_API_KEY (Apollo → Settings → Integrations → API). With no key,
 * discover() returns zero candidates and a clear error rather than throwing.
 *
 * Docs: https://docs.apollo.io/reference/organization-search
 */

const APOLLO_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_companies/search";

const manifest: DiscoveryProviderManifest = {
  name: "apollo",
  displayName: "Apollo.io (B2B Data)",
  type: "api",
  description:
    "Accurate B2B company data from Apollo — verified firmographics + technographics, filtered by ICP (industry, headcount, location, keywords).",
  trustScore: 92,
  capabilities: {
    supportsPagination: true,
    supportsScheduling: true,
    supportsIncremental: true,
    supportsRetry: true,
  },
  defaultSchedule: "0 6 * * *",
};

interface ApolloConfig {
  /** ICP keyword tags, e.g. ["partner program", "outsourcing", "software development"]. */
  keywords?: string[];
  /** Locations, e.g. ["India", "Hyderabad"]. */
  locations?: string[];
  /** Apollo employee-count ranges, e.g. ["51,200", "201,500", "501,1000"]. */
  employeeRanges?: string[];
  /** Free-text company-name search. */
  query?: string;
  /** Max candidates (per_page, capped at 100). */
  limit?: number;
  page?: number;
}

interface ApolloOrg {
  name?: string;
  website_url?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  city?: string;
  state?: string;
  country?: string;
  short_description?: string;
  keywords?: string[];
  technology_names?: string[];
}

export const apolloProvider: DiscoveryProvider = {
  manifest,

  async discover(config): Promise<DiscoveryResult> {
    const cfg = config as ApolloConfig;
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      return {
        candidates: [],
        errors: ["APOLLO_API_KEY is not set — add your Apollo API key to .env to enable accurate B2B discovery."],
      };
    }

    const perPage = Math.min(Math.max(cfg.limit ?? 25, 1), 100);
    const body: Record<string, unknown> = {
      page: cfg.page ?? 1,
      per_page: perPage,
    };
    if (cfg.query) body.q_organization_name = cfg.query;
    if (cfg.keywords?.length) body.q_organization_keyword_tags = cfg.keywords;
    if (cfg.locations?.length) body.organization_locations = cfg.locations;
    if (cfg.employeeRanges?.length) body.organization_num_employees_ranges = cfg.employeeRanges;

    try {
      const res = await fetchWithTimeout(
        APOLLO_SEARCH_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify(body),
        },
        30_000,
      );

      if (!res.ok) {
        return { candidates: [], errors: [`Apollo responded ${res.status}: ${await safeText(res)}`] };
      }

      const data = (await res.json()) as { organizations?: ApolloOrg[]; accounts?: ApolloOrg[] };
      const orgs = data.organizations || data.accounts || [];
      const errors: string[] = [];
      const seen = new Set<string>();
      const candidates: CompanyCandidateData[] = [];

      for (const org of orgs) {
        try {
          const normalized = this.normalize(org as unknown as Record<string, unknown>);
          const key = (normalized.website || normalized.companyName).toLowerCase();
          if (seen.has(key)) continue;
          const v = this.validate(normalized);
          if (!v.valid) {
            errors.push(`${normalized.companyName || "unknown"}: ${v.reason}`);
            continue;
          }
          seen.add(key);
          candidates.push(normalized);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Failed to parse an organization");
        }
      }

      return { candidates, errors, metadata: { returned: candidates.length, requested: perPage } };
    } catch (err) {
      return { candidates: [], errors: [`Apollo request failed: ${err instanceof Error ? err.message : "unknown error"}`] };
    }
  },

  normalize(raw: Record<string, unknown>): CompanyCandidateData {
    const o = raw as ApolloOrg;
    const website = o.website_url || (o.primary_domain ? `https://${o.primary_domain}` : undefined);
    const location = [o.city, o.state, o.country].filter(Boolean).join(", ") || undefined;
    const employees = o.estimated_num_employees;

    const signals: SignalData[] = [];
    for (const tech of (o.technology_names || []).slice(0, 12)) {
      signals.push({ type: "technology", value: tech, confidence: 90 });
    }
    const kwText = `${(o.keywords || []).join(" ")} ${o.short_description || ""}`.toLowerCase();
    if (/partner program|channel partner|technology partner|isv|reseller/.test(kwText)) {
      signals.push({ type: "partnership", value: "Partner Program", importance: "critical", confidence: 85 });
    }
    if (/outsourc|staff augmentation|offshore|dedicated team|vendor/.test(kwText)) {
      signals.push({ type: "pain", value: "Outsourcing Intent", importance: "critical", confidence: 80 });
    }
    if (/hiring|careers|recruit/.test(kwText)) {
      signals.push({ type: "hiring", value: "Active Hiring", importance: "high", confidence: 80 });
    }

    return {
      companyName: (o.name || "").trim(),
      website,
      industry: o.industry,
      size: sizeFromEmployees(employees),
      employees,
      location,
      country: o.country || "India",
      description: o.short_description,
      rawData: raw,
      confidence: 90,
      signals,
    };
  },

  validate(candidate: CompanyCandidateData) {
    if (!candidate.companyName || candidate.companyName.trim().length < 2) {
      return { valid: false, reason: "Missing company name" };
    }
    return { valid: true };
  },
};

// ─── helpers ────────────────────────────────────────────────────

function sizeFromEmployees(n?: number): string | undefined {
  if (!n) return undefined;
  if (n >= 5000) return "enterprise";
  if (n >= 1000) return "large";
  if (n >= 200) return "medium";
  if (n >= 50) return "small";
  return "startup";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<no body>";
  }
}
