import { ValidationError, ConflictError } from "@ryvan/common";
import type { ModelCapability, ModelConfig, ModelProvider, ModelProviderAdapter } from "./types.js";

export class ModelRegistry {
  private readonly models = new Map<string, ModelConfig>();
  private readonly providers = new Map<ModelProvider, ModelProviderAdapter>();

  registerProvider(adapter: ModelProviderAdapter): void {
    const oldAdapter = this.providers.get(adapter.provider);
    if (oldAdapter) {
      for (const model of oldAdapter.listModels()) {
        this.models.delete(model.id);
      }
    }
    this.providers.set(adapter.provider, adapter);
    for (const model of adapter.listModels()) {
      this.models.set(model.id, model);
    }
  }

  registerModel(config: ModelConfig): void {
    if (!config.id) {
      throw new ValidationError("id", "model id must not be empty");
    }
    if (config.contextWindow <= 0) {
      throw new ValidationError("contextWindow", "must be positive");
    }
    if (config.inputPricePerToken < 0 || config.outputPricePerToken < 0) {
      throw new ValidationError("price", "token prices must not be negative");
    }
    if (this.models.has(config.id)) {
      throw new ConflictError(config.id, "model already registered");
    }
    this.models.set(config.id, config);
  }

  getModel(modelId: string): ModelConfig | undefined {
    return this.models.get(modelId);
  }

  getProvider(provider: ModelProvider): ModelProviderAdapter | undefined {
    return this.providers.get(provider);
  }

  listModels(filter?: {
    provider?: ModelProvider;
    capabilities?: ModelCapability[];
  }): ModelConfig[] {
    let models = Array.from(this.models.values());

    if (filter?.provider) {
      models = models.filter((m) => m.provider === filter.provider);
    }

    if (filter?.capabilities?.length) {
      models = models.filter((m) =>
        filter.capabilities!.every((cap) => m.capabilities.includes(cap)),
      );
    }

    return models;
  }

  listProviders(): ModelProvider[] {
    return Array.from(this.providers.keys());
  }
}
