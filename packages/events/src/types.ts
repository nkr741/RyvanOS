export interface RyvanEvent<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly data: T;
  readonly timestamp: number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface EventMiddleware {
  (event: RyvanEvent, next: () => Promise<void>): Promise<void>;
}

export type EventHandler<T = unknown> = (event: RyvanEvent<T>) => void | Promise<void>;

export interface EventSubscription {
  readonly id: string;
  readonly event: string;
  unsubscribe(): void;
}

export interface EventBusOptions {
  maxListenersPerEvent?: number;
  enableDeadLetterQueue?: boolean;
  logger?: import("@ryvan/common").ILogger; // eslint-disable-line @typescript-eslint/consistent-type-imports
}

export interface EventFilter {
  source?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface DeadLetterEntry {
  event: RyvanEvent;
  error: Error;
  handler: string;
  timestamp: number;
  attempts: number;
}

export interface IEventBus {
  emit<T = unknown>(type: string, data: T, options?: EmitOptions): Promise<RyvanEvent<T>>;
  on<T = unknown>(type: string, handler: EventHandler<T>, filter?: EventFilter): EventSubscription;
  once<T = unknown>(
    type: string,
    handler: EventHandler<T>,
    filter?: EventFilter,
  ): EventSubscription;
  off(subscriptionId: string): boolean;
  offAll(type?: string): void;
  use(middleware: EventMiddleware): void;
  listenerCount(type: string): number;
  eventTypes(): string[];
  history(type?: string, limit?: number): RyvanEvent[];
  deadLetters(limit?: number): DeadLetterEntry[];
  clear(): void;
}

export interface EmitOptions {
  source?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}
