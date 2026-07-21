import { createPlatform } from "@ryvan/bootstrap";
import type { Platform } from "@ryvan/bootstrap";
import type { ModelService } from "@ryvan/models";
import { AnthropicAdapter } from "./anthropic-adapter";

let _platform: Platform | null = null;
let _startPromise: Promise<void> | null = null;

export function getAIOS(): Platform {
  if (!_platform) {
    _platform = createPlatform({
      identity: {
        tokenSecret: process.env.NEXTAUTH_SECRET || "dev-secret-minimum-32-chars-long!!",
        tokenExpiresIn: "24h",
        tokenIssuer: "cortex",
      },
      models: {
        defaultModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      },
    });

    if (process.env.ANTHROPIC_API_KEY) {
      const models = _platform.container.resolve<ModelService>("models");
      models.registry.registerProvider(new AnthropicAdapter());
    }

    _startPromise = _platform.start();
  }
  return _platform;
}

export async function ensureAIOSReady(): Promise<Platform> {
  const platform = getAIOS();
  if (_startPromise) {
    await _startPromise;
    _startPromise = null;
  }
  return platform;
}
