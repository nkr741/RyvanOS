import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "bde") {
      return getBDEStats(user.id);
    }

    return getAdminStats();
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}

async function getBDEStats(bdeId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    todayVendorSurveys,
    todayRiderSurveys,
    todayInterested,
    todayFollowUps,
    totalVendorSurveys,
    totalRiderSurveys,
    strongLeads,
    recentVendorSurveys,
    recentRiderSurveys,
    pendingFollowUps,
  ] = await Promise.all([
    // Today's vendor surveys
    prisma.vendorSurvey.count({
      where: {
        bdeId,
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    // Today's rider surveys
    prisma.riderSurvey.count({
      where: {
        bdeId,
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    // Today's interested leads
    prisma.vendorSurvey.count({
      where: {
        bdeId,
        createdAt: { gte: today, lt: tomorrow },
        leadStatus: { in: ["interested", "follow_up"] },
      },
    }),
    // Today's follow-ups due
    prisma.followUp.count({
      where: {
        bdeId,
        scheduledAt: { gte: today, lt: tomorrow },
        status: "pending",
      },
    }),
    // Total vendor surveys
    prisma.vendorSurvey.count({ where: { bdeId } }),
    // Total rider surveys
    prisma.riderSurvey.count({ where: { bdeId } }),
    // Strong leads (score >= 70)
    prisma.vendorSurvey.count({
      where: { bdeId, leadScore: { gte: 70 } },
    }),
    // Recent vendor surveys
    prisma.vendorSurvey.findMany({
      where: { bdeId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        businessName: true,
        category: true,
        leadScore: true,
        leadStatus: true,
        createdAt: true,
      },
    }),
    // Recent rider surveys
    prisma.riderSurvey.findMany({
      where: { bdeId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        riderName: true,
        leadScore: true,
        leadStatus: true,
        createdAt: true,
      },
    }),
    // Pending follow-ups
    prisma.followUp.findMany({
      where: { bdeId, status: "pending" },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: {
        survey: {
          select: { id: true, businessName: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    today: {
      visited: todayVendorSurveys + todayRiderSurveys,
      completed: todayVendorSurveys + todayRiderSurveys,
      interested: todayInterested,
      followUps: todayFollowUps,
      vendorSurveys: todayVendorSurveys,
      riderSurveys: todayRiderSurveys,
    },
    totals: {
      vendorSurveys: totalVendorSurveys,
      riderSurveys: totalRiderSurveys,
      strongLeads,
    },
    recentVendorSurveys,
    recentRiderSurveys,
    pendingFollowUps,
  });
}

async function getAdminStats() {
  const [
    totalVendorSurveys,
    totalRiderSurveys,
    vendorsByCategory,
    vendorsByStatus,
    surveysByBDE,
    strongLeads,
    recentVendorSurveys,
    recentRiderSurveys,
  ] = await Promise.all([
    prisma.vendorSurvey.count(),
    prisma.riderSurvey.count(),
    prisma.vendorSurvey.groupBy({
      by: ["category"],
      _count: { id: true },
    }),
    prisma.vendorSurvey.groupBy({
      by: ["leadStatus"],
      _count: { id: true },
    }),
    prisma.vendorSurvey.groupBy({
      by: ["bdeId"],
      _count: { id: true },
      _avg: { leadScore: true },
    }),
    prisma.vendorSurvey.count({
      where: { leadScore: { gte: 70 } },
    }),
    prisma.vendorSurvey.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        businessName: true,
        category: true,
        leadScore: true,
        leadStatus: true,
        createdAt: true,
        bde: { select: { id: true, name: true } },
      },
    }),
    prisma.riderSurvey.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        riderName: true,
        leadScore: true,
        leadStatus: true,
        createdAt: true,
        bde: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Get BDE names for the grouped stats
  const bdeIds = surveysByBDE.map((s: { bdeId: string }) => s.bdeId);
  const bdeUsers = await prisma.user.findMany({
    where: { id: { in: bdeIds } },
    select: { id: true, name: true },
  });
  const bdeNameMap = Object.fromEntries(
    bdeUsers.map((u: { id: string; name: string }) => [u.id, u.name])
  );

  const surveysByBDEWithNames = surveysByBDE.map(
    (s: { bdeId: string; _count: { id: number }; _avg: { leadScore: number | null } }) => ({
      bdeId: s.bdeId,
      bdeName: bdeNameMap[s.bdeId] ?? "Unknown",
      count: s._count.id,
      avgLeadScore: Math.round(s._avg.leadScore ?? 0),
    })
  );

  // Trend: surveys per day for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const recentSurveysForTrend = await prisma.vendorSurvey.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dailyTrend: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    dailyTrend[d.toISOString().split("T")[0]] = 0;
  }
  for (const s of recentSurveysForTrend) {
    const dateKey = s.createdAt.toISOString().split("T")[0];
    if (dailyTrend[dateKey] !== undefined) {
      dailyTrend[dateKey]++;
    }
  }

  return NextResponse.json({
    totals: {
      vendorSurveys: totalVendorSurveys,
      riderSurveys: totalRiderSurveys,
      totalSurveys: totalVendorSurveys + totalRiderSurveys,
      strongLeads,
    },
    byCategory: vendorsByCategory.map(
      (c: { category: string; _count: { id: number } }) => ({
        category: c.category,
        count: c._count.id,
      })
    ),
    byStatus: vendorsByStatus.map(
      (s: { leadStatus: string; _count: { id: number } }) => ({
        status: s.leadStatus,
        count: s._count.id,
      })
    ),
    byBDE: surveysByBDEWithNames,
    dailyTrend: Object.entries(dailyTrend).map(([date, count]) => ({
      date,
      count,
    })),
    recentVendorSurveys,
    recentRiderSurveys,
  });
}
