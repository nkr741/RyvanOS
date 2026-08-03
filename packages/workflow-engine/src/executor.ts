import { EVENTS, WorkflowError, generateId, sleep, withTimeout } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import { InMemoryWorkflowStore } from "./store.js";
import type { WorkflowRegistry } from "./registry.js";
import type {
  ApprovalGate,
  RetryPolicy,
  StartRunOptions,
  StepContext,
  StepState,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowEngineOptions,
  WorkflowRun,
  WorkflowStepDefinition,
  WorkflowStore,
} from "./types.js";

const DEFAULT_STEP_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_STEP_CONCURRENCY = 5;
const DEFAULT_RETRY: Required<Omit<RetryPolicy, "maxAttempts">> = {
  baseDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
};

const TERMINAL_STEP_STATUSES = new Set(["completed", "skipped", "failed", "compensated"]);

/**
 * Executes a workflow definition's step graph.
 *
 * Ordering comes from `dependsOn`: every step whose dependencies have finished
 * runs, up to `maxStepConcurrency` at a time. That makes parallelism a property
 * of the graph rather than a step type.
 *
 * A run that hits an approval, a schedule delay, or an event wait is persisted
 * as `suspended` and returns. `resume()` picks it back up — so a run survives
 * anything the store survives.
 *
 * Step outputs are persisted, so they must be structured-cloneable.
 */
export class WorkflowExecutor {
  private readonly registry: WorkflowRegistry;
  private readonly store: WorkflowStore;
  private readonly approvalGate?: ApprovalGate;
  private readonly maxStepConcurrency: number;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly aborts = new Map<string, AbortController>();

  constructor(registry: WorkflowRegistry, options: WorkflowEngineOptions = {}) {
    this.registry = registry;
    this.store = options.store ?? new InMemoryWorkflowStore();
    this.approvalGate = options.approvalGate;
    this.maxStepConcurrency = options.maxStepConcurrency ?? DEFAULT_MAX_STEP_CONCURRENCY;
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  /** Creates a run and drives it until it completes, fails, or suspends. */
  async start(
    definitionId: string,
    options: StartRunOptions & { version?: string } = {},
  ): Promise<WorkflowRun> {
    const definition = this.registry.get(definitionId, options.version);

    const missing = this.registry.missingHandlers(definition);
    if (missing.length > 0) {
      throw new WorkflowError(definition.id, `unregistered handlers: ${missing.join(", ")}`);
    }

    const now = Date.now();
    const run: WorkflowRun = {
      id: generateId("wfr"),
      definitionId: definition.id,
      definitionVersion: definition.version,
      status: "pending",
      input: options.input ?? {},
      outputs: {},
      steps: Object.fromEntries(
        definition.steps.map((step) => [
          step.id,
          { id: step.id, status: "pending", attempts: 0 } satisfies StepState,
        ]),
      ),
      subject: options.subject,
      correlationId: options.correlationId ?? generateId("corr"),
      missionId: options.missionId,
      metadata: options.metadata,
      createdAt: now,
    };

    await this.store.save(run);
    await this.emit(EVENTS.WORKFLOW_STARTED, run, {
      runId: run.id,
      definitionId: run.definitionId,
      version: run.definitionVersion,
    });

    return this.drive(run, definition);
  }

  /** Re-drives a suspended run. Returns it unchanged when nothing can proceed yet. */
  async resume(runId: string): Promise<WorkflowRun> {
    const run = await this.require(runId);

    if (run.status !== "suspended") {
      return run;
    }

    const definition = this.registry.get(run.definitionId, run.definitionVersion);
    await this.emit(EVENTS.WORKFLOW_RESUMED, run, { runId: run.id });

    return this.drive(run, definition);
  }

  async cancel(runId: string): Promise<WorkflowRun> {
    const run = await this.require(runId);

    if (this.isTerminal(run)) {
      return run;
    }

    this.aborts.get(runId)?.abort();

    run.status = "cancelled";
    run.completedAt = Date.now();
    for (const state of Object.values(run.steps)) {
      if (!TERMINAL_STEP_STATUSES.has(state.status)) {
        state.status = "skipped";
      }
    }

    await this.store.save(run);
    await this.emit(EVENTS.WORKFLOW_CANCELLED, run, { runId });
    return run;
  }

  /**
   * Delivers an event a run is waiting on. Returns the run when it advanced,
   * or undefined when no step was waiting for this type.
   */
  async notifyEvent(
    runId: string,
    eventType: string,
    payload?: unknown,
  ): Promise<WorkflowRun | undefined> {
    const run = await this.store.get(runId);
    if (!run || run.status !== "suspended") return undefined;

    const definition = this.registry.get(run.definitionId, run.definitionVersion);

    let matched = false;
    for (const step of definition.steps) {
      const state = run.steps[step.id];
      if (!state || state.status !== "waiting") continue;
      if (step.kind !== "event" || step.event?.type !== eventType) continue;

      this.completeStep(run, state, payload);
      await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, { output: payload });
      matched = true;
    }

    if (!matched) return undefined;

    await this.store.save(run);
    return this.drive(run, definition);
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    return this.store.get(runId);
  }

  async list(filter?: Parameters<WorkflowStore["list"]>[0]): ReturnType<WorkflowStore["list"]> {
    return this.store.list(filter);
  }

  /** Suspended runs whose schedule delay has elapsed, ready for `resume()`. */
  async dueRuns(now = Date.now()): Promise<WorkflowRun[]> {
    const suspended = await this.store.list({ status: "suspended" });

    return suspended.filter((run) =>
      Object.values(run.steps).some(
        (state) =>
          state.status === "waiting" && state.resumeAt !== undefined && state.resumeAt <= now,
      ),
    );
  }

  // --- execution loop -------------------------------------------------------

  private async drive(run: WorkflowRun, definition: WorkflowDefinition): Promise<WorkflowRun> {
    const controller = new AbortController();
    this.aborts.set(run.id, controller);

    run.status = "running";
    run.startedAt ??= Date.now();

    try {
      for (;;) {
        // `cancel()` writes straight to the store, so once aborted we must hand
        // back the stored run rather than saving our now-stale copy over it.
        if (controller.signal.aborted) {
          return (await this.store.get(run.id)) ?? run;
        }

        await this.settleWaitingSteps(run, definition);

        // A waiting step can fail while suspended — a denied or expired approval.
        const settled = this.fatalFailure(run, definition);
        if (settled) {
          await this.store.save(run);
          return this.failRun(run, definition, settled);
        }

        const ready = this.readySteps(run, definition);

        if (ready.length === 0) {
          if (this.hasWaiting(run)) {
            run.status = "suspended";
            await this.store.save(run);
            await this.emit(EVENTS.WORKFLOW_SUSPENDED, run, { runId: run.id });
            return run;
          }
          break;
        }

        const failure = await this.runBatch(run, definition, ready, controller.signal);

        if (controller.signal.aborted) {
          return (await this.store.get(run.id)) ?? run;
        }

        await this.store.save(run);

        if (failure) {
          return this.failRun(run, definition, failure);
        }
      }

      return this.completeRun(run, definition);
    } finally {
      this.aborts.delete(run.id);
    }
  }

  /** Steps that are pending and whose dependencies have all finished successfully. */
  private readySteps(run: WorkflowRun, definition: WorkflowDefinition): WorkflowStepDefinition[] {
    return definition.steps.filter((step) => {
      const state = run.steps[step.id];
      if (!state || state.status !== "pending") return false;

      return (step.dependsOn ?? []).every(
        (dependency) => run.steps[dependency]?.status === "completed",
      );
    });
  }

  private hasWaiting(run: WorkflowRun): boolean {
    return Object.values(run.steps).some((state) => state.status === "waiting");
  }

  /** Re-checks approvals, schedule delays, and event-wait timeouts. */
  private async settleWaitingSteps(
    run: WorkflowRun,
    definition: WorkflowDefinition,
  ): Promise<void> {
    const now = Date.now();

    for (const step of definition.steps) {
      const state = run.steps[step.id];
      if (!state || state.status !== "waiting") continue;

      if (step.kind === "approval" && state.approvalId && this.approvalGate) {
        const status = await this.approvalGate.check(state.approvalId);

        if (status === "granted") {
          this.completeStep(run, state, { approved: true, approvalId: state.approvalId });
          await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, { approved: true });
        } else if (status === "denied" || status === "expired") {
          this.failStep(state, `approval ${status}`);
          await this.emitStep(EVENTS.WORKFLOW_STEP_FAILED, run, step, { reason: status });
          if (step.continueOnError) this.skipDependents(run, definition, step.id);
        }
        continue;
      }

      if (step.kind === "schedule" && state.resumeAt !== undefined && state.resumeAt <= now) {
        this.completeStep(run, state, { resumedAt: now });
        await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, { resumedAt: now });
        continue;
      }

      if (step.kind === "event" && state.resumeAt !== undefined && state.resumeAt <= now) {
        this.failStep(state, `timed out waiting for event "${step.event?.type}"`);
        await this.emitStep(EVENTS.WORKFLOW_STEP_FAILED, run, step, { reason: "event timeout" });
        if (step.continueOnError) this.skipDependents(run, definition, step.id);
      }
    }
  }

  /** The first failed step the run is not configured to tolerate. */
  private fatalFailure(
    run: WorkflowRun,
    definition: WorkflowDefinition,
  ): { stepId: string; error: string } | undefined {
    for (const step of definition.steps) {
      const state = run.steps[step.id];
      if (state?.status === "failed" && !step.continueOnError) {
        return { stepId: step.id, error: state.error ?? "step failed" };
      }
    }
    return undefined;
  }

  /**
   * Runs ready steps, at most `maxStepConcurrency` at a time. Returns the first
   * fatal step failure, or undefined when the batch is survivable.
   */
  private async runBatch(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    ready: WorkflowStepDefinition[],
    signal: AbortSignal,
  ): Promise<{ stepId: string; error: string } | undefined> {
    let fatal: { stepId: string; error: string } | undefined;

    for (let i = 0; i < ready.length; i += this.maxStepConcurrency) {
      const slice = ready.slice(i, i + this.maxStepConcurrency);

      const outcomes = await Promise.all(
        slice.map((step) => this.executeStep(run, definition, step, signal)),
      );

      for (const outcome of outcomes) {
        if (outcome && !fatal) fatal = outcome;
      }

      if (fatal) break;
    }

    return fatal;
  }

  private async executeStep(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    step: WorkflowStepDefinition,
    signal: AbortSignal,
  ): Promise<{ stepId: string; error: string } | undefined> {
    const state = run.steps[step.id]!;
    state.status = "running";
    state.startedAt = Date.now();

    await this.emitStep(EVENTS.WORKFLOW_STEP_STARTED, run, step, {});

    try {
      switch (step.kind) {
        case "approval":
          return await this.beginApproval(run, step, state);

        case "schedule": {
          const resumeAt = step.schedule?.resumeAt ?? Date.now() + (step.schedule?.delayMs ?? 0);

          if (resumeAt <= Date.now()) {
            this.completeStep(run, state, { resumedAt: Date.now() });
            await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, {});
          } else {
            state.status = "waiting";
            state.resumeAt = resumeAt;
          }
          return undefined;
        }

        case "event": {
          state.status = "waiting";
          if (step.event?.timeoutMs) {
            state.resumeAt = Date.now() + step.event.timeoutMs;
          }
          return undefined;
        }

        case "conditional": {
          const passed = await step.condition!(this.contextFor(run));
          this.completeStep(run, state, passed);

          if (!passed) {
            const skipped = this.skipDependents(run, definition, step.id);
            await this.emitStep(EVENTS.WORKFLOW_STEP_SKIPPED, run, step, { skipped });
          }

          await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, { output: passed });
          return undefined;
        }

        case "action": {
          const output = await this.runHandlerWithRetry(run, definition, step, state, signal);
          this.completeStep(run, state, output);
          await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, {
            attempts: state.attempts,
          });
          return undefined;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.failStep(state, message);

      await this.emitStep(EVENTS.WORKFLOW_STEP_FAILED, run, step, {
        error: message,
        attempts: state.attempts,
      });
      this.logger?.error("Workflow step failed", {
        runId: run.id,
        stepId: step.id,
        error: message,
      });

      if (step.continueOnError) {
        this.skipDependents(run, definition, step.id);
        return undefined;
      }

      return { stepId: step.id, error: message };
    }
  }

  private async beginApproval(
    run: WorkflowRun,
    step: WorkflowStepDefinition,
    state: StepState,
  ): Promise<{ stepId: string; error: string } | undefined> {
    if (!this.approvalGate) {
      throw new WorkflowError(
        run.definitionId,
        `step "${step.id}" needs an approval gate but none is configured`,
      );
    }

    const { approvalId, status } = await this.approvalGate.request({
      action: step.approval?.action ?? "workflow:step:execute",
      resource: step.approval?.resource,
      reason: step.approval!.reason,
      ttlMs: step.approval?.ttlMs,
      subject: run.subject,
      metadata: { runId: run.id, stepId: step.id },
    });

    state.approvalId = approvalId;

    if (status === "granted") {
      this.completeStep(run, state, { approved: true, approvalId });
      await this.emitStep(EVENTS.WORKFLOW_STEP_COMPLETED, run, step, { approved: true });
      return undefined;
    }

    if (status === "denied" || status === "expired") {
      this.failStep(state, `approval ${status}`);
      await this.emitStep(EVENTS.WORKFLOW_STEP_FAILED, run, step, { reason: status });
      return step.continueOnError ? undefined : { stepId: step.id, error: `approval ${status}` };
    }

    state.status = "waiting";
    if (step.approval?.ttlMs) {
      state.resumeAt = Date.now() + step.approval.ttlMs;
    }
    return undefined;
  }

  private async runHandlerWithRetry(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    step: WorkflowStepDefinition,
    state: StepState,
    signal: AbortSignal,
  ): Promise<unknown> {
    const handler = this.registry.getHandler(step.handler!);
    if (!handler) {
      throw new WorkflowError(run.definitionId, `handler "${step.handler}" is not registered`);
    }

    const policy = step.retry ?? definition.retry;
    const maxAttempts = Math.max(1, policy?.maxAttempts ?? 1);
    const baseDelayMs = policy?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
    const multiplier = policy?.backoffMultiplier ?? DEFAULT_RETRY.backoffMultiplier;
    const maxDelayMs = policy?.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs;
    const timeoutMs = step.timeoutMs ?? definition.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      state.attempts = attempt;

      const context: StepContext = {
        ...this.contextFor(run),
        stepId: step.id,
        stepName: step.name,
        stepInput: step.input ?? {},
        attempt,
        signal,
      };

      try {
        return await withTimeout(
          Promise.resolve(handler(context)),
          timeoutMs,
          `workflow step ${step.id}`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxAttempts && !signal.aborted) {
          const delay = Math.min(baseDelayMs * Math.pow(multiplier, attempt - 1), maxDelayMs);
          this.logger?.warn("Retrying workflow step", {
            runId: run.id,
            stepId: step.id,
            attempt,
            delay,
          });
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("step failed without an error");
  }

  // --- state transitions ----------------------------------------------------

  private completeStep(run: WorkflowRun, state: StepState, output: unknown): void {
    state.status = "completed";
    state.output = output;
    state.completedAt = Date.now();
    state.sequence = this.nextSequence(run);
    state.resumeAt = undefined;
    run.outputs[state.id] = output;
  }

  /**
   * Monotonic completion counter. Compensation must undo in exact reverse
   * order, and `completedAt` cannot provide that — steps routinely finish
   * within the same millisecond.
   */
  private nextSequence(run: WorkflowRun): number {
    const highest = Object.values(run.steps).reduce(
      (max, state) => Math.max(max, state.sequence ?? 0),
      0,
    );
    return highest + 1;
  }

  private failStep(state: StepState, error: string): void {
    state.status = "failed";
    state.error = error;
    state.completedAt = Date.now();
    state.resumeAt = undefined;
  }

  /** Marks every pending step downstream of `stepId` as skipped. Returns their ids. */
  private skipDependents(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    stepId: string,
  ): string[] {
    const skipped: string[] = [];
    const queue = [stepId];

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const step of definition.steps) {
        if (!(step.dependsOn ?? []).includes(current)) continue;

        const state = run.steps[step.id];
        if (!state || state.status !== "pending") continue;

        state.status = "skipped";
        state.completedAt = Date.now();
        skipped.push(step.id);
        queue.push(step.id);
      }
    }

    return skipped;
  }

  /**
   * Ends a run that has nothing left to do. Steps marked `continueOnError` do
   * not fail the run — their failure stays visible in `run.steps`.
   */
  private async completeRun(
    run: WorkflowRun,
    definition: WorkflowDefinition,
  ): Promise<WorkflowRun> {
    if (this.isTerminal(run)) return run;

    const fatal = this.fatalFailure(run, definition);

    run.status = fatal ? "failed" : "completed";
    run.completedAt = Date.now();

    if (fatal) {
      run.error = `step "${fatal.stepId}" failed: ${fatal.error}`;
    }

    await this.store.save(run);
    await this.emit(
      run.status === "completed" ? EVENTS.WORKFLOW_COMPLETED : EVENTS.WORKFLOW_FAILED,
      run,
      { runId: run.id, error: run.error },
    );

    this.logger?.info("Workflow run finished", { runId: run.id, status: run.status });
    return run;
  }

  /**
   * Compensates completed steps in reverse completion order, then marks the run
   * terminal. A run that had something to undo ends `compensated`; one that had
   * nothing ends `failed`.
   */
  private async failRun(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    failure: { stepId: string; error: string },
  ): Promise<WorkflowRun> {
    run.status = "compensating";
    run.error = `step "${failure.stepId}" failed: ${failure.error}`;
    await this.store.save(run);

    const byId = new Map(definition.steps.map((step) => [step.id, step]));
    const completed = Object.values(run.steps)
      .filter((state) => state.status === "completed" && byId.get(state.id)?.compensate)
      .sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0));

    let compensatedAny = false;

    for (const state of completed) {
      const step = byId.get(state.id)!;
      const handler = this.registry.getHandler(step.compensate!);
      if (!handler) continue;

      try {
        await handler({
          ...this.contextFor(run),
          stepId: step.id,
          stepName: step.name,
          stepInput: step.input ?? {},
          attempt: 1,
        });
        state.status = "compensated";
        compensatedAny = true;
      } catch (err) {
        this.logger?.error("Compensation failed", {
          runId: run.id,
          stepId: step.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    run.status = compensatedAny ? "compensated" : "failed";
    run.completedAt = Date.now();
    await this.store.save(run);

    if (compensatedAny) {
      await this.emit(EVENTS.WORKFLOW_COMPENSATED, run, { runId: run.id });
    }
    await this.emit(EVENTS.WORKFLOW_FAILED, run, { runId: run.id, error: run.error });

    return run;
  }

  private isTerminal(run: WorkflowRun): boolean {
    return (
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "compensated" ||
      run.status === "cancelled"
    );
  }

  /**
   * Snapshots run state for a handler. `input` and `outputs` are copied so a
   * handler cannot mutate the run's own record, and so a handler holding the
   * object does not see later steps appear in it.
   */
  private contextFor(run: WorkflowRun): WorkflowContext {
    return {
      runId: run.id,
      definitionId: run.definitionId,
      correlationId: run.correlationId,
      input: { ...run.input },
      outputs: { ...run.outputs },
      subject: run.subject,
      metadata: run.metadata,
    };
  }

  private async require(runId: string): Promise<WorkflowRun> {
    const run = await this.store.get(runId);
    if (!run) {
      throw new WorkflowError(runId, "run not found");
    }
    return run;
  }

  private async emit(type: string, run: WorkflowRun, data: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit(
      type,
      { ...data, status: run.status, missionId: run.missionId },
      { source: "workflow-engine", correlationId: run.correlationId },
    );
  }

  private async emitStep(
    type: string,
    run: WorkflowRun,
    step: WorkflowStepDefinition,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit(
      type,
      { ...data, runId: run.id, stepId: step.id, stepName: step.name, kind: step.kind },
      { source: "workflow-engine", correlationId: run.correlationId },
    );
  }
}
