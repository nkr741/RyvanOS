export type ConnectorStatus = "disconnected" | "connecting" | "connected" | "degraded" | "error";

export type ConnectorAuthKind = "oauth2" | "api_key" | "basic" | "certificate" | "none";

export interface ConnectorHealth {
  status: ConnectorStatus;
  /** Round-trip time of the health probe. */
  latencyMs?: number;
  message?: string;
  checkedAt: number;
}

/** One callable capability, e.g. "createInvoice", "listEmployees". */
export interface ConnectorOperation {
  name: string;
  description?: string;
  /** JSON Schema for the operation's input. */
  input?: Record<string, unknown>;
  /** JSON Schema for the operation's output. */
  output?: Record<string, unknown>;
  /** True when the operation changes remote state — used to gate on policy. */
  mutates?: boolean;
  /** Permission a caller needs, e.g. "connector:sap:write". */
  requiredPermission?: string;
}

export interface ConnectorSchema {
  connectorId: string;
  vendor: string;
  version: string;
  operations: ConnectorOperation[];
  /** Event types this connector can emit, if it supports subscriptions. */
  emits?: string[];
}

export interface ConnectorConfig {
  id: string;
  vendor: string;
  auth: ConnectorAuthKind;
  /** Vendor-specific settings — endpoints, tenant ids, regions. */
  settings?: Record<string, unknown>;
  /**
   * Credentials. Never logged or emitted; a secrets backend supplies these at
   * runtime rather than them being written into config.
   */
  credentials?: Record<string, string>;
  timeoutMs?: number;
}

export interface ConnectorCallContext {
  subject?: {
    userId?: string;
    agentId?: string;
    orgId?: string;
    roles?: string[];
  };
  correlationId?: string;
  missionId?: string;
  runId?: string;
  timeoutMs?: number;
}

export interface ConnectorResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** Vendor-native error code, when the vendor supplies one. */
  code?: string;
  latencyMs: number;
  /** True when the failure is worth retrying (timeout, 429, 5xx). */
  retryable?: boolean;
}

/**
 * The contract every integration implements — Oracle, SAP, Workday, Slack,
 * Stripe alike. Products call `execute()` and never learn which vendor is
 * behind it.
 */
export interface Connector {
  readonly id: string;
  readonly vendor: string;
  readonly version: string;

  connect(config: ConnectorConfig): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<ConnectorHealth>;
  schema(): ConnectorSchema;
  execute<T = unknown>(
    operation: string,
    input: Record<string, unknown>,
    context?: ConnectorCallContext,
  ): Promise<ConnectorResult<T>>;
}

/** Optional capability: connectors that can push changes back to the platform. */
export interface SubscribableConnector extends Connector {
  subscribe(
    eventType: string,
    handler: (payload: unknown) => void | Promise<void>,
  ): Promise<{ unsubscribe(): Promise<void> }>;
}

export type ConnectorPolicyEffect = "allow" | "deny" | "require_approval";

/**
 * Port implemented by `@ryvan/policy-engine` and injected by `@ryvan/bootstrap`.
 * Declared here so this package imports no other domain package.
 */
export interface ConnectorPolicyGate {
  enforce(request: {
    action: string;
    resource?: string;
    subject: NonNullable<ConnectorCallContext["subject"]>;
    attributes?: Record<string, unknown>;
  }): Promise<{ effect: ConnectorPolicyEffect; allowed: boolean; reason: string }>;
}

/**
 * Port implemented by `@ryvan/resilience` and injected by `@ryvan/bootstrap`.
 *
 * Declared here so this package imports no other domain package. Without one,
 * calls go straight to the vendor — resilience is opt-in, not assumed.
 */
export interface ResilienceGate {
  run<T>(
    key: string,
    fn: () => Promise<T>,
    options?: {
      isRetryable?: (error: Error) => boolean;
      payload?: Record<string, unknown>;
      correlationId?: string;
      missionId?: string;
    },
  ): Promise<T>;
}

export interface ConnectorServiceOptions {
  policy?: ConnectorPolicyGate;
  /** Retries, circuit breaking, and fallbacks around every connector call. */
  resilience?: ResilienceGate;
  /** How often registered connectors are health-probed. Default 60000ms. */
  healthIntervalMs?: number;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}

export interface ConnectorRegistration {
  connector: Connector;
  config: ConnectorConfig;
  health: ConnectorHealth;
  registeredAt: number;
}
