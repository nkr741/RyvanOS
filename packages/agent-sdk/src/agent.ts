import type { ILogger } from "@ryvan/common";
import { AuthorizationError } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";

import type {
  AgentConfig,
  AgentStatus,
  AgentCapabilities,
  AgentExecutionContext,
  ConversationEntry,
  PolicyResult,
  ReflectionResult,
} from "./types.js";

export abstract class RyvanAgent {
  protected readonly config: AgentConfig;
  protected status: AgentStatus = "idle";
  protected logger?: ILogger;
  protected conversationHistory: ConversationEntry[] = [];
  protected workingMemory: Map<string, { value: unknown; createdAt: number }> = new Map();

  private eventBus?: IEventBus;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.status = "initializing";
    try {
      await this.onInitialize();
      this.status = "ready";
      this.emitEvent("agent:initialized", { agentId: this.config.id });
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  async execute(context: AgentExecutionContext): Promise<unknown> {
    if (this.status !== "ready") {
      throw new Error(`Cannot execute: agent is in "${this.status}" state, expected "ready"`);
    }
    this.status = "executing";
    this.emitEvent("agent:executing", {
      agentId: this.config.id,
      taskId: context.taskId,
    });

    try {
      const policyResult = this.checkPolicies(context);
      if (!policyResult.allowed) {
        throw new AuthorizationError(
          "execute",
          `agent:${this.config.id} - ${policyResult.reason ?? "policy denied"}`,
        );
      }

      const result = await this.onExecute(context);

      this.status = "reflecting";
      await this.onReflect(context, result);

      this.status = "ready";
      this.emitEvent("agent:completed", {
        agentId: this.config.id,
        taskId: context.taskId,
      });

      return result;
    } catch (error) {
      this.status = "error";
      this.emitEvent("agent:error", {
        agentId: this.config.id,
        taskId: context.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.status === "shutdown") return;
    if (this.status === "executing") {
      this.logger?.warn("Shutting down agent while executing", { agentId: this.config.id });
    }
    this.status = "shutdown";
    await this.onShutdown();
    this.emitEvent("agent:shutdown", { agentId: this.config.id });
  }

  abstract onExecute(context: AgentExecutionContext): Promise<unknown>;

  protected async onInitialize(): Promise<void> {}

  protected async onShutdown(): Promise<void> {}

  protected async onReflect(
    _context: AgentExecutionContext,
    _result: unknown,
  ): Promise<ReflectionResult | void> {}

  addToConversation(entry: ConversationEntry): void {
    this.conversationHistory.push(entry);

    const maxTurns = this.config.memory?.conversationMaxTurns ?? 50;
    if (this.conversationHistory.length > maxTurns) {
      const systemMessages = this.conversationHistory.filter((e) => e.role === "system");
      const nonSystem = this.conversationHistory.filter((e) => e.role !== "system");
      const keep = Math.max(1, maxTurns - systemMessages.length);
      this.conversationHistory = [...systemMessages, ...nonSystem.slice(-keep)];
    }
  }

  getConversationContext(): ConversationEntry[] {
    return this.conversationHistory;
  }

  setWorkingMemory(key: string, value: unknown): void {
    this.workingMemory.set(key, { value, createdAt: Date.now() });
  }

  getWorkingMemory<T>(key: string): T | undefined {
    const entry = this.workingMemory.get(key);
    if (!entry) return undefined;
    const ttl = this.config.memory?.workingMemoryTTLMs;
    if (ttl && Date.now() - entry.createdAt > ttl) {
      this.workingMemory.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  clearWorkingMemory(): void {
    this.workingMemory.clear();
  }

  getCapabilities(): AgentCapabilities {
    return {
      tools: this.config.tools ?? [],
      skills: this.config.skills ?? [],
      models: [this.config.model],
      policies: (this.config.policies ?? []).map((p) => p.name),
    };
  }

  private checkPolicies(context: AgentExecutionContext): PolicyResult {
    const policies = this.config.policies ?? [];
    for (const policy of policies) {
      const result = policy.enforce(context);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  protected emitEvent(type: string, data: unknown): void {
    if (this.eventBus) {
      this.eventBus.emit(type, data).catch((err: unknown) =>
        this.logger?.warn("Event emission failed", {
          type,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
  }

  setLogger(logger: ILogger): void {
    this.logger = logger;
  }

  getConfig(): AgentConfig {
    return this.config;
  }
}
