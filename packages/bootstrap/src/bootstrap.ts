import { Container, EVENTS, KernelStateError, Logger } from "@ryvan/common";
import type { ILogger, Service } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import type { RyvanEvent } from "@ryvan/events";
import { IdentityService } from "@ryvan/identity";
import { ModelService } from "@ryvan/models";
import { InMemoryBackend, MemoryManager } from "@ryvan/memory";
import { ToolService } from "@ryvan/tool-registry";
import { RuntimeService } from "@ryvan/agent-runtime";
import { AgentService } from "@ryvan/agent-sdk";
import { PolicyService } from "@ryvan/policy-engine";
import { WorkflowService } from "@ryvan/workflow-engine";
import { MissionService, TemplateMissionPlanner } from "@ryvan/mission-engine";
import { AuditService } from "@ryvan/audit";
import { ConnectorService } from "@ryvan/connector-sdk";
import {
  connectorPolicyGate,
  missionPolicyGate,
  policyApprovalGate,
  workflowRunner,
} from "./adapters.js";
import type { Platform, PlatformConfig, PlatformStatus } from "./types.js";

/**
 * Start order follows the dependency direction: audit early so it captures the
 * services that follow, and mission last because it drives everything below it.
 * Shutdown is the reverse.
 *
 * `events` is deliberately absent — `EventBus` has no lifecycle and is live the
 * moment it is constructed. Listing it here made `bootstrap()` throw on its
 * first iteration.
 */
const SERVICE_START_ORDER = [
  "identity",
  "policy",
  "audit",
  "models",
  "memory",
  "tools",
  "connectors",
  "workflow",
  "agent-sdk",
  "agent-runtime",
  "mission",
] as const;

const SERVICE_STOP_ORDER = [...SERVICE_START_ORDER].reverse();

class RyvanPlatform implements Platform {
  readonly container: Container;
  private _status: PlatformStatus = "created";
  private readonly logger: ILogger;
  private shutdownRegistered = false;

  constructor(config: PlatformConfig) {
    this.logger = config.logger ?? new Logger("info", "ryvan-platform");
    this.container = new Container();
    this.container.setLogger(this.logger);

    this.wireServices(config);
  }

  private wireServices(config: PlatformConfig): void {
    const eventBus = new EventBus({
      logger: this.logger,
      ...config.events,
    });

    const identity = new IdentityService(
      {
        token: {
          secret: config.identity.tokenSecret,
          expiresIn: config.identity.tokenExpiresIn ?? "24h",
          issuer: config.identity.tokenIssuer ?? "ryvan-platform",
        },
      },
      eventBus,
    );

    const models = new ModelService({
      defaultModel: config.models.defaultModel,
      logger: this.logger,
      eventBus,
    });

    const memory = new MemoryManager({
      backend: new InMemoryBackend(),
      eventBus,
      logger: this.logger,
    });

    const tools = new ToolService({
      logger: this.logger,
      eventBus,
    });

    const runtime = new RuntimeService({
      config: config.runtime,
      eventBus,
      logger: this.logger,
    });

    const agentSdk = new AgentService();

    const policy = new PolicyService({
      defaultEffect: config.policy?.defaultEffect,
      rules: config.policy?.rules,
      budgets: config.policy?.budgets,
      approvalTtlMs: config.policy?.approvalTtlMs,
      logger: this.logger,
      eventBus,
    });

    const audit = new AuditService({
      store: config.audit?.store,
      captureEvents: config.audit?.captureEvents,
      logger: this.logger,
      eventBus,
    });

    const connectors = new ConnectorService({
      policy: connectorPolicyGate(policy),
      healthIntervalMs: config.connectors?.healthIntervalMs,
      logger: this.logger,
      eventBus,
    });

    const workflow = new WorkflowService({
      definitions: config.workflow?.definitions,
      store: config.workflow?.store,
      maxStepConcurrency: config.workflow?.maxStepConcurrency,
      resumeIntervalMs: config.workflow?.resumeIntervalMs,
      approvalGate: policyApprovalGate(policy),
      logger: this.logger,
      eventBus,
    });

    const mission = new MissionService({
      planner:
        config.mission?.planner ?? new TemplateMissionPlanner(config.mission?.templates ?? []),
      store: config.mission?.store,
      workflows: workflowRunner(workflow),
      policy: missionPolicyGate(policy),
      policyAction: config.mission?.policyAction,
      approvalPollIntervalMs: config.mission?.approvalPollIntervalMs,
      logger: this.logger,
      eventBus,
    });

    if (config.policy?.trackModelSpend !== false) {
      this.trackModelSpend(eventBus, policy);
    }

    this.container.registerInstance("logger", this.logger);
    this.container.registerInstance("events", eventBus);
    this.container.registerInstance("identity", identity);
    this.container.registerInstance("models", models);
    this.container.registerInstance("memory", memory);
    this.container.registerInstance("tools", tools);
    this.container.registerInstance("agent-runtime", runtime);
    this.container.registerInstance("agent-sdk", agentSdk);
    this.container.registerInstance("policy", policy);
    this.container.registerInstance("audit", audit);
    this.container.registerInstance("connectors", connectors);
    this.container.registerInstance("workflow", workflow);
    this.container.registerInstance("mission", mission);
  }

  /**
   * Feeds model spend into the budget guard.
   *
   * Model events carry no tenant, so this records at global scope: a budget
   * with an empty `scope` sees it, a per-org budget does not. Attributing spend
   * per organisation needs tenant context on the model call itself.
   */
  private trackModelSpend(eventBus: EventBus, policy: PolicyService): void {
    eventBus.on(EVENTS.MODEL_RESPONSE, (event: RyvanEvent) => {
      const data = (event.data ?? {}) as { usage?: { estimatedCost?: number }; model?: string };
      const cost = data.usage?.estimatedCost;

      if (typeof cost === "number" && cost > 0) {
        policy.recordSpend({}, cost, `model:${data.model ?? "unknown"}`);
      }
    });
  }

  async start(): Promise<void> {
    if (this._status === "running") return;
    this._status = "starting";
    this.logger.info("Ryvan Platform starting");

    for (const name of SERVICE_START_ORDER) {
      const service = this.container.resolve<Service>(name);

      if (typeof service?.start !== "function") {
        throw new KernelStateError(
          this._status,
          `start "${name}" — it is registered but does not implement Service`,
        );
      }

      await service.start();
      this.logger.debug(`Service started: ${name}`);
    }

    this._status = "running";
    this.logger.info("Ryvan Platform running");
  }

  async stop(): Promise<void> {
    if (this._status === "stopped") return;
    this._status = "stopping";
    this.logger.info("Ryvan Platform stopping");

    for (const name of SERVICE_STOP_ORDER) {
      try {
        const service = this.container.resolve<Service>(name);
        await service.stop();
        this.logger.debug(`Service stopped: ${name}`);
      } catch (err) {
        this.logger.error(`Failed to stop ${name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this._status = "stopped";
    this.logger.info("Ryvan Platform stopped");
  }

  status(): PlatformStatus {
    return this._status;
  }

  enableGracefulShutdown(): void {
    if (this.shutdownRegistered) return;
    this.shutdownRegistered = true;

    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  }
}

export async function bootstrap(config: PlatformConfig): Promise<RyvanPlatform> {
  const platform = new RyvanPlatform(config);
  await platform.start();
  return platform;
}

export function createPlatform(config: PlatformConfig): RyvanPlatform {
  return new RyvanPlatform(config);
}
