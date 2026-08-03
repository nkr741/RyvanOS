import { EVENTS, NotFoundError, ValidationError, generateId } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import type { EventSubscription, IEventBus, RyvanEvent } from "@ryvan/events";
import { InMemoryMissionStore } from "./store.js";
import { TemplateMissionPlanner } from "./planner.js";
import type {
  LaunchMissionInput,
  Mission,
  MissionPlanner,
  MissionServiceOptions,
  MissionStatus,
  MissionStore,
  PolicyGate,
  WorkflowRunHandle,
  WorkflowRunner,
} from "./types.js";

const DEFAULT_POLICY_ACTION = "mission:execute";
const DEFAULT_APPROVAL_POLL_MS = 5_000;

const TERMINAL_STATUSES = new Set<MissionStatus>(["completed", "failed", "cancelled"]);

interface WorkflowFinishedEvent {
  runId?: string;
  missionId?: string;
  error?: string;
}

/**
 * Runs missions: the unit of intent that sits above a workflow.
 *
 * A mission is checked against policy, planned into a workflow, executed, and
 * finalised — in that order, always. Products describe *what* they want done;
 * this decides whether it may proceed and what carries it out.
 *
 * The workflow engine and policy engine are reached through ports
 * (`WorkflowRunner`, `PolicyGate`) supplied by `@ryvan/bootstrap`, so this
 * package imports no other domain package.
 */
export class MissionService implements Service {
  readonly name = "mission";

  private state: Status = "stopped";
  private readonly store: MissionStore;
  private readonly planner: MissionPlanner;
  private readonly workflows?: WorkflowRunner;
  private readonly policy?: PolicyGate;
  private readonly policyAction: string;
  private readonly approvalPollIntervalMs: number;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly subscriptions: EventSubscription[] = [];
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: MissionServiceOptions = {}) {
    this.store = options.store ?? new InMemoryMissionStore();
    this.planner = options.planner ?? new TemplateMissionPlanner();
    this.workflows = options.workflows;
    this.policy = options.policy;
    this.policyAction = options.policyAction ?? DEFAULT_POLICY_ACTION;
    this.approvalPollIntervalMs = options.approvalPollIntervalMs ?? DEFAULT_APPROVAL_POLL_MS;
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  async start(): Promise<void> {
    this.state = "starting";

    if (this.eventBus) {
      for (const type of [
        EVENTS.WORKFLOW_COMPLETED,
        EVENTS.WORKFLOW_FAILED,
        EVENTS.WORKFLOW_CANCELLED,
      ]) {
        this.subscriptions.push(
          this.eventBus.on(type, (event: RyvanEvent) => {
            void this.onWorkflowFinished(event.data as WorkflowFinishedEvent);
          }),
        );
      }
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.approvalPollIntervalMs);
    this.timer.unref?.();

    this.state = "running";
    this.logger?.info("Mission service started");
  }

  async stop(): Promise<void> {
    this.state = "stopping";

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.length = 0;

    this.state = "stopped";
    this.logger?.info("Mission service stopped");
  }

  status(): Status {
    return this.state;
  }

  /**
   * Creates a mission and carries it as far as it can go in one call: policy
   * check, plan, workflow start. A mission blocked on approval comes back
   * `awaiting_approval` rather than throwing.
   */
  async launch(input: LaunchMissionInput): Promise<Mission> {
    if (!input.type) {
      throw new ValidationError("type", "must not be empty");
    }

    const mission: Mission = {
      id: generateId("msn"),
      type: input.type,
      name: input.name ?? input.type,
      goal: input.goal ?? input.type,
      status: "created",
      input: input.input ?? {},
      subject: input.subject,
      correlationId: input.correlationId ?? generateId("corr"),
      metadata: input.metadata,
      createdAt: Date.now(),
    };

    await this.store.save(mission);
    await this.emit(EVENTS.MISSION_CREATED, mission, { type: mission.type, goal: mission.goal });

    const cleared = await this.checkPolicy(mission, input.estimatedCostUsd);
    if (!cleared) {
      return (await this.store.get(mission.id)) ?? mission;
    }

    return this.execute(mission);
  }

  async get(missionId: string): Promise<Mission | undefined> {
    return this.store.get(missionId);
  }

  async list(filter?: Parameters<MissionStore["list"]>[0]): Promise<Mission[]> {
    return this.store.list(filter);
  }

  async cancel(missionId: string): Promise<Mission> {
    const mission = await this.require(missionId);

    if (TERMINAL_STATUSES.has(mission.status)) {
      return mission;
    }

    if (mission.runId && this.workflows) {
      try {
        await this.workflows.cancel(mission.runId);
      } catch (err) {
        this.logger?.warn("Failed to cancel workflow run for mission", {
          missionId,
          runId: mission.runId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    mission.status = "cancelled";
    mission.completedAt = Date.now();
    await this.store.save(mission);
    await this.emit(EVENTS.MISSION_CANCELLED, mission, {});

    return mission;
  }

  /**
   * Re-checks every mission blocked on an approval and advances the ones that
   * have since been decided. Exposed so callers can drive it deterministically
   * instead of waiting for the poll interval.
   */
  async tick(): Promise<Mission[]> {
    if (!this.policy) return [];

    const blocked = await this.store.list({ status: "awaiting_approval" });
    const advanced: Mission[] = [];

    for (const mission of blocked) {
      if (!mission.approvalId) continue;

      try {
        const verdict = await this.policy.checkApproval(mission.approvalId);

        if (verdict === "granted") {
          advanced.push(await this.execute(mission));
        } else if (verdict === "denied" || verdict === "expired") {
          advanced.push(await this.fail(mission, `approval ${verdict}`));
        }
      } catch (err) {
        this.logger?.error("Failed to check mission approval", {
          missionId: mission.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return advanced;
  }

  // --- internals ------------------------------------------------------------

  /** Returns true when the mission may proceed. Records the outcome either way. */
  private async checkPolicy(mission: Mission, estimatedCostUsd?: number): Promise<boolean> {
    if (!this.policy) return true;

    const verdict = await this.policy.enforce({
      action: this.policyAction,
      resource: `mission:${mission.type}`,
      subject: mission.subject ?? {},
      attributes: { missionId: mission.id, ...mission.metadata },
      estimatedCostUsd,
    });

    if (verdict.effect === "deny") {
      await this.fail(mission, `policy denied: ${verdict.reason}`);
      return false;
    }

    if (verdict.effect === "require_approval") {
      mission.status = "awaiting_approval";
      mission.approvalId = verdict.approvalId;
      await this.store.save(mission);
      await this.emit(EVENTS.MISSION_AWAITING_APPROVAL, mission, {
        approvalId: verdict.approvalId,
        reason: verdict.reason,
      });
      this.logger?.info("Mission awaiting approval", {
        missionId: mission.id,
        approvalId: verdict.approvalId,
      });
      return false;
    }

    return true;
  }

  /** Plans the mission and hands it to the workflow engine. */
  private async execute(mission: Mission): Promise<Mission> {
    if (!this.workflows) {
      return this.fail(mission, "no workflow runner is configured");
    }

    mission.status = "planning";
    mission.startedAt ??= Date.now();
    await this.store.save(mission);

    let plan;
    try {
      plan = await this.planner.plan(mission);
    } catch (err) {
      return this.fail(mission, `planning failed: ${err instanceof Error ? err.message : err}`);
    }

    mission.workflowId = plan.workflowId;
    mission.workflowVersion = plan.workflowVersion;
    await this.store.save(mission);
    await this.emit(EVENTS.MISSION_PLANNED, mission, {
      workflowId: plan.workflowId,
      rationale: plan.rationale,
    });

    mission.status = "running";
    await this.store.save(mission);
    await this.emit(EVENTS.MISSION_STARTED, mission, { workflowId: plan.workflowId });

    let handle: WorkflowRunHandle;
    try {
      handle = await this.workflows.start(plan.workflowId, {
        input: plan.input,
        subject: mission.subject,
        correlationId: mission.correlationId,
        missionId: mission.id,
        version: plan.workflowVersion,
      });
    } catch (err) {
      return this.fail(
        mission,
        `workflow start failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    mission.runId = handle.id;
    await this.store.save(mission);

    return this.settle(mission, handle);
  }

  /** Applies a workflow outcome to the mission, if that outcome is terminal. */
  private async settle(mission: Mission, handle: WorkflowRunHandle): Promise<Mission> {
    switch (handle.status) {
      case "completed":
        mission.status = "completed";
        mission.result = handle.outputs;
        mission.completedAt = Date.now();
        await this.store.save(mission);
        await this.emit(EVENTS.MISSION_COMPLETED, mission, { runId: handle.id });
        this.logger?.info("Mission completed", { missionId: mission.id });
        return mission;

      case "failed":
      case "compensated":
        return this.fail(mission, handle.error ?? "workflow failed");

      case "cancelled":
        mission.status = "cancelled";
        mission.completedAt = Date.now();
        await this.store.save(mission);
        await this.emit(EVENTS.MISSION_CANCELLED, mission, { runId: handle.id });
        return mission;

      default:
        // Still running or suspended — the workflow event will finish this off.
        return mission;
    }
  }

  /**
   * Reacts to a workflow finishing. The workflow engine may resolve a run long
   * after `launch()` returned — a suspended approval or schedule step — so this
   * is how those missions reach a terminal state.
   */
  private async onWorkflowFinished(data: WorkflowFinishedEvent): Promise<void> {
    if (!data?.runId) return;

    const mission = data.missionId
      ? await this.store.get(data.missionId)
      : (await this.store.list({ runId: data.runId }))[0];

    if (!mission || TERMINAL_STATUSES.has(mission.status)) return;

    if (!this.workflows) {
      await this.fail(mission, data.error ?? "workflow finished without a runner configured");
      return;
    }

    const handle = await this.workflows.get(data.runId);
    if (!handle) return;

    await this.settle(mission, handle);
  }

  private async fail(mission: Mission, error: string): Promise<Mission> {
    mission.status = "failed";
    mission.error = error;
    mission.completedAt = Date.now();
    await this.store.save(mission);
    await this.emit(EVENTS.MISSION_FAILED, mission, { error });
    this.logger?.warn("Mission failed", { missionId: mission.id, error });
    return mission;
  }

  private async require(missionId: string): Promise<Mission> {
    const mission = await this.store.get(missionId);
    if (!mission) {
      throw new NotFoundError("Mission", missionId);
    }
    return mission;
  }

  private async emit(type: string, mission: Mission, data: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit(
      type,
      { ...data, missionId: mission.id, status: mission.status },
      { source: this.name, correlationId: mission.correlationId },
    );
  }
}
