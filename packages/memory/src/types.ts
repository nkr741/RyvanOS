export type MemoryType = "short" | "long" | "conversation" | "working" | "semantic" | "entity";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  namespace: string;
  key: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  importance: number;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface MemoryQuery {
  namespace?: string;
  type?: MemoryType;
  key?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  minImportance?: number;
  limit?: number;
  offset?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface ConversationTurn {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<MemoryType, number>;
  byNamespace: Record<string, number>;
  oldestEntry: number;
  newestEntry: number;
}

export interface IMemoryBackend {
  store(entry: MemoryEntry): Promise<void>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  search(query: MemoryQuery): Promise<MemorySearchResult[]>;
  update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  deleteByNamespace(namespace: string): Promise<number>;
  count(query?: MemoryQuery): Promise<number>;
  clear(): Promise<void>;
}
