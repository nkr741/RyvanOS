import type { ILogger, Service, Status } from "@ryvan/common";
import type { EventSubscription, IEventBus, RyvanEvent } from "@ryvan/events";
import { WorkflowExecutor } from "./executor.js";
import { WorkflowRegistry } from "./registry.js";
import type {
  StartRunOptions,
  StepHandler,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowServiceOptions,
} from "./types.js";

const DEFAULT_RESUME_INTERVAL_MS = 1_000;

/**
 * Service facade over the registry and executor.
 *
 * Beyond wiring, it does two things the executor cannot do alone: it ticks
 * suspended runs so schedule delays and granted approvals actually resume, and
 * it bridges the event bus so `event` steps wake when their event fires.
 */
export class WorkflowService implements Service {
  readonly name = "workflow";

  readonly registry: WorkflowRegistry;
  readonly executor: WorkflowExecutor;

  private state: Status = "stopped";
  private readonly resumeIntervalMs: number;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly subscriptions = new Map<string, EventSubscription>();
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(options: WorkflowServiceOptions = {}) {
    this.logger = options.logger;
    this.eventBus = options.eventBus;
    this.resumeIntervalMs = options.resumeIntervalMs ?? DEFAULT_RESUME_INTERVAL_MS;

    this.registry = new WorkflowRegistry();
    this.executor = new WorkflowExecutor(this.registry, options);

    for (const definition of options.definitions ?? []) {
      this.register(definition);
    }
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.timer = setInterval(() => {
      void this.tick();
    }, this.resumeIntervalMs);
    this.timer.unref?.();
    this.state = "running";
    this.logger?.info("Workflow service started", {
      definitions: this.registry.list().length,
    });
  }

  async stop(): Promise<void> {
    this.state = "stopping";

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();

    this.state = "stopped";
    this.logger?.info("Workflow service stopped");
  }

  status(): Status {
    return this.state;
  }

  register(definition: WorkflowDefinition): void {
    this.registry.register(definition);
    this.subscribeEventSteps(definition);
  }

  registerHandler(name: string, handler: StepHandler): void {
    this.registry.registerHandler(name, handler);
  }

  async run(
    definitionId: string,
    options: StartRunOptions & { version?: string } = {},
  ): Promise<WorkflowRun> {
    return this.executor.start(definitionId, options);
  }

  async resume(runId: string): Promise<WorkflowRun> {
    return this.executor.resume(runId);
  }

  async cancel(runId: string): Promise<WorkflowRun> {
    return this.executor.cancel(runId);
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    return this.executor.get(runId);
  }

  async list(filter?: Parameters<WorkflowExecutor["list"]>[0]): Promise<WorkflowRun[]> {
    return this.executor.list(filter);
  }

  /**
   * Advances suspended runs whose wait may now be over: an elapsed schedule
   * delay, an expired event wait, or an approval that has since been decided.
   * Exposed so tests and callers can drive time deterministically.
   */
  async tick(now = Date.now()): Promise<WorkflowRun[]> {
    if (this.ticking) return [];
    this.ticking = true;

    try {
      const suspended = await this.executor.list({ status: "suspended" });
      const resumed: WorkflowRun[] = [];

      for (const run of suspended) {
        const waiting = Object.values(run.steps).filter((step) => step.status === "waiting");

        const due = waiting.some(
          (step) =>
            (step.resumeAt !== undefined && step.resumeAt <= now) || step.approvalId !== undefined,
        );
        if (!due) continue;

        try {
          resumed.push(await this.executor.resume(run.id));
        } catch (err) {
          this.logger?.error("Failed to resume workflow run", {
            runId: run.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return resumed;
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Subscribes once per event type any `event` step waits on, then routes
   * arrivals to the suspended runs waiting for them.
   */
  private subscribeEventSteps(definition: WorkflowDefinition): void {
    if (!this.eventBus) return;

    for (const step of definition.steps) {
      const type = step.event?.type;
      if (step.kind !== "event" || !type || this.subscriptions.has(type)) continue;

      const subscription = this.eventBus.on(type, (event: RyvanEvent) => {
        void this.dispatchEvent(type, event);
      });

      this.subscriptions.set(type, subscription);
    }
  }

  private async dispatchEvent(type: string, event: RyvanEvent): Promise<void> {
    const suspended = await this.executor.list({ status: "suspended" });

    for (const run of suspended) {
      const definition = this.registry.get(run.definitionId, run.definitionVersion);

      const waitsForThis = definition.steps.some((step) => {
        if (step.kind !== "event" || step.event?.type !== type) return false;
        if (run.steps[step.id]?.status !== "waiting") return false;
        if (step.event.matchCorrelationId && event.correlationId !== run.correlationId) {
          return false;
        }
        return true;
      });

      if (!waitsForThis) continue;

      try {
        await this.executor.notifyEvent(run.id, type, event.data);
      } catch (err) {
        this.logger?.error("Failed to deliver event to workflow run", {
          runId: run.id,
          type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
