import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { detectAlerts, runDailyBriefing } from "@/cortex/org/briefing";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:org:briefing");

export const maxDuration = 300;

/** Current alerts — pure SQL, cheap enough to poll. */
export const GET = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const alerts = await detectAlerts();
    return NextResponse.json({ alerts });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Alerts error");
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
});

/** Run the briefing on demand (spends tokens — the founder asked for it). */
export const POST = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyBriefing();
    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Briefing error");
    return NextResponse.json({ error: "Briefing failed" }, { status: 500 });
  }
});
