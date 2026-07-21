import { generateId } from "@ryvan/common";

import type { CollaborationRole, CollaborationMessage, CollaborationProtocol } from "./types.js";

const RESERVED_IDS = new Set(["broadcast"]);
const MAX_MESSAGES = 10000;

export class CollaborationManager {
  private agents: Map<string, CollaborationRole> = new Map();
  private messages: CollaborationMessage[] = [];
  private protocols: Map<string, CollaborationProtocol> = new Map();

  registerAgent(agentId: string, role: CollaborationRole): void {
    if (RESERVED_IDS.has(agentId)) {
      throw new Error(`Agent ID "${agentId}" is reserved and cannot be used`);
    }
    this.agents.set(agentId, role);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  send(message: Omit<CollaborationMessage, "id" | "timestamp">): CollaborationMessage {
    if (!this.agents.has(message.from)) {
      throw new Error(`Sender "${message.from}" is not a registered agent`);
    }

    const full: CollaborationMessage = {
      ...message,
      id: generateId("msg"),
      timestamp: Date.now(),
    };
    this.messages.push(full);

    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }

    return full;
  }

  getMessages(
    agentId: string,
    options?: { limit?: number; since?: number },
  ): CollaborationMessage[] {
    let result = this.messages.filter(
      (m) =>
        m.to === agentId || m.to === "broadcast" || (Array.isArray(m.to) && m.to.includes(agentId)),
    );

    if (options?.since !== undefined) {
      result = result.filter((m) => m.timestamp > options.since!);
    }

    if (options?.limit !== undefined) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  broadcast(from: string, role: CollaborationRole, content: string): CollaborationMessage {
    return this.send({ from, to: "broadcast", role, content });
  }

  registerProtocol(protocol: CollaborationProtocol): void {
    this.protocols.set(protocol.name, protocol);
  }

  getProtocol(name: string): CollaborationProtocol | undefined {
    return this.protocols.get(name);
  }
}
