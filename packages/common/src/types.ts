export type Status = "initializing" | "starting" | "running" | "stopping" | "stopped" | "error";

export interface Lifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Status;
}

export interface Service extends Lifecycle {
  readonly name: string;
}

export interface Disposable {
  dispose(): Promise<void>;
}

export interface Identifiable {
  readonly id: string;
}

export interface Timestamped {
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SoftDeletable {
  deletedAt?: number;
  isDeleted(): boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface Result<T, E = Error> {
  ok: boolean;
  value?: T;
  error?: E;
}

export type ServiceFactory<T = unknown> = () => T | Promise<T>;

export interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

export interface TenantContext {
  tenantId: string;
  organizationId?: string;
  projectId?: string;
  environment: "development" | "staging" | "production";
}
