import { ValidationError } from "@ryvan/common";
import type { Role, Permission } from "./types.js";

const BUILT_IN_ROLES: Role[] = [
  {
    id: "system:admin",
    name: "System Administrator",
    permissions: ["*"],
    scope: "system",
    description: "Full system access",
  },
  {
    id: "org:owner",
    name: "Organization Owner",
    permissions: [
      "org:read",
      "org:update",
      "org:delete",
      "org:members:manage",
      "org:billing:manage",
      "org:settings:manage",
      "org:projects:create",
      "org:projects:delete",
      "org:api-keys:manage",
      "project:read",
      "project:update",
      "project:delete",
      "project:members:manage",
      "project:settings:manage",
    ],
    scope: "organization",
    description: "Full organization access including billing and deletion",
  },
  {
    id: "org:admin",
    name: "Organization Admin",
    permissions: [
      "org:read",
      "org:update",
      "org:members:manage",
      "org:settings:manage",
      "org:projects:create",
      "org:projects:delete",
      "org:api-keys:manage",
      "project:read",
      "project:update",
      "project:delete",
      "project:members:manage",
      "project:settings:manage",
    ],
    scope: "organization",
    description: "Organization admin without billing or org deletion",
  },
  {
    id: "org:member",
    name: "Organization Member",
    permissions: ["org:read", "project:read", "project:update"],
    scope: "organization",
    description: "Basic organization membership",
  },
  {
    id: "project:admin",
    name: "Project Admin",
    permissions: [
      "project:read",
      "project:update",
      "project:delete",
      "project:members:manage",
      "project:settings:manage",
    ],
    scope: "project",
    description: "Full project access",
  },
  {
    id: "project:member",
    name: "Project Member",
    permissions: ["project:read", "project:update"],
    scope: "project",
    description: "Can read and update project resources",
  },
  {
    id: "project:viewer",
    name: "Project Viewer",
    permissions: ["project:read"],
    scope: "project",
    description: "Read-only project access",
  },
];

const ROLE_HIERARCHY: Record<string, string[]> = {
  "org:owner": ["org:admin"],
  "org:admin": ["org:member"],
  "project:admin": ["project:member"],
  "project:member": ["project:viewer"],
};

export class RBACEngine {
  private roles = new Map<string, Role>();
  private userRoles = new Map<string, Set<string>>();
  private scopedAssignments = new Map<string, Map<string, Set<string>>>();

  constructor() {
    for (const role of BUILT_IN_ROLES) {
      this.roles.set(role.id, role);
    }
  }

  defineRole(role: Role): void {
    if (!role.id || !role.name) {
      throw new ValidationError("role", "id and name are required");
    }
    if (!role.permissions || role.permissions.length === 0) {
      throw new ValidationError("role", "must have at least one permission");
    }
    const validScopes: Role["scope"][] = ["system", "organization", "project"];
    if (!validScopes.includes(role.scope)) {
      throw new ValidationError("role", `scope must be one of: ${validScopes.join(", ")}`);
    }
    if (this.roles.has(role.id) && BUILT_IN_ROLES.some((r) => r.id === role.id)) {
      throw new ValidationError("role", `cannot redefine built-in role "${role.id}"`);
    }
    this.roles.set(role.id, role);
  }

  assignRole(userId: string, roleId: string, scope?: { orgId?: string; projectId?: string }): void {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }
    if (!this.roles.has(roleId)) {
      throw new ValidationError("roleId", `role "${roleId}" does not exist`);
    }

    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId)!.add(roleId);

    if (scope?.orgId || scope?.projectId) {
      const scopeKey = scope.projectId ? `project:${scope.projectId}` : `org:${scope.orgId}`;

      if (!this.scopedAssignments.has(userId)) {
        this.scopedAssignments.set(userId, new Map());
      }
      const userScopes = this.scopedAssignments.get(userId)!;
      if (!userScopes.has(scopeKey)) {
        userScopes.set(scopeKey, new Set());
      }
      userScopes.get(scopeKey)!.add(roleId);
    }
  }

  removeRole(userId: string, roleId: string): void {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }

    const roles = this.userRoles.get(userId);
    if (roles) {
      roles.delete(roleId);
      if (roles.size === 0) {
        this.userRoles.delete(userId);
      }
    }

    const scopes = this.scopedAssignments.get(userId);
    if (scopes) {
      for (const [scopeKey, scopeRoles] of scopes) {
        scopeRoles.delete(roleId);
        if (scopeRoles.size === 0) {
          scopes.delete(scopeKey);
        }
      }
      if (scopes.size === 0) {
        this.scopedAssignments.delete(userId);
      }
    }
  }

  hasPermission(
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

    const effectiveRoles = this.getEffectiveRoleIds(userId, scope);
    const allPermissions = this.collectPermissions(effectiveRoles);
    return allPermissions.has("*") || allPermissions.has(permission);
  }

  getUserRoles(userId: string): Role[] {
    if (!userId) {
      throw new ValidationError("userId", "must not be empty");
    }
    const roleIds = this.userRoles.get(userId);
    if (!roleIds) return [];

    const roles: Role[] = [];
    for (const roleId of roleIds) {
      const role = this.roles.get(roleId);
      if (role) roles.push(role);
    }
    return roles;
  }

  getRolePermissions(roleId: string): Permission[] {
    if (!roleId) {
      throw new ValidationError("roleId", "must not be empty");
    }
    const allPermissions = this.collectPermissions(new Set([roleId]));
    return Array.from(allPermissions);
  }

  private getEffectiveRoleIds(
    userId: string,
    scope?: { orgId?: string; projectId?: string },
  ): Set<string> {
    const directRoles = this.userRoles.get(userId);
    if (!directRoles || directRoles.size === 0) return new Set();

    const effective = new Set<string>(directRoles);

    if (scope) {
      const userScopes = this.scopedAssignments.get(userId);
      if (userScopes) {
        if (scope.projectId) {
          const projectRoles = userScopes.get(`project:${scope.projectId}`);
          if (projectRoles) {
            for (const r of projectRoles) effective.add(r);
          }
        }
        if (scope.orgId) {
          const orgRoles = userScopes.get(`org:${scope.orgId}`);
          if (orgRoles) {
            for (const r of orgRoles) effective.add(r);
          }
        }
      }
    }

    return effective;
  }

  private collectPermissions(roleIds: Set<string>): Set<string> {
    const permissions = new Set<string>();
    const visited = new Set<string>();

    const collect = (roleId: string): void => {
      if (visited.has(roleId)) return;
      visited.add(roleId);

      const role = this.roles.get(roleId);
      if (role) {
        for (const p of role.permissions) {
          permissions.add(p);
        }
      }

      const inherited = ROLE_HIERARCHY[roleId];
      if (inherited) {
        for (const childRoleId of inherited) {
          collect(childRoleId);
        }
      }
    };

    for (const roleId of roleIds) {
      collect(roleId);
    }

    return permissions;
  }
}
