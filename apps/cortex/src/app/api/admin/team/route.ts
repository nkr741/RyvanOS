import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:admin:team");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bdes = await prisma.user.findMany({
      where: { role: "bde" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            vendorSurveys: true,
            riderSurveys: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(bdes);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching team");
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 }
    );
  }
});
