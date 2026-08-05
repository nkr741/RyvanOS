import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "./circuit-breaker.js";
import { InMemoryDeadLetterStore } from "./dead-letters.js";
import { CircuitOpenError, ResilienceService } from "./resilience-service.js";

/** Fails the first `failures` calls, then succeeds. */
function flaky(failures: number, error = new Error("ETIMEDOUT")) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= failures) throw error;
    return "ok";
  };
  return { fn, calls: () => calls };
}

const FAST_RETRY = { maxAttempts: 3, baseDelayMs: 1, jitter: 0 };

describe("CircuitBreaker", () => {
  it("opens after the failure threshold", () => {
    const breaker = new CircuitBreaker("sap", { failureThreshold: 3 });

    expect(breaker.recordFailure("boom")).toBe("closed");
    expect(breaker.recordFailure("boom")).toBe("closed");
    expect(breaker.recordFailure("boom")).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("resets the failure count on success", () => {
    const breaker = new CircuitBreaker("sap", { failureThreshold: 3 });

    breaker.recordFailure("boom");
    breaker.recordFailure("boom");
    breaker.recordSuccess();
    breaker.recordFailure("boom");

    expect(breaker.snapshot().state).toBe("closed");
  });

  it("half-opens once the reset timeout passes, then closes on a good probe", () => {
    const opened = 1_000;
    const breaker = new CircuitBreaker("sap", { failureThreshold: 1, resetTimeoutMs: 100 });

    breaker.recordFailure("boom", opened);
    expect(breaker.canAttempt(opened + 50)).toBe(false);
    expect(breaker.canAttempt(opened + 150)).toBe(true);
    expect(breaker.snapshot().state).toBe("half_open");

    expect(breaker.recordSuccess()).toBe("closed");
  });

  it("returns to open when the probe also fails", () => {
    const opened = 1_000;
    const breaker = new CircuitBreaker("sap", { failureThreshold: 1, resetTimeoutMs: 100 });

    breaker.recordFailure("boom", opened);
    breaker.canAttempt(opened + 150);

    // One failed probe is enough — recovery was not real.
    expect(breaker.recordFailure("still down", opened + 160)).toBe("open");
  });

  it("holds back a second probe while one is in flight", () => {
    const opened = 1_000;
    const breaker = new CircuitBreaker("sap", { failureThreshold: 1, resetTimeoutMs: 100 });

    breaker.recordFailure("boom", opened);

    expect(breaker.canAttempt(opened + 150)).toBe(true);
    breaker.recordFailure("still down", opened + 151);
    expect(breaker.canAttempt(opened + 152)).toBe(false);
  });

  it("requires successThreshold probes before closing", () => {
    const breaker = new CircuitBreaker("sap", {
      failureThreshold: 1,
      resetTimeoutMs: 0,
      successThreshold: 2,
    });

    breaker.recordFailure("boom", 0);
    breaker.canAttempt(1);

    expect(breaker.recordSuccess()).toBe("half_open");
    expect(breaker.recordSuccess()).toBe("closed");
  });

  it("can be forced closed by an operator", () => {
    const breaker = new CircuitBreaker("sap", { failureThreshold: 1 });
    breaker.recordFailure("boom");

    breaker.reset();

    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.snapshot().state).toBe("closed");
  });

  it("reports totals and the last error", () => {
    const breaker = new CircuitBreaker("sap", { failureThreshold: 10 });
    breaker.recordSuccess();
    breaker.recordFailure("vendor 503");

    expect(breaker.snapshot()).toMatchObject({
      key: "sap",
      totalCalls: 2,
      totalFailures: 1,
      lastError: "vendor 503",
    });
  });
});

describe("ResilienceService", () => {
  it("returns the result when nothing fails", async () => {
    const service = new ResilienceService();

    const outcome = await service.execute("sap:read", async () => "value");

    expect(outcome.result).toBe("value");
    expect(outcome.attempts).toBe(1);
    expect(outcome.usedFallback).toBeUndefined();
  });

  it("retries a transient failure and succeeds", async () => {
    const eventBus = new EventBus();
    const service = new ResilienceService({
      defaultPolicy: { retry: FAST_RETRY },
      eventBus,
    });
    const target = flaky(2);

    const outcome = await service.execute("sap:read", target.fn);

    expect(outcome.result).toBe("ok");
    expect(outcome.attempts).toBe(3);
    expect(target.calls()).toBe(3);
    expect(eventBus.history(EVENTS.RESILIENCE_RETRY)).toHaveLength(2);
  });

  it("gives up immediately on a failure the caller says is not retryable", async () => {
    const service = new ResilienceService({ defaultPolicy: { retry: FAST_RETRY } });
    const target = flaky(5, new Error("400 invalid payload"));

    await expect(
      service.execute("sap:write", target.fn, { isRetryable: () => false }),
    ).rejects.toThrow(/invalid payload/);

    // A rejected payload will not fix itself; retrying it just wastes time.
    expect(target.calls()).toBe(1);
  });

  it("opens the circuit after repeated failures and then fails fast", async () => {
    const eventBus = new EventBus();
    const service = new ResilienceService({
      defaultPolicy: { retry: { maxAttempts: 1 }, breaker: { failureThreshold: 2 } },
      eventBus,
    });

    const boom = async () => {
      throw new Error("down");
    };

    await expect(service.execute("sap:read", boom)).rejects.toThrow();
    await expect(service.execute("sap:read", boom)).rejects.toThrow();

    expect(service.circuit("sap:read")?.state).toBe("open");
    expect(eventBus.history(EVENTS.CIRCUIT_OPENED)).toHaveLength(1);

    // The next call never reaches the dependency at all.
    const never = vi.fn();
    await expect(service.execute("sap:read", never as never)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(never).not.toHaveBeenCalled();
  });

  it("keeps circuits independent per target", async () => {
    const service = new ResilienceService({
      defaultPolicy: { retry: { maxAttempts: 1 }, breaker: { failureThreshold: 1 } },
    });

    await expect(
      service.execute("sap:read", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow();

    // SAP being down must not stop Slack.
    expect(service.circuit("sap:read")?.state).toBe("open");
    expect(service.circuit("slack:post")).toBeUndefined();
    await expect(service.execute("slack:post", async () => "ok")).resolves.toMatchObject({
      result: "ok",
    });
  });

  it("falls back to another target when the primary fails", async () => {
    const eventBus = new EventBus();
    const service = new ResilienceService({
      policies: [
        {
          target: "sap:*",
          retry: { maxAttempts: 1 },
          fallbacks: ["sap-eu:read"],
        },
      ],
      eventBus,
    });

    const outcome = await service.execute(
      "sap:read",
      async () => {
        throw new Error("region down");
      },
      { runFallback: async (key) => `served by ${key}` },
    );

    expect(outcome.result).toBe("served by sap-eu:read");
    expect(outcome.usedFallback).toBe("sap-eu:read");
    expect(eventBus.history(EVENTS.RESILIENCE_FALLBACK)).toHaveLength(1);
  });

  it("uses a fallback even when the primary circuit is already open", async () => {
    const service = new ResilienceService({
      policies: [
        {
          target: "sap:read",
          retry: { maxAttempts: 1 },
          breaker: { failureThreshold: 1 },
          fallbacks: ["sap-eu:read"],
        },
      ],
    });

    const down = async () => {
      throw new Error("down");
    };
    const runFallback = async () => "from eu";

    await service.execute("sap:read", down, { runFallback });
    expect(service.circuit("sap:read")?.state).toBe("open");

    // Circuit open, but the fallback still serves the call.
    const outcome = await service.execute("sap:read", down, { runFallback });
    expect(outcome.result).toBe("from eu");
    expect(outcome.usedFallback).toBe("sap-eu:read");
  });

  it("tries the next fallback when the first also fails", async () => {
    const service = new ResilienceService({
      policies: [{ target: "sap:read", retry: { maxAttempts: 1 }, fallbacks: ["eu", "apac"] }],
    });

    const outcome = await service.execute(
      "sap:read",
      async () => {
        throw new Error("down");
      },
      {
        runFallback: async (key) => {
          if (key === "eu") throw new Error("eu down too");
          return `from ${key}`;
        },
      },
    );

    expect(outcome.usedFallback).toBe("apac");
  });

  it("dead-letters exhausted work and still reports the failure", async () => {
    const eventBus = new EventBus();
    const service = new ResilienceService({
      policies: [{ target: "sap:write", retry: { maxAttempts: 1 }, deadLetter: true }],
      eventBus,
    });

    await expect(
      service.execute(
        "sap:write",
        async () => {
          throw new Error("vendor 500");
        },
        { payload: { invoiceId: "inv_1" }, correlationId: "corr_1" },
      ),
      // Parked is not done — a caller must not read this as success, or it
      // would believe a payment went through when it is sitting in a queue.
    ).rejects.toThrow(/vendor 500/);

    const letters = await service.deadLetters.list({ replayed: false });

    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({
      key: "sap:write",
      error: "vendor 500",
      payload: { invoiceId: "inv_1" },
      correlationId: "corr_1",
    });
    expect(eventBus.history(EVENTS.RESILIENCE_DEAD_LETTERED)).toHaveLength(1);
  });

  it("replays a dead letter and marks it done", async () => {
    const service = new ResilienceService({
      policies: [{ target: "sap:write", retry: { maxAttempts: 1 }, deadLetter: true }],
    });

    await expect(
      service.execute("sap:write", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow();

    const [letter] = await service.deadLetters.list({ replayed: false });
    const run = vi.fn(async () => undefined);

    expect(await service.replay(letter!.id, run)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(await service.deadLetters.list({ replayed: false })).toHaveLength(0);
    expect(await service.deadLetters.list({ replayed: true })).toHaveLength(1);
  });

  it("leaves a letter replayable when the replay itself fails", async () => {
    const store = new InMemoryDeadLetterStore();
    const service = new ResilienceService({
      policies: [{ target: "k", retry: { maxAttempts: 1 }, deadLetter: true }],
      deadLetters: store,
    });

    await expect(
      service.execute("k", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow();

    const [letter] = await store.list({ replayed: false });

    await expect(
      service.replay(letter!.id, async () => {
        throw new Error("replay failed");
      }),
    ).rejects.toThrow(/replay failed/);

    expect(await store.list({ replayed: false })).toHaveLength(1);
  });

  it("returns false when replaying an unknown letter", async () => {
    expect(await new ResilienceService().replay("nope", async () => undefined)).toBe(false);
  });

  it("matches policies by glob, most specific first", async () => {
    const service = new ResilienceService({
      policies: [
        { target: "sap:write", retry: { maxAttempts: 7 } },
        { target: "sap:*", retry: { maxAttempts: 2 } },
      ],
    });

    expect(service.policyFor("sap:write").retry?.maxAttempts).toBe(7);
    expect(service.policyFor("sap:read").retry?.maxAttempts).toBe(2);
    expect(service.policyFor("slack:post").retry).toBeUndefined();
  });

  it("times a call out under the policy", async () => {
    const service = new ResilienceService({
      defaultPolicy: { retry: { maxAttempts: 1 }, timeoutMs: 20 },
    });

    await expect(service.execute("slow", () => new Promise(() => {}))).rejects.toThrow(/timed out/);
  });

  it("closes the circuit again once the dependency recovers", async () => {
    const eventBus = new EventBus();
    const service = new ResilienceService({
      defaultPolicy: {
        retry: { maxAttempts: 1 },
        breaker: { failureThreshold: 1, resetTimeoutMs: 0 },
      },
      eventBus,
    });

    await expect(
      service.execute("sap:read", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow();
    expect(service.circuit("sap:read")?.state).toBe("open");

    // resetTimeoutMs 0 means the next call is a probe; it succeeds.
    await expect(service.execute("sap:read", async () => "back")).resolves.toMatchObject({
      result: "back",
    });

    expect(service.circuit("sap:read")?.state).toBe("closed");
    expect(eventBus.history(EVENTS.CIRCUIT_CLOSED).length).toBeGreaterThan(0);
  });

  it("lets an operator force a circuit closed", async () => {
    const service = new ResilienceService({
      defaultPolicy: { retry: { maxAttempts: 1 }, breaker: { failureThreshold: 1 } },
    });

    await expect(
      service.execute("sap:read", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow();

    service.resetCircuit("sap:read");

    expect(service.circuit("sap:read")?.state).toBe("closed");
  });

  it("reports every circuit for health checks", async () => {
    const service = new ResilienceService({ defaultPolicy: { retry: { maxAttempts: 1 } } });

    await service.execute("a", async () => "ok");
    await service.execute("b", async () => "ok");

    expect(
      service
        .circuits()
        .map((c) => c.key)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("reports its lifecycle", async () => {
    const service = new ResilienceService();

    expect(service.status()).toBe("stopped");
    await service.start();
    expect(service.status()).toBe("running");
    await service.stop();
    expect(service.status()).toBe("stopped");
  });
});
