import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateAISummary, calculateLeadScore } from "@/lib/ai";

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
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build where clause
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

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search } },
        { ownerName: { contains: search } },
        { mobile: { contains: search } },
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
      prisma.vendorSurvey.findMany({
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
      prisma.vendorSurvey.count({ where }),
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
    console.error("Error fetching vendor surveys:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendor surveys" },
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

    // Auto-generate AI summary and lead score
    const aiSummary = generateAISummary(body);
    const leadScore = calculateLeadScore(body);

    // Determine lead status based on score
    let leadStatus = "new";
    if (body.interestLevel === "hot" || leadScore >= 70) {
      leadStatus = "interested";
    } else if (body.interestLevel === "warm" || leadScore >= 40) {
      leadStatus = "follow_up";
    }

    // Build document records from uploaded doc fields
    const docFields = [
      "gstDoc", "fssaiDoc", "panDoc", "visitingCard",
      "menuPhoto", "shopPhoto", "ownerPhoto", "shopFrontPhoto",
    ];
    const documentRecords = docFields
      .filter((key) => body[key])
      .map((key) => ({
        type: key,
        fileName: (body[key] as string).split("/").pop() || key,
        filePath: body[key] as string,
      }));

    const survey = await prisma.vendorSurvey.create({
      data: {
        bdeId: user.id,
        businessName: body.businessName,
        ownerName: body.ownerName,
        mobile: body.mobile,
        whatsapp: body.whatsapp,
        email: body.email,
        address: body.address,
        gpsLat: body.gpsLat,
        gpsLng: body.gpsLng,
        category: body.category,
        yearsInBusiness: body.yearsInBusiness,
        numberOfBranches: body.numberOfBranches,
        employees: body.employees,
        seatingCapacity: body.seatingCapacity,
        businessHours: body.businessHours,
        weeklyOff: body.weeklyOff,
        homeDelivery: body.homeDelivery ?? false,
        ownDeliveryStaff: body.ownDeliveryStaff ?? false,
        ownWebsite: body.ownWebsite ?? false,
        ownMobileApp: body.ownMobileApp ?? false,
        ownWhatsappOrdering: body.ownWhatsappOrdering ?? false,
        onlinePlatforms: body.onlinePlatforms
          ? JSON.stringify(body.onlinePlatforms)
          : "[]",
        dailyOrdersWalkIn: body.dailyOrdersWalkIn,
        dailyOrdersOnline: body.dailyOrdersOnline,
        dailyOrdersPhone: body.dailyOrdersPhone,
        dailyOrdersWhatsapp: body.dailyOrdersWhatsapp,
        averageOrderValue: body.averageOrderValue,
        monthlyRevenue: body.monthlyRevenue,
        peakHours: body.peakHours,
        bestSellingProducts: body.bestSellingProducts,
        painPoints: body.painPoints
          ? JSON.stringify(body.painPoints)
          : "{}",
        currentCommission: body.currentCommission,
        platformCommissions: body.platformCommissions
          ? JSON.stringify(body.platformCommissions)
          : "{}",
        deliveryCharges: body.deliveryCharges,
        whoPaysDelvery: body.whoPaysDelvery,
        whoPaysPackaging: body.whoPaysPackaging,
        whoPaysPromotions: body.whoPaysPromotions,
        whoPaysDiscounts: body.whoPaysDiscounts,
        settlementFrequency: body.settlementFrequency,
        settlementProblems: body.settlementProblems,
        marketingChannels: body.marketingChannels
          ? JSON.stringify(body.marketingChannels)
          : "[]",
        aiInterests: body.aiInterests
          ? JSON.stringify(body.aiInterests)
          : "[]",
        wouldJoinRynOne: body.wouldJoinRynOne,
        featureVotes: body.featureVotes
          ? JSON.stringify(body.featureVotes)
          : "{}",
        gstDoc: body.gstDoc,
        fssaiDoc: body.fssaiDoc,
        panDoc: body.panDoc,
        visitingCard: body.visitingCard,
        menuPhoto: body.menuPhoto,
        shopPhoto: body.shopPhoto,
        ownerPhoto: body.ownerPhoto,
        shopFrontPhoto: body.shopFrontPhoto,
        businessSentiment: body.businessSentiment,
        interestLevel: body.interestLevel,
        estimatedOrders: body.estimatedOrders,
        potentialRevenue: body.potentialRevenue,
        riskLevel: body.riskLevel,
        voiceNoteUrl: body.voiceNoteUrl,
        voiceTranscript: body.voiceTranscript,
        marketFeedback: body.marketFeedback,
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
    console.error("Error creating vendor survey:", error);
    return NextResponse.json(
      { error: "Failed to create vendor survey" },
      { status: 500 }
    );
  }
}
