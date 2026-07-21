import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:admin:team");

export const PATCH = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const updated = await prisma.user.update({
      where: { id },
      data: { active: body.active },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error updating team member");
    return NextResponse.json(
      { error: "Failed to update team member" },
      { status: 500 }
    );
  }
});
