import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:followups");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bdeId = searchParams.get("bdeId");
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (user.role === "bde") {
      where.bdeId = user.id;
    } else if (bdeId) {
      where.bdeId = bdeId;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: dayStart, lte: dayEnd };
    }

    const followUps = await prisma.followUp.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      include: {
        survey: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            mobile: true,
            category: true,
            leadScore: true,
            leadStatus: true,
          },
        },
        bde: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(followUps);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching follow-ups");
    return NextResponse.json(
      { error: "Failed to fetch follow-ups" },
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

    if (!body.surveyId || !body.scheduledAt) {
      return NextResponse.json(
        { error: "surveyId and scheduledAt are required" },
        { status: 400 }
      );
    }

    // Verify the survey exists
    const survey = await prisma.vendorSurvey.findUnique({
      where: { id: body.surveyId },
    });

    if (!survey) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    // BDE can only create follow-ups for own surveys
    if (user.role === "bde" && survey.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const followUp = await prisma.followUp.create({
      data: {
        surveyId: body.surveyId,
        bdeId: user.id,
        scheduledAt: new Date(body.scheduledAt),
        notes: body.notes,
        status: "pending",
        priority: body.priority || "medium",
        category: body.category || "follow_up",
        reminderAt: body.reminderAt ? new Date(body.reminderAt) : null,
      },
      include: {
        survey: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            mobile: true,
          },
        },
        bde: {
          select: { id: true, name: true },
        },
      },
    });

    // Update survey status to follow_up if it's currently "new"
    if (survey.leadStatus === "new") {
      await prisma.vendorSurvey.update({
        where: { id: body.surveyId },
        data: { leadStatus: "follow_up" },
      });
    }

    return NextResponse.json(followUp, { status: 201 });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error creating follow-up");
    return NextResponse.json(
      { error: "Failed to create follow-up" },
      { status: 500 }
    );
  }
});

export const PUT = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Follow-up id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.followUp.findUnique({
      where: { id: body.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Follow-up not found" },
        { status: 404 }
      );
    }

    if (user.role === "bde" && existing.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};

    if (body.status) {
      data.status = body.status;
      if (body.status === "completed") {
        data.completedAt = new Date();
      }
    }

    if (body.scheduledAt) {
      data.scheduledAt = new Date(body.scheduledAt);
    }

    if (body.notes !== undefined) {
      data.notes = body.notes;
    }

    if (body.priority) data.priority = body.priority;
    if (body.category) data.category = body.category;
    if (body.reminderAt !== undefined) {
      data.reminderAt = body.reminderAt ? new Date(body.reminderAt) : null;
    }

    const followUp = await prisma.followUp.update({
      where: { id: body.id },
      data,
      include: {
        survey: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            mobile: true,
          },
        },
        bde: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(followUp);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error updating follow-up");
    return NextResponse.json(
      { error: "Failed to update follow-up" },
      { status: 500 }
    );
  }
});

export const DELETE = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Follow-up id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.followUp.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Follow-up not found" },
        { status: 404 }
      );
    }

    if (user.role === "bde" && existing.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.followUp.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error deleting follow-up");
    return NextResponse.json(
      { error: "Failed to delete follow-up" },
      { status: 500 }
    );
  }
});
