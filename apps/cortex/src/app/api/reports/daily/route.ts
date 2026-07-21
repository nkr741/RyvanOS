import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:reports:daily");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bdeId = searchParams.get("bdeId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = {};

    if (user.role === "bde") {
      where.bdeId = user.id;
    } else if (bdeId) {
      where.bdeId = bdeId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        (where.date as Record<string, unknown>).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.date as Record<string, unknown>).lte = new Date(dateTo);
      }
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        bde: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(reports);
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching daily reports");
    return NextResponse.json(
      { error: "Failed to fetch daily reports" },
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
    const targetBdeId = user.role === "admin" && body.bdeId
      ? body.bdeId
      : user.id;
    const reportDate = body.date ? new Date(body.date) : new Date();
    reportDate.setHours(0, 0, 0, 0);

    const dayEnd = new Date(reportDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Check if report already exists for this date
    const existingReport = await prisma.dailyReport.findFirst({
      where: {
        bdeId: targetBdeId,
        date: { gte: reportDate, lte: dayEnd },
      },
    });

    // Aggregate today's surveys
    const [
      vendorSurveysToday,
      riderSurveysToday,
      interestedToday,
      strongLeadsToday,
      followUpsToday,
    ] = await Promise.all([
      prisma.vendorSurvey.count({
        where: {
          bdeId: targetBdeId,
          createdAt: { gte: reportDate, lte: dayEnd },
        },
      }),
      prisma.riderSurvey.count({
        where: {
          bdeId: targetBdeId,
          createdAt: { gte: reportDate, lte: dayEnd },
        },
      }),
      prisma.vendorSurvey.count({
        where: {
          bdeId: targetBdeId,
          createdAt: { gte: reportDate, lte: dayEnd },
          leadStatus: { in: ["interested", "follow_up"] },
        },
      }),
      prisma.vendorSurvey.count({
        where: {
          bdeId: targetBdeId,
          createdAt: { gte: reportDate, lte: dayEnd },
          leadScore: { gte: 70 },
        },
      }),
      prisma.followUp.count({
        where: {
          bdeId: targetBdeId,
          scheduledAt: { gte: reportDate, lte: dayEnd },
        },
      }),
    ]);

    const totalVisited = vendorSurveysToday + riderSurveysToday;
    const dateStr = reportDate.toISOString().split("T")[0];
    const summary = `${dateStr}: Visited ${totalVisited} locations (${vendorSurveysToday} vendors, ${riderSurveysToday} riders). ${interestedToday} interested leads, ${strongLeadsToday} strong leads. ${followUpsToday} follow-ups scheduled.`;

    const reportData = {
      bdeId: targetBdeId,
      date: reportDate,
      visited: totalVisited,
      completed: totalVisited,
      interested: interestedToday,
      strongLeads: strongLeadsToday,
      followUps: followUpsToday,
      summary,
    };

    let report;
    if (existingReport) {
      report = await prisma.dailyReport.update({
        where: { id: existingReport.id },
        data: reportData,
        include: {
          bde: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    } else {
      report = await prisma.dailyReport.create({
        data: reportData,
        include: {
          bde: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    }

    return NextResponse.json(report, { status: existingReport ? 200 : 201 });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error generating daily report");
    return NextResponse.json(
      { error: "Failed to generate daily report" },
      { status: 500 }
    );
  }
});
