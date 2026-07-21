import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:activities");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const vendorSurveyId = searchParams.get("vendorSurveyId");
    const riderSurveyId = searchParams.get("riderSurveyId");
    const followUpId = searchParams.get("followUpId");
    const type = searchParams.get("type");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (user.role === "bde") {
      where.userId = user.id;
    }

    if (vendorSurveyId) where.vendorSurveyId = vendorSurveyId;
    if (riderSurveyId) where.riderSurveyId = riderSurveyId;
    if (followUpId) where.followUpId = followUpId;
    if (type) where.type = type;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          vendorSurvey: {
            select: { id: true, businessName: true, ownerName: true },
          },
          riderSurvey: { select: { id: true, riderName: true } },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    return NextResponse.json({
      activities,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Failed to fetch activities");
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
});

export const POST = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.type || !body.content) {
      return NextResponse.json(
        { error: "Type and content are required" },
        { status: 400 }
      );
    }

    const activity = await prisma.activity.create({
      data: {
        type: body.type,
        content: body.content,
        userId: user.id,
        vendorSurveyId: body.vendorSurveyId || null,
        riderSurveyId: body.riderSurveyId || null,
        followUpId: body.followUpId || null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Failed to create activity");
    return NextResponse.json(
      { error: "Failed to create activity" },
      { status: 500 }
    );
  }
});
