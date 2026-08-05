import type { AuditService } from "@ryvan/audit";
import type { ConnectorService } from "@ryvan/connector-sdk";
import type { ConsoleSources } from "@ryvan/console";
import type { MissionService } from "@ryvan/mission-engine";
import type { ObservabilityService } from "@ryvan/observability";
import type { PolicyService } from "@ryvan/policy-engine";
import type { ResilienceService } from "@ryvan/resilience";
import type { StorageDriver } from "@ryvan/storage";
import type { WorkflowService } from "@ryvan/workflow-engine";
import type { Service } from "@ryvan/common";

export interface ConsoleSourceDeps {
  missions: MissionService;
  workflows: WorkflowService;
  observability: ObservabilityService;
  policy: PolicyService;
  audit: AuditService;
  resilience: ResilienceService;
  connectors: ConnectorService;
  services: Service[];
  drivers: StorageDriver[];
}

/**
 * Adapts the running platform to what the console reads.
 *
 * The console declares ports rather than importing eight services, so this is
 * where the two meet — the same arrangement as `adapters.ts`, and the reason
 * the console can be tested against fakes without booting anything.
 *
 * Read-only apart from the three actions an operator genuinely needs at 3am:
 * decide an approval, reset a circuit, cancel a mission.
 */
export function consoleSources(deps: ConsoleSourceDeps): ConsoleSources {
  return {
    missions: {
      list: async (filter) =>
        (await deps.missions.list(filter as never)).map((mission) => ({
          id: mission.id,
          type: mission.type,
          name: mission.name,
          goal: mission.goal,
          status: mission.status,
          runId: mission.runId,
          approvalId: mission.approvalId,
          correlationId: mission.correlationId,
          error: mission.error,
          subject: mission.subject,
          createdAt: mission.createdAt,
          completedAt: mission.completedAt,
        })),

      get: async (id) => {
        const mission = await deps.missions.get(id);
        return mission ? { ...mission, result: mission.result } : undefined;
      },

      cancel: async (id) => deps.missions.cancel(id),
    },

    traces: {
      list: async (filter) => deps.observability.traces(filter),
      get: async (traceId) => deps.observability.trace(traceId),
      tree: async (traceId) => deps.observability.tree(traceId),
    },

    workflows: {
      list: async (filter) => deps.workflows.list(filter as never),
      get: async (runId) => deps.workflows.get(runId),
    },

    approvals: {
      pending: async () => deps.policy.approvals.pending(),
      grant: async (id, decidedBy, note) => deps.policy.grantApproval(id, decidedBy, note),
      deny: async (id, decidedBy, note) => deps.policy.denyApproval(id, decidedBy, note),
    },

    audit: {
      // Mapped rather than passed through: the console's shape is deliberately
      // looser than the ledger's, so tightening it would couple the console's
      // release to the audit package's.
      query: async (filter) =>
        (await deps.audit.query(filter)).map((entry) => ({
          id: entry.id,
          sequence: entry.sequence,
          timestamp: entry.timestamp,
          action: entry.action,
          resource: entry.resource,
          outcome: entry.outcome,
          actor: entry.actor as Record<string, unknown>,
          correlationId: entry.correlationId,
        })),

      verify: async () => deps.audit.verify(),
    },

    policies: {
      rules: () =>
        deps.policy.engine.listRules().map((rule) => ({
          id: rule.id,
          name: rule.name,
          effect: rule.effect,
          enabled: rule.enabled,
        })),

      budgets: () =>
        deps.policy.budgets.listLimits().map((limit) => {
          const status = deps.policy.budgets.status(limit.id);
          return {
            id: limit.id,
            limitUsd: limit.limitUsd,
            spentUsd: status.spentUsd,
            period: limit.period,
          };
        }),
    },

    circuits: {
      list: () => deps.resilience.circuits(),
      reset: (key) => deps.resilience.resetCircuit(key),
    },

    deadLetters: {
      list: async (filter) => deps.resilience.deadLetters.list(filter),
    },

    connectors: {
      list: () =>
        deps.connectors.list().map((registration) => ({
          id: registration.connector.id,
          vendor: registration.connector.vendor,
          version: registration.connector.version,
          health: registration.health,
          operations: registration.connector
            .schema()
            .operations.map((operation) => ({ name: operation.name, mutates: operation.mutates })),
        })),
    },

    health: {
      services: () =>
        deps.services.map((service) => ({ name: service.name, status: service.status() })),
      storage: async () =>
        Promise.all(
          deps.drivers.map(async (driver) => {
            const health = await driver.health();
            return {
              kind: health.kind,
              reachable: health.reachable,
              latencyMs: health.latencyMs,
            };
          }),
        ),
    },
  };
}
