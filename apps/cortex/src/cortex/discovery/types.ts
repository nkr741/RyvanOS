export interface CompanyCandidateData {
  companyName: string;
  website?: string;
  industry?: string;
  size?: string;
  employees?: number;
  location?: string;
  country?: string;
  description?: string;
  rawData?: Record<string, unknown>;
  confidence?: number;
  signals?: SignalData[];
}

export interface SignalData {
  type: SignalType;
  value: string;
  category?: string;
  confidence?: number;
  importance?: SignalImportance;
  evidence?: string;
  evidenceUrl?: string;
  metadata?: Record<string, unknown>;
}

export type SignalType =
  | "hiring"
  | "technology"
  | "cloud"
  | "growth"
  | "pain"
  | "partnership"
  | "funding"
  | "certification"
  | "expansion";

export type SignalImportance = "low" | "medium" | "high" | "critical";

export interface ProviderCapabilities {
  supportsPagination: boolean;
  supportsScheduling: boolean;
  supportsIncremental: boolean;
  supportsRetry: boolean;
}

export interface DiscoveryProviderManifest {
  name: string;
  displayName: string;
  type: "manual" | "csv" | "api" | "scraper" | "directory";
  description: string;
  trustScore: number;
  capabilities: ProviderCapabilities;
  defaultSchedule?: string;
}

export interface DiscoveryResult {
  candidates: CompanyCandidateData[];
  errors: string[];
  metadata?: Record<string, unknown>;
}

export interface DiscoveryProvider {
  manifest: DiscoveryProviderManifest;
  discover(config: Record<string, unknown>): Promise<DiscoveryResult>;
  normalize(raw: Record<string, unknown>): CompanyCandidateData;
  validate(candidate: CompanyCandidateData): { valid: boolean; reason?: string };
}
