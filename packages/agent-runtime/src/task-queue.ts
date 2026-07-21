import type { Task, TaskPriority } from "./types.js";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class TaskQueue {
  private readonly tasks = new Map<string, Task>();
  private readonly order: string[] = [];

  enqueue(task: Task): void {
    const existingIdx = this.order.indexOf(task.id);
    if (existingIdx !== -1) {
      this.order.splice(existingIdx, 1);
    }
    this.tasks.set(task.id, task);
    const weight = PRIORITY_WEIGHT[task.priority];
    let idx = this.order.length;
    for (let i = 0; i < this.order.length; i++) {
      const existing = this.tasks.get(this.order[i]);
      if (existing && PRIORITY_WEIGHT[existing.priority] > weight) {
        idx = i;
        break;
      }
    }
    this.order.splice(idx, 0, task.id);
  }

  dequeue(): Task | undefined {
    if (this.order.length === 0) return undefined;
    const id = this.order.shift()!;
    const task = this.tasks.get(id);
    this.tasks.delete(id);
    return task;
  }

  peek(): Task | undefined {
    if (this.order.length === 0) return undefined;
    return this.tasks.get(this.order[0]);
  }

  cancel(taskId: string): boolean {
    const idx = this.order.indexOf(taskId);
    if (idx === -1) return false;
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = "cancelled";
    task.completedAt = Date.now();
    this.order.splice(idx, 1);
    return true;
  }

  size(): number {
    return this.order.length;
  }

  pending(): Task[] {
    return this.order.map((id) => this.tasks.get(id)).filter((t): t is Task => t !== undefined);
  }

  getById(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }
}
