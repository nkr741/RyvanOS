import { EVENTS, computeBackoff, generateId, matchesGlob, sleep, withTimeout } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import { scopedEmitter } from "@ryvan/events";
import type { ScopedEmitter } from "@ryvan/events";
import { CircuitBreaker } from "./circuit-breaker.js";
import { InMemoryDeadLetterStore } from "./dead-letters.js";
import type {
  CircuitSnapshot,
  CircuitState,
  DeadLetter,
  DeadLetterStore,
  ExecuteOptions,
  ExecuteOutcome,
  ResiliencePolicy,
  ResilienceServiceOptions,
  RetrySpec,
} from "./types.js";

const DEFAULT_RETRY: Required<RetrySpec> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
  jitter: 0.2,
};

/** Raised when a circuit is open, so callers can tell this from a real failure. */
export class CircuitOpenError extends Error {
  constructor(
    readonly key: string,
    readonly retryAt?: number,
  ) {
    super(`Circuit "${key}" is open`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Makes a call survivable.
 *
 * Retries handle a blip. The circuit breaker handles an outage — it stops
 * calling a dependency that is already down, so a slow vendor cannot exhaust
 * the platform's concurrency. Fallbacks handle "this route is gone, try
 * another". Dead letters handle work that must eventually happen but cannot
 * happen now.
 *
 * Policies are matched by glob against a call key, so SAP being down does not
 * open the circuit on Slack.
 */
export class ResilienceService implements Service {
  readonly name = "resilience";

  readonly deadLetters: DeadLetterStore;

  private state: Status = "stopped";
  private readonly policies: ResiliencePolicy[];
  private readonly defaultPolicy: Omit<ResiliencePolicy, "target">;
  private readonly breakers = new Map<string, CircuitBreaker>();
  /** Last emitted state per key, so only real transitions reach the bus. */
  private readonly lastStates = new Map<string, CircuitState>();
  private readonly logger?: ILogger;
  private readonly emit: ScopedEmitter;

  constructor(options: ResilienceServiceOptions = {}) {
    this.policies = options.policies ?? [];
    this.defaultPolicy = options.defaultPolicy ?? {};
    this.deadLetters = options.deadLetters ?? new InMemoryDeadLetterStore();
    this.logger = options.logger;
    this.emit = scopedEmitter("resilience", options.eventBus);
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.state = "running";
    this.logger?.info("Resilience service started", { policies: this.policies.length });
  }

  async stop(): Promise<void> {
    this.state = "stopping";
    this.state = "stopped";
    this.logger?.info("Resilience service stopped");
  }

  status(): Status {
    return this.state;
  }

  addPolicy(policy: ResiliencePolicy): void {
    this.policies.push(policy);
  }

  /** The policy governing a key — the first matching one, else the default. */
  policyFor(key: string): ResiliencePolicy {
    const matched = this.policies.find((policy) => matchesGlob(key, [policy.target]));
    return matched ?? { target: key, ...this.defaultPolicy };
  }

  /**
   * Runs `fn` under the policy for `key`.
   *
   * Order: refuse fast if the circuit is open, otherwise attempt with retries,
   * then fall back, then dead-letter. Anything that gets through unhandled is
   * rethrown — resilience makes failure survivable, it does not hide it.
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options: ExecuteOptions = {},
  ): Promise<ExecuteOutcome<T>> {
    const policy = this.policyFor(key);
    const startedAt = Date.now();
    const breaker = this.breakerFor(key, policy);

    let attempts = 0;
    let lastError: Error | undefined;

    if (breaker.canAttempt()) {
      try {
        const result = await this.attemptWithRetries(key, fn, policy, options, (n) => {
          attempts = n;
        });

        this.transition(key, breaker.recordSuccess(), breaker);
        return { result, attempts, durationMs: Date.now() - startedAt };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.transition(key, breaker.recordFailure(lastError.message), breaker);
      }
    } else {
      const snapshot = breaker.snapshot();
      lastError = new CircuitOpenError(key, snapshot.retryAt);
      this.logger?.warn("Circuit open, skipping call", { key, retryAt: snapshot.retryAt });
    }

    // Primary is down. Try each fallback in turn, under its own circuit.
    for (const fallbackKey of policy.fallbacks ?? []) {
      if (!options.runFallback) break;

      const fallbackBreaker = this.breakerFor(fallbackKey, this.policyFor(fallbackKey));
      if (!fallbackBreaker.canAttempt()) continue;

      try {
        const result = (await options.runFallback(fallbackKey)) as T;

        this.transition(fallbackKey, fallbackBreaker.recordSuccess(), fallbackBreaker);
        await this.emit(EVENTS.RESILIENCE_FALLBACK, {
          key,
          fallback: fallbackKey,
          reason: lastError?.message,
        });
        this.logger?.info("Recovered via fallback", { key, fallback: fallbackKey });

        return {
          result,
          attempts,
          usedFallback: fallbackKey,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        const failure = err instanceof Error ? err : new Error(String(err));
        this.transition(
          fallbackKey,
          fallbackBreaker.recordFailure(failure.message),
          fallbackBreaker,
        );
        lastError = failure;
      }
    }

    if (policy.deadLetter) {
      await this.deadLetter(key, lastError, attempts, options);
      // The work is parked, not done. Saying otherwise would let a caller
      // believe a payment went through when it is sitting in a queue.
      throw lastError ?? new Error(`"${key}" failed and was dead-lettered`);
    }

    throw lastError ?? new Error(`"${key}" failed`);
  }

  /** Every circuit's current state, for the console and health checks. */
  circuits(): CircuitSnapshot[] {
    return Array.from(this.breakers.values()).map((breaker) => breaker.snapshot());
  }

  circuit(key: string): CircuitSnapshot | undefined {
    return this.breakers.get(key)?.snapshot();
  }

  /** Forces a circuit closed — for an operator who knows the dependency is back. */
  resetCircuit(key: string): void {
    this.breakers.get(key)?.reset();
  }

  /**
   * Replays a parked call. The caller supplies how to run it, because only they
   * know what the payload means.
   */
  async replay(letterId: string, run: (letter: DeadLetter) => Promise<void>): Promise<boolean> {
    const pending = await this.deadLetters.list({ replayed: false });
    const letter = pending.find((candidate) => candidate.id === letterId);
    if (!letter) return false;

    // Marked only after `run` succeeds — a failed replay stays replayable
    // rather than silently disappearing.
    await run(letter);
    await this.deadLetters.markReplayed(letter.id);
    await this.emit(EVENTS.RESILIENCE_REPLAYED, { letterId: letter.id, key: letter.key });

    return true;
  }

  // --- internals ------------------------------------------------------------

  private async attemptWithRetries<T>(
    key: string,
    fn: () => Promise<T>,
    policy: ResiliencePolicy,
    options: ExecuteOptions,
    report: (attempts: number) => void,
  ): Promise<T> {
    const spec = { ...DEFAULT_RETRY, ...policy.retry };
    const maxAttempts = Math.max(1, spec.maxAttempts);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      report(attempt);

      try {
        const call = fn();
        return policy.timeoutMs
          ? await withTimeout(call, policy.timeoutMs, `resilience ${key}`)
          : await call;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // A rejected payload will not fix itself; only retry what might.
        if (options.isRetryable && !options.isRetryable(lastError)) break;
        if (attempt >= maxAttempts) break;

        const delay = computeBackoff(attempt, {
          baseDelay: spec.baseDelayMs,
          backoffMultiplier: spec.backoffMultiplier,
          maxDelay: spec.maxDelayMs,
          jitter: spec.jitter,
        });

        await this.emit(EVENTS.RESILIENCE_RETRY, {
          key,
          attempt,
          maxAttempts,
          delayMs: delay,
          error: lastError.message,
          correlationId: options.correlationId,
        });
        this.logger?.warn("Retrying after failure", { key, attempt, delay });

        await sleep(delay);
      }
    }

    throw lastError ?? new Error(`"${key}" failed without an error`);
  }

  private breakerFor(key: string, policy: ResiliencePolicy): CircuitBreaker {
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(key, policy.breaker);
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  /** Emits only when the state actually changed, so the bus is not spammed. */
  private transition(key: string, next: CircuitState, breaker: CircuitBreaker): void {
    const previous = this.lastStates.get(key);
    if (previous === next) return;

    this.lastStates.set(key, next);
    const snapshot = breaker.snapshot();

    const type =
      next === "open"
        ? EVENTS.CIRCUIT_OPENED
        : next === "half_open"
          ? EVENTS.CIRCUIT_HALF_OPEN
          : EVENTS.CIRCUIT_CLOSED;

    void this.emit(type, {
      key,
      from: previous ?? "closed",
      to: next,
      consecutiveFailures: snapshot.consecutiveFailures,
      lastError: snapshot.lastError,
      retryAt: snapshot.retryAt,
    });

    this.logger?.warn("Circuit state changed", { key, from: previous ?? "closed", to: next });
  }

  private async deadLetter(
    key: string,
    error: Error | undefined,
    attempts: number,
    options: ExecuteOptions,
  ): Promise<void> {
    const letter: DeadLetter = {
      id: generateId("dlq"),
      key,
      payload: options.payload,
      error: error?.message ?? "unknown failure",
      attempts,
      correlationId: options.correlationId,
      missionId: options.missionId,
      createdAt: Date.now(),
    };

    await this.deadLetters.add(letter);
    await this.emit(EVENTS.RESILIENCE_DEAD_LETTERED, {
      letterId: letter.id,
      key,
      error: letter.error,
      attempts,
      correlationId: options.correlationId,
    });

    this.logger?.error("Call dead-lettered", { key, attempts, error: letter.error });
  }
}
