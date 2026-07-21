import type { ILogger, Service, Status } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import { ToolRegistry } from "./registry.js";
import { ToolExecutor } from "./executor.js";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolHandler,
  ToolResult,
  ToolStats,
} from "./types.js";

interface ToolServiceOptions {
  logger?: ILogger;
  eventBus?: IEventBus;
}

export class ToolService implements Service {
  readonly name = "tool-registry";
  readonly registry: ToolRegistry;
  readonly executor: ToolExecutor;
  private _status: Status = "stopped";

  constructor(options: ToolServiceOptions = {}) {
    this.registry = new ToolRegistry();
    this.executor = new ToolExecutor({
      registry: this.registry,
      logger: options.logger,
      eventBus: options.eventBus,
    });
  }

  async start(): Promise<void> {
    this._status = "starting";
    this._status = "running";
  }

  async stop(): Promise<void> {
    this._status = "stopping";
    this._status = "stopped";
  }

  status(): Status {
    return this._status;
  }

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.registry.register(definition, handler);
  }

  execute(
    name: string,
    input: Record<string, unknown>,
    context?: Partial<ToolExecutionContext>,
  ): Promise<ToolResult> {
    if (this._status !== "running") {
      throw new Error("ToolService is not running");
    }
    return this.executor.execute(name, input, context);
  }

  list(filter?: { category?: string; search?: string }): ToolDefinition[] {
    return this.registry.list(filter);
  }

  toModelFormat(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return this.registry.toModelFormat();
  }

  getStats(name: string): ToolStats;
  getStats(): Map<string, ToolStats>;
  getStats(name?: string): ToolStats | Map<string, ToolStats> {
    if (name !== undefined) {
      return this.executor.getStats(name);
    }
    return this.executor.getStats();
  }
}
