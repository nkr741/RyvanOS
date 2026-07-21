import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateAISummary, calculateLeadScore } from "@/lib/ai";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:surveys:vendor");

export const GET = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const survey = await prisma.vendorSurvey.findUnique({
      where: { id },
      include: {
        bde: {
          select: { id: true, name: true, email: true },
        },
        documents: true,
        followUps: {
          orderBy: { scheduledAt: "desc" },
        },
      },
    });

    if (!survey) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    // BDE can only view own surveys
    if (user.role === "bde" && survey.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(survey);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching vendor survey");
    return NextResponse.json(
      { error: "Failed to fetch vendor survey" },
      { status: 500 }
    );
  }
});

export const PUT = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const existing = await prisma.vendorSurvey.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    // BDE can only update own surveys
    if (user.role === "bde" && existing.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // Serialize JSON fields if provided as objects
    const data: Record<string, unknown> = { ...body };
    if (body.onlinePlatforms && typeof body.onlinePlatforms !== "string") {
      data.onlinePlatforms = JSON.stringify(body.onlinePlatforms);
    }
    if (body.painPoints && typeof body.painPoints !== "string") {
      data.painPoints = JSON.stringify(body.painPoints);
    }
    if (body.platformCommissions && typeof body.platformCommissions !== "string") {
      data.platformCommissions = JSON.stringify(body.platformCommissions);
    }
    if (body.marketingChannels && typeof body.marketingChannels !== "string") {
      data.marketingChannels = JSON.stringify(body.marketingChannels);
    }
    if (body.aiInterests && typeof body.aiInterests !== "string") {
      data.aiInterests = JSON.stringify(body.aiInterests);
    }
    if (body.featureVotes && typeof body.featureVotes !== "string") {
      data.featureVotes = JSON.stringify(body.featureVotes);
    }

    // Re-generate AI summary and score with merged data
    const mergedData = { ...existing, ...data };
    data.aiSummary = generateAISummary(mergedData);
    data.leadScore = calculateLeadScore(mergedData);

    // Don't allow changing bdeId
    delete data.bdeId;
    delete data.id;
    delete data.createdAt;

    const survey = await prisma.vendorSurvey.update({
      where: { id },
      data,
      include: {
        bde: {
          select: { id: true, name: true, email: true },
        },
        documents: true,
        followUps: true,
      },
    });

    return NextResponse.json(survey);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error updating vendor survey");
    return NextResponse.json(
      { error: "Failed to update vendor survey" },
      { status: 500 }
    );
  }
});

export const DELETE = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin only
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;

    const existing = await prisma.vendorSurvey.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    // Delete related records first
    await prisma.followUp.deleteMany({ where: { surveyId: id } });
    await prisma.document.deleteMany({ where: { vendorSurveyId: id } });
    await prisma.vendorSurvey.delete({ where: { id } });

    return NextResponse.json({ message: "Survey deleted successfully" });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error deleting vendor survey");
    return NextResponse.json(
      { error: "Failed to delete vendor survey" },
      { status: 500 }
    );
  }
});
