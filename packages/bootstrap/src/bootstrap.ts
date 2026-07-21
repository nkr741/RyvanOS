import { Container, Logger } from "@ryvan/common";
import type { ILogger, Service } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { IdentityService } from "@ryvan/identity";
import { ModelService } from "@ryvan/models";
import { InMemoryBackend, MemoryManager } from "@ryvan/memory";
import { ToolService } from "@ryvan/tool-registry";
import { RuntimeService } from "@ryvan/agent-runtime";
import { AgentService } from "@ryvan/agent-sdk";
import type { Platform, PlatformConfig, PlatformStatus } from "./types.js";

const SERVICE_START_ORDER = [
  "events",
  "identity",
  "models",
  "memory",
  "tools",
  "agent-sdk",
  "agent-runtime",
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

    this.container.registerInstance("logger", this.logger);
    this.container.registerInstance("events", eventBus);
    this.container.registerInstance("identity", identity);
    this.container.registerInstance("models", models);
    this.container.registerInstance("memory", memory);
    this.container.registerInstance("tools", tools);
    this.container.registerInstance("agent-runtime", runtime);
    this.container.registerInstance("agent-sdk", agentSdk);
  }

  async start(): Promise<void> {
    if (this._status === "running") return;
    this._status = "starting";
    this.logger.info("Ryvan Platform starting");

    for (const name of SERVICE_START_ORDER) {
      const service = this.container.resolve<Service>(name);
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
