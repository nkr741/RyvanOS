import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrgStatus } from "@/cortex/org";

/** Live status of the Cortex agent org — manager + every department and agent. */
export async function GET(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const org = await getOrgStatus();
    return NextResponse.json(org);
  } catch (error) {
    console.error("Org status error:", error);
    return NextResponse.json({ error: "Failed to load org status" }, { status: 500 });
  }
}
