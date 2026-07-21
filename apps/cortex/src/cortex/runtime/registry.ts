import { type BaseAgent, type AgentManifest } from "./base-agent";

// ─── Agent Registry ─────────────────────────────────────────────
// Dynamic registration. Future plugins become easy.
// Every agent registers via registry.register().

interface RegisteredAgent {
  agent: BaseAgent;
  manifest: AgentManifest;
  registeredAt: string;
}

class AgentRegistryImpl {
  private agents = new Map<string, RegisteredAgent>();

  register(agent: BaseAgent): void {
    const m = agent.manifest;
    this.agents.set(m.id, {
      agent,
      manifest: m,
      registeredAt: new Date().toISOString(),
    });
  }

  get(id: string): BaseAgent | undefined {
    return this.agents.get(id)?.agent;
  }

  getManifest(id: string): AgentManifest | undefined {
    return this.agents.get(id)?.manifest;
  }

  list(): { id: string; manifest: AgentManifest; state: string; registeredAt: string }[] {
    return Array.from(this.agents.entries()).map(([id, reg]) => ({
      id,
      manifest: reg.manifest,
      state: reg.agent.state,
      registeredAt: reg.registeredAt,
    }));
  }

  findBySubscription(eventType: string): BaseAgent[] {
    return Array.from(this.agents.values())
      .filter(reg => reg.agent.canHandle(eventType))
      .map(reg => reg.agent);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  count(): number {
    return this.agents.size;
  }
}

export const agentRegistry = new AgentRegistryImpl();
