import type { IMemoryBackend, MemoryEntry, MemoryQuery, MemorySearchResult } from "../types.js";

const DEFAULT_MAX_ENTRIES = 50000;

export class InMemoryBackend implements IMemoryBackend {
  private store_: Map<string, MemoryEntry> = new Map();
  private readonly maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  async store(entry: MemoryEntry): Promise<void> {
    this.store_.set(entry.id, entry);

    if (this.store_.size > this.maxEntries) {
      let oldest: { id: string; importance: number; updatedAt: number } | undefined;
      for (const [id, e] of this.store_) {
        if (this.isExpired(e)) {
          this.store_.delete(id);
          continue;
        }
        if (!oldest || e.importance < oldest.importance || e.updatedAt < oldest.updatedAt) {
          oldest = { id, importance: e.importance, updatedAt: e.updatedAt };
        }
      }
      if (this.store_.size > this.maxEntries && oldest) {
        this.store_.delete(oldest.id);
      }
    }
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    const entry = this.store_.get(id);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store_.delete(id);
      return null;
    }
    return entry;
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];

    for (const [id, entry] of this.store_) {
      if (this.isExpired(entry)) {
        this.store_.delete(id);
        continue;
      }

      if (!this.matchesQuery(entry, query)) continue;

      const score = this.computeScore(entry, query);
      results.push({ entry, score });
    }

    results.sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt);

    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null> {
    const entry = this.store_.get(id);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store_.delete(id);
      return null;
    }

    const updated: MemoryEntry = { ...entry, ...updates, id: entry.id, updatedAt: Date.now() };
    this.store_.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store_.delete(id);
  }

  async deleteByNamespace(namespace: string): Promise<number> {
    let count = 0;
    for (const [id, entry] of this.store_) {
      if (entry.namespace === namespace) {
        this.store_.delete(id);
        count++;
      }
    }
    return count;
  }

  async count(query?: MemoryQuery): Promise<number> {
    if (!query) {
      let count = 0;
      for (const [id, entry] of this.store_) {
        if (this.isExpired(entry)) {
          this.store_.delete(id);
        } else {
          count++;
        }
      }
      return count;
    }

    let count = 0;
    for (const [id, entry] of this.store_) {
      if (this.isExpired(entry)) {
        this.store_.delete(id);
        continue;
      }
      if (this.matchesQuery(entry, query)) count++;
    }
    return count;
  }

  async clear(): Promise<void> {
    this.store_.clear();
  }

  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  }

  private matchesQuery(entry: MemoryEntry, query: MemoryQuery): boolean {
    if (query.namespace !== undefined && entry.namespace !== query.namespace) return false;
    if (query.type !== undefined && entry.type !== query.type) return false;
    if (query.key !== undefined && entry.key !== query.key) return false;
    if (query.minImportance !== undefined && entry.importance < query.minImportance) return false;

    if (query.metadata) {
      for (const [k, v] of Object.entries(query.metadata)) {
        const entryVal = entry.metadata[k];
        if (typeof v === "object" || typeof entryVal === "object") {
          if (JSON.stringify(entryVal) !== JSON.stringify(v)) return false;
        } else if (entryVal !== v) {
          return false;
        }
      }
    }

    if (query.content !== undefined) {
      const lower = entry.content.toLowerCase();
      if (!lower.includes(query.content.toLowerCase())) return false;
    }

    return true;
  }

  private computeScore(entry: MemoryEntry, query: MemoryQuery): number {
    if (query.content === undefined) return 1;

    const lower = entry.content.toLowerCase();
    const queryLower = query.content.toLowerCase();
    if (lower === queryLower) return 1;

    const ratio = queryLower.length / lower.length;
    return Math.min(ratio, 1);
  }
}
