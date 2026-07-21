import type { Executor } from "./types";

class ExecutorRegistry {
  private executors = new Map<string, Executor>();

  register(executor: Executor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: string): Executor | undefined {
    return this.executors.get(type);
  }

  list(): Executor[] {
    return Array.from(this.executors.values());
  }

  has(type: string): boolean {
    return this.executors.has(type);
  }
}

export const executorRegistry = new ExecutorRegistry();
