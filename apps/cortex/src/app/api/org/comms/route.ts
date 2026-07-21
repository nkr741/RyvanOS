import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRecentMessages } from "@/cortex/org/delegation";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:org:comms");

/** The chain-of-command feed — who assigned what to whom, and what came back. */
export const GET = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 40;
    const messages = await getRecentMessages(limit);
    return NextResponse.json({ count: messages.length, messages });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Comms feed error");
    return NextResponse.json({ error: "Failed to load the comms feed" }, { status: 500 });
  }
});
