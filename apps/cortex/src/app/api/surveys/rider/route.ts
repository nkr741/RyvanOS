import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateRiderAISummary, calculateRiderScore } from "@/lib/ai";

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = (page - 1) * limit;

    const bdeId = searchParams.get("bdeId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = {};

    // BDE role can only see own surveys
    if (user.role === "bde") {
      where.bdeId = user.id;
    } else if (bdeId) {
      where.bdeId = bdeId;
    }

    if (status) {
      where.leadStatus = status;
    }

    if (search) {
      where.OR = [
        { riderName: { contains: search } },
        { phone: { contains: search } },
        { address: { contains: search } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
      }
    }

    const [surveys, total] = await Promise.all([
      prisma.riderSurvey.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          bde: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.riderSurvey.count({ where }),
    ]);

    return NextResponse.json({
      surveys,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching rider surveys:", error);
    return NextResponse.json(
      { error: "Failed to fetch rider surveys" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const aiSummary = generateRiderAISummary(body);
    const leadScore = calculateRiderScore(body);

    let leadStatus = "new";
    if (body.wouldJoinRynOne === "yes" || leadScore >= 70) {
      leadStatus = "interested";
    } else if (body.wouldJoinRynOne === "maybe" || leadScore >= 40) {
      leadStatus = "follow_up";
    }

    // Build document records from uploaded files
    const documentFiles: Record<string, string> = body.documentFiles || {};
    const documentRecords = Object.entries(documentFiles).map(
      ([type, filePath]) => ({
        type,
        fileName: (filePath as string).split("/").pop() || type,
        filePath: filePath as string,
      })
    );

    const survey = await prisma.riderSurvey.create({
      data: {
        bdeId: user.id,
        riderName: body.riderName,
        age: body.age,
        gender: body.gender,
        phone: body.phone,
        address: body.address,
        vehicleType: body.vehicleType,
        licenseNo: body.licenseNo,
        rcNumber: body.rcNumber,
        insurance: body.insurance ?? false,
        aadhaar: body.aadhaar,
        pan: body.pan,
        currentPlatforms: body.currentPlatforms
          ? JSON.stringify(body.currentPlatforms)
          : "[]",
        experienceMonths: body.experienceMonths,
        dailyEarnings: body.dailyEarnings,
        monthlyEarnings: body.monthlyEarnings,
        fuelCost: body.fuelCost,
        maintenanceCost: body.maintenanceCost,
        netSavings: body.netSavings,
        hoursPerDay: body.hoursPerDay,
        peakHours: body.peakHours,
        preferredArea: body.preferredArea,
        nightShift: body.nightShift ?? false,
        painPoints: body.painPoints
          ? JSON.stringify(body.painPoints)
          : "{}",
        averageWaiting: body.averageWaiting,
        whoShouldPayWait: body.whoShouldPayWait,
        understandsPayout: body.understandsPayout,
        satisfactionRating: body.satisfactionRating,
        wouldRecommend: body.wouldRecommend,
        wantedBenefits: body.wantedBenefits
          ? JSON.stringify(body.wantedBenefits)
          : "[]",
        wouldJoinRynOne: body.wouldJoinRynOne,
        featureVotes: body.featureVotes
          ? JSON.stringify(body.featureVotes)
          : "{}",
        professionalism: body.professionalism,
        communication: body.communication,
        vehicleCondition: body.vehicleCondition,
        documentsComplete: body.documentsComplete ?? false,
        riskLevel: body.riskLevel,
        likelihoodToJoin: body.likelihoodToJoin,
        overallScore: leadScore,
        voiceNoteUrl: body.voiceNoteUrl,
        voiceTranscript: body.voiceTranscript,
        marketFeedback: body.marketFeedback,
        gpsLat: body.gpsLat,
        gpsLng: body.gpsLng,
        aiSummary,
        leadScore,
        leadStatus,
        documents: {
          create: documentRecords,
        },
      },
      include: {
        bde: {
          select: { id: true, name: true, email: true },
        },
        documents: true,
      },
    });

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    console.error("Error creating rider survey:", error);
    return NextResponse.json(
      { error: "Failed to create rider survey" },
      { status: 500 }
    );
  }
}
