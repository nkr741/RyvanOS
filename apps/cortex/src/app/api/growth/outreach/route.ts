import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isEnabled } from "@/lib/features";
import { sendEmail } from "@/cortex/email";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:growth:outreach");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "pending";

    if (view === "pending") {
      const steps = await prisma.outreachStep.findMany({
        where: { status: "pending", approvalRequired: true },
        orderBy: { createdAt: "asc" },
        include: {
          sequence: {
            include: { company: { select: { id: true, name: true, industry: true } } },
          },
          contact: { select: { id: true, name: true, email: true, title: true } },
        },
      });
      return NextResponse.json({ steps });
    }

    if (view === "sent") {
      const logs = await prisma.emailLog.findMany({
        orderBy: { sentAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ emails: logs });
    }

    if (view === "stats") {
      const [total, sent, delivered, opened, bounced] = await Promise.all([
        prisma.emailLog.count(),
        prisma.emailLog.count({ where: { status: "sent" } }),
        prisma.emailLog.count({ where: { status: "delivered" } }),
        prisma.emailLog.count({ where: { status: "opened" } }),
        prisma.emailLog.count({ where: { status: "bounced" } }),
      ]);
      return NextResponse.json({
        stats: { total, sent, delivered, opened, bounced },
        sendingEnabled: isEnabled("EMAIL_SENDING_ENABLED"),
      });
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Outreach GET error");
    return NextResponse.json({ error: "Failed to load outreach data" }, { status: 500 });
  }
});

export const POST = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "approve_step") {
      const { stepId } = body;
      if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });

      const step = await prisma.outreachStep.findUnique({
        where: { id: stepId },
        include: { contact: true, sequence: true },
      });
      if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });
      if (step.status !== "pending") {
        return NextResponse.json({ error: `Step is already ${step.status}` }, { status: 400 });
      }

      await prisma.outreachStep.update({
        where: { id: stepId },
        data: { status: "approved" },
      });

      return NextResponse.json({ success: true, status: "approved" });
    }

    if (action === "approve_and_send") {
      const { stepId, recipientEmail } = body;
      if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });

      const step = await prisma.outreachStep.findUnique({
        where: { id: stepId },
        include: {
          contact: true,
          sequence: { include: { company: { select: { id: true, name: true } } } },
        },
      });
      if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });
      if (step.status !== "pending" && step.status !== "approved") {
        return NextResponse.json({ error: `Step is already ${step.status}` }, { status: 400 });
      }

      const toEmail = recipientEmail || step.contact?.email;
      if (!toEmail) {
        return NextResponse.json(
          {
            error: "No recipient email — provide recipientEmail or ensure the contact has an email",
          },
          { status: 400 },
        );
      }

      if (!step.subject || !step.content) {
        return NextResponse.json({ error: "Step has no email content" }, { status: 400 });
      }

      const result = await sendEmail({
        to: toEmail,
        subject: step.subject,
        body: step.content,
        outreachStepId: step.id,
        contactId: step.contactId || undefined,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error || "Email send failed" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        emailLogId: result.emailLogId,
        resendMessageId: result.resendMessageId,
      });
    }

    if (action === "skip_step") {
      const { stepId } = body;
      if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });

      await prisma.outreachStep.update({
        where: { id: stepId },
        data: { status: "skipped" },
      });

      return NextResponse.json({ success: true, status: "skipped" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Outreach POST error");
    return NextResponse.json({ error: "Failed to process outreach request" }, { status: 500 });
  }
});
