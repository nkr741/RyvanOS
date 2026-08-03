import { ConflictError, NotFoundError, ValidationError, generateId } from "@ryvan/common";
import type { ApprovalRequest, ApprovalStatus, PolicySubject } from "./types.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface RaiseApprovalInput {
  action: string;
  resource?: string;
  subject: PolicySubject;
  reason: string;
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Where pending approvals live.
 *
 * Every method is async because any real implementation talks to a database —
 * a synchronous port would have to be redesigned the moment approvals needed to
 * outlive the process, and an approval that does not survive a restart silently
 * turns into a denial.
 *
 * `@ryvan/persistence` supplies the durable implementation.
 */
export interface ApprovalStore {
  raise(input: RaiseApprovalInput): Promise<ApprovalRequest>;
  get(approvalId: string): Promise<ApprovalRequest | undefined>;
  grant(approvalId: string, decidedBy: string, note?: string): Promise<ApprovalRequest>;
  deny(approvalId: string, decidedBy: string, note?: string): Promise<ApprovalRequest>;
  list(status?: ApprovalStatus): Promise<ApprovalRequest[]>;
  pending(): Promise<ApprovalRequest[]>;
  /** Sweeps lapsed requests, returning those that transitioned on this call. */
  expireStale(): Promise<ApprovalRequest[]>;
}

/** Builds the record for a new approval. Shared by every implementation. */
export function buildApproval(input: RaiseApprovalInput, defaultTtlMs: number): ApprovalRequest {
  if (!input.action) {
    throw new ValidationError("action", "must not be empty");
  }
  if (!input.reason) {
    throw new ValidationError("reason", "must not be empty");
  }

  const now = Date.now();

  return {
    id: generateId("appr"),
    action: input.action,
    resource: input.resource,
    subject: input.subject,
    reason: input.reason,
    status: "pending",
    requestedAt: now,
    expiresAt: now + (input.ttlMs ?? defaultTtlMs),
    metadata: input.metadata,
  };
}

/**
 * Applies a decision, refusing to overwrite one already made. Returns the
 * updated record; the caller persists it.
 */
export function decideApproval(
  request: ApprovalRequest,
  status: "granted" | "denied",
  decidedBy: string,
  note?: string,
): ApprovalRequest {
  if (!decidedBy) {
    throw new ValidationError("decidedBy", "must not be empty");
  }
  if (request.status !== "pending") {
    throw new ConflictError("ApprovalRequest", `already ${request.status}`);
  }

  return {
    ...request,
    status,
    decidedAt: Date.now(),
    decidedBy,
    decisionNote: note,
  };
}

/** Marks a lapsed request expired. Returns undefined when it has not lapsed. */
export function expireIfLapsed(
  request: ApprovalRequest,
  now = Date.now(),
): ApprovalRequest | undefined {
  if (request.status !== "pending" || now < request.expiresAt) return undefined;
  return { ...request, status: "expired", decidedAt: now };
}

/**
 * Process-local approval store. Correct for tests and for a single-process
 * deployment that can afford to lose pending approvals on restart.
 */
export class InMemoryApprovalStore implements ApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = DEFAULT_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
  }

  async raise(input: RaiseApprovalInput): Promise<ApprovalRequest> {
    const request = buildApproval(input, this.defaultTtlMs);
    this.requests.set(request.id, request);
    return request;
  }

  /** Reads a request, lazily transitioning it to "expired" when its TTL has passed. */
  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    const request = this.requests.get(approvalId);
    if (!request) return undefined;

    const expired = expireIfLapsed(request);
    if (expired) {
      this.requests.set(approvalId, expired);
      return expired;
    }

    return request;
  }

  async grant(approvalId: string, decidedBy: string, note?: string): Promise<ApprovalRequest> {
    return this.decide(approvalId, "granted", decidedBy, note);
  }

  async deny(approvalId: string, decidedBy: string, note?: string): Promise<ApprovalRequest> {
    return this.decide(approvalId, "denied", decidedBy, note);
  }

  async list(status?: ApprovalStatus): Promise<ApprovalRequest[]> {
    const all: ApprovalRequest[] = [];

    for (const id of Array.from(this.requests.keys())) {
      const request = await this.get(id);
      if (request) all.push(request);
    }

    return status ? all.filter((request) => request.status === status) : all;
  }

  async pending(): Promise<ApprovalRequest[]> {
    return this.list("pending");
  }

  async expireStale(): Promise<ApprovalRequest[]> {
    const expired: ApprovalRequest[] = [];

    for (const request of Array.from(this.requests.values())) {
      const lapsed = expireIfLapsed(request);
      if (lapsed) {
        this.requests.set(lapsed.id, lapsed);
        expired.push(lapsed);
      }
    }

    return expired;
  }

  private async decide(
    approvalId: string,
    status: "granted" | "denied",
    decidedBy: string,
    note?: string,
  ): Promise<ApprovalRequest> {
    const request = await this.get(approvalId);
    if (!request) {
      throw new NotFoundError("ApprovalRequest", approvalId);
    }

    const decided = decideApproval(request, status, decidedBy, note);
    this.requests.set(approvalId, decided);

    return decided;
  }
}
