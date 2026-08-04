import { generateId, ModelError } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import type { ModelRegistry } from "./registry.js";
import type { ModelConfig, ModelRequest, ModelResponse, RoutingHints } from "./types.js";

export interface ModelRouterOptions {
  registry: ModelRegistry;
  defaultModel: string;
  logger?: ILogger;
  eventBus?: IEventBus;
}

export class ModelRouter {
  private readonly registry: ModelRegistry;
  private readonly defaultModel: string;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;

  constructor(options: ModelRouterOptions) {
    this.registry = options.registry;
    this.defaultModel = options.defaultModel;
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  private validateRequest(request: ModelRequest): void {
    if (!request.messages || request.messages.length === 0) {
      throw new ModelError("request", "messages must not be empty");
    }
    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new ModelError("request", "temperature must be between 0 and 2");
    }
    if (request.maxTokens !== undefined && request.maxTokens <= 0) {
      throw new ModelError("request", "maxTokens must be positive");
    }
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    this.validateRequest(request);
    const requestId = generateId("req");
    const modelId = request.model ?? this.resolveModelId(request.routingHints);
    const config = this.registry.getModel(modelId);

    if (!config) {
      throw new ModelError(modelId, "Model not found in registry");
    }

    const adapter = this.registry.getProvider(config.provider);

    if (!adapter) {
      throw new ModelError(modelId, `No adapter registered for provider "${config.provider}"`);
    }

    await this.eventBus?.emit(
      "model:called",
      {
        requestId,
        model: modelId,
        provider: config.provider,
        messageCount: request.messages.length,
        stream: request.stream ?? false,
        tenant: request.tenant,
      },
      { source: "models", correlationId: request.correlationId },
    );

    const startTime = performance.now();
    const response = await adapter.chat(request, config);
    const latencyMs = Math.round(performance.now() - startTime);

    const result: ModelResponse = {
      ...response,
      id: response.id || generateId("res"),
      latencyMs,
    };

    this.logger?.info("Model call completed", {
      model: modelId,
      provider: config.provider,
      latencyMs,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: result.usage.estimatedCost,
    });

    await this.eventBus?.emit(
      "model:response",
      {
        requestId,
        id: result.id,
        model: modelId,
        provider: config.provider,
        latencyMs,
        usage: result.usage,
        finishReason: result.finishReason,
        tenant: request.tenant,
      },
      { source: "models", correlationId: request.correlationId },
    );

    return result;
  }

  selectModel(hints: RoutingHints): ModelConfig {
    let candidates = this.registry.listModels();

    if (hints.requiredCapabilities?.length) {
      candidates = candidates.filter((m) =>
        hints.requiredCapabilities!.every((cap) => m.capabilities.includes(cap)),
      );
    }

    if (hints.privacySensitive) {
      candidates = candidates.filter((m) => m.isLocal);
    } else if (hints.preferLocal) {
      const localCandidates = candidates.filter((m) => m.isLocal);
      if (localCandidates.length > 0) {
        candidates = localCandidates;
      }
    }

    if (hints.maxCostPerCall !== undefined) {
      const estimatedTokens = hints.estimatedInputTokens ?? 1000;
      candidates = candidates.filter(
        (m) => this.estimateCost(m, estimatedTokens) <= hints.maxCostPerCall!,
      );
    }

    if (candidates.length === 0) {
      throw new ModelError("none", "No model matches the provided routing hints");
    }

    // Pick lowest cost among remaining candidates
    candidates.sort(
      (a, b) =>
        a.inputPricePerToken +
        a.outputPricePerToken -
        (b.inputPricePerToken + b.outputPricePerToken),
    );

    return candidates[0];
  }

  private resolveModelId(hints?: RoutingHints): string {
    if (!hints) {
      return this.defaultModel;
    }

    try {
      return this.selectModel(hints).id;
    } catch {
      this.logger?.warn("Model selection failed, falling back to default", {
        defaultModel: this.defaultModel,
      });
      return this.defaultModel;
    }
  }

  private estimateCost(model: ModelConfig, inputTokens: number): number {
    const estimatedOutputTokens = Math.min(Math.round(model.maxOutputTokens * 0.25), inputTokens);
    return (
      model.inputPricePerToken * inputTokens + model.outputPricePerToken * estimatedOutputTokens
    );
  }
}
