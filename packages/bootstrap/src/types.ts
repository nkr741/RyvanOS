import type { ILogger } from "@ryvan/common";
import type { EventBusOptions } from "@ryvan/events";
import type { WorkerConfig } from "@ryvan/agent-runtime";
import type { BudgetLimit, PolicyEffect, PolicyRule } from "@ryvan/policy-engine";
import type { WorkflowDefinition, WorkflowStore } from "@ryvan/workflow-engine";
import type { MissionPlanner, MissionStore, MissionTemplate } from "@ryvan/mission-engine";
import type { AuditStore } from "@ryvan/audit";
import type { ResiliencePolicy } from "@ryvan/resilience";

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

  observability?: {
    /** Cap on spans retained per trace, so a runaway loop cannot exhaust memory. Default 2000. */
    maxSpansPerTrace?: number;
  };

  /**
   * Retries, circuit breakers, fallbacks and dead letters, matched by glob
   * against a call key such as "connector:sap:createInvoice".
   */
  resilience?: {
    policies?: ResiliencePolicy[];
    /** Applied to any target no policy matches. */
    defaultPolicy?: Omit<ResiliencePolicy, "target">;
  };

  /**
   * The Developer Console. Omit it and no console starts.
   *
   * Opt-in because it exposes every mission's inputs, the audit trail, and the
   * approval buttons — that should be something someone turned on deliberately.
   */
  console?: {
    /** Bearer token required on every request. At least 16 characters. */
    token: string;
    /** Default 4500. */
    port?: number;
    /** Default "127.0.0.1". Binding publicly should be a typed decision. */
    host?: string;
    /** Mount prefix when sitting behind a proxy, e.g. "/console". */
    basePath?: string;
  };

  /**
   * Durable storage. Omit it entirely and the platform runs fully in memory,
   * which is right for tests and wrong for production — nothing survives a
   * restart. Supplying `postgresUrl` swaps every domain store for its durable
   * equivalent without any other change.
   */
  storage?: {
    /** postgres://user:pass@host:5432/db — enables durable workflow, mission, audit, and memory state. */
    postgresUrl?: string;
    /** redis://host:6379 — enables the shared key/value store for caches, locks, and counters. */
    redisUrl?: string;
    /** Table prefix, so environments can share a database. Default "ryvan". */
    tablePrefix?: string;
    /** Embedding width for the vector column. Must match your model. Default 1536. */
    vectorDimensions?: number;
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
