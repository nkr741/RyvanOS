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
 * Tracks human-in-the-loop approval gates.
 *
 * Storage is in-memory and process-local. A Postgres-backed store will
 * implement the same surface when persistence lands (see PLATFORM-ROADMAP.md).
 */
export class ApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = DEFAULT_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
  }

  raise(input: RaiseApprovalInput): ApprovalRequest {
    if (!input.action) {
      throw new ValidationError("action", "must not be empty");
    }
    if (!input.reason) {
      throw new ValidationError("reason", "must not be empty");
    }

    const now = Date.now();
    const request: ApprovalRequest = {
      id: generateId("appr"),
      action: input.action,
      resource: input.resource,
      subject: input.subject,
      reason: input.reason,
      status: "pending",
      requestedAt: now,
      expiresAt: now + (input.ttlMs ?? this.defaultTtlMs),
      metadata: input.metadata,
    };

    this.requests.set(request.id, request);
    return request;
  }

  /** Reads a request, lazily transitioning it to "expired" when its TTL has passed. */
  get(approvalId: string): ApprovalRequest | undefined {
    const request = this.requests.get(approvalId);
    if (!request) return undefined;

    if (request.status === "pending" && Date.now() >= request.expiresAt) {
      request.status = "expired";
      request.decidedAt = Date.now();
    }

    return request;
  }

  grant(approvalId: string, decidedBy: string, note?: string): ApprovalRequest {
    return this.decide(approvalId, "granted", decidedBy, note);
  }

  deny(approvalId: string, decidedBy: string, note?: string): ApprovalRequest {
    return this.decide(approvalId, "denied", decidedBy, note);
  }

  list(status?: ApprovalStatus): ApprovalRequest[] {
    const all = Array.from(this.requests.keys())
      .map((id) => this.get(id))
      .filter((request): request is ApprovalRequest => request !== undefined);

    return status ? all.filter((request) => request.status === status) : all;
  }

  pending(): ApprovalRequest[] {
    return this.list("pending");
  }

  /** Sweeps expired requests and returns those that transitioned on this call. */
  expireStale(): ApprovalRequest[] {
    const now = Date.now();
    const expired: ApprovalRequest[] = [];

    for (const request of this.requests.values()) {
      if (request.status === "pending" && now >= request.expiresAt) {
        request.status = "expired";
        request.decidedAt = now;
        expired.push(request);
      }
    }

    return expired;
  }

  private decide(
    approvalId: string,
    status: "granted" | "denied",
    decidedBy: string,
    note?: string,
  ): ApprovalRequest {
    if (!decidedBy) {
      throw new ValidationError("decidedBy", "must not be empty");
    }

    const request = this.get(approvalId);
    if (!request) {
      throw new NotFoundError("ApprovalRequest", approvalId);
    }
    if (request.status !== "pending") {
      throw new ConflictError("ApprovalRequest", `already ${request.status}`);
    }

    request.status = status;
    request.decidedAt = Date.now();
    request.decidedBy = decidedBy;
    request.decisionNote = note;

    return request;
  }
}
