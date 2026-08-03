import { ConnectorError, withTimeout } from "@ryvan/common";
import type {
  Connector,
  ConnectorCallContext,
  ConnectorConfig,
  ConnectorHealth,
  ConnectorOperation,
  ConnectorResult,
  ConnectorSchema,
  ConnectorStatus,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Base class for connector implementations.
 *
 * It handles the parts every vendor integration would otherwise re-implement:
 * connection state, operation validation, timeouts, latency measurement, and
 * turning a thrown error into a `ConnectorResult`. Subclasses supply three
 * things — the operations they expose, how to open a connection, and how to
 * perform one call.
 */
export abstract class BaseConnector implements Connector {
  abstract readonly id: string;
  abstract readonly vendor: string;
  abstract readonly version: string;

  protected config?: ConnectorConfig;
  protected state: ConnectorStatus = "disconnected";

  /** Operations this connector exposes. */
  protected abstract operations(): ConnectorOperation[];

  /** Opens the vendor connection. Throw to fail the connect. */
  protected abstract doConnect(config: ConnectorConfig): Promise<void>;

  /** Performs one call. Throw to fail it; the base class shapes the result. */
  protected abstract doExecute(
    operation: ConnectorOperation,
    input: Record<string, unknown>,
    context?: ConnectorCallContext,
  ): Promise<unknown>;

  /** Override for a real probe. The default reports the connection state. */
  protected async doHealth(): Promise<Omit<ConnectorHealth, "checkedAt" | "latencyMs">> {
    return { status: this.state };
  }

  protected async doDisconnect(): Promise<void> {
    // Nothing to release by default.
  }

  async connect(config: ConnectorConfig): Promise<void> {
    this.state = "connecting";

    try {
      await this.doConnect(config);
      this.config = config;
      this.state = "connected";
    } catch (err) {
      this.state = "error";
      throw new ConnectorError(this.id, err instanceof Error ? err.message : String(err));
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.doDisconnect();
    } finally {
      this.state = "disconnected";
      this.config = undefined;
    }
  }

  async health(): Promise<ConnectorHealth> {
    const startedAt = Date.now();

    try {
      const health = await this.doHealth();
      return { ...health, latencyMs: Date.now() - startedAt, checkedAt: Date.now() };
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
      };
    }
  }

  schema(): ConnectorSchema {
    return {
      connectorId: this.id,
      vendor: this.vendor,
      version: this.version,
      operations: this.operations(),
    };
  }

  async execute<T = unknown>(
    operationName: string,
    input: Record<string, unknown>,
    context?: ConnectorCallContext,
  ): Promise<ConnectorResult<T>> {
    const startedAt = Date.now();

    const operation = this.operations().find((candidate) => candidate.name === operationName);
    if (!operation) {
      return {
        success: false,
        error: `Unknown operation "${operationName}"`,
        code: "UNKNOWN_OPERATION",
        latencyMs: Date.now() - startedAt,
        retryable: false,
      };
    }

    if (this.state !== "connected") {
      return {
        success: false,
        error: `Connector "${this.id}" is ${this.state}`,
        code: "NOT_CONNECTED",
        latencyMs: Date.now() - startedAt,
        retryable: true,
      };
    }

    const timeoutMs = context?.timeoutMs ?? this.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const data = (await withTimeout(
        Promise.resolve(this.doExecute(operation, input, context)),
        timeoutMs,
        `connector ${this.id}.${operationName}`,
      )) as T;

      return { success: true, data, latencyMs: Date.now() - startedAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: message,
        latencyMs: Date.now() - startedAt,
        retryable: this.isRetryable(err),
      };
    }
  }

  /**
   * Whether a failure is worth another attempt. Timeouts and transient
   * transport errors are; a rejected payload is not. Override for vendors that
   * signal this precisely.
   */
  protected isRetryable(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error);
    return (
      message.includes("timed out") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("429") ||
      message.includes("503")
    );
  }
}
