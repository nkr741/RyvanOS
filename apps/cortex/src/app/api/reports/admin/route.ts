import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:reports:admin");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

    const [
      todayVendorSurveys,
      todayInterested,
      todayStrongLeads,
      tomorrowFollowUps,
      allBDEs,
      vendorSurveysForBDE,
      vendorSurveysByStatus,
      recentSurveysForTrend,
    ] = await Promise.all([
      prisma.vendorSurvey.count({
        where: { createdAt: { gte: today, lt: tomorrow } },
      }),
      prisma.vendorSurvey.count({
        where: {
          createdAt: { gte: today, lt: tomorrow },
          leadStatus: { in: ["interested", "follow_up"] },
        },
      }),
      prisma.vendorSurvey.count({
        where: {
          createdAt: { gte: today, lt: tomorrow },
          leadScore: { gte: 70 },
        },
      }),
      prisma.followUp.count({
        where: {
          scheduledAt: { gte: tomorrow, lt: dayAfterTomorrow },
          status: "pending",
        },
      }),
      prisma.user.findMany({
        where: { role: "bde" },
        select: { id: true, name: true },
      }),
      prisma.vendorSurvey.groupBy({
        by: ["bdeId"],
        _count: { id: true },
        _avg: { leadScore: true },
        _max: { leadScore: true },
      }),
      prisma.vendorSurvey.groupBy({
        by: ["leadStatus"],
        _count: { id: true },
      }),
      prisma.vendorSurvey.findMany({
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    // Today's surveys by BDE
    const todaySurveysByBDE = await prisma.vendorSurvey.groupBy({
      by: ["bdeId"],
      where: { createdAt: { gte: today, lt: tomorrow } },
      _count: { id: true },
    });

    // This week's surveys by BDE
    const weekSurveysByBDE = await prisma.vendorSurvey.groupBy({
      by: ["bdeId"],
      where: { createdAt: { gte: weekStart } },
      _count: { id: true },
    });

    const todayMap = Object.fromEntries(
      todaySurveysByBDE.map((s: { bdeId: string; _count: { id: number } }) => [s.bdeId, s._count.id])
    );
    const weekMap = Object.fromEntries(
      weekSurveysByBDE.map((s: { bdeId: string; _count: { id: number } }) => [s.bdeId, s._count.id])
    );
    const bdeNameMap = Object.fromEntries(
      allBDEs.map((u: { id: string; name: string }) => [u.id, u.name])
    );

    const bdePerformance = vendorSurveysForBDE.map(
      (s: { bdeId: string; _count: { id: number }; _avg: { leadScore: number | null }; _max: { leadScore: number | null } }) => ({
        id: s.bdeId,
        name: bdeNameMap[s.bdeId] ?? "Unknown",
        todaySurveys: todayMap[s.bdeId] ?? 0,
        weekSurveys: weekMap[s.bdeId] ?? 0,
        totalSurveys: s._count.id,
        avgLeadScore: Math.round(s._avg.leadScore ?? 0),
        bestLead: s._max.leadScore ?? 0,
      })
    );

    // Daily counts for last 14 days
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      dailyMap[d.toISOString().split("T")[0]] = 0;
    }
    for (const s of recentSurveysForTrend) {
      const dateKey = s.createdAt.toISOString().split("T")[0];
      if (dailyMap[dateKey] !== undefined) {
        dailyMap[dateKey]++;
      }
    }
    const dailyCounts = Object.entries(dailyMap).map(([date, count]) => ({
      date,
      count,
    }));

    // Status funnel
    const statusMap = Object.fromEntries(
      vendorSurveysByStatus.map((s: { leadStatus: string; _count: { id: number } }) => [s.leadStatus, s._count.id])
    );
    const funnel = [
      { label: "Lead", count: (statusMap["new"] ?? 0) + (statusMap["follow_up"] ?? 0), color: "bg-blue-500" },
      { label: "Qualified", count: statusMap["qualified"] ?? 0, color: "bg-indigo-500" },
      { label: "Interested", count: statusMap["interested"] ?? 0, color: "bg-amber-500" },
      { label: "Negotiation", count: statusMap["negotiation"] ?? 0, color: "bg-purple-500" },
      { label: "Onboarded", count: statusMap["onboarded"] ?? 0, color: "bg-emerald-500" },
      { label: "Active", count: statusMap["active_merchant"] ?? 0, color: "bg-green-500" },
    ];

    return NextResponse.json({
      aggregate: {
        visited: todayVendorSurveys,
        completed: todayVendorSurveys,
        interested: todayInterested,
        strongLeads: todayStrongLeads,
        followUpsTomorrow: tomorrowFollowUps,
      },
      bdePerformance,
      dailyCounts,
      funnel,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching admin reports");
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
});
