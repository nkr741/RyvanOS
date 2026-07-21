import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:growth:companies:detail");

export const GET = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { createdAt: "desc" } },
        opportunities: {
          orderBy: { updatedAt: "desc" },
          include: { createdBy: { select: { id: true, name: true } } },
        },
        outreachSequences: {
          orderBy: { updatedAt: "desc" },
          include: {
            steps: {
              orderBy: { stepOrder: "asc" },
              include: { contact: { select: { id: true, name: true, email: true } } },
            },
            createdBy: { select: { id: true, name: true } },
          },
        },
        growthActivities: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { user: { select: { id: true, name: true } } },
        },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Growth company detail error");
    return NextResponse.json({ error: "Failed to fetch company" }, { status: 500 });
  }
});

export const PATCH = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json() as Record<string, unknown>;

    const allowedFields = [
      "name", "website", "industry", "size", "employees", "location", "country",
      "description", "cloudProvider", "status", "assignedToId",
    ];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    if (body.techStack) data.techStack = JSON.stringify(body.techStack);
    if (body.painPoints) data.painPoints = JSON.stringify(body.painPoints);
    if (body.growthSignals) data.growthSignals = JSON.stringify(body.growthSignals);

    data.lastActivityAt = new Date();

    const company = await prisma.company.update({
      where: { id },
      data,
    });

    await prisma.growthActivity.create({
      data: {
        companyId: id,
        type: "status_change",
        content: `Company updated${body.status ? `: status → ${body.status}` : ""}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ company });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Growth company update error");
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 });
  }
});
