import type { ILogger } from "@ryvan/common";
import type { EventBusOptions } from "@ryvan/events";
import type { WorkerConfig } from "@ryvan/agent-runtime";

export interface PlatformConfig {
  identity: {
    tokenSecret: string;
    tokenExpiresIn?: string;
    tokenIssuer?: string;
  };
  models: {
    defaultModel: string;
  };
  events?: Partial<EventBusOptions>;
  runtime?: Partial<WorkerConfig>;
  logger?: ILogger;
}

export interface Platform {
  readonly container: PlatformContainer;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): PlatformStatus;
}

export interface PlatformContainer {
  resolve<T>(name: string): T;
  has(name: string): boolean;
}

export type PlatformStatus = "created" | "starting" | "running" | "stopping" | "stopped";
