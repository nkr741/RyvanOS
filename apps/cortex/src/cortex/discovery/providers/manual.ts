import type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  DiscoveryResult,
  CompanyCandidateData,
} from "../types";

const manifest: DiscoveryProviderManifest = {
  name: "manual",
  displayName: "Manual Entry",
  type: "manual",
  description: "Add companies manually through the Discovery Hub",
  trustScore: 95,
  capabilities: {
    supportsPagination: false,
    supportsScheduling: false,
    supportsIncremental: false,
    supportsRetry: false,
  },
};

export const manualProvider: DiscoveryProvider = {
  manifest,

  async discover(config): Promise<DiscoveryResult> {
    const candidates = (config.candidates || []) as CompanyCandidateData[];
    return { candidates, errors: [] };
  },

  normalize(raw: Record<string, unknown>): CompanyCandidateData {
    return {
      companyName: (raw.companyName as string) || (raw.name as string) || "",
      website: raw.website as string | undefined,
      industry: raw.industry as string | undefined,
      size: raw.size as string | undefined,
      employees: raw.employees as number | undefined,
      location: raw.location as string | undefined,
      country: (raw.country as string) || "India",
      description: raw.description as string | undefined,
      rawData: raw,
      confidence: 95,
    };
  },

  validate(candidate: CompanyCandidateData) {
    if (!candidate.companyName || candidate.companyName.trim().length < 2) {
      return { valid: false, reason: "Company name is required (min 2 characters)" };
    }
    return { valid: true };
  },
};
