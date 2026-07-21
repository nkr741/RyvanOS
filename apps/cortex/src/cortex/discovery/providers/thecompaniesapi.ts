import type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  DiscoveryResult,
  CompanyCandidateData,
  SignalData,
} from "../types";

/**
 * The Companies API provider — accurate B2B firmographics on a usable free tier.
 *
 * Tuned for Ryvan's first wedge: QA-automation outreach to software/product
 * companies (US/UK) that likely lack in-house QA capacity. Mega-corps (5k+ emp,
 * they have their own QA org) are dropped.
 *
 * Requires THE_COMPANIES_API_KEY. Costs 1 credit per returned company, so keep
 * batch sizes small. With no key, discover() returns nothing + a clear error.
 *
 * GET https://api.thecompaniesapi.com/v2/companies?token=…&query=[…conditions…]
 */

const BASE_URL = "https://api.thecompaniesapi.com/v2/companies";

const manifest: DiscoveryProviderManifest = {
  name: "thecompaniesapi",
  displayName: "The Companies API (B2B Data)",
  type: "api",
  description:
    "Accurate B2B firmographics (name, domain, industry, size, HQ) filtered by ICP. Free tier, 1 credit/company.",
  trustScore: 88,
  capabilities: {
    supportsPagination: true,
    supportsScheduling: true,
    supportsIncremental: true,
    supportsRetry: true,
  },
  defaultSchedule: "0 6 * * *",
};

interface TcaConfig {
  /** Industry slugs, e.g. ["software-development", "saas"]. */
  industries?: string[];
  /** HQ country codes, e.g. ["us", "gb"]. */
  countries?: string[];
  /** Employee buckets, e.g. ["10-50","50-200","200-500"]. Defaults to SMB/mid. */
  employeeRanges?: string[];
  /** Free-text search on name/domain (used instead of industry filter if set). */
  search?: string;
  /** Max companies (1 credit each). Default 10. */
  limit?: number;
  page?: number;
}

interface TcaCompany {
  about?: { name?: string; industry?: string; industries?: string[]; totalEmployees?: string; businessType?: string };
  domain?: { domain?: string };
  descriptions?: { primary?: string };
  locations?: { headquarters?: { country?: { name?: string; code?: string }; city?: { name?: string } } };
}

// Employee buckets we consider too large to outsource QA to a new studio.
const TOO_LARGE = new Set(["5k-10k", "over-10k", "10k+"]);

export const theCompaniesApiProvider: DiscoveryProvider = {
  manifest,

  async discover(config): Promise<DiscoveryResult> {
    const cfg = config as TcaConfig;
    const apiKey = process.env.THE_COMPANIES_API_KEY;
    if (!apiKey) {
      return {
        candidates: [],
        errors: ["THE_COMPANIES_API_KEY is not set — add your key from thecompaniesapi.com to .env."],
      };
    }

    const limit = Math.min(Math.max(cfg.limit ?? 10, 1), 50);
    const params = new URLSearchParams();
    params.set("token", apiKey);
    params.set("size", String(limit));
    params.set("page", String(cfg.page ?? 1));

    if (cfg.search) {
      params.set("search", cfg.search);
    } else {
      const conditions: Array<Record<string, unknown>> = [];
      const industries = cfg.industries?.length ? cfg.industries : ["software-development"];
      conditions.push({ attribute: "about.industries", operator: "or", sign: "equals", values: industries });
      const countries = cfg.countries?.length ? cfg.countries : ["us", "gb"];
      conditions.push({ attribute: "locations.headquarters.country.code", operator: "or", sign: "equals", values: countries });
      // Target SMB/mid software companies — the ones that lack in-house QA and
      // would actually outsource to a studio. Excludes the WhatsApp/Splunk giants.
      const employeeRanges = cfg.employeeRanges?.length ? cfg.employeeRanges : ["10-50", "50-200", "200-500"];
      conditions.push({ attribute: "about.totalEmployees", operator: "or", sign: "equals", values: employeeRanges });
      params.set("query", JSON.stringify(conditions));
    }

    try {
      const res = await fetchWithTimeout(`${BASE_URL}?${params.toString()}`, { method: "GET" }, 30_000);
      if (!res.ok) {
        return { candidates: [], errors: [`The Companies API responded ${res.status}: ${await safeText(res)}`] };
      }
      const data = (await res.json()) as { companies?: TcaCompany[] };
      const companies = data.companies || [];
      const errors: string[] = [];
      const seen = new Set<string>();
      const candidates: CompanyCandidateData[] = [];

      for (const co of companies) {
        try {
          const normalized = this.normalize(co as unknown as Record<string, unknown>);
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
          errors.push(err instanceof Error ? err.message : "Failed to parse a company");
        }
      }
      return { candidates, errors, metadata: { returned: candidates.length, requested: limit } };
    } catch (err) {
      return { candidates: [], errors: [`The Companies API request failed: ${err instanceof Error ? err.message : "unknown"}`] };
    }
  },

  normalize(raw: Record<string, unknown>): CompanyCandidateData {
    const c = raw as TcaCompany;
    const name = c.about?.name?.trim() || "";
    const domain = c.domain?.domain;
    const industries = c.about?.industries || [];
    const industryText = `${(c.about?.industry || "")} ${industries.join(" ")} ${c.descriptions?.primary || ""}`.toLowerCase();

    const signals: SignalData[] = [];
    // Fit signals for QA-automation outreach.
    if (/software|saas|product|application|platform|app-development/.test(industryText)) {
      signals.push({ type: "technology", value: "Software/Product Company", importance: "high", confidence: 80 });
    }
    if (/outsourc|agency|it-services|consulting|staff-augmentation/.test(industryText)) {
      signals.push({ type: "partnership", value: "Agency / Outsourcing Model", importance: "critical", confidence: 80 });
    }
    if (/qa|testing|quality/.test(industryText)) {
      signals.push({ type: "pain", value: "QA/Testing Relevant", importance: "high", confidence: 70 });
    }

    return {
      companyName: name,
      website: domain ? `https://${domain}` : undefined,
      industry: c.about?.industry,
      size: c.about?.totalEmployees,
      location: [c.locations?.headquarters?.city?.name, c.locations?.headquarters?.country?.name].filter(Boolean).join(", ") || undefined,
      country: c.locations?.headquarters?.country?.name || "Unknown",
      description: c.descriptions?.primary,
      rawData: raw,
      confidence: 88,
      signals,
    };
  },

  validate(candidate: CompanyCandidateData) {
    if (!candidate.companyName || candidate.companyName.trim().length < 2) {
      return { valid: false, reason: "Missing company name" };
    }
    const size = (candidate.size || "").toLowerCase();
    if (TOO_LARGE.has(size)) {
      return { valid: false, reason: `Too large (${candidate.size}) — has in-house QA` };
    }
    return { valid: true };
  },
};

// ─── helpers ────────────────────────────────────────────────────

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
