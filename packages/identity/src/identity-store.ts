import type { APIKey, Organization, Project, User } from "./types.js";

/**
 * Where identity records live.
 *
 * Async throughout because any real implementation talks to a database. Until
 * this existed, users, organizations, projects and API keys were process maps —
 * a restart logged everyone out and invalidated every key ever issued.
 *
 * `@ryvan/persistence` supplies the durable implementation.
 */
export interface IdentityStore {
  saveUser(user: User): Promise<void>;
  getUser(userId: string): Promise<User | undefined>;
  /** Callers pass the raw address; implementations match on the normalised form. */
  getUserByEmail(email: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;

  saveOrganization(organization: Organization): Promise<void>;
  getOrganization(orgId: string): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;

  saveProject(project: Project): Promise<void>;
  getProject(projectId: string): Promise<Project | undefined>;

  saveApiKey(apiKey: APIKey): Promise<void>;
  getApiKey(keyId: string): Promise<APIKey | undefined>;
  /** Lookup by the public half of the key, which is what a caller presents. */
  getApiKeyByPrefix(prefix: string): Promise<APIKey | undefined>;
  listApiKeysByUser(userId: string): Promise<APIKey[]>;
  listApiKeysByOrg(orgId: string): Promise<APIKey[]>;
  deleteApiKey(keyId: string): Promise<boolean>;
}

/** Emails are compared case-insensitively and without surrounding space. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Process-local identity store. Correct for tests; a data-loss bug in
 * production, where `@ryvan/persistence` should supply the durable one.
 */
export class InMemoryIdentityStore implements IdentityStore {
  private readonly users = new Map<string, User>();
  private readonly organizations = new Map<string, Organization>();
  private readonly projects = new Map<string, Project>();
  private readonly apiKeys = new Map<string, APIKey>();

  async saveUser(user: User): Promise<void> {
    // Normalised on write, exactly as the durable store does, so a lookup
    // behaves the same whichever store is in play.
    this.users.set(user.id, { ...user, email: normalizeEmail(user.email) });
  }

  async getUser(userId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    return user ? { ...user } : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    const normalized = normalizeEmail(email);

    for (const user of this.users.values()) {
      if (user.email === normalized) return { ...user };
    }
    return undefined;
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values()).map((user) => ({ ...user }));
  }

  async saveOrganization(organization: Organization): Promise<void> {
    this.organizations.set(organization.id, { ...organization });
  }

  async getOrganization(orgId: string): Promise<Organization | undefined> {
    const organization = this.organizations.get(orgId);
    return organization ? { ...organization } : undefined;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    for (const organization of this.organizations.values()) {
      if (organization.slug === slug) return { ...organization };
    }
    return undefined;
  }

  async saveProject(project: Project): Promise<void> {
    this.projects.set(project.id, { ...project });
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const project = this.projects.get(projectId);
    return project ? { ...project } : undefined;
  }

  async saveApiKey(apiKey: APIKey): Promise<void> {
    this.apiKeys.set(apiKey.id, { ...apiKey });
  }

  async getApiKey(keyId: string): Promise<APIKey | undefined> {
    const apiKey = this.apiKeys.get(keyId);
    return apiKey ? { ...apiKey } : undefined;
  }

  async getApiKeyByPrefix(prefix: string): Promise<APIKey | undefined> {
    for (const apiKey of this.apiKeys.values()) {
      if (apiKey.prefix === prefix) return { ...apiKey };
    }
    return undefined;
  }

  async listApiKeysByUser(userId: string): Promise<APIKey[]> {
    return Array.from(this.apiKeys.values())
      .filter((apiKey) => apiKey.userId === userId)
      .map((apiKey) => ({ ...apiKey }));
  }

  async listApiKeysByOrg(orgId: string): Promise<APIKey[]> {
    return Array.from(this.apiKeys.values())
      .filter((apiKey) => apiKey.organizationId === orgId)
      .map((apiKey) => ({ ...apiKey }));
  }

  async deleteApiKey(keyId: string): Promise<boolean> {
    return this.apiKeys.delete(keyId);
  }
}
