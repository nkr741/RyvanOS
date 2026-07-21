const flags = {
  DISCOVERY_ENABLED: env("FEATURE_DISCOVERY", true),
  INTELLIGENCE_ENABLED: env("FEATURE_INTELLIGENCE", true),
  EXECUTION_ENABLED: env("FEATURE_EXECUTION", true),
  PROPOSALS_ENABLED: env("FEATURE_PROPOSALS", true),
  EMAIL_DRAFTS_ENABLED: env("FEATURE_EMAIL_DRAFTS", true),
  EMAIL_SENDING_ENABLED: env("FEATURE_EMAIL_SENDING", false),
  MEETING_AUTOMATION_ENABLED: env("FEATURE_MEETING_AUTOMATION", false),
  CONTINUOUS_MONITORING_ENABLED: env("FEATURE_CONTINUOUS_MONITORING", false),
  CRAWLER_ENABLED: env("FEATURE_CRAWLER", false),
} as const;

function env(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  return val === "true" || val === "1";
}

export function isEnabled(flag: keyof typeof flags): boolean {
  return flags[flag];
}

export function getAllFlags(): Record<string, boolean> {
  return { ...flags };
}
