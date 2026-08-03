import type { DocumentStore } from "@ryvan/storage";
import { normalizeEmail } from "@ryvan/identity";
import type { APIKey, IdentityStore, Organization, Project, User } from "@ryvan/identity";

const COLLECTIONS = {
  users: "users",
  organizations: "organizations",
  projects: "projects",
  apiKeys: "api_keys",
} as const;

/**
 * Durable identity store.
 *
 * Without this, every user, organization, project and API key lived in a
 * process map: a restart logged everyone out and invalidated every key ever
 * issued. Password hashes are stored as-is — they are already bcrypt digests,
 * never plaintext.
 */
export class DocumentIdentityStore implements IdentityStore {
  constructor(private readonly documents: DocumentStore) {}

  async saveUser(user: User): Promise<void> {
    // Emails are normalised on write so the lookup below is an exact match and
    // can use an index, rather than scanning and lower-casing every row.
    await this.documents.put(COLLECTIONS.users, { ...user, email: normalizeEmail(user.email) });
  }

  async getUser(userId: string): Promise<User | undefined> {
    return this.documents.get<User>(COLLECTIONS.users, userId);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;

    const [user] = await this.documents.find<User>(COLLECTIONS.users, {
      where: { email: normalizeEmail(email) },
      limit: 1,
    });

    return user;
  }

  async listUsers(): Promise<User[]> {
    return this.documents.find<User>(COLLECTIONS.users, { orderBy: "createdAt" });
  }

  async saveOrganization(organization: Organization): Promise<void> {
    await this.documents.put(COLLECTIONS.organizations, organization);
  }

  async getOrganization(orgId: string): Promise<Organization | undefined> {
    return this.documents.get<Organization>(COLLECTIONS.organizations, orgId);
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [organization] = await this.documents.find<Organization>(COLLECTIONS.organizations, {
      where: { slug },
      limit: 1,
    });

    return organization;
  }

  async saveProject(project: Project): Promise<void> {
    await this.documents.put(COLLECTIONS.projects, project);
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.documents.get<Project>(COLLECTIONS.projects, projectId);
  }

  async saveApiKey(apiKey: APIKey): Promise<void> {
    await this.documents.put(COLLECTIONS.apiKeys, apiKey);
  }

  async getApiKey(keyId: string): Promise<APIKey | undefined> {
    return this.documents.get<APIKey>(COLLECTIONS.apiKeys, keyId);
  }

  async getApiKeyByPrefix(prefix: string): Promise<APIKey | undefined> {
    const [apiKey] = await this.documents.find<APIKey>(COLLECTIONS.apiKeys, {
      where: { prefix },
      limit: 1,
    });

    return apiKey;
  }

  async listApiKeysByUser(userId: string): Promise<APIKey[]> {
    return this.documents.find<APIKey>(COLLECTIONS.apiKeys, { where: { userId } });
  }

  async listApiKeysByOrg(orgId: string): Promise<APIKey[]> {
    return this.documents.find<APIKey>(COLLECTIONS.apiKeys, {
      where: { organizationId: orgId },
    });
  }

  async deleteApiKey(keyId: string): Promise<boolean> {
    return this.documents.delete(COLLECTIONS.apiKeys, keyId);
  }
}
