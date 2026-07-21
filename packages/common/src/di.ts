import type { IServiceRegistry, ILogger } from "./interfaces.js";
import type { Service, ServiceFactory } from "./types.js";
import { ServiceNotFoundError, ServiceAlreadyRegisteredError, RyvanError } from "./errors.js";

interface RegistryEntry {
  instance?: unknown;
  factory?: ServiceFactory;
  singleton: boolean;
}

export class Container implements IServiceRegistry {
  private entries = new Map<string, RegistryEntry>();
  private logger?: ILogger;

  setLogger(logger: ILogger): void {
    this.logger = logger;
  }

  register<T extends Service>(name: string, factory: ServiceFactory<T>): void {
    if (this.entries.has(name)) throw new ServiceAlreadyRegisteredError(name);
    this.entries.set(name, { factory, singleton: true });
    this.logger?.debug(`Registered service: ${name}`);
  }

  registerTransient<T extends Service>(name: string, factory: ServiceFactory<T>): void {
    if (this.entries.has(name)) throw new ServiceAlreadyRegisteredError(name);
    this.entries.set(name, { factory, singleton: false });
  }

  registerInstance<T>(name: string, instance: T): void {
    if (this.entries.has(name)) throw new ServiceAlreadyRegisteredError(name);
    this.entries.set(name, { instance, singleton: true });
    this.logger?.debug(`Registered instance: ${name}`);
  }

  resolve<T>(name: string): T {
    const entry = this.entries.get(name);
    if (!entry) throw new ServiceNotFoundError(name);

    if (entry.instance !== undefined && entry.singleton) return entry.instance as T;
    if (!entry.factory) throw new ServiceNotFoundError(name);

    const instance = entry.factory();
    if (instance != null && typeof (instance as Record<string, unknown>).then === "function") {
      throw new RyvanError(
        `Service "${name}" has an async factory — use resolveAsync() instead of resolve()`,
        "ASYNC_FACTORY",
        { name },
      );
    }
    if (entry.singleton) entry.instance = instance;
    return instance as T;
  }

  async resolveAsync<T>(name: string): Promise<T> {
    const entry = this.entries.get(name);
    if (!entry) throw new ServiceNotFoundError(name);

    if (entry.instance !== undefined && entry.singleton) return entry.instance as T;
    if (!entry.factory) throw new ServiceNotFoundError(name);

    const instance = await entry.factory();
    if (entry.singleton) entry.instance = instance;
    return instance as T;
  }

  resolveAll(): Map<string, unknown> {
    const result = new Map<string, unknown>();
    for (const [name, entry] of this.entries) {
      if (entry.instance !== undefined) result.set(name, entry.instance);
    }
    return result;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  unregister(name: string): boolean {
    return this.entries.delete(name);
  }

  names(): string[] {
    return Array.from(this.entries.keys());
  }

  clear(): void {
    this.entries.clear();
  }
}
