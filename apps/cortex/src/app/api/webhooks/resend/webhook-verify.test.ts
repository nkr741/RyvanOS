import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

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
  if (Math.abs(now - ts) > 300) return false;

  const key = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
    "base64",
  );
  const message = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(message).digest("base64");

  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts[0] !== "v1" || !parts[1]) continue;
    if (parts[1] === expected) return true;
  }
  return false;
}

function sign(secret: string, svixId: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const message = `${svixId}.${timestamp}.${body}`;
  const sig = createHmac("sha256", key).update(message).digest("base64");
  return `v1,${sig}`;
}

const SECRET = "whsec_" + Buffer.from("test-secret-key-32bytes!").toString("base64");
const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "e123" } });

describe("webhook signature verification", () => {
  it("accepts a valid signature", () => {
    const now = String(Math.floor(Date.now() / 1000));
    const sig = sign(SECRET, "msg_123", now, BODY);
    expect(verifySignature(SECRET, "msg_123", now, sig, BODY)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const now = String(Math.floor(Date.now() / 1000));
    expect(verifySignature(SECRET, "msg_123", now, "v1,invalidsig", BODY)).toBe(false);
  });

  it("rejects expired timestamps", () => {
    const old = String(Math.floor(Date.now() / 1000) - 600);
    const sig = sign(SECRET, "msg_123", old, BODY);
    expect(verifySignature(SECRET, "msg_123", old, sig, BODY)).toBe(false);
  });

  it("rejects non-numeric timestamps", () => {
    const sig = sign(SECRET, "msg_123", "notanumber", BODY);
    expect(verifySignature(SECRET, "msg_123", "notanumber", sig, BODY)).toBe(false);
  });

  it("handles multiple signatures (accepts if any match)", () => {
    const now = String(Math.floor(Date.now() / 1000));
    const validSig = sign(SECRET, "msg_123", now, BODY);
    const combined = `v1,wrongsig ${validSig}`;
    expect(verifySignature(SECRET, "msg_123", now, combined, BODY)).toBe(true);
  });

  it("handles secret without whsec_ prefix", () => {
    const rawSecret = Buffer.from("raw-secret-key-for-test!").toString("base64");
    const now = String(Math.floor(Date.now() / 1000));
    const sig = sign(rawSecret, "msg_456", now, BODY);
    expect(verifySignature(rawSecret, "msg_456", now, sig, BODY)).toBe(true);
  });
});
