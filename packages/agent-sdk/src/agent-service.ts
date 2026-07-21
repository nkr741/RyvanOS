import type { Service, Status } from "@ryvan/common";

import type { AgentConfig } from "./types.js";
import type { RyvanAgent } from "./agent.js";
import { CollaborationManager } from "./collaboration.js";

export class AgentService implements Service {
  readonly name = "agent-sdk";
  readonly collaboration = new CollaborationManager();

  private agents: Map<string, RyvanAgent> = new Map();
  private currentStatus: Status = "stopped";

  async start(): Promise<void> {
    this.currentStatus = "starting";
    this.currentStatus = "running";
  }

  async stop(): Promise<void> {
    this.currentStatus = "stopping";
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }
    this.agents.clear();
    this.currentStatus = "stopped";
  }

  status(): Status {
    return this.currentStatus;
  }

  async registerAgent(agent: RyvanAgent): Promise<void> {
    if (this.currentStatus !== "running") {
      throw new Error("AgentService is not running");
    }
    const id = agent.getConfig().id;
    const existing = this.agents.get(id);
    if (existing) {
      await existing.shutdown();
    }
    this.agents.set(id, agent);
  }

  getAgent(agentId: string): RyvanAgent | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map((agent) => agent.getConfig());
  }

  unregisterAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }
}
