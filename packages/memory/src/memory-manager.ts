import type { Service, Status, ILogger } from "@ryvan/common";
import { generateId, EVENTS } from "@ryvan/common";
import type { IEventBus } from "@ryvan/events";
import type {
  IMemoryBackend,
  MemoryType,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
} from "./types.js";
import { ConversationMemory } from "./conversation-memory.js";
import { WorkingMemory } from "./working-memory.js";

export class MemoryManager implements Service {
  readonly name = "memory";
  private state: Status = "stopped";
  private readonly backend: IMemoryBackend;
  private readonly eventBus?: IEventBus;
  private readonly logger?: ILogger;

  constructor(opts: { backend: IMemoryBackend; eventBus?: IEventBus; logger?: ILogger }) {
    this.backend = opts.backend;
    this.eventBus = opts.eventBus;
    this.logger = opts.logger;
  }

  async start(): Promise<void> {
    this.state = "starting";
    this.logger?.info("Memory manager starting");
    this.state = "running";
    this.logger?.info("Memory manager started");
  }

  async stop(): Promise<void> {
    this.state = "stopping";
    this.logger?.info("Memory manager stopping");
    this.state = "stopped";
    this.logger?.info("Memory manager stopped");
  }

  status(): Status {
    return this.state;
  }

  async store(
    type: MemoryType,
    namespace: string,
    key: string,
    content: string,
    opts?: { importance?: number; metadata?: Record<string, unknown>; ttlMs?: number },
  ): Promise<MemoryEntry> {
    if (opts?.importance !== undefined && (opts.importance < 0 || opts.importance > 1)) {
      throw new Error("importance must be between 0 and 1");
    }
    if (opts?.ttlMs !== undefined && opts.ttlMs <= 0) {
      throw new Error("ttlMs must be positive");
    }
    const now = Date.now();
    const entry: MemoryEntry = {
      id: generateId("mem"),
      type,
      namespace,
      key,
      content,
      metadata: opts?.metadata ?? {},
      importance: opts?.importance ?? 0.5,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: opts?.ttlMs ? now + opts.ttlMs : undefined,
    };

    await this.backend.store(entry);
    await this.eventBus?.emit(EVENTS.MEMORY_STORED, { entry });
    this.logger?.debug("Memory stored", { id: entry.id, type, namespace, key });
    return entry;
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    const entry = await this.backend.retrieve(id);
    if (!entry) return null;

    const updated = await this.backend.update(id, { accessCount: entry.accessCount + 1 });
    await this.eventBus?.emit(EVENTS.MEMORY_RETRIEVED, {
      id,
      type: entry.type,
      namespace: entry.namespace,
    });
    return updated ?? { ...entry, accessCount: entry.accessCount + 1 };
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results = await this.backend.search(query);

    for (const result of results) {
      const updated = await this.backend.update(result.entry.id, {
        accessCount: result.entry.accessCount + 1,
      });
      if (updated) {
        result.entry = updated;
      }
    }

    return results;
  }

  getConversation(namespace: string, maxTurns?: number): ConversationMemory {
    return new ConversationMemory({
      backend: this.backend,
      namespace,
      maxTurns,
    });
  }

  getWorkingMemory(namespace: string, ttlMs?: number): WorkingMemory {
    return new WorkingMemory({
      backend: this.backend,
      namespace,
      ttlMs,
    });
  }

  async stats(): Promise<MemoryStats> {
    const allResults = await this.backend.search({});
    const byType: Record<MemoryType, number> = {
      short: 0,
      long: 0,
      conversation: 0,
      working: 0,
      semantic: 0,
      entity: 0,
    };
    const byNamespace: Record<string, number> = {};
    let oldest = Infinity;
    let newest = 0;

    for (const result of allResults) {
      const entry = result.entry;
      byType[entry.type]++;
      byNamespace[entry.namespace] = (byNamespace[entry.namespace] ?? 0) + 1;
      if (entry.createdAt < oldest) oldest = entry.createdAt;
      if (entry.createdAt > newest) newest = entry.createdAt;
    }

    return {
      totalEntries: allResults.length,
      byType,
      byNamespace,
      oldestEntry: allResults.length > 0 ? oldest : 0,
      newestEntry: newest,
    };
  }

  async clearNamespace(namespace: string): Promise<number> {
    const count = await this.backend.deleteByNamespace(namespace);
    await this.eventBus?.emit(EVENTS.MEMORY_CLEARED, { namespace, count });
    this.logger?.info("Namespace cleared", { namespace, count });
    return count;
  }
}
