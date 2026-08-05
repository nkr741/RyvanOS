import { EVENTS, NotFoundError, ValidationError } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import { scopedEmitter } from "@ryvan/events";
import type { ScopedEmitter } from "@ryvan/events";
import type {
  Connector,
  ConnectorCallContext,
  ConnectorConfig,
  ConnectorHealth,
  ConnectorPolicyGate,
  ConnectorRegistration,
  ConnectorResult,
  ConnectorSchema,
  ConnectorServiceOptions,
  ResilienceGate,
} from "./types.js";

const DEFAULT_HEALTH_INTERVAL_MS = 60_000;

/**
 * Carries a retryable connector failure as a throw, so the resilience gate can
 * see it. Never escapes this module — `runProtected` unwraps it either way.
 */
class RetryableConnectorFailure extends Error {
  constructor(readonly result: ConnectorResult<unknown>) {
    super(result.error ?? "retryable connector failure");
    this.name = "RetryableConnectorFailure";
  }
}

/**
 * Registry and call surface for connectors.
 *
 * Every call goes through here rather than to a connector directly, which is
 * what makes integrations governable: one place enforces policy on mutating
 * operations, records the call on the event bus, and tracks health. Adding
 * Salesforce should mean writing a `Connector`, not writing an integration.
 *
 * This package ships no vendor implementations on purpose — the contract is
 * the reusable part.
 */
export class ConnectorService implements Service {
  readonly name = "connectors";

  private state: Status = "stopped";
  private readonly registrations = new Map<string, ConnectorRegistration>();
  private readonly policy?: ConnectorPolicyGate;
  private readonly resilience?: ResilienceGate;
  private readonly healthIntervalMs: number;
  private readonly logger?: ILogger;
  private readonly emitEvent: ScopedEmitter;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: ConnectorServiceOptions = {}) {
    this.policy = options.policy;
    this.resilience = options.resilience;
    this.healthIntervalMs = options.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS;
    this.logger = options.logger;
    this.emitEvent = scopedEmitter("connectors", options.eventBus);
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.timer = setInterval(() => {
      void this.checkHealth();
    }, this.healthIntervalMs);
    this.timer.unref?.();
    this.state = "running";
    this.logger?.info("Connector service started", { connectors: this.registrations.size });
  }

  async stop(): Promise<void> {
    this.state = "stopping";

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    for (const registration of this.registrations.values()) {
      try {
        await registration.connector.disconnect();
        await this.emitEvent(EVENTS.CONNECTOR_DISCONNECTED, {
          connectorId: registration.connector.id,
        });
      } catch (err) {
        this.logger?.warn("Failed to disconnect connector", {
          connectorId: registration.connector.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.state = "stopped";
    this.logger?.info("Connector service stopped");
  }

  status(): Status {
    return this.state;
  }

  /** Registers a connector and opens its connection. */
  async register(connector: Connector, config: ConnectorConfig): Promise<void> {
    if (!connector?.id) {
      throw new ValidationError("connector.id", "must not be empty");
    }
    if (this.registrations.has(connector.id)) {
      throw new ValidationError("connector.id", `"${connector.id}" is already registered`);
    }

    await connector.connect(config);
    const health = await connector.health();

    this.registrations.set(connector.id, {
      connector,
      config,
      health,
      registeredAt: Date.now(),
    });

    await this.emitEvent(EVENTS.CONNECTOR_REGISTERED, {
      connectorId: connector.id,
      vendor: connector.vendor,
      version: connector.version,
    });
    await this.emitEvent(EVENTS.CONNECTOR_CONNECTED, { connectorId: connector.id });

    this.logger?.info("Connector registered", {
      connectorId: connector.id,
      vendor: connector.vendor,
    });
  }

  async unregister(connectorId: string): Promise<void> {
    const registration = this.registrations.get(connectorId);
    if (!registration) return;

    await registration.connector.disconnect();
    this.registrations.delete(connectorId);
    await this.emitEvent(EVENTS.CONNECTOR_DISCONNECTED, { connectorId });
  }

  get(connectorId: string): Connector {
    const registration = this.registrations.get(connectorId);
    if (!registration) {
      throw new NotFoundError("Connector", connectorId);
    }
    return registration.connector;
  }

  list(): ConnectorRegistration[] {
    return Array.from(this.registrations.values());
  }

  schemas(): ConnectorSchema[] {
    return this.list().map((registration) => registration.connector.schema());
  }

  /**
   * Calls a connector operation.
   *
   * Mutating operations are checked against policy first, so a denied write is
   * never sent to the vendor. Read operations skip the check — the volume is
   * high and the risk is not.
   */
  async execute<T = unknown>(
    connectorId: string,
    operationName: string,
    input: Record<string, unknown> = {},
    context?: ConnectorCallContext,
  ): Promise<ConnectorResult<T>> {
    const registration = this.registrations.get(connectorId);
    if (!registration) {
      throw new NotFoundError("Connector", connectorId);
    }

    const { connector } = registration;
    const operation = connector
      .schema()
      .operations.find((candidate) => candidate.name === operationName);

    if (operation?.mutates && this.policy) {
      const verdict = await this.policy.enforce({
        action: `connector:${connectorId}:${operationName}`,
        resource: `connector:${connectorId}`,
        subject: context?.subject ?? {},
        attributes: {
          operation: operationName,
          requiredPermission: operation.requiredPermission,
          missionId: context?.missionId,
          runId: context?.runId,
        },
      });

      if (!verdict.allowed) {
        await this.emitEvent(EVENTS.CONNECTOR_ERROR, {
          connectorId,
          operation: operationName,
          error: verdict.reason,
          effect: verdict.effect,
        });

        return {
          success: false,
          error: `Policy ${verdict.effect}: ${verdict.reason}`,
          code: "POLICY_BLOCKED",
          latencyMs: 0,
          retryable: false,
        };
      }
    }

    const result = await this.runProtected(connectorId, operationName, () =>
      connector.execute<T>(operationName, input, context),
    );

    await this.emitEvent(
      result.success ? EVENTS.CONNECTOR_EXECUTED : EVENTS.CONNECTOR_ERROR,
      {
        connectorId,
        operation: operationName,
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
        missionId: context?.missionId,
        runId: context?.runId,
        subject: context?.subject,
      },
      { correlationId: context?.correlationId },
    );

    return result;
  }

  /**
   * Runs a connector call under the resilience gate, if one is configured.
   *
   * `BaseConnector` reports failure as a result rather than throwing, but
   * retry and circuit-breaking key on thrown errors. So a *retryable* failure
   * is briefly turned into a throw, and turned back into a result once the
   * attempts are exhausted — the caller's contract is unchanged either way.
   * A non-retryable failure is returned as-is and never counts against the
   * circuit, since a rejected payload says nothing about the vendor's health.
   */
  private async runProtected<T>(
    connectorId: string,
    operationName: string,
    call: () => Promise<ConnectorResult<T>>,
  ): Promise<ConnectorResult<T>> {
    if (!this.resilience) return call();

    try {
      return await this.resilience.run(
        `connector:${connectorId}:${operationName}`,
        async () => {
          const result = await call();
          if (!result.success && result.retryable) {
            throw new RetryableConnectorFailure(result as ConnectorResult<unknown>);
          }
          return result;
        },
        { isRetryable: (error) => error instanceof RetryableConnectorFailure },
      );
    } catch (err) {
      if (err instanceof RetryableConnectorFailure) {
        return err.result as ConnectorResult<T>;
      }

      // A circuit-open rejection, or anything else the gate raised.
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        code: "RESILIENCE_BLOCKED",
        latencyMs: 0,
        retryable: true,
      };
    }
  }

  /** Probes every connector and emits on any status change. */
  async checkHealth(): Promise<Record<string, ConnectorHealth>> {
    const results: Record<string, ConnectorHealth> = {};

    for (const registration of this.registrations.values()) {
      const previous = registration.health.status;

      try {
        registration.health = await registration.connector.health();
      } catch (err) {
        registration.health = {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
          checkedAt: Date.now(),
        };
      }

      results[registration.connector.id] = registration.health;

      if (registration.health.status !== previous) {
        await this.emitEvent(EVENTS.CONNECTOR_HEALTH_CHANGED, {
          connectorId: registration.connector.id,
          from: previous,
          to: registration.health.status,
          message: registration.health.message,
        });
        this.logger?.warn("Connector health changed", {
          connectorId: registration.connector.id,
          from: previous,
          to: registration.health.status,
        });
      }
    }

    return results;
  }
}
