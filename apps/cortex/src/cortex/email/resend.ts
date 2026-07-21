import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { isEnabled } from "@/lib/features";
import { eventBus } from "@/cortex/runtime/event";

const FROM_EMAIL = process.env.RYVAN_SENDER_EMAIL || "naveen@ryvanai.com";
const FROM_NAME = process.env.RYVAN_SENDER_NAME || "Naveen Kumar Reddy";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  workItemId?: string;
  outreachStepId?: string;
  prospectId?: string;
  contactId?: string;
}

export interface SendEmailResult {
  success: boolean;
  emailLogId?: string;
  resendMessageId?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!isEnabled("EMAIL_SENDING_ENABLED")) {
    return { success: false, error: "Email sending is disabled (feature flag off)" };
  }

  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [params.to],
    subject: params.subject,
    text: params.body,
    replyTo: params.replyTo || FROM_EMAIL,
  });

  if (error) {
    console.error("[email] Resend error:", error);
    return { success: false, error: error.message };
  }

  const resendMessageId = data?.id || null;

  const emailLog = await prisma.emailLog.create({
    data: {
      resendMessageId,
      workItemId: params.workItemId || null,
      outreachStepId: params.outreachStepId || null,
      prospectId: params.prospectId || null,
      contactId: params.contactId || null,
      recipientEmail: params.to,
      fromEmail: FROM_EMAIL,
      fromName: FROM_NAME,
      subject: params.subject,
      status: "sent",
    },
  });

  if (params.outreachStepId) {
    await prisma.outreachStep.update({
      where: { id: params.outreachStepId },
      data: { status: "sent", sentAt: new Date(), resendMessageId },
    });
  }

  await eventBus.publish({
    type: "email.sent.v1",
    version: "1",
    source: "email.resend",
    payload: {
      emailLogId: emailLog.id,
      resendMessageId,
      recipientEmail: params.to,
      subject: params.subject,
      workItemId: params.workItemId,
      outreachStepId: params.outreachStepId,
      prospectId: params.prospectId,
    },
  });

  return {
    success: true,
    emailLogId: emailLog.id,
    resendMessageId: resendMessageId || undefined,
  };
}

export async function handleResendWebhook(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  const emailId = data.email_id as string;
  if (!emailId) return;

  const emailLog = await prisma.emailLog.findUnique({
    where: { resendMessageId: emailId },
  });
  if (!emailLog) {
    console.warn("[email] Webhook for unknown message:", emailId);
    return;
  }

  const updates: Record<string, unknown> = {};
  let outreachStepUpdates: Record<string, unknown> | null = null;

  switch (eventType) {
    case "email.delivered":
      updates.status = "delivered";
      updates.deliveredAt = new Date();
      break;
    case "email.opened":
      updates.status = "opened";
      updates.openedAt = new Date();
      if (emailLog.outreachStepId) {
        outreachStepUpdates = { status: "opened", openedAt: new Date() };
      }
      break;
    case "email.clicked":
      updates.clickedAt = new Date();
      break;
    case "email.bounced":
      updates.status = "bounced";
      updates.bouncedAt = new Date();
      updates.bounceReason =
        ((data.bounce as Record<string, unknown>)?.type as string) || "unknown";
      if (emailLog.outreachStepId) {
        outreachStepUpdates = { status: "bounced" };
      }
      break;
    case "email.complained":
      updates.status = "complained";
      break;
    default:
      return;
  }

  await prisma.emailLog.update({
    where: { id: emailLog.id },
    data: updates,
  });

  if (outreachStepUpdates && emailLog.outreachStepId) {
    await prisma.outreachStep.update({
      where: { id: emailLog.outreachStepId },
      data: outreachStepUpdates,
    });
  }

  await eventBus.publish({
    type: `email.${eventType.replace("email.", "")}.v1`,
    version: "1",
    source: "email.webhook",
    payload: {
      emailLogId: emailLog.id,
      resendMessageId: emailId,
      event: eventType,
      workItemId: emailLog.workItemId,
      outreachStepId: emailLog.outreachStepId,
    },
  });
}
