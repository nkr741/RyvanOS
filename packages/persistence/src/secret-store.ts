import type { DocumentStore } from "@ryvan/storage";
import type { SealedSecret, SecretScope, SecretStore } from "@ryvan/secrets";

const COLLECTION = "secrets";

/**
 * Durable secret storage.
 *
 * Only ciphertext reaches this layer — `SecretsService` seals before it writes,
 * so a database dump contains no readable credential. That is the property that
 * makes a leaked backup survivable.
 */
export class DocumentSecretStore implements SecretStore {
  constructor(private readonly documents: DocumentStore) {}

  async put(secret: SealedSecret): Promise<void> {
    await this.documents.put(COLLECTION, secret);
  }

  async get(id: string): Promise<SealedSecret | undefined> {
    return this.documents.get<SealedSecret>(COLLECTION, id);
  }

  async list(scope?: SecretScope): Promise<SealedSecret[]> {
    const where: Record<string, unknown> = {};
    if (scope?.orgId !== undefined) where["scope.orgId"] = scope.orgId;
    if (scope?.projectId !== undefined) where["scope.projectId"] = scope.projectId;

    return this.documents.find<SealedSecret>(COLLECTION, {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "name",
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.documents.delete(COLLECTION, id);
  }
}
