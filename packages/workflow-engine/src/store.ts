import { deepClone } from "@ryvan/common";
import type { WorkflowRun, WorkflowRunStatus, WorkflowStore } from "./types.js";

/**
 * Process-local run store. Runs are cloned in and out so a caller holding a
 * reference cannot mutate persisted state behind the engine's back — the same
 * guarantee a database-backed store gives for free.
 */
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly runs = new Map<string, WorkflowRun>();

  async save(run: WorkflowRun): Promise<void> {
    this.runs.set(run.id, deepClone(run));
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    const run = this.runs.get(runId);
    return run ? deepClone(run) : undefined;
  }

  async list(filter?: {
    status?: WorkflowRunStatus;
    definitionId?: string;
    missionId?: string;
  }): Promise<WorkflowRun[]> {
    let runs = Array.from(this.runs.values());

    if (filter?.status) {
      runs = runs.filter((run) => run.status === filter.status);
    }
    if (filter?.definitionId) {
      runs = runs.filter((run) => run.definitionId === filter.definitionId);
    }
    if (filter?.missionId) {
      runs = runs.filter((run) => run.missionId === filter.missionId);
    }

    return runs.map((run) => deepClone(run)).sort((a, b) => a.createdAt - b.createdAt);
  }

  clear(): void {
    this.runs.clear();
  }
}
