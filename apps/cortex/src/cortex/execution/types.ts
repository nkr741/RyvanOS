export interface PlaybookStage {
  id: string;
  name: string;
  executorType: string;
  approvalRequired: boolean;
  autoAdvance: boolean;
  config?: Record<string, unknown>;
}

export interface PlaybookDefinition {
  id: string;
  displayName: string;
  description: string;
  version: string;
  domain: string;
  stages: PlaybookStage[];
  triggers?: ExecutionCondition[];
}

export interface ExecutorInput {
  workItemId: string;
  missionId: string;
  prospectId?: string;
  intelligenceId?: string;
  stageId: string;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface ExecutorOutput {
  success: boolean;
  data: Record<string, unknown>;
  summary?: string;
  approvalRequired?: boolean;
}

export interface Executor {
  type: string;
  displayName: string;
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
}

export interface ExecutionCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "in";
  value: string | number | string[];
}

export interface OutcomeData {
  result: "won" | "lost" | "no_response" | "rejected" | "deferred";
  reason?: string;
  evidence?: string;
  revenue?: number;
  lessons?: string[];
  recommendations?: string[];
}
