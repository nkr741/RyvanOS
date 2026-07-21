import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage");
    const companyId = searchParams.get("companyId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where: Record<string, unknown> = {};
    if (stage) where.stage = stage;
    if (companyId) where.companyId = companyId;

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, industry: true, qualificationGrade: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    const stats = {
      total: await prisma.opportunity.count(),
      totalValue: (await prisma.opportunity.aggregate({ _sum: { estimatedValue: true } }))._sum.estimatedValue || 0,
      byStage: await prisma.opportunity.groupBy({
        by: ["stage"],
        _count: true,
        _sum: { estimatedValue: true },
      }),
    };

    return NextResponse.json({ opportunities, stats });
  } catch (error) {
    console.error("Growth opportunities GET error:", error);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      companyId: string;
      title: string;
      description?: string;
      services?: string[];
      estimatedValue?: number;
      probability?: number;
      stage?: string;
      source?: string;
    };

    if (!body.companyId || !body.title) {
      return NextResponse.json({ error: "companyId and title are required" }, { status: 400 });
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        companyId: body.companyId,
        title: body.title,
        description: body.description,
        services: JSON.stringify(body.services || []),
        estimatedValue: body.estimatedValue,
        probability: body.probability ?? 20,
        stage: body.stage || "identified",
        source: body.source,
        createdById: user.id,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    await prisma.growthActivity.create({
      data: {
        companyId: body.companyId,
        type: "opportunity",
        content: `Opportunity identified: ${body.title}${body.estimatedValue ? ` (₹${body.estimatedValue.toLocaleString()})` : ""}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ opportunity }, { status: 201 });
  } catch (error) {
    console.error("Growth opportunities POST error:", error);
    return NextResponse.json({ error: "Failed to create opportunity" }, { status: 500 });
  }
}
