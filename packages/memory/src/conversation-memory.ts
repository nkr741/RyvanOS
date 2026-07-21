import { generateId } from "@ryvan/common";
import type { IMemoryBackend, ConversationTurn, MemoryEntry } from "./types.js";

export class ConversationMemory {
  private readonly backend: IMemoryBackend;
  private readonly namespace: string;
  private readonly maxTurns: number;

  constructor(opts: { backend: IMemoryBackend; namespace: string; maxTurns?: number }) {
    this.backend = opts.backend;
    this.namespace = opts.namespace;
    this.maxTurns = opts.maxTurns ?? 50;
  }

  async addTurn(turn: ConversationTurn): Promise<string> {
    const entry: MemoryEntry = {
      id: generateId("conv"),
      type: "conversation",
      namespace: this.namespace,
      key: `turn:${turn.timestamp}`,
      content: JSON.stringify(turn),
      metadata: { role: turn.role, ...turn.metadata },
      importance: 0.5,
      accessCount: 0,
      createdAt: turn.timestamp,
      updatedAt: turn.timestamp,
    };

    await this.backend.store(entry);

    const count = await this.backend.count({ namespace: this.namespace, type: "conversation" });
    if (count > this.maxTurns) {
      const all = await this.backend.search({
        namespace: this.namespace,
        type: "conversation",
      });
      const sorted = [...all].sort((a, b) => a.entry.createdAt - b.entry.createdAt);
      const excess = sorted.slice(0, count - this.maxTurns);
      for (const r of excess) {
        await this.backend.delete(r.entry.id);
      }
    }

    return entry.id;
  }

  async getTurns(limit?: number): Promise<ConversationTurn[]> {
    const results = await this.backend.search({
      namespace: this.namespace,
      type: "conversation",
    });

    const turns: ConversationTurn[] = [];
    for (const r of results) {
      try {
        turns.push(JSON.parse(r.entry.content) as ConversationTurn);
      } catch {
        // skip entries with corrupt JSON
      }
    }
    turns.sort((a, b) => a.timestamp - b.timestamp);

    if (limit !== undefined) {
      return turns.slice(-limit);
    }
    return turns;
  }

  async getContext(maxTurns?: number): Promise<string> {
    const turns = await this.getTurns(maxTurns ?? this.maxTurns);
    return turns.map((t) => `${t.role}: ${t.content}`).join("\n");
  }

  async summarize(summary: string): Promise<void> {
    const results = await this.backend.search({
      namespace: this.namespace,
      type: "conversation",
    });

    if (results.length > this.maxTurns) {
      const sorted = [...results].sort((a, b) => a.entry.createdAt - b.entry.createdAt);
      const toRemove = sorted.slice(0, sorted.length - this.maxTurns);

      for (const r of toRemove) {
        await this.backend.delete(r.entry.id);
      }
    }

    const now = Date.now();
    const summaryEntry: MemoryEntry = {
      id: generateId("mem"),
      type: "long",
      namespace: this.namespace,
      key: `summary:${now}`,
      content: summary,
      metadata: { source: "conversation_summary" },
      importance: 0.8,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.backend.store(summaryEntry);
  }

  async clear(): Promise<void> {
    const conversations = await this.backend.search({
      namespace: this.namespace,
      type: "conversation",
    });
    for (const r of conversations) {
      await this.backend.delete(r.entry.id);
    }

    const summaries = await this.backend.search({
      namespace: this.namespace,
      type: "long",
    });
    for (const r of summaries) {
      if (r.entry.metadata?.source === "conversation_summary") {
        await this.backend.delete(r.entry.id);
      }
    }
  }
}
