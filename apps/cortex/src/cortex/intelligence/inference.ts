import { prisma } from "@/lib/prisma";

export interface InferenceCondition {
  signalType: string;
  valuePattern?: string;
  required: boolean;
}

export interface InferenceMatch {
  ruleId: string;
  ruleName: string;
  insight: string;
  recommendedService: string | null;
  confidence: number;
  matchedSignals: string[];
  evidence: string[];
}

const DEFAULT_RULES: Array<{
  name: string;
  description: string;
  conditions: InferenceCondition[];
  insight: string;
  recommendedService: string | null;
  confidenceBase: number;
}> = [
  {
    name: "qa_automation_opportunity",
    description: "Company hiring QA/testing roles with existing automation stack",
    conditions: [
      { signalType: "hiring", valuePattern: "qa|testing|quality", required: true },
      { signalType: "technology", valuePattern: "selenium|cypress|playwright|jest", required: false },
    ],
    insight: "Company is expanding test automation capacity — strong fit for AI Test Engineering and QA Automation services",
    recommendedService: "QA Automation",
    confidenceBase: 88,
  },
  {
    name: "cloud_migration_opportunity",
    description: "Company on legacy infrastructure or expanding cloud",
    conditions: [
      { signalType: "cloud", valuePattern: "on-premise|hybrid", required: false },
      { signalType: "pain", valuePattern: "legacy|migration|modernization", required: false },
      { signalType: "technology", valuePattern: "monolith|legacy", required: false },
    ],
    insight: "Company has legacy infrastructure signals — opportunity for Cloud Migration and Modernization",
    recommendedService: "Cloud & DevOps",
    confidenceBase: 82,
  },
  {
    name: "ai_engineering_opportunity",
    description: "Company showing AI adoption or automation interest",
    conditions: [
      { signalType: "technology", valuePattern: "python|tensorflow|pytorch|ml|ai", required: false },
      { signalType: "hiring", valuePattern: "ai|ml|data scientist|machine learning", required: false },
      { signalType: "growth", valuePattern: "ai initiative|ai adoption", required: false },
    ],
    insight: "Company is investing in AI/ML — opportunity for Enterprise AI and AI Engineering services",
    recommendedService: "Enterprise AI",
    confidenceBase: 85,
  },
  {
    name: "devops_opportunity",
    description: "Company using cloud with scaling or CI/CD signals",
    conditions: [
      { signalType: "cloud", valuePattern: "aws|azure|gcp", required: true },
      { signalType: "technology", valuePattern: "kubernetes|docker|terraform|jenkins|ci/cd", required: false },
      { signalType: "pain", valuePattern: "scaling|scalability|deployment|infrastructure", required: false },
    ],
    insight: "Company has cloud infrastructure with DevOps tooling — opportunity for Cloud & DevOps optimization",
    recommendedService: "Cloud & DevOps",
    confidenceBase: 80,
  },
  {
    name: "data_engineering_opportunity",
    description: "Company with data-heavy stack or analytics needs",
    conditions: [
      { signalType: "technology", valuePattern: "kafka|elasticsearch|spark|airflow|redshift|bigquery|snowflake", required: false },
      { signalType: "pain", valuePattern: "data|analytics|reporting", required: false },
    ],
    insight: "Company has data infrastructure signals — opportunity for Data Engineering services",
    recommendedService: "Data Engineering",
    confidenceBase: 78,
  },
  {
    name: "high_growth_enterprise",
    description: "Fast-growing company with expansion signals",
    conditions: [
      { signalType: "growth", valuePattern: "series|funding|expansion|acquisition", required: true },
      { signalType: "hiring", valuePattern: ".", required: true },
    ],
    insight: "Company is in rapid growth phase — likely receptive to scaling engineering capacity through outsourcing",
    recommendedService: null,
    confidenceBase: 75,
  },
  {
    name: "compliance_security_opportunity",
    description: "Company with compliance or security concerns",
    conditions: [
      { signalType: "pain", valuePattern: "compliance|security|audit|gdpr|hipaa|sox", required: true },
      { signalType: "certification", valuePattern: ".", required: false },
    ],
    insight: "Company has compliance/security requirements — opportunity for security automation and compliance engineering",
    recommendedService: "Enterprise AI",
    confidenceBase: 83,
  },
];

export async function seedInferenceRules(): Promise<number> {
  let created = 0;
  for (const rule of DEFAULT_RULES) {
    const exists = await prisma.inferenceRule.findUnique({
      where: { name: rule.name },
    });
    if (!exists) {
      await prisma.inferenceRule.create({
        data: {
          name: rule.name,
          description: rule.description,
          conditions: JSON.stringify(rule.conditions),
          insight: rule.insight,
          recommendedService: rule.recommendedService,
          confidenceBase: rule.confidenceBase,
        },
      });
      created++;
    }
  }
  return created;
}

export async function runInference(
  signals: Array<{ id: string; type: string; value: string; confidence: number; evidence?: string | null }>
): Promise<InferenceMatch[]> {
  const rules = await prisma.inferenceRule.findMany({
    where: { active: true },
  });

  const matches: InferenceMatch[] = [];

  for (const rule of rules) {
    const conditions = JSON.parse(rule.conditions) as InferenceCondition[];
    let totalRequired = 0;
    let matchedRequired = 0;
    let matchedOptional = 0;
    const matchedSignalIds: string[] = [];
    const evidenceList: string[] = [];

    for (const cond of conditions) {
      const pattern = cond.valuePattern ? new RegExp(cond.valuePattern, "i") : null;
      const matching = signals.filter(
        (s) => s.type === cond.signalType && (!pattern || pattern.test(s.value))
      );

      if (cond.required) {
        totalRequired++;
        if (matching.length > 0) {
          matchedRequired++;
          matchedSignalIds.push(...matching.map((s) => s.id));
          evidenceList.push(
            ...matching.filter((s) => s.evidence).map((s) => s.evidence!)
          );
        }
      } else if (matching.length > 0) {
        matchedOptional++;
        matchedSignalIds.push(...matching.map((s) => s.id));
        evidenceList.push(
          ...matching.filter((s) => s.evidence).map((s) => s.evidence!)
        );
      }
    }

    if (totalRequired > 0 && matchedRequired < totalRequired) continue;
    if (matchedSignalIds.length === 0) continue;

    const avgSignalConfidence =
      matchedSignalIds.reduce((sum, id) => {
        const s = signals.find((sig) => sig.id === id);
        return sum + (s?.confidence || 70);
      }, 0) / matchedSignalIds.length;

    const optionalBonus = matchedOptional * 3;
    const confidence = Math.min(
      100,
      Math.round((rule.confidenceBase + avgSignalConfidence) / 2 + optionalBonus)
    );

    matches.push({
      ruleId: rule.id,
      ruleName: rule.name,
      insight: rule.insight,
      recommendedService: rule.recommendedService,
      confidence,
      matchedSignals: [...new Set(matchedSignalIds)],
      evidence: [...new Set(evidenceList)],
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}
