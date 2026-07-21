import type { ILogger, Service, Status } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import { CostTracker } from "./cost-tracker.js";
import { ModelRegistry } from "./registry.js";
import { ModelRouter } from "./router.js";
import type { ModelRequest, ModelResponse } from "./types.js";

export interface ModelServiceOptions {
  defaultModel: string;
  logger?: ILogger;
  eventBus?: IEventBus;
}

export class ModelService implements Service {
  readonly name = "models";

  readonly registry: ModelRegistry;
  readonly router: ModelRouter;
  readonly costTracker: CostTracker;

  private _status: Status = "stopped";
  private readonly logger?: ILogger;

  constructor(options: ModelServiceOptions) {
    this.logger = options.logger;
    this.registry = new ModelRegistry();
    this.costTracker = new CostTracker();
    this.router = new ModelRouter({
      registry: this.registry,
      defaultModel: options.defaultModel,
      logger: options.logger,
      eventBus: options.eventBus,
    });
  }

  async start(): Promise<void> {
    this._status = "starting";
    this.logger?.info("Model service starting");
    this._status = "running";
    this.logger?.info("Model service started");
  }

  async stop(): Promise<void> {
    this._status = "stopping";
    this.logger?.info("Model service stopping");
    this._status = "stopped";
    this.logger?.info("Model service stopped");
  }

  status(): Status {
    return this._status;
  }

  async chat(
    request: ModelRequest,
    context?: { tenantId?: string; userId?: string },
  ): Promise<ModelResponse> {
    if (this._status !== "running") {
      throw new Error("ModelService is not running");
    }

    const response = await this.router.chat(request);

    this.costTracker.record({
      model: response.model,
      provider: response.provider,
      tenantId: context?.tenantId,
      userId: context?.userId,
      ...response.usage,
    });

    return response;
  }
}
