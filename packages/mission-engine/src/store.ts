import { deepClone } from "@ryvan/common";
import type { Mission, MissionStatus, MissionStore } from "./types.js";

/** Process-local mission store. Clones on the way in and out, as a DB would. */
export class InMemoryMissionStore implements MissionStore {
  private readonly missions = new Map<string, Mission>();

  async save(mission: Mission): Promise<void> {
    this.missions.set(mission.id, deepClone(mission));
  }

  async get(missionId: string): Promise<Mission | undefined> {
    const mission = this.missions.get(missionId);
    return mission ? deepClone(mission) : undefined;
  }

  async list(filter?: {
    status?: MissionStatus;
    type?: string;
    orgId?: string;
    runId?: string;
  }): Promise<Mission[]> {
    let missions = Array.from(this.missions.values());

    if (filter?.status) {
      missions = missions.filter((mission) => mission.status === filter.status);
    }
    if (filter?.type) {
      missions = missions.filter((mission) => mission.type === filter.type);
    }
    if (filter?.orgId) {
      missions = missions.filter((mission) => mission.subject?.orgId === filter.orgId);
    }
    if (filter?.runId) {
      missions = missions.filter((mission) => mission.runId === filter.runId);
    }

    return missions.map((mission) => deepClone(mission)).sort((a, b) => a.createdAt - b.createdAt);
  }

  clear(): void {
    this.missions.clear();
  }
}
