import { EVENTS } from "@ryvan/common";
import { BaseConnector } from "@ryvan/connector-sdk";
import type { ConnectorOperation, ConnectorService } from "@ryvan/connector-sdk";
import type { EventBus } from "@ryvan/events";
import type { ResilienceService } from "@ryvan/resilience";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";
import type { PlatformConfig } from "./types.js";

/** A vendor that fails in whatever way the test dictates. */
class FlakyConnector extends BaseConnector {
  readonly id = "sap";
  readonly vendor = "sap";
  readonly version = "1.0.0";

  failures = 0;
  calls = 0;
  /** When set, failures look permanent rather than transient. */
  permanent = false;

  protected operations(): ConnectorOperation[] {
    return [{ name: "read" }, { name: "createInvoice", mutates: true }];
  }

  protected async doConnect(): Promise<void> {}

  protected async doExecute(): Promise<unknown> {
    this.calls++;
    if (this.calls <= this.failures) {
      throw new Error(this.permanent ? "400 invalid payload" : "ETIMEDOUT");
    }
    return { ok: true };
  }
}

let running: Awaited<ReturnType<typeof bootstrap>>[] = [];

afterEach(async () => {
  for (const platform of running) await platform.stop();
  running = [];
});

async function boot(resilience?: PlatformConfig["resilience"]) {
  const platform = await bootstrap({
    identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
    models: { defaultModel: "claude-haiku-4-5" },
    resilience,
  });
  running.push(platform);

  const connectors = platform.container.resolve<ConnectorService>("connectors");
  const connector = new FlakyConnector();
  await connectors.register(connector, { id: "sap", vendor: "sap", auth: "api_key" });

  return {
    platform,
    connectors,
    connector,
    resilienceService: platform.container.resolve<ResilienceService>("resilience"),
    events: platform.container.resolve<EventBus>("events"),
  };
}

describe("connector self-healing", () => {
  it("retries a transient vendor failure and succeeds without the caller knowing", async () => {
    const { connectors, connector, events } = await boot({
      defaultPolicy: { retry: { maxAttempts: 3, baseDelayMs: 1, jitter: 0 } },
    });
    connector.failures = 2;

    const result = await connectors.execute("sap", "read");

    expect(result.success).toBe(true);
    expect(connector.calls).toBe(3);
    expect(events.history(EVENTS.RESILIENCE_RETRY)).toHaveLength(2);

    // The caller sees one successful call, not three attempts.
    expect(events.history(EVENTS.CONNECTOR_EXECUTED)).toHaveLength(1);
  });

  it("does not retry a failure the connector classifies as permanent", async () => {
    const { connectors, connector } = await boot({
      defaultPolicy: { retry: { maxAttempts: 3, baseDelayMs: 1 } },
    });
    connector.failures = 5;
    connector.permanent = true;

    const result = await connectors.execute("sap", "read");

    expect(result.success).toBe(false);
    // BaseConnector marks a 400 as non-retryable, so it is attempted once.
    expect(connector.calls).toBe(1);
  });

  it("opens the circuit after repeated failures and stops calling the vendor", async () => {
    const { connectors, connector, resilienceService, events } = await boot({
      defaultPolicy: {
        retry: { maxAttempts: 1 },
        breaker: { failureThreshold: 2, resetTimeoutMs: 10_000 },
      },
    });
    connector.failures = 99;

    await connectors.execute("sap", "read");
    await connectors.execute("sap", "read");

    expect(resilienceService.circuit("connector:sap:read")?.state).toBe("open");
    expect(events.history(EVENTS.CIRCUIT_OPENED)).toHaveLength(1);

    const callsBefore = connector.calls;
    const blocked = await connectors.execute("sap", "read");

    // The vendor is not called at all — that is the point of the breaker.
    expect(connector.calls).toBe(callsBefore);
    expect(blocked.success).toBe(false);
    expect(blocked.code).toBe("RESILIENCE_BLOCKED");
  });

  it("keeps one connector's outage from affecting another operation", async () => {
    const { connectors, connector, resilienceService } = await boot({
      defaultPolicy: { retry: { maxAttempts: 1 }, breaker: { failureThreshold: 1 } },
    });
    connector.failures = 1;

    await connectors.execute("sap", "read");
    expect(resilienceService.circuit("connector:sap:read")?.state).toBe("open");

    // Circuits are keyed per operation, so createInvoice is unaffected.
    const other = await connectors.execute("sap", "createInvoice");
    expect(other.success).toBe(true);
  });

  it("dead-letters a write that cannot be delivered", async () => {
    const { connectors, connector, resilienceService, events } = await boot({
      policies: [
        {
          target: "connector:sap:createInvoice",
          retry: { maxAttempts: 2, baseDelayMs: 1 },
          deadLetter: true,
        },
      ],
    });
    connector.failures = 99;

    const result = await connectors.execute("sap", "createInvoice", { amount: 100 });

    expect(result.success).toBe(false);

    const letters = await resilienceService.deadLetters.list({ replayed: false });
    expect(letters).toHaveLength(1);
    expect(letters[0]?.key).toBe("connector:sap:createInvoice");
    expect(events.history(EVENTS.RESILIENCE_DEAD_LETTERED)).toHaveLength(1);
  });

  it("is resilient by default, with no policy configured at all", async () => {
    const { connectors, connector } = await boot();
    connector.failures = 1;

    // A platform nobody configured still survives a transient blip: the
    // service's built-in retry applies when no policy matches. Being resilient
    // only for teams who remembered to opt in is the wrong default.
    const result = await connectors.execute("sap", "read");

    expect(result.success).toBe(true);
    expect(connector.calls).toBe(2);
  });

  it("still does not retry a permanent failure under the default policy", async () => {
    const { connectors, connector } = await boot();
    connector.failures = 99;
    connector.permanent = true;

    // Resilient-by-default must not mean retrying things that cannot succeed.
    const result = await connectors.execute("sap", "read");

    expect(result.success).toBe(false);
    expect(connector.calls).toBe(1);
  });

  it("registers resilience on the container and starts it", async () => {
    const { platform, resilienceService } = await boot();

    expect(platform.container.has("resilience")).toBe(true);
    expect(resilienceService.status()).toBe("running");
  });
});
