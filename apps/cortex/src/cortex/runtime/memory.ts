/**
 * Agent Memory — AIOS adapter layer.
 *
 * Routes through @ryvan/memory MemoryManager under the hood.
 * Preserves the same AgentMemory interface and getAgentMemory() factory
 * that context.ts depends on.
 *
 * API surface is UNCHANGED — context.ts imports { getAgentMemory, AgentMemory }
 * without modification.
 */

import type { MemoryManager } from "@ryvan/memory";
import { getAIOS } from "../../lib/aios";

// ─── Types (unchanged — consumers depend on these) ─────────────

export interface MemoryEntry {
  key: string;
  value: unknown;
  agentId: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface AgentMemory {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  list(prefix?: string): Promise<MemoryEntry[]>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ─── Adapter class ─────────────────────────────────────────────

class AIOSAgentMemory implements AgentMemory {
  private readonly agentId: string;
  private readonly scope: string;
  private manager: MemoryManager | null = null;

  constructor(agentId: string, scope: string) {
    this.agentId = agentId;
    this.scope = scope;
  }

  private getManager(): MemoryManager {
    if (!this.manager) {
      this.manager = getAIOS().container.resolve<MemoryManager>("memory");
    }
    return this.manager;
  }

  private namespace(): string {
    return `agent:${this.agentId}:${this.scope}`;
  }

  async get(key: string): Promise<unknown | null> {
    const manager = this.getManager();
    const results = await manager.search({
      namespace: this.namespace(),
      key,
      limit: 1,
    });

    if (results.length === 0) return null;

    const entry = results[0].entry;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      return null;
    }

    try {
      return JSON.parse(entry.content);
    } catch {
      return entry.content;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const manager = this.getManager();
    await manager.store("working", this.namespace(), key, JSON.stringify(value), {
      ttlMs: ttl ? ttl * 1000 : undefined,
      metadata: { agentId: this.agentId, scope: this.scope },
    });
  }

  async list(prefix?: string): Promise<MemoryEntry[]> {
    const manager = this.getManager();
    const results = await manager.search({
      namespace: this.namespace(),
    });

    const entries: MemoryEntry[] = [];
    for (const result of results) {
      const entry = result.entry;
      if (prefix && !entry.key.startsWith(prefix)) continue;

      let value: unknown;
      try {
        value = JSON.parse(entry.content);
      } catch {
        value = entry.content;
      }

      entries.push({
        key: entry.key,
        value,
        agentId: this.agentId,
        scope: this.scope,
        createdAt: new Date(entry.createdAt).toISOString(),
        updatedAt: new Date(entry.updatedAt).toISOString(),
        ttl: entry.expiresAt
          ? Math.max(0, Math.round((entry.expiresAt - entry.createdAt) / 1000))
          : undefined,
      });
    }

    return entries;
  }

  async delete(key: string): Promise<void> {
    const manager = this.getManager();
    const results = await manager.search({
      namespace: this.namespace(),
      key,
      limit: 1,
    });

    if (results.length > 0) {
      await manager.clearNamespace(this.namespace());
    }
  }

  async clear(): Promise<void> {
    const manager = this.getManager();
    await manager.clearNamespace(this.namespace());
  }
}

// ─── Factory (unchanged signature) ─────────────────────────────

const adapterCache = new Map<string, AIOSAgentMemory>();

export function getAgentMemory(agentId: string, scope: string = "default"): AgentMemory {
  const key = `${agentId}:${scope}`;
  if (!adapterCache.has(key)) {
    adapterCache.set(key, new AIOSAgentMemory(agentId, scope));
  }
  return adapterCache.get(key)!;
}
