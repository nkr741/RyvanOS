import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { chatWithAssistant, type ChatTurn } from "@/cortex/assistant";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:assistant");

/**
 * Cortex Assistant chat endpoint. Takes the conversation history and returns the
 * assistant's next reply (Claude with tools over the app's real data).
 * Admin-only for now (founder assistant); role-scoping expands it to BDEs later.
 */
export const POST = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { messages?: ChatTurn[] };
    const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const reply = await chatWithAssistant(history);
    return NextResponse.json({ reply });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Assistant error");
    return NextResponse.json({ error: "Assistant failed to respond" }, { status: 500 });
  }
});
