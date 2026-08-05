import { nanoid } from "nanoid";

export function generateId(prefix?: string, size = 21): string {
  const id = nanoid(size);
  return prefix ? `${prefix}_${id}` : id;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BackoffOptions {
  /** Delay before the first retry. */
  baseDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  /**
   * Fraction of the delay to randomise, 0..1. Without jitter, every caller that
   * failed at the same moment retries at the same moment — the thundering herd
   * that turns a blip into an outage. Default 0.
   */
  jitter?: number;
}

/**
 * Delay before retry `attempt` (1-based), capped and optionally jittered.
 *
 * Shared so the generic `retry()` helper, the workflow step executor, and the
 * resilience layer cannot drift into three different backoff curves.
 */
export function computeBackoff(
  attempt: number,
  opts: BackoffOptions,
  random = Math.random,
): number {
  const raw = opts.baseDelay * Math.pow(opts.backoffMultiplier, Math.max(0, attempt - 1));
  const capped = Math.min(raw, opts.maxDelay);

  if (!opts.jitter) return capped;

  const spread = capped * Math.min(1, Math.max(0, opts.jitter));
  // Centred on the capped delay, so jitter spreads retries either side rather
  // than only ever making them sooner.
  return Math.max(0, capped - spread / 2 + random() * spread);
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter?: number;
    /** Return false to give up immediately — a rejected payload will not fix itself. */
    shouldRetry?: (error: Error, attempt: number) => boolean;
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  },
): Promise<T> {
  if (opts.maxRetries < 0) {
    throw new Error("maxRetries must be >= 0");
  }
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (opts.shouldRetry && !opts.shouldRetry(lastError, attempt + 1)) {
        throw lastError;
      }

      if (attempt < opts.maxRetries) {
        const delay = computeBackoff(attempt + 1, opts);
        opts.onRetry?.(lastError, attempt + 1, delay);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreeze<T extends Record<string, unknown>>(obj: T): Readonly<T> {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") {
      deepFreeze(val as Record<string, unknown>);
    }
  }
  return Object.freeze(obj);
}

export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be positive");
  }
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}

export function mapValues<T, U>(
  obj: Record<string, T>,
  fn: (value: T, key: string) => U,
): Record<string, U> {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = fn(value, key);
  }
  return result;
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invariant violation: ${message}`);
}

export function exhaustive(_value: never): never {
  throw new Error(`Exhaustive check failed: ${_value}`);
}
