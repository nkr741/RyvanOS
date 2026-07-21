import type { Service, Status, ILogger } from "@ryvan/common";
import { generateId } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import type { Task, TaskPriority, PlannerStrategy, RuntimeStats, WorkerConfig } from "./types.js";
import { TaskQueue } from "./task-queue.js";
import { Planner } from "./planner.js";
import { Scheduler } from "./scheduler.js";

export class RuntimeService implements Service {
  readonly name = "agent-runtime";
  private state: Status = "stopped";
  readonly queue: TaskQueue;
  readonly planner: Planner;
  readonly scheduler: Scheduler;
  private readonly eventBus?: IEventBus;
  private readonly logger?: ILogger;

  constructor(opts?: { config?: Partial<WorkerConfig>; eventBus?: IEventBus; logger?: ILogger }) {
    this.eventBus = opts?.eventBus;
    this.logger = opts?.logger;
    this.queue = new TaskQueue();
    this.planner = new Planner();
    const config: WorkerConfig = {
      maxConcurrency: opts?.config?.maxConcurrency ?? 5,
      pollIntervalMs: opts?.config?.pollIntervalMs ?? 1000,
      shutdownTimeoutMs: opts?.config?.shutdownTimeoutMs ?? 10000,
    };
    this.scheduler = new Scheduler({
      queue: this.queue,
      config,
      logger: this.logger,
      eventBus: this.eventBus,
    });
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.logger?.info("Agent runtime starting");
    this.scheduler.start();
    this.state = "running";
    this.logger?.info("Agent runtime started");
  }

  async stop(): Promise<void> {
    this.state = "stopping";
    this.logger?.info("Agent runtime stopping");
    await this.scheduler.stop();
    this.state = "stopped";
    this.logger?.info("Agent runtime stopped");
  }

  status(): Status {
    return this.state;
  }

  async submit(
    goal: string,
    options?: {
      priority?: TaskPriority;
      agentId?: string;
      timeout?: number;
      maxAttempts?: number;
      metadata?: Record<string, unknown>;
      parentTaskId?: string;
    },
  ): Promise<Task> {
    if (this.state !== "running") {
      throw new Error("RuntimeService is not running");
    }
    const now = Date.now();
    const task: Task = {
      id: generateId("task"),
      goal,
      status: "pending",
      priority: options?.priority ?? "normal",
      agentId: options?.agentId,
      parentTaskId: options?.parentTaskId,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      timeout: options?.timeout ?? 300000,
      metadata: options?.metadata ?? {},
      createdAt: now,
    };

    void this.eventBus?.emit("task:created", { task });
    this.logger?.info("Task created", { taskId: task.id, goal });

    task.status = "planning";
    const plan = await this.planner.plan(goal, task.metadata, undefined, task.id);
    task.plan = plan;

    task.status = "queued";
    this.queue.enqueue(task);
    this.logger?.debug("Task enqueued", { taskId: task.id, priority: task.priority });

    return task;
  }

  cancel(taskId: string): boolean {
    const queued = this.queue.cancel(taskId);
    if (queued) {
      void this.eventBus?.emit("task:cancelled", { taskId });
      this.logger?.info("Task cancelled", { taskId });
      return true;
    }

    const runningTasks = this.scheduler.getRunningTasks();
    const running = runningTasks.find((t) => t.id === taskId);
    if (running) {
      running.status = "cancelled";
      running.completedAt = Date.now();
      void this.eventBus?.emit("task:cancelled", { taskId });
      this.logger?.info("Running task cancelled", { taskId });
      return true;
    }

    return false;
  }

  getTask(taskId: string): Task | undefined {
    const queued = this.queue.getById(taskId);
    if (queued) return queued;

    const runningTasks = this.scheduler.getRunningTasks();
    return runningTasks.find((t) => t.id === taskId);
  }

  stats(): RuntimeStats {
    return this.scheduler.stats();
  }

  registerPlannerStrategy(strategy: PlannerStrategy): void {
    this.planner.registerStrategy(strategy);
  }
}
