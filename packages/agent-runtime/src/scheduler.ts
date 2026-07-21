import type { ILogger } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import type { Task, TaskResult, WorkerConfig, RuntimeStats } from "./types.js";
import type { TaskQueue } from "./task-queue.js";

export class Scheduler {
  private readonly queue: TaskQueue;
  private readonly config: WorkerConfig;
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly running = new Map<string, Task>();
  private intervalId?: ReturnType<typeof setInterval>;
  private isRunning = false;
  private completedCount = 0;
  private failedCount = 0;
  private totalDurationMs = 0;

  constructor(opts: {
    queue: TaskQueue;
    config: WorkerConfig;
    logger?: ILogger;
    eventBus?: IEventBus;
  }) {
    this.queue = opts.queue;
    this.config = opts.config;
    this.logger = opts.logger;
    this.eventBus = opts.eventBus;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.poll(), this.config.pollIntervalMs);
    this.logger?.info("Scheduler started", {
      maxConcurrency: this.config.maxConcurrency,
      pollIntervalMs: this.config.pollIntervalMs,
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.logger?.info("Scheduler stopping", { runningTasks: this.running.size });

    // Drain queued tasks — mark them cancelled so they aren't silently abandoned
    let drained: Task | undefined;
    while ((drained = this.queue.dequeue())) {
      drained.status = "cancelled";
      drained.completedAt = Date.now();
      void this.eventBus?.emit("task:cancelled", { taskId: drained.id });
    }
    this.logger?.debug("Queued tasks drained");

    if (this.running.size > 0) {
      const deadline = Date.now() + this.config.shutdownTimeoutMs;
      await new Promise<void>((resolve) => {
        const check = () => {
          if (this.running.size === 0 || Date.now() >= deadline) {
            resolve();
            return;
          }
          setTimeout(check, 100);
        };
        check();
      });

      // Force-stop tasks still running after shutdown timeout
      for (const [, task] of Array.from(this.running)) {
        task.status = "failed";
        task.error = "Scheduler shutdown";
        task.completedAt = Date.now();
        this.running.delete(task.id);
        this.failedCount++;
        void this.eventBus?.emit("task:failed", { task, willRetry: false });
      }
    }

    this.logger?.info("Scheduler stopped");
  }

  assign(taskId: string, agentId: string): void {
    if (!this.isRunning) {
      throw new Error("Scheduler is not running");
    }
    const task = this.queue.getById(taskId) ?? this.running.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    task.agentId = agentId;
    void this.eventBus?.emit("task:assigned", {
      taskId,
      agentId,
      assignedAt: Date.now(),
    });
    this.logger?.debug("Task assigned", { taskId, agentId });
  }

  submitResult(taskId: string, result: TaskResult): void {
    if (!this.isRunning) {
      throw new Error("Scheduler is not running");
    }
    const task = this.running.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} is not running`);
    }
    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();
    this.running.delete(taskId);
    this.completedCount++;
    this.totalDurationMs += result.duration;
    void this.eventBus?.emit("task:completed", { task });
    this.logger?.info("Task completed", { taskId, duration: result.duration });
  }

  failTask(taskId: string, error: string): void {
    if (!this.isRunning) {
      throw new Error("Scheduler is not running");
    }
    const task = this.running.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} is not running`);
    }
    task.error = error;
    this.running.delete(taskId);

    if (task.attempts < task.maxAttempts) {
      task.status = "pending";
      task.startedAt = undefined;
      this.queue.enqueue(task);
      void this.eventBus?.emit("task:failed", { task, willRetry: true });
      this.logger?.warn("Task failed, retrying", {
        taskId,
        attempt: task.attempts,
        maxAttempts: task.maxAttempts,
        error,
      });
    } else {
      task.status = "failed";
      task.completedAt = Date.now();
      this.failedCount++;
      void this.eventBus?.emit("task:failed", { task, willRetry: false });
      this.logger?.error("Task failed permanently", {
        taskId,
        attempts: task.attempts,
        error,
      });
    }
  }

  getRunningTasks(): Task[] {
    return Array.from(this.running.values());
  }

  stats(): RuntimeStats {
    const processed = this.completedCount + this.failedCount;
    return {
      activeTasks: this.running.size,
      queuedTasks: this.queue.size(),
      completedTasks: this.completedCount,
      failedTasks: this.failedCount,
      totalTasksProcessed: processed,
      averageDurationMs: this.completedCount > 0 ? this.totalDurationMs / this.completedCount : 0,
      workerUtilization:
        this.config.maxConcurrency > 0 ? this.running.size / this.config.maxConcurrency : 0,
    };
  }

  private poll(): void {
    if (!this.isRunning) return;

    for (const [taskId, task] of this.running) {
      if (task.startedAt && Date.now() - task.startedAt > task.timeout) {
        this.logger?.warn("Task timed out", { taskId, timeout: task.timeout });
        this.failTask(taskId, `Task timed out after ${task.timeout}ms`);
      }
    }

    while (this.running.size < this.config.maxConcurrency) {
      const task = this.queue.dequeue();
      if (!task) break;

      task.status = "running";
      task.startedAt = Date.now();
      task.attempts++;
      this.running.set(task.id, task);
      void this.eventBus?.emit("task:started", { task });
      this.logger?.debug("Task started", { taskId: task.id, attempt: task.attempts });
    }
  }
}
