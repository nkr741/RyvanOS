import { deepClone } from "@ryvan/common";
import type { DeadLetter, DeadLetterStore } from "./types.js";

/**
 * Process-local dead-letter storage.
 *
 * Correct for tests; in production this should be durable, since the whole
 * point of a dead letter is that the work outlives the failure that parked it.
 * `@ryvan/persistence` supplies the document-backed one.
 */
export class InMemoryDeadLetterStore implements DeadLetterStore {
  private readonly letters = new Map<string, DeadLetter>();

  async add(letter: DeadLetter): Promise<void> {
    this.letters.set(letter.id, deepClone(letter));
  }

  async list(filter?: { key?: string; replayed?: boolean; limit?: number }): Promise<DeadLetter[]> {
    let letters = Array.from(this.letters.values());

    if (filter?.key) {
      letters = letters.filter((letter) => letter.key === filter.key);
    }
    if (filter?.replayed !== undefined) {
      letters = letters.filter((letter) => (letter.replayedAt !== undefined) === filter.replayed);
    }

    letters = letters.sort((a, b) => a.createdAt - b.createdAt);

    if (filter?.limit !== undefined && letters.length > filter.limit) {
      letters = letters.slice(-filter.limit);
    }

    return letters.map((letter) => deepClone(letter));
  }

  async markReplayed(id: string): Promise<void> {
    const letter = this.letters.get(id);
    if (letter) {
      this.letters.set(id, { ...letter, replayedAt: Date.now() });
    }
  }

  clear(): void {
    this.letters.clear();
  }
}
