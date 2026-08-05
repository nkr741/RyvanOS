import type { CircuitBreakerOptions, CircuitSnapshot, CircuitState } from "./types.js";

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;
const DEFAULT_SUCCESS_THRESHOLD = 1;

/**
 * One circuit, protecting one target.
 *
 * The value is not that it retries — retrying is cheap and already handled.
 * The value is that it *stops*: once a dependency is clearly down, every
 * further call fails instantly instead of burning a timeout, so a slow
 * dependency cannot exhaust the caller's concurrency and take the platform
 * down with it.
 */
export class CircuitBreaker {
  readonly key: string;

  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private lastFailureAt?: number;
  private lastError?: string;
  private openedAt?: number;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(key: string, options: CircuitBreakerOptions = {}) {
    this.key = key;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = options.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.successThreshold = options.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD;
  }

  /**
   * Whether a call may proceed, transitioning an expired open circuit to
   * half-open so exactly one probe gets through.
   */
  canAttempt(now = Date.now()): boolean {
    if (this.state === "closed") return true;

    if (this.state === "open") {
      if (this.openedAt !== undefined && now - this.openedAt >= this.resetTimeoutMs) {
        this.state = "half_open";
        this.consecutiveSuccesses = 0;
        return true;
      }
      return false;
    }

    // Half-open: the probe is already in flight, so hold everything else back
    // rather than sending a second wave at a dependency that may still be down.
    return this.consecutiveSuccesses === 0 && this.consecutiveFailures === 0;
  }

  recordSuccess(): CircuitState {
    this.totalCalls++;
    this.consecutiveFailures = 0;

    if (this.state === "half_open") {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.state = "closed";
        this.consecutiveSuccesses = 0;
        this.openedAt = undefined;
      }
    }

    return this.state;
  }

  recordFailure(error: string, now = Date.now()): CircuitState {
    this.totalCalls++;
    this.totalFailures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureAt = now;
    this.lastError = error;

    // A failed probe sends it straight back to open — recovery was not real.
    if (this.state === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = now;
    }

    return this.state;
  }

  /** Forces the circuit shut, for an operator who knows the dependency is back. */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openedAt = undefined;
  }

  snapshot(): CircuitSnapshot {
    return {
      key: this.key,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      lastFailureAt: this.lastFailureAt,
      lastError: this.lastError,
      retryAt:
        this.state === "open" && this.openedAt !== undefined
          ? this.openedAt + this.resetTimeoutMs
          : undefined,
    };
  }
}
