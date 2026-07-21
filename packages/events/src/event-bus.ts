import { generateId } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type {
  RyvanEvent,
  EventHandler,
  EventMiddleware,
  EventSubscription,
  EventBusOptions,
  EventFilter,
  DeadLetterEntry,
  IEventBus,
  EmitOptions,
} from "./types.js";

interface RegisteredHandler {
  id: string;
  handler: EventHandler;
  filter?: EventFilter;
  once: boolean;
}

const DEFAULT_MAX_LISTENERS = 100;
const DEFAULT_HISTORY_LIMIT = 1000;

export class EventBus implements IEventBus {
  private listeners = new Map<string, RegisteredHandler[]>();
  private middlewares: EventMiddleware[] = [];
  private eventHistory: RyvanEvent[] = [];
  private deadLetterQueue: DeadLetterEntry[] = [];
  private maxListeners: number;
  private enableDLQ: boolean;
  private logger?: ILogger;

  constructor(options: EventBusOptions = {}) {
    this.maxListeners = options.maxListenersPerEvent ?? DEFAULT_MAX_LISTENERS;
    this.enableDLQ = options.enableDeadLetterQueue ?? false;
    this.logger = options.logger;
  }

  async emit<T = unknown>(type: string, data: T, options?: EmitOptions): Promise<RyvanEvent<T>> {
    const event: RyvanEvent<T> = {
      id: generateId("evt"),
      type,
      data,
      timestamp: Date.now(),
      source: options?.source,
      correlationId: options?.correlationId,
      metadata: options?.metadata,
    };

    this.eventHistory.push(event as RyvanEvent);
    if (this.eventHistory.length > DEFAULT_HISTORY_LIMIT) {
      this.eventHistory.shift();
    }

    await this.executeMiddlewareChain(event as RyvanEvent, async () => {
      await this.dispatch(event as RyvanEvent);
    });

    return event;
  }

  on<T = unknown>(type: string, handler: EventHandler<T>, filter?: EventFilter): EventSubscription {
    return this.addHandler(type, handler as EventHandler, filter, false);
  }

  once<T = unknown>(
    type: string,
    handler: EventHandler<T>,
    filter?: EventFilter,
  ): EventSubscription {
    return this.addHandler(type, handler as EventHandler, filter, true);
  }

  off(subscriptionId: string): boolean {
    for (const [type, handlers] of this.listeners) {
      const index = handlers.findIndex((h) => h.id === subscriptionId);
      if (index !== -1) {
        handlers.splice(index, 1);
        if (handlers.length === 0) this.listeners.delete(type);
        return true;
      }
    }
    return false;
  }

  offAll(type?: string): void {
    if (type) {
      this.listeners.delete(type);
    } else {
      this.listeners.clear();
    }
  }

  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  eventTypes(): string[] {
    return Array.from(this.listeners.keys());
  }

  history(type?: string, limit = 50): RyvanEvent[] {
    let events = this.eventHistory;
    if (type) {
      events = events.filter((e) => e.type === type);
    }
    return events.slice(-limit);
  }

  deadLetters(limit = 50): DeadLetterEntry[] {
    return this.deadLetterQueue.slice(-limit);
  }

  clear(): void {
    this.listeners.clear();
    this.middlewares = [];
    this.eventHistory = [];
    this.deadLetterQueue = [];
  }

  private addHandler(
    type: string,
    handler: EventHandler,
    filter: EventFilter | undefined,
    once: boolean,
  ): EventSubscription {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }

    const handlers = this.listeners.get(type)!;
    if (handlers.length >= this.maxListeners) {
      const msg = `Max listeners (${this.maxListeners}) reached for event "${type}"`;
      this.logger?.warn(msg);
      throw new Error(msg);
    }

    const id = generateId("sub");
    handlers.push({ id, handler, filter, once });

    return {
      id,
      event: type,
      unsubscribe: () => this.off(id),
    };
  }

  private async dispatch(event: RyvanEvent): Promise<void> {
    const handlers = this.listeners.get(event.type);
    if (!handlers || handlers.length === 0) return;

    const toRemove: string[] = [];

    for (const registered of handlers) {
      if (registered.filter && !this.matchesFilter(event, registered.filter)) {
        continue;
      }

      try {
        await registered.handler(event);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger?.error(`Event handler error for "${event.type}"`, {
          eventId: event.id,
          handlerId: registered.id,
          error: error.message,
        });

        if (this.enableDLQ) {
          this.deadLetterQueue.push({
            event,
            error,
            handler: registered.id,
            timestamp: Date.now(),
            attempts: 1,
          });
        }
      }

      if (registered.once) {
        toRemove.push(registered.id);
      }
    }

    for (const id of toRemove) {
      this.off(id);
    }
  }

  private matchesFilter(event: RyvanEvent, filter: EventFilter): boolean {
    if (filter.source && event.source !== filter.source) return false;
    if (filter.correlationId && event.correlationId !== filter.correlationId) return false;
    if (filter.metadata) {
      if (!event.metadata) return false;
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (event.metadata[key] !== value) return false;
      }
    }
    return true;
  }

  private async executeMiddlewareChain(
    event: RyvanEvent,
    final: () => Promise<void>,
  ): Promise<void> {
    if (this.middlewares.length === 0) {
      return final();
    }

    let index = 0;
    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(event, next);
      } else {
        await final();
      }
    };

    await next();
  }
}
