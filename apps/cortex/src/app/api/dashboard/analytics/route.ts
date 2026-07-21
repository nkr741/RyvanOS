import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:dashboard:analytics");

export const GET = withApi(async (request) => {
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

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, unknown>).lte = end;
      }
    }

    const allVendorSurveys = await prisma.vendorSurvey.findMany({
      where,
      select: {
        painPoints: true,
        onlinePlatforms: true,
        platformCommissions: true,
        featureVotes: true,
        interestLevel: true,
        category: true,
        createdAt: true,
      },
    });

    // Pain point aggregation
    const painPointCounts: Record<string, Record<number, number>> = {};
    for (const survey of allVendorSurveys) {
      try {
        const points = JSON.parse(survey.painPoints || "{}") as Record<string, number>;
        for (const [point, rating] of Object.entries(points)) {
          if (!painPointCounts[point]) {
            painPointCounts[point] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
          }
          const r = Math.min(5, Math.max(1, Math.round(rating)));
          painPointCounts[point][r] = (painPointCounts[point][r] || 0) + 1;
        }
      } catch {
        // skip invalid JSON
      }
    }

    const painPointAggregation = Object.entries(painPointCounts).map(
      ([painPoint, ratings]) => {
        const totalResponses = Object.values(ratings).reduce((a, b) => a + b, 0);
        const weightedSum = Object.entries(ratings).reduce(
          (sum, [rating, count]) => sum + parseInt(rating) * count,
          0
        );
        return {
          painPoint,
          ratings,
          totalResponses,
          averageRating: totalResponses > 0
            ? Math.round((weightedSum / totalResponses) * 100) / 100
            : 0,
        };
      }
    );

    // Competitor market share (platform usage counts)
    const platformCounts: Record<string, number> = {};
    for (const survey of allVendorSurveys) {
      try {
        const platforms = JSON.parse(survey.onlinePlatforms || "[]") as string[];
        for (const platform of platforms) {
          platformCounts[platform] = (platformCounts[platform] || 0) + 1;
        }
      } catch {
        // skip invalid JSON
      }
    }

    const competitorMarketShare = Object.entries(platformCounts)
      .map(([platform, count]) => ({
        platform,
        count,
        percentage: allVendorSurveys.length > 0
          ? Math.round((count / allVendorSurveys.length) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Average commission by platform
    const commissionSums: Record<string, { total: number; count: number }> = {};
    for (const survey of allVendorSurveys) {
      try {
        const commissions = JSON.parse(survey.platformCommissions || "{}") as Record<string, number>;
        for (const [platform, commission] of Object.entries(commissions)) {
          if (!commissionSums[platform]) {
            commissionSums[platform] = { total: 0, count: 0 };
          }
          commissionSums[platform].total += commission;
          commissionSums[platform].count += 1;
        }
      } catch {
        // skip invalid JSON
      }
    }

    const averageCommissionByPlatform = Object.entries(commissionSums).map(
      ([platform, data]) => ({
        platform,
        averageCommission:
          Math.round((data.total / data.count) * 100) / 100,
        respondents: data.count,
      })
    );

    // Feature voting results
    const featureSums: Record<string, { total: number; count: number }> = {};
    for (const survey of allVendorSurveys) {
      try {
        const votes = JSON.parse(survey.featureVotes || "{}") as Record<string, number>;
        for (const [feature, importance] of Object.entries(votes)) {
          if (!featureSums[feature]) {
            featureSums[feature] = { total: 0, count: 0 };
          }
          featureSums[feature].total += importance;
          featureSums[feature].count += 1;
        }
      } catch {
        // skip invalid JSON
      }
    }

    const featureVotingResults = Object.entries(featureSums)
      .map(([feature, data]) => ({
        feature,
        averageImportance:
          Math.round((data.total / data.count) * 100) / 100,
        totalVotes: data.count,
      }))
      .sort((a, b) => b.averageImportance - a.averageImportance);

    // Interest levels distribution
    const interestCounts: Record<string, number> = {};
    for (const survey of allVendorSurveys) {
      const level = survey.interestLevel || "unknown";
      interestCounts[level] = (interestCounts[level] || 0) + 1;
    }

    const interestDistribution = Object.entries(interestCounts).map(
      ([level, count]) => ({
        level,
        count,
        percentage: allVendorSurveys.length > 0
          ? Math.round((count / allVendorSurveys.length) * 10000) / 100
          : 0,
      })
    );

    // Category distribution
    const categoryCounts: Record<string, number> = {};
    for (const survey of allVendorSurveys) {
      categoryCounts[survey.category] =
        (categoryCounts[survey.category] || 0) + 1;
    }

    const categoryDistribution = Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count,
        percentage: allVendorSurveys.length > 0
          ? Math.round((count / allVendorSurveys.length) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Daily survey trend
    const trendStart = dateFrom ? new Date(dateFrom) : new Date();
    if (!dateFrom) trendStart.setDate(trendStart.getDate() - 30);
    trendStart.setHours(0, 0, 0, 0);
    const trendEnd = dateTo ? new Date(dateTo) : new Date();
    trendEnd.setHours(23, 59, 59, 999);

    const trendDays = Math.min(
      90,
      Math.ceil((trendEnd.getTime() - trendStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    const dailyTrend: Record<string, number> = {};
    for (let i = 0; i < trendDays; i++) {
      const d = new Date(trendStart);
      d.setDate(d.getDate() + i);
      dailyTrend[d.toISOString().split("T")[0]] = 0;
    }

    for (const survey of allVendorSurveys) {
      const dateKey = survey.createdAt.toISOString().split("T")[0];
      if (dailyTrend[dateKey] !== undefined) {
        dailyTrend[dateKey]++;
      }
    }

    return NextResponse.json({
      painPointAggregation,
      competitorMarketShare,
      averageCommissionByPlatform,
      featureVotingResults,
      interestDistribution,
      categoryDistribution,
      dailySurveyTrend: Object.entries(dailyTrend).map(([date, count]) => ({
        date,
        count,
      })),
      totalSurveysAnalyzed: allVendorSurveys.length,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Error fetching analytics");
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
});
