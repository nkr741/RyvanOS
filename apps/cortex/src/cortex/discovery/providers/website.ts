import type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  DiscoveryResult,
  CompanyCandidateData,
  SignalData,
} from "../types";

const manifest: DiscoveryProviderManifest = {
  name: "website_intel",
  displayName: "Website Intelligence",
  type: "api",
  description:
    "Extract company intelligence from a website URL — tech stack, cloud, hiring signals, growth indicators",
  trustScore: 75,
  capabilities: {
    supportsPagination: false,
    supportsScheduling: true,
    supportsIncremental: true,
    supportsRetry: true,
  },
};

export const websiteProvider: DiscoveryProvider = {
  manifest,

  async discover(config): Promise<DiscoveryResult> {
    const urls = (config.urls || []) as string[];
    const candidates: CompanyCandidateData[] = [];
    const errors: string[] = [];

    for (const url of urls) {
      try {
        const normalized = this.normalize({ url });
        const validation = this.validate(normalized);
        if (validation.valid) {
          candidates.push(normalized);
        } else {
          errors.push(`${url}: ${validation.reason}`);
        }
      } catch (err) {
        errors.push(
          `${url}: ${err instanceof Error ? err.message : "Failed"}`
        );
      }
    }

    return { candidates, errors };
  },

  normalize(raw: Record<string, unknown>): CompanyCandidateData {
    const url = (raw.url as string) || "";
    const domain = url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    const companyName =
      (raw.companyName as string) ||
      domain
        .split(".")[0]
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const signals: SignalData[] = [];
    const description = (raw.description as string) || "";
    const fullText = `${description} ${JSON.stringify(raw)}`.toLowerCase();

    const techMap: Record<string, string> = {
      react: "React", angular: "Angular", vue: "Vue.js",
      nextjs: "Next.js", "next.js": "Next.js", python: "Python",
      django: "Django", flask: "Flask", java: "Java",
      "spring boot": "Spring Boot", ".net": ".NET",
      nodejs: "Node.js", "node.js": "Node.js",
      kubernetes: "Kubernetes", docker: "Docker",
      terraform: "Terraform", ansible: "Ansible",
      selenium: "Selenium", cypress: "Cypress",
      jenkins: "Jenkins", "github actions": "GitHub Actions",
    };
    for (const [kw, label] of Object.entries(techMap)) {
      if (fullText.includes(kw))
        signals.push({ type: "technology", value: label, confidence: 70 });
    }

    const cloudMap: Record<string, string> = {
      aws: "AWS", "amazon web services": "AWS",
      azure: "Azure", "microsoft azure": "Azure",
      "google cloud": "GCP", gcp: "GCP",
    };
    for (const [kw, label] of Object.entries(cloudMap)) {
      if (fullText.includes(kw))
        signals.push({ type: "cloud", value: label, confidence: 75 });
    }

    if (/hiring|careers|join us|open positions/.test(fullText)) {
      signals.push({
        type: "hiring",
        value: "Active Hiring",
        importance: "high",
        confidence: 70,
      });
    }

    if (/series [a-d]|funding|raised|investment/.test(fullText)) {
      signals.push({
        type: "funding",
        value: "Recent Funding",
        importance: "high",
        confidence: 65,
      });
    }

    return {
      companyName,
      website: url.startsWith("http") ? url : `https://${url}`,
      industry: raw.industry as string | undefined,
      size: raw.size as string | undefined,
      employees: raw.employees as number | undefined,
      location: raw.location as string | undefined,
      country: (raw.country as string) || "India",
      description,
      rawData: raw,
      confidence: 70,
      signals,
    };
  },

  validate(candidate: CompanyCandidateData) {
    if (!candidate.companyName || candidate.companyName.trim().length < 2) {
      return { valid: false, reason: "Could not determine company name" };
    }
    if (!candidate.website) {
      return { valid: false, reason: "Website URL is required" };
    }
    return { valid: true };
  },
};
