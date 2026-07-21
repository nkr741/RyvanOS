import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrgStatus } from "@/cortex/org";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:org");

/** Live status of the Cortex agent org — manager + every department and agent. */
export const GET = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const org = await getOrgStatus();
    return NextResponse.json(org);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Org status error");
    return NextResponse.json({ error: "Failed to load org status" }, { status: 500 });
  }
});
