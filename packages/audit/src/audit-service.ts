import { EVENTS } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import type { EventSubscription, IEventBus, RyvanEvent } from "@ryvan/events";
import { AuditLedger } from "./ledger.js";
import type {
  AppendAuditInput,
  AuditEntry,
  AuditFilter,
  AuditMapper,
  AuditOutcome,
  AuditServiceOptions,
  AuditVerification,
} from "./types.js";

/**
 * Events recorded by default: everything that decides, spends, or acts on an
 * external system. Read-only chatter (memory reads, model calls) is left out —
 * an audit log nobody can read is an audit log nobody reads.
 */
export const DEFAULT_CAPTURE_EVENTS: string[] = [
  EVENTS.POLICY_DENIED,
  EVENTS.APPROVAL_REQUESTED,
  EVENTS.APPROVAL_GRANTED,
  EVENTS.APPROVAL_DENIED,
  EVENTS.COST_EXCEEDED,
  EVENTS.MISSION_CREATED,
  EVENTS.MISSION_AWAITING_APPROVAL,
  EVENTS.MISSION_COMPLETED,
  EVENTS.MISSION_FAILED,
  EVENTS.MISSION_CANCELLED,
  EVENTS.WORKFLOW_COMPLETED,
  EVENTS.WORKFLOW_FAILED,
  EVENTS.WORKFLOW_COMPENSATED,
  EVENTS.WORKFLOW_CANCELLED,
  EVENTS.CONNECTOR_EXECUTED,
  EVENTS.CONNECTOR_ERROR,
  EVENTS.TOOL_ERROR,
  EVENTS.IDENTITY_USER_CREATED,
  EVENTS.IDENTITY_AUTHORIZATION_DENIED,
  EVENTS.IDENTITY_ORG_CREATED,
];

const FAILURE_HINTS = ["failed", "error", "cancelled", "exceeded"];
const DENIED_HINTS = ["denied", "rejected"];
const PENDING_HINTS = ["requested", "awaiting", "created"];

/** Infers an outcome from the event name, since events don't carry one. */
function inferOutcome(type: string): AuditOutcome {
  if (DENIED_HINTS.some((hint) => type.includes(hint))) return "denied";
  if (FAILURE_HINTS.some((hint) => type.includes(hint))) return "failure";
  if (PENDING_HINTS.some((hint) => type.includes(hint))) return "pending";
  return "success";
}

/**
 * Turns a platform event into an audit entry. Actor fields are lifted from the
 * event's `subject` when present, which is the shape policy and workflow use.
 */
export const defaultAuditMapper: AuditMapper = (type, data, correlationId) => {
  const subject = (data.subject ?? {}) as Record<string, unknown>;

  const resource =
    (data.resource as string | undefined) ??
    (data.missionId ? `mission:${data.missionId}` : undefined) ??
    (data.runId ? `workflow:${data.runId}` : undefined) ??
    (data.connectorId ? `connector:${data.connectorId}` : undefined);

  return {
    action: type,
    resource,
    outcome: inferOutcome(type),
    correlationId,
    actor: {
      userId: subject.userId as string | undefined,
      agentId: subject.agentId as string | undefined,
      orgId: subject.orgId as string | undefined,
      projectId: subject.projectId as string | undefined,
      kind: subject.agentId ? "agent" : subject.userId ? "user" : "system",
    },
    details: data,
  };
};

/**
 * Records what the platform did.
 *
 * It subscribes to the event bus rather than requiring callers to log
 * explicitly — an audit trail that depends on every author remembering to call
 * it is one that has gaps. `record()` remains available for anything the bus
 * does not carry.
 */
export class AuditService implements Service {
  readonly name = "audit";

  readonly ledger: AuditLedger;

  private state: Status = "stopped";
  private readonly captureEvents: string[];
  private readonly mapper: AuditMapper;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly subscriptions: EventSubscription[] = [];

  constructor(options: AuditServiceOptions = {}) {
    this.ledger = new AuditLedger(options.store);
    this.captureEvents = options.captureEvents ?? DEFAULT_CAPTURE_EVENTS;
    this.mapper = options.mapper ?? defaultAuditMapper;
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  async start(): Promise<void> {
    this.state = "starting";

    if (this.eventBus) {
      for (const type of this.captureEvents) {
        this.subscriptions.push(
          this.eventBus.on(type, (event: RyvanEvent) => {
            void this.capture(type, event);
          }),
        );
      }
    }

    this.state = "running";
    this.logger?.info("Audit service started", { captured: this.captureEvents.length });
  }

  async stop(): Promise<void> {
    this.state = "stopping";

    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.length = 0;

    this.state = "stopped";
    this.logger?.info("Audit service stopped");
  }

  status(): Status {
    return this.state;
  }

  /** Records an entry directly. */
  async record(input: AppendAuditInput): Promise<AuditEntry> {
    return this.ledger.append(input);
  }

  async query(filter?: AuditFilter): Promise<AuditEntry[]> {
    return this.ledger.query(filter);
  }

  /** Confirms the chain has not been altered since it was written. */
  async verify(): Promise<AuditVerification> {
    return this.ledger.verify();
  }

  private async capture(type: string, event: RyvanEvent): Promise<void> {
    // An event handler can still be in flight when the service stops, and by
    // the time it lands the storage driver may be disconnected. Dropping it is
    // correct: shutdown already unsubscribed, so this event is past the ledger's
    // lifetime.
    if (this.state !== "running") return;

    try {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const input = this.mapper(type, data, event.correlationId);
      if (!input) return;

      await this.ledger.append(input);
    } catch (err) {
      // A failing audit write must never take down the thing being audited.
      this.logger?.error("Failed to record audit entry", {
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
