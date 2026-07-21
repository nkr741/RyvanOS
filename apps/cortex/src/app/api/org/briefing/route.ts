import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { detectAlerts, runDailyBriefing } from "@/cortex/org/briefing";

export const maxDuration = 300;

/** Current alerts — pure SQL, cheap enough to poll. */
export async function GET(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const alerts = await detectAlerts();
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Alerts error:", error);
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
}

/** Run the briefing on demand (spends tokens — the founder asked for it). */
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyBriefing();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Briefing error:", error);
    return NextResponse.json({ error: "Briefing failed" }, { status: 500 });
  }
}
