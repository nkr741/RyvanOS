import { prisma } from "@/lib/prisma";
import type { ExecutionCondition } from "./types";

interface ProspectContext {
  qualificationGrade?: string | null;
  qualificationScore?: number | null;
  industry?: string | null;
  size?: string | null;
  cloudProvider?: string | null;
  recommendedServices?: string[];
  techStack?: string[];
}

const DEFAULT_EXECUTION_RULES = [
  {
    name: "enterprise_grade_a",
    description: "Grade A enterprise prospects get the full enterprise acquisition playbook",
    conditions: [
      { field: "qualificationGrade", operator: "eq" as const, value: "A" },
      { field: "size", operator: "in" as const, value: ["enterprise", "large"] },
    ],
    playbookName: "acquire-enterprise-client",
    priority: 90,
  },
  {
    name: "midmarket_grade_a",
    description: "Grade A mid-market prospects get the standard acquisition playbook",
    conditions: [
      { field: "qualificationGrade", operator: "eq" as const, value: "A" },
      { field: "size", operator: "in" as const, value: ["mid-market", "medium", "small"] },
    ],
    playbookName: "acquire-midmarket-client",
    priority: 80,
  },
  {
    name: "grade_b_outreach",
    description: "Grade B prospects get a nurture playbook to build the relationship",
    conditions: [
      { field: "qualificationGrade", operator: "eq" as const, value: "B" },
    ],
    playbookName: "nurture-prospect",
    priority: 60,
  },
  {
    name: "qa_automation_focus",
    description: "Prospects with QA Automation as top recommended service get the QA-specific playbook",
    conditions: [
      { field: "recommendedServices", operator: "contains" as const, value: "QA Automation" },
      { field: "qualificationGrade", operator: "in" as const, value: ["A", "B"] },
    ],
    playbookName: "qa-automation-pitch",
    priority: 85,
  },
];

export async function seedExecutionRules(): Promise<number> {
  let created = 0;
  for (const rule of DEFAULT_EXECUTION_RULES) {
    const exists = await prisma.executionRule.findUnique({ where: { name: rule.name } });
    if (!exists) {
      await prisma.executionRule.create({
        data: {
          name: rule.name,
          description: rule.description,
          conditions: JSON.stringify(rule.conditions),
          playbookName: rule.playbookName,
          priority: rule.priority,
        },
      });
      created++;
    }
  }
  return created;
}

export async function matchPlaybook(prospect: ProspectContext): Promise<string | null> {
  const rules = await prisma.executionRule.findMany({
    where: { active: true },
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    const conditions = JSON.parse(rule.conditions) as ExecutionCondition[];
    if (evaluateConditions(conditions, prospect)) {
      const playbook = await prisma.playbook.findUnique({ where: { name: rule.playbookName } });
      if (playbook?.active) return rule.playbookName;
    }
  }

  return null;
}

function evaluateConditions(conditions: ExecutionCondition[], context: ProspectContext): boolean {
  for (const cond of conditions) {
    const fieldValue = getField(context, cond.field);
    if (!evaluateCondition(fieldValue, cond.operator, cond.value)) return false;
  }
  return true;
}

function getField(context: ProspectContext, field: string): unknown {
  return (context as Record<string, unknown>)[field];
}

function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  condValue: string | number | string[]
): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;

  switch (operator) {
    case "eq":
      return fieldValue === condValue;
    case "neq":
      return fieldValue !== condValue;
    case "gt":
      return typeof fieldValue === "number" && fieldValue > (condValue as number);
    case "lt":
      return typeof fieldValue === "number" && fieldValue < (condValue as number);
    case "gte":
      return typeof fieldValue === "number" && fieldValue >= (condValue as number);
    case "lte":
      return typeof fieldValue === "number" && fieldValue <= (condValue as number);
    case "contains":
      if (Array.isArray(fieldValue)) return fieldValue.includes(condValue as string);
      if (typeof fieldValue === "string") return fieldValue.includes(condValue as string);
      return false;
    case "in":
      if (Array.isArray(condValue)) return condValue.includes(fieldValue as string);
      return false;
    default:
      return false;
  }
}
