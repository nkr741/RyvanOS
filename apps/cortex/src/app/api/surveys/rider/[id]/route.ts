import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateRiderAISummary, calculateRiderScore } from "@/lib/ai";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:surveys:rider");

export const GET = withApi(async (request, ctx) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const survey = await prisma.riderSurvey.findUnique({
      where: { id },
      include: {
        bde: {
          select: { id: true, name: true, email: true },
        },
        documents: true,
      },
    });

    if (!survey) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    if (user.role === "bde" && survey.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(survey);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching rider survey");
    return NextResponse.json(
      { error: "Failed to fetch rider survey" },
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

    const existing = await prisma.riderSurvey.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    if (user.role === "bde" && existing.bdeId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const data: Record<string, unknown> = { ...body };
    if (body.currentPlatforms && typeof body.currentPlatforms !== "string") {
      data.currentPlatforms = JSON.stringify(body.currentPlatforms);
    }
    if (body.painPoints && typeof body.painPoints !== "string") {
      data.painPoints = JSON.stringify(body.painPoints);
    }
    if (body.wantedBenefits && typeof body.wantedBenefits !== "string") {
      data.wantedBenefits = JSON.stringify(body.wantedBenefits);
    }
    if (body.featureVotes && typeof body.featureVotes !== "string") {
      data.featureVotes = JSON.stringify(body.featureVotes);
    }

    // Re-generate AI summary and score
    const mergedData = { ...existing, ...data };
    data.aiSummary = generateRiderAISummary(mergedData);
    data.leadScore = calculateRiderScore(mergedData);
    data.overallScore = data.leadScore;

    // Protect immutable fields
    delete data.bdeId;
    delete data.id;
    delete data.createdAt;

    const survey = await prisma.riderSurvey.update({
      where: { id },
      data,
      include: {
        bde: {
          select: { id: true, name: true, email: true },
        },
        documents: true,
      },
    });

    return NextResponse.json(survey);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error updating rider survey");
    return NextResponse.json(
      { error: "Failed to update rider survey" },
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

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;

    const existing = await prisma.riderSurvey.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Survey not found" },
        { status: 404 }
      );
    }

    await prisma.document.deleteMany({ where: { riderSurveyId: id } });
    await prisma.riderSurvey.delete({ where: { id } });

    return NextResponse.json({ message: "Survey deleted successfully" });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error deleting rider survey");
    return NextResponse.json(
      { error: "Failed to delete rider survey" },
      { status: 500 }
    );
  }
});
