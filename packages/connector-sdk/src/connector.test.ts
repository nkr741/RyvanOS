import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it } from "vitest";
import { BaseConnector } from "./base-connector.js";
import { ConnectorService } from "./connector-service.js";
import type {
  ConnectorConfig,
  ConnectorOperation,
  ConnectorPolicyGate,
  ConnectorStatus,
} from "./types.js";

/** A stand-in vendor whose behaviour each test dictates. */
class TestConnector extends BaseConnector {
  readonly id = "test";
  readonly vendor = "test-vendor";
  readonly version = "1.0.0";

  connectShouldFail = false;
  executeImpl: (input: Record<string, unknown>) => unknown = (input) => ({ echoed: input });
  reportedStatus?: ConnectorStatus;
  calls: string[] = [];

  protected operations(): ConnectorOperation[] {
    return [
      { name: "read", description: "Reads a record" },
      { name: "write", description: "Writes a record", mutates: true },
    ];
  }

  protected async doConnect(): Promise<void> {
    if (this.connectShouldFail) throw new Error("credentials rejected");
  }

  protected async doExecute(operation: ConnectorOperation, input: Record<string, unknown>) {
    this.calls.push(operation.name);
    return this.executeImpl(input);
  }

  protected override async doHealth() {
    return { status: this.reportedStatus ?? this.state };
  }
}

const config: ConnectorConfig = { id: "test", vendor: "test-vendor", auth: "api_key" };

class FakeGate implements ConnectorPolicyGate {
  allow = true;
  reason = "not permitted";
  seen: unknown[] = [];

  async enforce(request: Parameters<ConnectorPolicyGate["enforce"]>[0]) {
    this.seen.push(request);
    return this.allow
      ? { effect: "allow" as const, allowed: true, reason: "ok" }
      : { effect: "deny" as const, allowed: false, reason: this.reason };
  }
}

async function setup(policy?: ConnectorPolicyGate) {
  const eventBus = new EventBus();
  const service = new ConnectorService({ eventBus, policy });
  const connector = new TestConnector();
  await service.register(connector, config);
  return { service, connector, eventBus };
}

describe("BaseConnector", () => {
  it("refuses to execute before connecting", async () => {
    const connector = new TestConnector();

    const result = await connector.execute("read", {});

    expect(result.success).toBe(false);
    expect(result.code).toBe("NOT_CONNECTED");
    expect(result.retryable).toBe(true);
  });

  it("rejects an unknown operation", async () => {
    const connector = new TestConnector();
    await connector.connect(config);

    expect((await connector.execute("teleport", {})).code).toBe("UNKNOWN_OPERATION");
  });

  it("wraps a connect failure in a ConnectorError", async () => {
    const connector = new TestConnector();
    connector.connectShouldFail = true;

    await expect(connector.connect(config)).rejects.toThrow(/credentials rejected/);
    expect((await connector.health()).status).toBe("error");
  });

  it("returns the handler result with a latency measurement", async () => {
    const connector = new TestConnector();
    await connector.connect(config);

    const result = await connector.execute("read", { id: 1 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ echoed: { id: 1 } });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("turns a thrown error into a failed result rather than throwing", async () => {
    const connector = new TestConnector();
    await connector.connect(config);
    connector.executeImpl = () => {
      throw new Error("vendor said no");
    };

    const result = await connector.execute("read", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("vendor said no");
    expect(result.retryable).toBe(false);
  });

  it("marks timeouts and transient errors retryable", async () => {
    const connector = new TestConnector();
    await connector.connect({ ...config, timeoutMs: 20 });
    connector.executeImpl = () => new Promise(() => {});

    const result = await connector.execute("read", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
    expect(result.retryable).toBe(true);
  });

  it("publishes its schema", async () => {
    const schema = new TestConnector().schema();

    expect(schema.connectorId).toBe("test");
    expect(schema.operations.map((operation) => operation.name)).toEqual(["read", "write"]);
  });
});

describe("ConnectorService", () => {
  it("registers, connects, and emits", async () => {
    const { service, eventBus } = await setup();

    expect(service.list()).toHaveLength(1);
    expect(service.get("test").vendor).toBe("test-vendor");
    expect(eventBus.history(EVENTS.CONNECTOR_REGISTERED)).toHaveLength(1);
    expect(eventBus.history(EVENTS.CONNECTOR_CONNECTED)).toHaveLength(1);
  });

  it("refuses a duplicate registration", async () => {
    const { service } = await setup();

    await expect(service.register(new TestConnector(), config)).rejects.toThrow(
      /already registered/,
    );
  });

  it("throws for an unknown connector", async () => {
    const { service } = await setup();

    expect(() => service.get("ghost")).toThrow();
    await expect(service.execute("ghost", "read")).rejects.toThrow();
  });

  it("executes and emits on success", async () => {
    const { service, eventBus } = await setup();

    const result = await service.execute("test", "read", { id: 7 });

    expect(result.success).toBe(true);
    expect(eventBus.history(EVENTS.CONNECTOR_EXECUTED)).toHaveLength(1);
  });

  it("blocks a mutating operation the policy denies, without calling the vendor", async () => {
    const policy = new FakeGate();
    policy.allow = false;
    const { service, connector, eventBus } = await setup(policy);

    const result = await service.execute("test", "write", { id: 7 });

    expect(result.success).toBe(false);
    expect(result.code).toBe("POLICY_BLOCKED");
    expect(connector.calls).toHaveLength(0);
    expect(eventBus.history(EVENTS.CONNECTOR_ERROR)).toHaveLength(1);
  });

  it("does not consult policy for a read operation", async () => {
    const policy = new FakeGate();
    const { service } = await setup(policy);

    await service.execute("test", "read", {});

    expect(policy.seen).toHaveLength(0);
  });

  it("consults policy for a mutating operation", async () => {
    const policy = new FakeGate();
    const { service, connector } = await setup(policy);

    await service.execute("test", "write", {}, { subject: { userId: "u1" } });

    expect(policy.seen[0]).toMatchObject({
      action: "connector:test:write",
      resource: "connector:test",
    });
    expect(connector.calls).toEqual(["write"]);
  });

  it("emits when health changes", async () => {
    const { service, connector, eventBus } = await setup();

    connector.reportedStatus = "degraded";
    await service.checkHealth();

    const changes = eventBus.history(EVENTS.CONNECTOR_HEALTH_CHANGED);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.data).toMatchObject({ from: "connected", to: "degraded" });

    // Unchanged on the next probe — no repeat event.
    await service.checkHealth();
    expect(eventBus.history(EVENTS.CONNECTOR_HEALTH_CHANGED)).toHaveLength(1);
  });

  it("disconnects everything on stop", async () => {
    const { service, connector, eventBus } = await setup();

    await service.start();
    await service.stop();

    expect((await connector.health()).status).toBe("disconnected");
    expect(eventBus.history(EVENTS.CONNECTOR_DISCONNECTED).length).toBeGreaterThan(0);
  });

  it("unregisters a connector", async () => {
    const { service } = await setup();

    await service.unregister("test");

    expect(service.list()).toHaveLength(0);
  });
});
