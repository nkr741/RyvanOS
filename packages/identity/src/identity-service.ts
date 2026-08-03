import {
  generateId,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
} from "@ryvan/common";
import type { Status, Service } from "@ryvan/common";
import type { EventBus } from "@ryvan/events";
import { RBACEngine } from "./rbac.js";
import { TokenManager } from "./token.js";
import type { TokenManagerConfig } from "./token.js";
import { APIKeyManager } from "./api-keys.js";
import { InMemoryIdentityStore, normalizeEmail } from "./identity-store.js";
import type { IdentityStore } from "./identity-store.js";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./password.js";
import type { User, Organization, Project, AuthResult, SafeUser } from "./types.js";

export interface IdentityServiceConfig {
  token: TokenManagerConfig;
  /**
   * Where identity records live. Defaults to an in-memory store, which loses
   * every user, organization and API key on restart.
   */
  store?: IdentityStore;
}

export class IdentityService implements Service {
  readonly name = "identity";
  readonly rbac: RBACEngine;
  readonly tokens: TokenManager;
  readonly apiKeys: APIKeyManager;

  private currentStatus: Status = "stopped";
  private readonly store: IdentityStore;
  private eventBus?: EventBus;

  constructor(config: IdentityServiceConfig, eventBus?: EventBus) {
    this.store = config.store ?? new InMemoryIdentityStore();
    this.rbac = new RBACEngine();
    this.tokens = new TokenManager(config.token);
    this.apiKeys = new APIKeyManager(this.store);
    this.eventBus = eventBus;
  }

  async start(): Promise<void> {
    this.currentStatus = "starting";
    await this.rehydrateRoles();
    this.currentStatus = "running";
  }

  /**
   * Re-assigns every persisted user's roles into the RBAC engine.
   *
   * Role assignments live in memory inside `RBACEngine`, so without this a
   * restart would leave persisted users authenticated but authorised for
   * nothing. Roles are recovered from the user record, which is the durable
   * source of truth.
   *
   * Custom roles registered with `rbac.defineRole()` are *not* recovered —
   * callers must re-declare them on boot, the same way they declare workflows.
   */
  private async rehydrateRoles(): Promise<void> {
    for (const user of await this.store.listUsers()) {
      for (const roleId of user.roles) {
        try {
          this.rbac.assignRole(user.id, roleId, { orgId: user.organizationId });
        } catch {
          // A role the engine no longer knows about — skip it rather than
          // refusing to start the whole platform over one stale assignment.
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.currentStatus = "stopping";
    this.currentStatus = "stopped";
  }

  status(): Status {
    return this.currentStatus;
  }

  async createUser(data: {
    email: string;
    name: string;
    password: string;
    organizationId: string;
  }): Promise<User> {
    if (!data.email) {
      throw new ValidationError("email", "must not be empty");
    }
    if (!data.name) {
      throw new ValidationError("name", "must not be empty");
    }
    if (!data.password) {
      throw new ValidationError("password", "must not be empty");
    }
    if (!data.organizationId) {
      throw new ValidationError("organizationId", "must not be empty");
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new ValidationError("email", "invalid email format");
    }

    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new ValidationError("password", strength.errors.join("; "));
    }

    if (!(await this.store.getOrganization(data.organizationId))) {
      throw new NotFoundError("organization", data.organizationId);
    }

    if (await this.store.getUserByEmail(normalizedEmail)) {
      throw new ConflictError("user", `email "${normalizedEmail}" already exists`);
    }

    const passwordHash = await hashPassword(data.password);
    const now = Date.now();

    const user: User = {
      id: generateId("usr"),
      email: normalizedEmail,
      name: data.name,
      passwordHash,
      organizationId: data.organizationId,
      roles: ["org:member"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveUser(user);

    this.rbac.assignRole(user.id, "org:member", { orgId: data.organizationId });

    await this.emit("identity:user.created", {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
    });

    return user;
  }

  async authenticateWithPassword(email: string, password: string): Promise<AuthResult> {
    if (!email) {
      throw new ValidationError("email", "must not be empty");
    }
    if (!password) {
      throw new ValidationError("password", "must not be empty");
    }

    const user = await this.store.getUserByEmail(email);
    if (!user) {
      throw new AuthenticationError("invalid credentials");
    }

    if (user.status !== "active") {
      throw new AuthenticationError("account is not active");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AuthenticationError("invalid credentials");
    }

    const roles = this.rbac.getUserRoles(user.id);
    const permissions = new Set<string>();
    for (const role of roles) {
      for (const p of this.rbac.getRolePermissions(role.id)) {
        permissions.add(p);
      }
    }

    const token = this.tokens.sign({
      sub: user.id,
      org: user.organizationId,
      roles: user.roles,
      permissions: Array.from(permissions),
    });

    const decoded = this.tokens.decode(token);
    const expiresAt = decoded?.exp ?? 0;

    await this.emit("identity:user.authenticated", {
      userId: user.id,
      method: "password",
    });

    return { user: this.toSafeUser(user), token, expiresAt };
  }

  async authenticateWithAPIKey(rawKey: string): Promise<AuthResult> {
    if (!rawKey) {
      throw new ValidationError("apiKey", "must not be empty");
    }

    const apiKey = await this.apiKeys.validate(rawKey);
    if (!apiKey) {
      throw new AuthenticationError("invalid API key");
    }

    const user = await this.store.getUser(apiKey.userId);
    if (!user) {
      throw new AuthenticationError("API key owner not found");
    }

    if (user.status !== "active") {
      throw new AuthenticationError("account is not active");
    }

    const token = this.tokens.sign({
      sub: user.id,
      org: user.organizationId,
      roles: user.roles,
      permissions: apiKey.permissions,
    });

    const decoded = this.tokens.decode(token);
    const expiresAt = decoded?.exp ?? 0;

    await this.emit("identity:user.authenticated", {
      userId: user.id,
      method: "api_key",
      keyId: apiKey.id,
    });

    return { user: this.toSafeUser(user), token, expiresAt };
  }

  authorize(
    userId: string,
    permission: string,
    scope?: { orgId?: string; projectId?: string },
  ): boolean {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }
    if (!permission) {
      throw new ValidationError("permission", "must not be empty");
    }

    const allowed = this.rbac.hasPermission(userId, permission, scope);
    if (!allowed) {
      void this.emit("identity:authorization.denied", {
        userId,
        permission,
        scope,
      });
    }
    return allowed;
  }

  async getUser(userId: string): Promise<User | undefined> {
    return this.store.getUser(userId);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    return this.store.getUserByEmail(normalizeEmail(email));
  }

  async createOrganization(data: {
    name: string;
    slug: string;
    plan?: "free" | "pro" | "enterprise";
  }): Promise<Organization> {
    if (!data.name) {
      throw new ValidationError("name", "must not be empty");
    }
    if (!data.slug) {
      throw new ValidationError("slug", "must not be empty");
    }

    if (await this.store.getOrganizationBySlug(data.slug)) {
      throw new ConflictError("organization", `slug "${data.slug}" already exists`);
    }

    const now = Date.now();
    const org: Organization = {
      id: generateId("org"),
      name: data.name,
      slug: data.slug,
      plan: data.plan ?? "free",
      settings: {},
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveOrganization(org);
    await this.emit("identity:org.created", { orgId: org.id, name: org.name, slug: org.slug });
    return org;
  }

  async getOrganization(orgId: string): Promise<Organization | undefined> {
    return this.store.getOrganization(orgId);
  }

  async createProject(data: {
    name: string;
    organizationId: string;
    description?: string;
  }): Promise<Project> {
    if (!data.name) {
      throw new ValidationError("name", "must not be empty");
    }
    if (!data.organizationId) {
      throw new ValidationError("organizationId", "must not be empty");
    }

    if (!(await this.store.getOrganization(data.organizationId))) {
      throw new NotFoundError("organization", data.organizationId);
    }

    const now = Date.now();
    const project: Project = {
      id: generateId("prj"),
      name: data.name,
      organizationId: data.organizationId,
      description: data.description ?? "",
      settings: {},
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveProject(project);
    await this.emit("identity:project.created", {
      projectId: project.id,
      name: project.name,
      organizationId: project.organizationId,
    });
    return project;
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.store.getProject(projectId);
  }

  private toSafeUser(user: User): SafeUser {
    const safeUser: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(user)) {
      if (key !== "passwordHash") safeUser[key] = value;
    }
    return safeUser as SafeUser;
  }

  private async emit(type: string, data: Record<string, unknown>): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.emit(type, data, { source: this.name });
    }
  }
}
