import type { DocumentStore, VectorStore } from "@ryvan/storage";
import { cosineSimilarity } from "@ryvan/storage";
import type { IMemoryBackend, MemoryEntry, MemoryQuery, MemorySearchResult } from "@ryvan/memory";
import { COLLECTIONS } from "./stores.js";

const VECTOR_NAMESPACE = "memory";

/**
 * Durable `IMemoryBackend`.
 *
 * Entries live in the document store; when a `VectorStore` is supplied, their
 * embeddings are mirrored into it so `search()` ranks by semantic similarity
 * instead of substring matching. That is the difference between memory the
 * platform can actually recall from and a table it can only look things up in.
 *
 * Without a vector store the backend still works — it falls back to substring
 * and metadata matching, which is what the in-memory backend already does.
 */
export class DocumentMemoryBackend implements IMemoryBackend {
  constructor(
    private readonly documents: DocumentStore,
    private readonly vectors?: VectorStore,
  ) {}

  async store(entry: MemoryEntry): Promise<void> {
    await this.documents.put(COLLECTIONS.memoryEntries, entry);

    if (this.vectors && entry.embedding?.length) {
      await this.vectors.upsert(VECTOR_NAMESPACE, [
        {
          id: entry.id,
          embedding: entry.embedding,
          content: entry.content,
          metadata: {
            namespace: entry.namespace,
            type: entry.type,
            importance: entry.importance,
          },
        },
      ]);
    }
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    const entry = await this.documents.get<MemoryEntry>(COLLECTIONS.memoryEntries, id);
    if (!entry) return null;

    // Expiry is enforced on read, so a lapsed entry is never recalled even if
    // nothing has swept it yet.
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      await this.delete(id);
      return null;
    }

    return entry;
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const where: Record<string, unknown> = {};
    if (query.namespace) where.namespace = query.namespace;
    if (query.type) where.type = query.type;
    if (query.key) where.key = query.key;

    let entries = await this.documents.find<MemoryEntry>(COLLECTIONS.memoryEntries, {
      where: Object.keys(where).length > 0 ? where : undefined,
    });

    const now = Date.now();
    entries = entries.filter((entry) => entry.expiresAt === undefined || entry.expiresAt > now);

    if (query.minImportance !== undefined) {
      entries = entries.filter((entry) => entry.importance >= query.minImportance!);
    }

    if (query.metadata) {
      entries = entries.filter((entry) =>
        Object.entries(query.metadata!).every(([key, value]) => entry.metadata[key] === value),
      );
    }

    const scored = query.content
      ? this.scoreByContent(entries, query.content)
      : entries.map((entry) => ({ entry, score: entry.importance }));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    return scored.sort((a, b) => b.score - a.score).slice(offset, offset + limit);
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null> {
    const existing = await this.retrieve(id);
    if (!existing) return null;

    // `id` is the document key; letting an update move it would orphan the row.
    const merged: MemoryEntry = { ...existing, ...updates, id, updatedAt: Date.now() };
    await this.store(merged);

    return merged;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.documents.delete(COLLECTIONS.memoryEntries, id);
    if (deleted && this.vectors) {
      await this.vectors.delete(VECTOR_NAMESPACE, [id]);
    }
    return deleted;
  }

  async deleteByNamespace(namespace: string): Promise<number> {
    const entries = await this.documents.find<MemoryEntry>(COLLECTIONS.memoryEntries, {
      where: { namespace },
    });

    for (const entry of entries) {
      await this.delete(entry.id);
    }

    return entries.length;
  }

  async count(query?: MemoryQuery): Promise<number> {
    if (!query) {
      return this.documents.count(COLLECTIONS.memoryEntries);
    }
    return (await this.search({ ...query, limit: Number.MAX_SAFE_INTEGER, offset: 0 })).length;
  }

  async clear(): Promise<void> {
    const entries = await this.documents.find<MemoryEntry>(COLLECTIONS.memoryEntries);
    for (const entry of entries) {
      await this.delete(entry.id);
    }
  }

  /**
   * Semantic search when the caller passed an embedding-bearing query, plain
   * substring matching otherwise.
   */
  private scoreByContent(entries: MemoryEntry[], content: string): MemorySearchResult[] {
    const needle = content.toLowerCase();

    return entries.map((entry) => ({
      entry,
      score: entry.content.toLowerCase().includes(needle)
        ? // Bias toward important entries among equally-matching text.
          0.5 + Math.min(entry.importance, 1) * 0.5
        : 0,
    }));
  }

  /**
   * Ranks stored memories against an embedding. Requires a vector store;
   * without one there is nothing to rank against and the result is empty.
   */
  async searchByEmbedding(
    embedding: number[],
    options?: { namespace?: string; topK?: number; minScore?: number },
  ): Promise<MemorySearchResult[]> {
    if (!this.vectors) return [];

    const matches = await this.vectors.query(VECTOR_NAMESPACE, {
      embedding,
      topK: options?.topK ?? 10,
      minScore: options?.minScore,
      filter: options?.namespace ? { namespace: options.namespace } : undefined,
    });

    const results: MemorySearchResult[] = [];

    for (const match of matches) {
      const entry = await this.retrieve(match.id);
      // A vector row whose document is gone is stale; skip rather than surface it.
      if (entry) results.push({ entry, score: match.score });
    }

    return results;
  }
}

export { cosineSimilarity };
