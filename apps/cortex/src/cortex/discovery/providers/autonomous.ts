import type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  DiscoveryResult,
  CompanyCandidateData,
  SignalData,
} from "../types";

/**
 * Autonomous discovery provider.
 *
 * Sources candidate companies WITHOUT human-supplied input, using Serper.dev
 * (Google Search API). Supports two ICP modes per run:
 *   - "b2b"   → /search  (organic web results → company sites for Ryvan services)
 *   - "local" → /places  (local business listings → rynOne merchant onboarding)
 *
 * Requires SERPER_API_KEY. With no key, discover() returns zero candidates and a
 * clear error rather than throwing — the run simply produces nothing.
 *
 * The provider interface is source-agnostic, so Apollo/Crunchbase/Google-Places
 * can be dropped in later without touching callers.
 */

const SERPER_SEARCH_URL = "https://google.serper.dev/search";
const SERPER_PLACES_URL = "https://google.serper.dev/places";

const manifest: DiscoveryProviderManifest = {
  name: "autonomous_search",
  displayName: "Autonomous Search",
  type: "api",
  description:
    "Autonomously discover companies via web + local search (Serper). B2B prospects for Ryvan services or local merchants for rynOne.",
  trustScore: 65,
  capabilities: {
    supportsPagination: true,
    supportsScheduling: true,
    supportsIncremental: true,
    supportsRetry: true,
  },
  defaultSchedule: "0 6 * * *",
};

interface AutonomousConfig {
  mode?: "b2b" | "local";
  /** Explicit search query. If omitted, one is built from industry + location. */
  query?: string;
  industry?: string;
  location?: string;
  /** Max candidates to return (Serper `num`). Default 20, capped at 100. */
  limit?: number;
  /** Geo/host-language for Serper. Defaults to India (gl=in, hl=en). */
  gl?: string;
  hl?: string;
}

interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
}

interface SerperPlace {
  title?: string;
  address?: string;
  category?: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
}

export const autonomousProvider: DiscoveryProvider = {
  manifest,

  async discover(config): Promise<DiscoveryResult> {
    const cfg = config as AutonomousConfig;
    const apiKey = process.env.SERPER_API_KEY;
    const errors: string[] = [];

    if (!apiKey) {
      return {
        candidates: [],
        errors: ["SERPER_API_KEY is not set — autonomous discovery is disabled. Add a free key from https://serper.dev to .env."],
      };
    }

    const mode = cfg.mode === "local" ? "local" : "b2b";
    const limit = Math.min(Math.max(cfg.limit ?? 20, 1), 100);
    const gl = cfg.gl || "in";
    const hl = cfg.hl || "en";
    const query = (cfg.query || buildQuery(mode, cfg.industry, cfg.location)).trim();

    if (!query) {
      return { candidates: [], errors: ["Empty query — provide a query, or an industry/location."] };
    }

    try {
      const url = mode === "local" ? SERPER_PLACES_URL : SERPER_SEARCH_URL;
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: limit, gl, hl }),
        },
        30_000,
      );

      if (!res.ok) {
        return { candidates: [], errors: [`Serper responded ${res.status}: ${(await safeText(res))}`] };
      }

      const data = await res.json();
      const rawItems = mode === "local"
        ? ((data.places as SerperPlace[]) || [])
        : ((data.organic as SerperOrganic[]) || []);

      const seen = new Set<string>();
      const candidates: CompanyCandidateData[] = [];

      for (const item of rawItems.slice(0, limit)) {
        try {
          const normalized = this.normalize({ ...item, __mode: mode });
          const dedupKey = (normalized.website || normalized.companyName).toLowerCase();
          if (seen.has(dedupKey)) continue;
          const validation = this.validate(normalized);
          if (!validation.valid) {
            errors.push(`${normalized.companyName || "unknown"}: ${validation.reason}`);
            continue;
          }
          seen.add(dedupKey);
          candidates.push(normalized);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Failed to parse a result");
        }
      }

      return { candidates, errors, metadata: { mode, query, requested: limit, returned: candidates.length } };
    } catch (err) {
      return { candidates: [], errors: [`Serper request failed: ${err instanceof Error ? err.message : "unknown error"}`] };
    }
  },

  normalize(raw: Record<string, unknown>): CompanyCandidateData {
    const mode = raw.__mode === "local" ? "local" : "b2b";

    if (mode === "local") {
      const p = raw as SerperPlace;
      const website = cleanUrl(p.website);
      const signals: SignalData[] = [];
      if (typeof p.rating === "number") {
        signals.push({
          type: "growth",
          value: `${p.rating}★ (${p.ratingCount ?? 0} reviews)`,
          confidence: 60,
          importance: p.rating >= 4 ? "high" : "medium",
        });
      }
      return {
        companyName: (p.title || "").trim(),
        website,
        industry: p.category,
        location: p.address,
        country: "India",
        description: [p.category, p.address, p.phoneNumber].filter(Boolean).join(" · "),
        rawData: raw,
        confidence: 65,
        signals,
      };
    }

    // b2b — organic web result
    const o = raw as SerperOrganic;
    const link = o.link || "";
    const website = cleanUrl(link);
    const host = domainOf(link);
    // Company name = the registrable (second-level) label, so
    // "in.linkedin.com" → "linkedin", "razorpay.com" → "razorpay".
    const sld = registrableLabel(host);
    const companyName = sld
      ? sld.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : (o.title || "").trim();
    const snippet = o.snippet || "";
    return {
      companyName,
      website,
      country: "India",
      description: snippet,
      rawData: raw,
      confidence: 60,
      signals: extractSignals(`${o.title || ""} ${snippet}`),
    };
  },

  validate(candidate: CompanyCandidateData) {
    if (!candidate.companyName || candidate.companyName.trim().length < 2) {
      return { valid: false, reason: "Could not determine company name" };
    }
    // Drop job boards, directories, and social/search platforms — never prospects.
    if (candidate.website && isAggregator(domainOf(candidate.website))) {
      return { valid: false, reason: "Excluded aggregator/job-board/directory" };
    }
    return { valid: true };
  },
};

/** Job boards, directories, and platforms that are never real prospects. */
const AGGREGATOR_PATTERN =
  /(^|\.)(linkedin|naukri|indeed|wellfound|angel|glassdoor|ambitionbox|monster|shine|foundit|timesjobs|instahyre|cutshort|hirist|internshala|iimjobs|apna|builtin\w*|simplyhired|ziprecruiter|crunchbase|tracxn|ycombinator|zaubacorp|thomasnet|clutch|goodfirms|designrush|sortlist|topdevelopers|appfutura|techreviewer|itfirms|mobileappdaily|f6s|glassdoor|google|bing|duckduckgo|wikipedia|facebook|twitter|youtube|instagram|medium|quora|reddit|amazon|flipkart|justdial|sulekha|yourstory|inc42|economictimes|businesstoday|business-standard|moneycontrol|livemint|forbes|techcrunch|hindustantimes|thehindu|ndtv|timesofindia|entrackr)\b/;

function isAggregator(host: string): boolean {
  if (host === "x.com" || host.endsWith(".x.com")) return true;
  return AGGREGATOR_PATTERN.test(host);
}

/** Second-level domain label: "in.linkedin.com" → "linkedin", "acme.co.uk" → "acme". */
function registrableLabel(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 1) return host;
  // Handle common two-part TLDs (co.uk, co.in, com.au) by taking the label before them.
  const twoPartTld = /^(co|com|net|org|gov|edu|ac)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  const idx = twoPartTld ? parts.length - 3 : parts.length - 2;
  return parts[Math.max(0, idx)] || parts[0];
}

// ─── helpers ────────────────────────────────────────────────────

function buildQuery(mode: "b2b" | "local", industry?: string, location?: string): string {
  const loc = location || "India";
  if (mode === "local") {
    return `${industry || "restaurants"} in ${loc}`;
  }
  // B2B ICP: companies that run partner programs and outsource project work to
  // startups on an outcome/deliverable basis — Ryvan's ideal clients.
  const seg = industry ? `${industry} ` : "";
  return `${seg}companies ${loc} "technology partner program" OR "outsource software development" OR "engineering partner"`;
}

/** Lightweight keyword signal extraction from result text (mirrors the website provider). */
function extractSignals(text: string): SignalData[] {
  const t = text.toLowerCase();
  const signals: SignalData[] = [];

  const techMap: Record<string, string> = {
    react: "React", "next.js": "Next.js", nextjs: "Next.js", python: "Python",
    java: "Java", "node.js": "Node.js", nodejs: "Node.js", kubernetes: "Kubernetes",
    docker: "Docker", "machine learning": "ML", "artificial intelligence": "AI", "ai ": "AI",
  };
  for (const [kw, label] of Object.entries(techMap)) {
    if (t.includes(kw)) signals.push({ type: "technology", value: label, confidence: 55 });
  }

  const cloudMap: Record<string, string> = {
    aws: "AWS", azure: "Azure", "google cloud": "GCP", gcp: "GCP",
  };
  for (const [kw, label] of Object.entries(cloudMap)) {
    if (t.includes(kw)) signals.push({ type: "cloud", value: label, confidence: 55 });
  }

  if (/hiring|careers|we're hiring|open positions|join our team/.test(t)) {
    signals.push({ type: "hiring", value: "Active Hiring", importance: "high", confidence: 60 });
  }
  if (/series [a-e]\b|raised|funding|seed round|venture/.test(t)) {
    signals.push({ type: "funding", value: "Funding Signal", importance: "high", confidence: 55 });
  }
  if (/expand|expansion|new office|scaling|growth/.test(t)) {
    signals.push({ type: "growth", value: "Growth Signal", importance: "medium", confidence: 50 });
  }
  // ─── Core ICP signals: partner programs + outsourcing intent ───
  if (/partner program|become a partner|technology partner|channel partner|partner with us|solution partner|vendor program|preferred vendor/.test(t)) {
    signals.push({ type: "partnership", value: "Partner Program", importance: "critical", confidence: 70 });
  }
  if (/outsourc|offshore development|staff augmentation|contract development|dedicated team|engage vendors|third-party developer|nearshore/.test(t)) {
    signals.push({ type: "pain", value: "Outsourcing Intent", importance: "critical", confidence: 65 });
  }
  if (/outcome-based|project-based|pay per|deliverable|fixed price|milestone-based|rfp|request for proposal/.test(t)) {
    signals.push({ type: "partnership", value: "Outcome/Project-Based Engagement", importance: "high", confidence: 60 });
  }
  return signals;
}

function cleanUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `https://${url}`;
}

function domainOf(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
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
