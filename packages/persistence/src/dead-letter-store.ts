import { applyRange } from "@ryvan/common";
import type { DocumentStore } from "@ryvan/storage";
import type { DeadLetter, DeadLetterStore } from "@ryvan/resilience";

const COLLECTION = "dead_letters";

/**
 * Durable dead-letter storage.
 *
 * The whole point of a dead letter is that the work outlives the failure that
 * parked it — an in-memory queue loses exactly the calls someone promised would
 * eventually happen.
 */
export class DocumentDeadLetterStore implements DeadLetterStore {
  constructor(private readonly documents: DocumentStore) {}

  async add(letter: DeadLetter): Promise<void> {
    await this.documents.put(COLLECTION, letter);
  }

  async list(filter?: { key?: string; replayed?: boolean; limit?: number }): Promise<DeadLetter[]> {
    let letters = await this.documents.find<DeadLetter>(COLLECTION, {
      where: filter?.key ? { key: filter.key } : undefined,
      orderBy: "createdAt",
      direction: "asc",
    });

    // "Replayed" is the presence of a timestamp, which the document port
    // cannot express as an equality filter.
    if (filter?.replayed !== undefined) {
      letters = letters.filter((letter) => (letter.replayedAt !== undefined) === filter.replayed);
    }

    return applyRange(letters, { limit: filter?.limit }, (letter) => letter.createdAt);
  }

  async markReplayed(id: string): Promise<void> {
    const letter = await this.documents.get<DeadLetter>(COLLECTION, id);
    if (!letter) return;

    await this.documents.put(COLLECTION, { ...letter, replayedAt: Date.now() });
  }
}
