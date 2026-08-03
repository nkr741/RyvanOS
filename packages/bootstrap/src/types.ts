import type { ILogger } from "@ryvan/common";
import type { EventBusOptions } from "@ryvan/events";
import type { WorkerConfig } from "@ryvan/agent-runtime";
import type { BudgetLimit, PolicyEffect, PolicyRule } from "@ryvan/policy-engine";
import type { WorkflowDefinition, WorkflowStore } from "@ryvan/workflow-engine";
import type { MissionPlanner, MissionStore, MissionTemplate } from "@ryvan/mission-engine";
import type { AuditStore } from "@ryvan/audit";

export interface PlatformConfig {
  identity: {
    tokenSecret: string;
    tokenExpiresIn?: string;
    tokenIssuer?: string;
  };
  models: {
    defaultModel: string;
  };
  events?: Partial<EventBusOptions>;
  runtime?: Partial<WorkerConfig>;

  policy?: {
    /** Effect when no rule matches. Default "allow". */
    defaultEffect?: PolicyEffect;
    rules?: PolicyRule[];
    budgets?: BudgetLimit[];
    approvalTtlMs?: number;
    /**
     * Record model spend against budgets automatically. Default true.
     * Model events carry no tenant, so spend lands at global scope — only a
     * budget with an empty `scope` sees it. Per-org ceilings need tenant
     * context on model calls (see PLATFORM-ROADMAP.md).
     */
    trackModelSpend?: boolean;
  };

  workflow?: {
    definitions?: WorkflowDefinition[];
    store?: WorkflowStore;
    maxStepConcurrency?: number;
    resumeIntervalMs?: number;
  };

  mission?: {
    /** Mission-type to workflow mappings for the default template planner. */
    templates?: MissionTemplate[];
    /** Replaces the template planner entirely. */
    planner?: MissionPlanner;
    store?: MissionStore;
    policyAction?: string;
    approvalPollIntervalMs?: number;
  };

  audit?: {
    store?: AuditStore;
    /** Event types recorded. Defaults to the platform's security-relevant set. */
    captureEvents?: string[];
  };

  connectors?: {
    healthIntervalMs?: number;
  };

  logger?: ILogger;
}

export interface Platform {
  readonly container: PlatformContainer;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): PlatformStatus;
}

export interface PlatformContainer {
  resolve<T>(name: string): T;
  has(name: string): boolean;
}

export type PlatformStatus = "created" | "starting" | "running" | "stopping" | "stopped";
