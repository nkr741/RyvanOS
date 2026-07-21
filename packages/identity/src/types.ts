export type Permission = string;

export interface User {
  readonly id: string;
  email: string;
  name: string;
  passwordHash: string;
  organizationId: string;
  roles: string[];
  status: "active" | "suspended" | "deleted";
  readonly createdAt: number;
  updatedAt: number;
}

export interface Organization {
  readonly id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  settings: Record<string, unknown>;
  readonly createdAt: number;
  updatedAt: number;
}

export interface Project {
  readonly id: string;
  name: string;
  organizationId: string;
  description: string;
  settings: Record<string, unknown>;
  readonly createdAt: number;
  updatedAt: number;
}

export interface Role {
  readonly id: string;
  name: string;
  permissions: Permission[];
  scope: "system" | "organization" | "project";
  description: string;
}

export interface APIKey {
  readonly id: string;
  name: string;
  keyHash: string;
  prefix: string;
  userId: string;
  organizationId: string;
  permissions: Permission[];
  expiresAt?: number;
  lastUsedAt?: number;
  readonly createdAt: number;
}

export interface Session {
  readonly id: string;
  userId: string;
  token: string;
  expiresAt: number;
  readonly createdAt: number;
  metadata: Record<string, unknown>;
}

export interface TokenPayload {
  sub: string;
  org: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

export type SafeUser = Omit<User, "passwordHash">;

export interface AuthResult {
  user: SafeUser;
  token: string;
  expiresAt: number;
}
