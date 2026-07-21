import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleResendWebhook } from "@/cortex/email";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:webhooks:resend");

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const TIMESTAMP_TOLERANCE_S = 300;

function verifySignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
): boolean {
  const ts = parseInt(svixTimestamp, 10);
  if (Number.isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_S) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const message = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(message).digest("base64");

  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts[0] !== "v1" || !parts[1]) continue;
    const a = Buffer.from(expected);
    const b = Buffer.from(parts[1]);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }

  return false;
}

export const POST = withApi(async (request) => {
  const rawBody = await request.text();

  if (WEBHOOK_SECRET) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      log.warn("webhook rejected — missing svix headers");
      return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 401 });
    }

    if (!verifySignature(WEBHOOK_SECRET, svixId, svixTimestamp, svixSignature, rawBody)) {
      log.warn({ svixId }, "webhook rejected — invalid signature");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  let body: { type?: string; data?: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = body;

  if (!type || !data) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  try {
    await handleResendWebhook(type, data);
    return NextResponse.json({ received: true });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), eventType: type }, "webhook processing failed");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
});
