import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { delegateToDepartment } from "@/cortex/org/delegation";
import { DEPARTMENTS } from "@/cortex/org";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:org:delegate");

export const maxDuration = 300;

/** Send a task down the chain of command to a department lead. */
export const POST = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { department, task } = await request.json();
    const dept = DEPARTMENTS.find((d) => d.id === department);
    if (!dept) return NextResponse.json({ error: "Unknown department" }, { status: 400 });
    if (!task?.trim()) return NextResponse.json({ error: "A task is required" }, { status: 400 });

    const report = await delegateToDepartment(dept.id, task.trim());
    return NextResponse.json({
      department: dept.name,
      lead: `${dept.head.name} (${dept.head.title})`,
      report,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Delegate error");
    return NextResponse.json({ error: "Delegation failed" }, { status: 500 });
  }
});
