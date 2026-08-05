/**
 * Circuit states.
 *
 * `closed` lets calls through. `open` rejects immediately — the point of a
 * breaker is to stop hammering a dependency that is already down, and to fail
 * fast rather than making every caller wait for a timeout. `half_open` lets a
 * single probe through to find out whether it has recovered.
 */
export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. Default 5. */
  failureThreshold?: number;
  /** How long the circuit stays open before allowing a probe. Default 30000ms. */
  resetTimeoutMs?: number;
  /** Consecutive probe successes needed to close again. Default 1. */
  successThreshold?: number;
}

export interface CircuitSnapshot {
  key: string;
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  lastFailureAt?: number;
  lastError?: string;
  /** When an open circuit will next allow a probe. */
  retryAt?: number;
}

export interface RetrySpec {
  /** Total attempts, including the first. 1 means no retry. Default 3. */
  maxAttempts?: number;
  baseDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  /** Fraction of the delay to randomise, 0..1. Default 0.2. */
  jitter?: number;
}

/**
 * How a target should behave when it fails.
 *
 * A "target" is whatever you want to protect independently — a connector, one
 * of its operations, a model provider. Keyed rather than global, because SAP
 * being down should not open the circuit on Slack.
 */
export interface ResiliencePolicy {
  /** Glob matched against the call key, e.g. "connector:sap:*". */
  target: string;
  retry?: RetrySpec;
  breaker?: CircuitBreakerOptions;
  /**
   * Keys to try, in order, when the primary fails or its circuit is open.
   * The caller supplies how to run each one.
   */
  fallbacks?: string[];
  /** Fail the call outright after this long, regardless of retries. */
  timeoutMs?: number;
  /**
   * Park the call for later instead of failing when everything is exhausted.
   * Use for work that must eventually happen but need not happen now.
   */
  deadLetter?: boolean;
}

export interface DeadLetter {
  id: string;
  key: string;
  /** Serialised call input, so the work can be replayed. */
  payload?: Record<string, unknown>;
  error: string;
  attempts: number;
  correlationId?: string;
  missionId?: string;
  createdAt: number;
  /** Set once replayed, so a letter is not processed twice. */
  replayedAt?: number;
}

export interface DeadLetterStore {
  add(letter: DeadLetter): Promise<void>;
  list(filter?: { key?: string; replayed?: boolean; limit?: number }): Promise<DeadLetter[]>;
  markReplayed(id: string): Promise<void>;
}

export interface ExecuteOptions {
  /** Decides whether a given failure is worth retrying. */
  isRetryable?: (error: Error) => boolean;
  /** Runs a named fallback target. Required for `fallbacks` to do anything. */
  runFallback?: (key: string) => Promise<unknown>;
  payload?: Record<string, unknown>;
  correlationId?: string;
  missionId?: string;
}

export interface ExecuteOutcome<T> {
  result: T;
  /** Attempts made against the primary target. */
  attempts: number;
  /** Set when a fallback produced the result. */
  usedFallback?: string;
  durationMs: number;
}

export interface ResilienceServiceOptions {
  policies?: ResiliencePolicy[];
  /** Applied to any target no policy matches. */
  defaultPolicy?: Omit<ResiliencePolicy, "target">;
  deadLetters?: DeadLetterStore;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}
