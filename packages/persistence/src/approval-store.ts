import { NotFoundError } from "@ryvan/common";
import type { DocumentStore } from "@ryvan/storage";
import { buildApproval, decideApproval, expireIfLapsed } from "@ryvan/policy-engine";
import type {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalStore,
  RaiseApprovalInput,
} from "@ryvan/policy-engine";

const COLLECTION = "approvals";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Durable approval store.
 *
 * Without this, a restart loses every pending approval and any workflow waiting
 * on one resumes straight to `expired` — a deploy silently turns "waiting for
 * the CFO" into "denied". The decision logic itself is shared with the
 * in-memory store so both behave identically.
 */
export class DocumentApprovalStore implements ApprovalStore {
  constructor(
    private readonly documents: DocumentStore,
    private readonly defaultTtlMs = DEFAULT_TTL_MS,
  ) {}

  async raise(input: RaiseApprovalInput): Promise<ApprovalRequest> {
    const request = buildApproval(input, this.defaultTtlMs);
    await this.documents.put(COLLECTION, request);
    return request;
  }

  /** Reads a request, persisting the transition when its TTL has passed. */
  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    const request = await this.documents.get<ApprovalRequest>(COLLECTION, approvalId);
    if (!request) return undefined;

    const expired = expireIfLapsed(request);
    if (expired) {
      await this.documents.put(COLLECTION, expired);
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
    const stored = await this.documents.find<ApprovalRequest>(COLLECTION, {
      where: status ? { status } : undefined,
      orderBy: "requestedAt",
      direction: "asc",
    });

    // A row still marked "pending" may have lapsed since it was written, so
    // resolve each through `get` rather than trusting the stored status.
    const resolved: ApprovalRequest[] = [];
    for (const request of stored) {
      const current = (await this.get(request.id)) ?? request;
      if (!status || current.status === status) {
        resolved.push(current);
      }
    }

    return resolved;
  }

  async pending(): Promise<ApprovalRequest[]> {
    return this.list("pending");
  }

  async expireStale(): Promise<ApprovalRequest[]> {
    const candidates = await this.documents.find<ApprovalRequest>(COLLECTION, {
      where: { status: "pending" },
    });

    const expired: ApprovalRequest[] = [];

    for (const request of candidates) {
      const lapsed = expireIfLapsed(request);
      if (lapsed) {
        await this.documents.put(COLLECTION, lapsed);
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
    await this.documents.put(COLLECTION, decided);

    return decided;
  }
}
