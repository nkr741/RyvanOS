import type { z } from "zod";
import type { HealthCheck, Paginated, PaginationParams, Service, ServiceFactory } from "./types.js";
import type { LogLevel } from "./constants.js";

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;
  child(defaultContext: Record<string, unknown>): ILogger;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  service?: string;
  traceId?: string;
  spanId?: string;
}

export interface IConfigManager {
  get<T>(key: string, defaultValue?: T): T;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  load(config: Record<string, unknown>): void;
  loadFromEnv(prefix?: string): void;
  toJSON(): Record<string, unknown>;
  validate<T>(key: string, schema: z.ZodSchema<T>): T;
}

export interface IServiceRegistry {
  register<T extends Service>(name: string, factory: ServiceFactory<T>): void;
  registerTransient<T extends Service>(name: string, factory: ServiceFactory<T>): void;
  registerInstance<T>(name: string, instance: T): void;
  resolve<T>(name: string): T;
  resolveAsync<T>(name: string): Promise<T>;
  resolveAll(): Map<string, unknown>;
  has(name: string): boolean;
  unregister(name: string): boolean;
  names(): string[];
}

/**
 * The event bus contract lives in `@ryvan/events` — `IEventBus`, `EventHandler`,
 * and `EventSubscription` are exported from there and are what every package
 * imports. A second, incompatible copy used to sit here (its handlers took the
 * payload where the real one passes a `RyvanEvent` envelope), which meant code
 * typed against `@ryvan/common` could not accept the actual `EventBus`.
 *
 * `@ryvan/common` is a leaf package and cannot import `@ryvan/events`, so the
 * declaration is not re-exported here. Import it from `@ryvan/events`.
 */

export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findMany(params?: PaginationParams & Record<string, unknown>): Promise<Paginated<T>>;
  create(data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;
}

export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(pattern?: string): Promise<void>;
}

export interface IHealthCheckable {
  healthCheck(): Promise<HealthCheck>;
}

export interface IPlugin {
  readonly name: string;
  readonly version: string;
  install(container: IServiceRegistry): Promise<void>;
  uninstall(): Promise<void>;
}

export interface IMiddleware<TContext> {
  execute(context: TContext, next: () => Promise<void>): Promise<void>;
}
