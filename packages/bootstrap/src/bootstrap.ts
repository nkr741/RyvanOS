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
  InMemoryDocumentStore,
  InMemoryKeyValueStore,
  InMemoryVectorStore,
  PostgresDriver,
  PostgresVectorStore,
  RedisKeyValueStore,
} from "@ryvan/storage";
import type { DocumentStore, KeyValueStore, StorageDriver, VectorStore } from "@ryvan/storage";
import { ObservabilityService } from "@ryvan/observability";
import { ResilienceService } from "@ryvan/resilience";
import { ConsoleService } from "@ryvan/console";
import {
  DocumentApprovalStore,
  DocumentAuditStore,
  DocumentIdentityStore,
  DocumentMemoryBackend,
  DocumentMissionStore,
  DocumentDeadLetterStore,
  DocumentTraceStore,
  DocumentWorkflowStore,
} from "@ryvan/persistence";
import {
  connectorPolicyGate,
  connectorResilienceGate,
  missionPolicyGate,
  policyApprovalGate,
  workflowRunner,
} from "./adapters.js";
import { consoleSources } from "./console-sources.js";
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
  "resilience",
  "observability",
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

class RyvanPlatform implements Platform {
  readonly container: Container;
  private _status: PlatformStatus = "created";
  private readonly logger: ILogger;
  private readonly drivers: StorageDriver[] = [];
  /** Set when a console token was supplied, so start() knows to include it. */
  private consoleEnabled = false;
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

    const storage = this.wireStorage(config);

    const identity = new IdentityService(
      {
        token: {
          secret: config.identity.tokenSecret,
          expiresIn: config.identity.tokenExpiresIn ?? "24h",
          issuer: config.identity.tokenIssuer ?? "ryvan-platform",
        },
        store: storage.durable ? new DocumentIdentityStore(storage.documents) : undefined,
      },
      eventBus,
    );

    const models = new ModelService({
      defaultModel: config.models.defaultModel,
      logger: this.logger,
      eventBus,
    });

    const memory = new MemoryManager({
      // Durable when storage is configured; the package's own in-memory
      // backend otherwise, so nothing is required to get started.
      backend: storage.durable
        ? new DocumentMemoryBackend(storage.documents, storage.vectors)
        : new InMemoryBackend(),
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
      approvalStore: storage.durable
        ? new DocumentApprovalStore(storage.documents, config.policy?.approvalTtlMs)
        : undefined,
      logger: this.logger,
      eventBus,
    });

    const audit = new AuditService({
      store:
        config.audit?.store ??
        (storage.durable ? new DocumentAuditStore(storage.documents) : undefined),
      captureEvents: config.audit?.captureEvents,
      logger: this.logger,
      eventBus,
    });

    // Starts before the services it observes, so no span is missed. It only
    // subscribes to the bus, so it cannot break what it is watching.
    const observability = new ObservabilityService({
      store: storage.durable ? new DocumentTraceStore(storage.documents) : undefined,
      maxSpansPerTrace: config.observability?.maxSpansPerTrace,
      logger: this.logger,
      eventBus,
    });

    const resilience = new ResilienceService({
      policies: config.resilience?.policies,
      defaultPolicy: config.resilience?.defaultPolicy,
      deadLetters: storage.durable ? new DocumentDeadLetterStore(storage.documents) : undefined,
      logger: this.logger,
      eventBus,
    });

    const connectors = new ConnectorService({
      policy: connectorPolicyGate(policy),
      resilience: connectorResilienceGate(resilience),
      healthIntervalMs: config.connectors?.healthIntervalMs,
      logger: this.logger,
      eventBus,
    });

    const workflow = new WorkflowService({
      definitions: config.workflow?.definitions,
      store:
        config.workflow?.store ??
        (storage.durable ? new DocumentWorkflowStore(storage.documents) : undefined),
      maxStepConcurrency: config.workflow?.maxStepConcurrency,
      resumeIntervalMs: config.workflow?.resumeIntervalMs,
      approvalGate: policyApprovalGate(policy),
      logger: this.logger,
      eventBus,
    });

    const mission = new MissionService({
      planner:
        config.mission?.planner ?? new TemplateMissionPlanner(config.mission?.templates ?? []),
      store:
        config.mission?.store ??
        (storage.durable ? new DocumentMissionStore(storage.documents) : undefined),
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

    // Opt-in: the console shows every mission's inputs and the approval
    // buttons, so it starts only when a token has been supplied for it.
    if (config.console?.token) {
      const consoleService = new ConsoleService({
        token: config.console.token,
        port: config.console.port,
        host: config.console.host,
        basePath: config.console.basePath,
        logger: this.logger,
        sources: consoleSources({
          missions: mission,
          workflows: workflow,
          observability,
          policy,
          audit,
          resilience,
          connectors,
          services: [
            identity,
            policy,
            resilience,
            observability,
            audit,
            models,
            memory,
            tools,
            connectors,
            workflow,
            runtime,
            agentSdk,
            mission,
          ],
          drivers: this.drivers,
        }),
      });

      this.container.registerInstance("console", consoleService);
      this.consoleEnabled = true;
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
    this.container.registerInstance("resilience", resilience);
    this.container.registerInstance("observability", observability);
    this.container.registerInstance("documents", storage.documents);
    this.container.registerInstance("cache", storage.cache);
    if (storage.vectors) {
      this.container.registerInstance("vectors", storage.vectors);
    }
  }

  /**
   * Chooses storage drivers.
   *
   * With no `storage` config the platform runs entirely in memory — correct for
   * tests, and a data-loss bug in production. Supplying `postgresUrl` is the
   * single switch that makes workflow runs, missions, the audit ledger, and
   * memory survive a restart; no other configuration changes.
   */
  private wireStorage(config: PlatformConfig): {
    durable: boolean;
    documents: DocumentStore;
    cache: KeyValueStore;
    vectors?: VectorStore;
  } {
    const postgresUrl = config.storage?.postgresUrl;
    const redisUrl = config.storage?.redisUrl;

    const cache = redisUrl
      ? new RedisKeyValueStore({
          url: redisUrl,
          keyPrefix: config.storage?.tablePrefix ?? "ryvan",
          logger: this.logger,
        })
      : new InMemoryKeyValueStore();

    if (!postgresUrl) {
      if (redisUrl) this.drivers.push(cache as unknown as StorageDriver);

      this.logger.warn(
        "No storage.postgresUrl configured — running in memory. State will not survive a restart.",
      );

      return {
        durable: false,
        documents: new InMemoryDocumentStore(),
        cache,
        vectors: new InMemoryVectorStore(),
      };
    }

    const postgres = new PostgresDriver({
      connectionString: postgresUrl,
      tablePrefix: config.storage?.tablePrefix,
      vectorDimensions: config.storage?.vectorDimensions,
      logger: this.logger,
    });

    this.drivers.push(postgres);
    if (redisUrl) this.drivers.push(cache as unknown as StorageDriver);

    return {
      durable: true,
      documents: postgres,
      cache,
      vectors: new PostgresVectorStore(postgres),
    };
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

    // Storage comes up before any service, since services read from it as they start.
    for (const driver of this.drivers) {
      await driver.connect();
      this.logger.debug(`Storage driver connected: ${driver.kind}`);
    }

    for (const name of this.startOrder()) {
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

    for (const name of [...this.startOrder()].reverse()) {
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

    // Storage goes down last, so a service can still flush state as it stops.
    for (const driver of this.drivers) {
      try {
        await driver.disconnect();
      } catch (err) {
        this.logger.error(`Failed to disconnect ${driver.kind}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this._status = "stopped";
    this.logger.info("Ryvan Platform stopped");
  }

  /** Start order, with the console appended when one was configured. */
  private startOrder(): string[] {
    // Last, so it can never be the reason the platform fails to come up: an
    // inspector that takes the thing it inspects down with it is worse than
    // no inspector.
    return this.consoleEnabled ? [...SERVICE_START_ORDER, "console"] : [...SERVICE_START_ORDER];
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
