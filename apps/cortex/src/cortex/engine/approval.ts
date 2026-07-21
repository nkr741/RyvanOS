import { prisma } from "@/lib/prisma";
import { eventBus } from "../runtime/event";

// ─── Human Approval Gateway ────────────────────────────────────
// No agent sends external comms without approval policy check.
// approval.granted.v1 → mission continues
// approval.denied.v1 → mission fails gracefully

export type ApprovalDecision = "automatic" | "approval_required";

export interface ApprovalRequest {
  missionId: string;
  stepId: string;
  action: string;
  agentId: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface ApprovalResult {
  approved: boolean;
  autoApproved: boolean;
  reason?: string;
}

const DEFAULT_POLICIES: Record<string, ApprovalDecision> = {
  "research.execute": "automatic",
  "analysis.execute": "automatic",
  "score.calculate": "automatic",
  "proposal.draft": "automatic",
  "followup.create": "automatic",
  "activity.log": "automatic",
  "notification.internal": "automatic",
  "proposal.send": "approval_required",
  "email.send": "approval_required",
  "whatsapp.send": "approval_required",
  "meeting.schedule": "approval_required",
  "contract.generate": "approval_required",
  "stage.change": "approval_required",
  "payment.process": "approval_required",
};

class ApprovalGatewayImpl {
  async checkPolicy(action: string): Promise<ApprovalDecision> {
    const dbPolicy = await prisma.approvalPolicy.findUnique({
      where: { action },
    });

    if (dbPolicy) {
      return dbPolicy.policy as ApprovalDecision;
    }

    return DEFAULT_POLICIES[action] || "approval_required";
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const policy = await this.checkPolicy(request.action);

    if (policy === "automatic") {
      await eventBus.publish({
        type: "approval.auto_granted.v1",
        version: "1",
        payload: {
          action: request.action,
          agentId: request.agentId,
          stepId: request.stepId,
        },
        source: "approval-gateway",
        missionId: request.missionId,
        correlationId: request.missionId,
      });

      return { approved: true, autoApproved: true };
    }

    await prisma.notification.create({
      data: {
        userId: (await this.getAdminId()),
        title: `Approval Required: ${request.description}`,
        message: `Agent "${request.agentId}" needs approval for "${request.action}" in mission ${request.missionId}`,
        type: "approval",
        actionUrl: `/admin/missions?approve=${request.stepId}`,
      },
    });

    await eventBus.publish({
      type: "approval.requested.v1",
      version: "1",
      payload: {
        action: request.action,
        agentId: request.agentId,
        stepId: request.stepId,
        description: request.description,
      },
      source: "approval-gateway",
      missionId: request.missionId,
      correlationId: request.missionId,
    });

    return { approved: false, autoApproved: false, reason: "Awaiting human approval" };
  }

  async grantApproval(
    stepId: string,
    userId: string,
  ): Promise<void> {
    const step = await prisma.missionStep.update({
      where: { id: stepId },
      data: {
        status: "running",
        approvedById: userId,
        approvedAt: new Date(),
      },
      include: { mission: true },
    });

    await eventBus.publish({
      type: "approval.granted.v1",
      version: "1",
      payload: { stepId, userId, agentId: step.agentId },
      source: "approval-gateway",
      missionId: step.missionId,
      correlationId: step.missionId,
    });
  }

  async denyApproval(
    stepId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    const step = await prisma.missionStep.update({
      where: { id: stepId },
      data: {
        status: "failed",
        error: `Denied: ${reason}`,
        approvedById: userId,
        approvedAt: new Date(),
      },
      include: { mission: true },
    });

    await eventBus.publish({
      type: "approval.denied.v1",
      version: "1",
      payload: { stepId, userId, reason, agentId: step.agentId },
      source: "approval-gateway",
      missionId: step.missionId,
      correlationId: step.missionId,
    });
  }

  async listPolicies(): Promise<{ action: string; policy: ApprovalDecision; source: string }[]> {
    const dbPolicies = await prisma.approvalPolicy.findMany();
    const dbMap = new Map(dbPolicies.map(p => [p.action, p.policy as ApprovalDecision]));

    const all = new Map<string, { policy: ApprovalDecision; source: string }>();

    for (const [action, policy] of Object.entries(DEFAULT_POLICIES)) {
      all.set(action, { policy, source: "default" });
    }

    for (const [action, policy] of dbMap) {
      all.set(action, { policy, source: "custom" });
    }

    return Array.from(all.entries()).map(([action, { policy, source }]) => ({
      action,
      policy,
      source,
    }));
  }

  private async getAdminId(): Promise<string> {
    const admin = await prisma.user.findFirst({
      where: { role: "admin", active: true },
      select: { id: true },
    });
    return admin?.id || "";
  }
}

export const approvalGateway = new ApprovalGatewayImpl();
