import { generateId } from "@ryvan/common";
import type { IMemoryBackend, MemoryEntry } from "./types.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export class WorkingMemory {
  private readonly backend: IMemoryBackend;
  private readonly namespace: string;
  private readonly ttlMs: number;

  constructor(opts: { backend: IMemoryBackend; namespace: string; ttlMs?: number }) {
    this.backend = opts.backend;
    this.namespace = opts.namespace;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  async set(key: string, value: unknown): Promise<string> {
    const existing = await this.backend.search({
      namespace: this.namespace,
      type: "working",
      key,
    });

    if (existing.length > 0) {
      const now = Date.now();
      await this.backend.update(existing[0].entry.id, {
        content: JSON.stringify(value),
        updatedAt: now,
        expiresAt: now + this.ttlMs,
      });
      return existing[0].entry.id;
    }

    const now = Date.now();
    const entry: MemoryEntry = {
      id: generateId("wm"),
      type: "working",
      namespace: this.namespace,
      key,
      content: JSON.stringify(value),
      metadata: {},
      importance: 0.5,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.ttlMs,
    };

    await this.backend.store(entry);
    return entry.id;
  }

  async get<T>(key: string): Promise<T | null> {
    const results = await this.backend.search({
      namespace: this.namespace,
      type: "working",
      key,
    });

    if (results.length === 0) return null;
    try {
      return JSON.parse(results[0].entry.content) as T;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const results = await this.backend.search({
      namespace: this.namespace,
      type: "working",
      key,
    });

    if (results.length === 0) return false;
    return this.backend.delete(results[0].entry.id);
  }

  async entries(): Promise<Record<string, unknown>> {
    const results = await this.backend.search({
      namespace: this.namespace,
      type: "working",
    });

    const record: Record<string, unknown> = {};
    for (const r of results) {
      try {
        record[r.entry.key] = JSON.parse(r.entry.content) as unknown;
      } catch {
        // skip entries with corrupt JSON
      }
    }
    return record;
  }

  async clear(): Promise<void> {
    const results = await this.backend.search({
      namespace: this.namespace,
      type: "working",
    });

    for (const r of results) {
      await this.backend.delete(r.entry.id);
    }
  }
}
