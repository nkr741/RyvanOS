import { generateId, NotFoundError, ValidationError, withTimeout, EVENTS } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import type { ToolRegistry } from "./registry.js";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolMiddleware,
  ToolResult,
  ToolStats,
} from "./types.js";

interface ExecutorOptions {
  registry: ToolRegistry;
  logger?: ILogger;
  eventBus?: IEventBus;
}

export class ToolExecutor {
  private readonly registry: ToolRegistry;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly middlewares: ToolMiddleware[] = [];
  private readonly stats = new Map<string, ToolStats>();

  constructor(options: ExecutorOptions) {
    this.registry = options.registry;
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  use(middleware: ToolMiddleware): void {
    this.middlewares.push(middleware);
  }

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context?: Partial<ToolExecutionContext>,
  ): Promise<ToolResult> {
    const definition = this.registry.get(toolName);
    if (!definition) {
      throw new NotFoundError("Tool", toolName);
    }

    const handler = this.registry.getHandler(toolName);
    if (!handler) {
      throw new NotFoundError("ToolHandler", toolName);
    }

    this.validateInput(definition, input);

    const executionContext: ToolExecutionContext = {
      toolName,
      input,
      userId: context?.userId,
      agentId: context?.agentId,
      correlationId: context?.correlationId ?? generateId("corr"),
      timeout: context?.timeout ?? definition.timeout,
    };

    const startTime = Date.now();

    try {
      const result = await this.runWithMiddleware(executionContext, async () => {
        return withTimeout(handler(executionContext), executionContext.timeout, `tool:${toolName}`);
      });

      const executionTimeMs = Date.now() - startTime;
      const finalResult: ToolResult = { ...result, executionTimeMs };

      this.updateStats(toolName, finalResult);

      this.logger?.info("Tool executed", {
        tool: toolName,
        success: finalResult.success,
        executionTimeMs,
      });

      if (this.eventBus) {
        await this.eventBus.emit(
          EVENTS.TOOL_EXECUTED,
          {
            toolName,
            success: finalResult.success,
            executionTimeMs,
            correlationId: executionContext.correlationId,
            agentId: executionContext.agentId,
          },
          // Also as the event's correlationId, so tracing can place this call
          // in the trace of the work that made it.
          { source: "tools", correlationId: executionContext.correlationId },
        );
      }

      return finalResult;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const failResult: ToolResult = {
        success: false,
        output: null,
        error: errorMessage,
        executionTimeMs,
      };

      this.updateStats(toolName, failResult);

      this.logger?.error("Tool execution failed", {
        tool: toolName,
        error: errorMessage,
        executionTimeMs,
      });

      if (this.eventBus) {
        await this.eventBus.emit(
          EVENTS.TOOL_ERROR,
          {
            toolName,
            error: errorMessage,
            executionTimeMs,
            correlationId: executionContext.correlationId,
            agentId: executionContext.agentId,
          },
          { source: "tools", correlationId: executionContext.correlationId },
        );
      }

      return failResult;
    }
  }

  getStats(toolName: string): ToolStats;
  getStats(): Map<string, ToolStats>;
  getStats(toolName?: string): ToolStats | Map<string, ToolStats> {
    if (toolName !== undefined) {
      return (
        this.stats.get(toolName) ?? {
          totalExecutions: 0,
          successCount: 0,
          failureCount: 0,
          averageLatencyMs: 0,
        }
      );
    }
    return new Map(this.stats);
  }

  private validateInput(definition: ToolDefinition, input: Record<string, unknown>): void {
    for (const param of definition.parameters) {
      const value = input[param.name];

      if (param.required && value === undefined) {
        throw new ValidationError(param.name, `required parameter is missing`);
      }

      if (value === undefined) {
        if (param.default !== undefined) {
          input[param.name] = param.default;
        }
        continue;
      }

      if (!this.checkType(value, param.type)) {
        throw new ValidationError(
          param.name,
          `expected type "${param.type}" but got "${typeof value}"`,
        );
      }

      if (param.enum && !param.enum.includes(value)) {
        throw new ValidationError(
          param.name,
          `value must be one of: ${param.enum.map(String).join(", ")}`,
        );
      }
    }

    const declaredNames = new Set(definition.parameters.map((p) => p.name));
    const extraKeys = Object.keys(input).filter((k) => !declaredNames.has(k));
    if (extraKeys.length > 0) {
      throw new ValidationError("input", `unexpected parameters: ${extraKeys.join(", ")}`);
    }
  }

  private checkType(
    value: unknown,
    expected: "string" | "number" | "boolean" | "object" | "array",
  ): boolean {
    if (expected === "array") {
      return Array.isArray(value);
    }
    if (expected === "object") {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    return typeof value === expected;
  }

  private async runWithMiddleware(
    context: ToolExecutionContext,
    handler: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    if (this.middlewares.length === 0) {
      return handler();
    }

    let index = 0;
    const next = (): Promise<ToolResult> => {
      if (index < this.middlewares.length) {
        const mw = this.middlewares[index++]!;
        return mw(context, next);
      }
      return handler();
    };

    return next();
  }

  private updateStats(toolName: string, result: ToolResult): void {
    const existing = this.stats.get(toolName);

    if (!existing) {
      this.stats.set(toolName, {
        totalExecutions: 1,
        successCount: result.success ? 1 : 0,
        failureCount: result.success ? 0 : 1,
        averageLatencyMs: result.executionTimeMs,
        lastExecutedAt: Date.now(),
      });
      return;
    }

    existing.totalExecutions++;
    if (result.success) {
      existing.successCount++;
    } else {
      existing.failureCount++;
    }
    existing.averageLatencyMs =
      existing.averageLatencyMs +
      (result.executionTimeMs - existing.averageLatencyMs) / existing.totalExecutions;
    existing.lastExecutedAt = Date.now();
  }
}
