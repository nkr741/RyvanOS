import { NextRequest, NextResponse } from "next/server";
import { runDailyBriefing } from "@/cortex/org/briefing";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:cron:daily-briefing");

/**
 * Daily founder briefing cron.
 *
 * Operations sweeps the real data for alerts (pure SQL) and the Ops Lead writes
 * the narrative briefing through the normal chain of command. Everything lands
 * in the founder's notifications.
 *
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cortex.ryvanai.com/api/cron/daily-briefing
 *
 * Auth is a shared secret, not a user session, so no human need be present.
 */
export const maxDuration = 300;

export const POST = withApi(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyBriefing();
    return NextResponse.json({
      ok: true,
      alerts: result.alerts.length,
      notificationsSent: result.notificationsSent,
      briefing: result.briefing,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Daily briefing cron error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Briefing failed" },
      { status: 500 },
    );
  }
});
