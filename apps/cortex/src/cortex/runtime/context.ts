import { type CortexEventData, eventBus } from "./event";
import { type AgentMemory, getAgentMemory } from "./memory";
import { type ToolOutput, toolRegistry } from "./tool";

// ─── Agent Context ──────────────────────────────────────────────
// Injected into every agent during execution.
// Provides scoped access to tools, memory, events, and mission state.

export interface MissionContext {
  missionId: string;
  missionType: string;
  correlationId: string;
  stepId: string;
  stepSequence: number;
  merchantId?: string;
}

export class AgentContext {
  readonly agentId: string;
  readonly mission: MissionContext;
  readonly memory: AgentMemory;
  private reasoning: string[] = [];

  constructor(agentId: string, mission: MissionContext) {
    this.agentId = agentId;
    this.mission = mission;
    this.memory = getAgentMemory(agentId, mission.missionId);
  }

  async useTool(toolId: string, input: Record<string, unknown>): Promise<ToolOutput> {
    return toolRegistry.execute(toolId, input);
  }

  async publishEvent(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    return eventBus.publish({
      type,
      version: "1",
      payload,
      source: this.agentId,
      correlationId: this.mission.correlationId,
      missionId: this.mission.missionId,
    });
  }

  addReasoning(step: string): void {
    this.reasoning.push(`[${new Date().toISOString()}] ${step}`);
  }

  getReasoning(): string {
    return this.reasoning.join("\n");
  }

  async getEvents(): Promise<CortexEventData[]> {
    return eventBus.replay(this.mission.missionId);
  }
}
