import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        onlinePlatforms: true,
        platformCommissions: true,
        painPoints: true,
        wouldJoinRynOne: true,
        address: true,
        gpsLat: true,
        gpsLng: true,
      },
    });

    // 1. Market Share — how many vendors use each platform
    const platformUsage: Record<string, number> = {};
    for (const survey of allVendorSurveys) {
      try {
        const platforms = JSON.parse(survey.onlinePlatforms || "[]") as string[];
        if (platforms.length === 0) {
          platformUsage["None"] = (platformUsage["None"] || 0) + 1;
        }
        for (const p of platforms) {
          platformUsage[p] = (platformUsage[p] || 0) + 1;
        }
      } catch {
        platformUsage["None"] = (platformUsage["None"] || 0) + 1;
      }
    }

    const totalVendors = allVendorSurveys.length || 1;
    const marketShare: Record<string, { count: number; percentage: number }> = {};
    for (const [platform, count] of Object.entries(platformUsage)) {
      marketShare[platform] = {
        count,
        percentage: Math.round((count / totalVendors) * 100),
      };
    }

    // 2. Commission Comparison
    const commissionData: Record<string, { values: number[]; count: number }> = {};
    for (const survey of allVendorSurveys) {
      try {
        const commissions = JSON.parse(survey.platformCommissions || "{}") as Record<string, number>;
        for (const [platform, commission] of Object.entries(commissions)) {
          if (typeof commission !== "number" || commission <= 0) continue;
          if (!commissionData[platform]) {
            commissionData[platform] = { values: [], count: 0 };
          }
          commissionData[platform].values.push(commission);
          commissionData[platform].count++;
        }
      } catch {
        // skip
      }
    }

    const commissionComparison = Object.entries(commissionData).map(
      ([platform, data]) => ({
        platform,
        avgCommission:
          Math.round(
            (data.values.reduce((a, b) => a + b, 0) / data.values.length) * 10
          ) / 10,
        minCommission: Math.min(...data.values),
        maxCommission: Math.max(...data.values),
        merchantCount: data.count,
      })
    );

    // 3. Pain Points by Platform
    const painPointsByPlatform: Record<string, Record<string, number>> = {};
    for (const survey of allVendorSurveys) {
      let platforms: string[] = [];
      try {
        platforms = JSON.parse(survey.onlinePlatforms || "[]") as string[];
      } catch {
        continue;
      }

      let painPoints: Record<string, number> = {};
      try {
        painPoints = JSON.parse(survey.painPoints || "{}") as Record<string, number>;
      } catch {
        continue;
      }

      for (const platform of platforms) {
        if (!painPointsByPlatform[platform]) {
          painPointsByPlatform[platform] = {};
        }
        for (const [point, rating] of Object.entries(painPoints)) {
          if (rating >= 3) {
            painPointsByPlatform[platform][point] =
              (painPointsByPlatform[platform][point] || 0) + 1;
          }
        }
      }
    }

    // Convert pain point counts to percentages
    const painPointsByPlatformPct: Record<string, Record<string, number>> = {};
    for (const [platform, points] of Object.entries(painPointsByPlatform)) {
      const platformCount = platformUsage[platform] || 1;
      painPointsByPlatformPct[platform] = {};
      for (const [point, count] of Object.entries(points)) {
        painPointsByPlatformPct[platform][point] = Math.round(
          (count / platformCount) * 100
        );
      }
    }

    // 4. Satisfaction Scores (inverse of average pain point severity by platform)
    const satisfactionScores: Record<string, number> = {};
    for (const survey of allVendorSurveys) {
      let platforms: string[] = [];
      try {
        platforms = JSON.parse(survey.onlinePlatforms || "[]") as string[];
      } catch {
        continue;
      }

      let painPoints: Record<string, number> = {};
      try {
        painPoints = JSON.parse(survey.painPoints || "{}") as Record<string, number>;
      } catch {
        continue;
      }

      const painValues = Object.values(painPoints);
      if (painValues.length === 0) continue;
      const avgPain = painValues.reduce((a, b) => a + b, 0) / painValues.length;

      for (const platform of platforms) {
        if (!satisfactionScores[platform]) {
          satisfactionScores[platform] = 0;
        }
        // Invert: 5 = worst pain → 1/10 satisfaction, 1 = least pain → 9/10
        satisfactionScores[platform] += 10 - avgPain * 1.5;
      }
    }

    // Average satisfaction
    for (const platform of Object.keys(satisfactionScores)) {
      const count = platformUsage[platform] || 1;
      satisfactionScores[platform] =
        Math.round((satisfactionScores[platform] / count) * 10) / 10;
      satisfactionScores[platform] = Math.max(
        1,
        Math.min(10, satisfactionScores[platform])
      );
    }

    // 5. Switching Intent (wouldJoinRynOne by platform)
    const switchingIntent: Record<string, { wouldSwitch: number; total: number; percentage: number }> = {};
    for (const survey of allVendorSurveys) {
      let platforms: string[] = [];
      try {
        platforms = JSON.parse(survey.onlinePlatforms || "[]") as string[];
      } catch {
        continue;
      }

      const wouldSwitch =
        survey.wouldJoinRynOne === "immediately" ||
        survey.wouldJoinRynOne === "within_3_months";

      for (const platform of platforms) {
        if (!switchingIntent[platform]) {
          switchingIntent[platform] = { wouldSwitch: 0, total: 0, percentage: 0 };
        }
        switchingIntent[platform].total++;
        if (wouldSwitch) {
          switchingIntent[platform].wouldSwitch++;
        }
      }
    }

    for (const data of Object.values(switchingIntent)) {
      data.percentage =
        data.total > 0 ? Math.round((data.wouldSwitch / data.total) * 100) : 0;
    }

    // 6. Area Breakdown (group by address locality)
    const areaMap: Record<string, Record<string, number>> = {};
    for (const survey of allVendorSurveys) {
      const area = extractArea(survey.address);
      if (!area) continue;

      let platforms: string[] = [];
      try {
        platforms = JSON.parse(survey.onlinePlatforms || "[]") as string[];
      } catch {
        continue;
      }

      if (!areaMap[area]) {
        areaMap[area] = {};
      }
      for (const platform of platforms) {
        areaMap[area][platform] = (areaMap[area][platform] || 0) + 1;
      }
    }

    const areaBreakdown = Object.entries(areaMap)
      .map(([area, platforms]) => {
        const swiggy = platforms["Swiggy"] || 0;
        const zomato = platforms["Zomato"] || 0;
        const magicpin = platforms["Magicpin"] || 0;
        const ondc = platforms["ONDC"] || 0;

        const all = Object.entries(platforms).sort((a, b) => b[1] - a[1]);
        const dominant = all.length > 0 ? all[0][0] : "None";

        return { area, dominant, swiggy, zomato, magicpin, ondc };
      })
      .sort(
        (a, b) =>
          b.swiggy + b.zomato + b.magicpin + b.ondc -
          (a.swiggy + a.zomato + a.magicpin + a.ondc)
      )
      .slice(0, 10);

    return NextResponse.json({
      marketShare,
      commissionComparison,
      painPointsByPlatform: painPointsByPlatformPct,
      satisfactionScores,
      switchingIntent,
      areaBreakdown,
    });
  } catch (error) {
    console.error("Error fetching competitor analysis:", error);
    return NextResponse.json(
      { error: "Failed to fetch competitor data" },
      { status: 500 }
    );
  }
}

function extractArea(address: string): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return parts[0] || null;
}
