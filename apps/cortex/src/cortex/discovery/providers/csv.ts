import type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  DiscoveryResult,
  CompanyCandidateData,
  SignalData,
} from "../types";

const manifest: DiscoveryProviderManifest = {
  name: "csv_import",
  displayName: "CSV Import",
  type: "csv",
  description: "Import companies from CSV files or structured data",
  trustScore: 85,
  capabilities: {
    supportsPagination: false,
    supportsScheduling: false,
    supportsIncremental: false,
    supportsRetry: true,
  },
};

const FIELD_ALIASES: Record<string, string[]> = {
  companyName: ["company_name", "company", "name", "organization", "org", "business_name"],
  website: ["website", "url", "domain", "web", "site"],
  industry: ["industry", "sector", "vertical", "category"],
  size: ["size", "company_size", "org_size"],
  employees: ["employees", "employee_count", "headcount", "team_size", "staff"],
  location: ["location", "city", "address", "hq", "headquarters"],
  country: ["country", "region"],
  description: ["description", "about", "summary", "notes", "bio"],
  techStack: ["tech_stack", "technologies", "tech", "stack", "tools"],
  cloudProvider: ["cloud_provider", "cloud", "hosting", "infrastructure"],
};

function resolveField(row: Record<string, unknown>, fieldName: string): unknown {
  const aliases = FIELD_ALIASES[fieldName] || [fieldName];
  for (const alias of aliases) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === alias.replace(/[^a-z0-9]/g, "")
    );
    if (key && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
}

export const csvProvider: DiscoveryProvider = {
  manifest,

  async discover(config): Promise<DiscoveryResult> {
    const rows = (config.rows || []) as Record<string, unknown>[];
    const candidates: CompanyCandidateData[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const normalized = this.normalize(rows[i]);
        const validation = this.validate(normalized);
        if (validation.valid) {
          candidates.push(normalized);
        } else {
          errors.push(`Row ${i + 1}: ${validation.reason}`);
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Parse error"}`);
      }
    }

    return { candidates, errors, metadata: { totalRows: rows.length } };
  },

  normalize(raw: Record<string, unknown>): CompanyCandidateData {
    const signals: SignalData[] = [];

    const techStack = resolveField(raw, "techStack") as string | undefined;
    if (techStack) {
      const techs = techStack.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
      for (const tech of techs) {
        signals.push({ type: "technology", value: tech, confidence: 85 });
      }
    }

    const cloud = resolveField(raw, "cloudProvider") as string | undefined;
    if (cloud) {
      signals.push({ type: "cloud", value: cloud, confidence: 85 });
    }

    return {
      companyName: String(resolveField(raw, "companyName") || ""),
      website: resolveField(raw, "website") as string | undefined,
      industry: resolveField(raw, "industry") as string | undefined,
      size: resolveField(raw, "size") as string | undefined,
      employees: resolveField(raw, "employees")
        ? parseInt(String(resolveField(raw, "employees")), 10) || undefined
        : undefined,
      location: resolveField(raw, "location") as string | undefined,
      country: (resolveField(raw, "country") as string) || "India",
      description: resolveField(raw, "description") as string | undefined,
      rawData: raw,
      confidence: 85,
      signals,
    };
  },

  validate(candidate: CompanyCandidateData) {
    if (!candidate.companyName || candidate.companyName.trim().length < 2) {
      return { valid: false, reason: "Company name is required" };
    }
    return { valid: true };
  },
};
