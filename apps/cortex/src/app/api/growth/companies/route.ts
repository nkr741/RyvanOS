import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:growth:companies");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const grade = searchParams.get("grade");
    const industry = searchParams.get("industry");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (grade) where.qualificationGrade = grade;
    if (industry) where.industry = industry;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { industry: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        _count: { select: { contacts: true, opportunities: true, outreachSequences: true, growthActivities: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    const stats = {
      total: await prisma.company.count(),
      qualified: await prisma.company.count({ where: { qualificationGrade: { in: ["A", "B"] } } }),
      inOutreach: await prisma.company.count({ where: { status: "outreach" } }),
      opportunities: await prisma.opportunity.count(),
    };

    return NextResponse.json({
      companies: companies.map(c => ({
        id: c.id,
        name: c.name,
        website: c.website,
        industry: c.industry,
        size: c.size,
        employees: c.employees,
        location: c.location,
        country: c.country,
        status: c.status,
        source: c.source,
        qualificationScore: c.qualificationScore,
        qualificationGrade: c.qualificationGrade,
        aiSummary: c.aiSummary,
        confidence: c.confidence,
        assignedTo: c.assignedTo,
        createdBy: c.createdBy,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        lastActivityAt: c.lastActivityAt?.toISOString() || null,
        counts: c._count,
      })),
      stats,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Growth companies GET error");
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
});

export const POST = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      name: string;
      website?: string;
      industry: string;
      size?: string;
      employees?: number;
      location?: string;
      country?: string;
      description?: string;
      techStack?: string[];
      cloudProvider?: string;
      painPoints?: string[];
      growthSignals?: string[];
      source?: string;
      sourceDetail?: string;
      contacts?: { name: string; title?: string; email?: string; phone?: string; linkedin?: string; role?: string }[];
    };

    if (!body.name || !body.industry) {
      return NextResponse.json({ error: "name and industry are required" }, { status: 400 });
    }

    const company = await prisma.company.create({
      data: {
        name: body.name,
        website: body.website,
        industry: body.industry,
        size: body.size,
        employees: body.employees,
        location: body.location,
        country: body.country || "India",
        description: body.description,
        techStack: JSON.stringify(body.techStack || []),
        cloudProvider: body.cloudProvider,
        painPoints: JSON.stringify(body.painPoints || []),
        growthSignals: JSON.stringify(body.growthSignals || []),
        source: body.source || "manual",
        sourceDetail: body.sourceDetail,
        createdById: user.id,
        contacts: body.contacts ? {
          create: body.contacts.map(c => ({
            name: c.name,
            title: c.title,
            email: c.email,
            phone: c.phone,
            linkedin: c.linkedin,
            role: c.role,
          })),
        } : undefined,
      },
      include: {
        contacts: true,
        _count: { select: { contacts: true, opportunities: true } },
      },
    });

    await prisma.growthActivity.create({
      data: {
        companyId: company.id,
        type: "discovery",
        content: `Company added: ${company.name} (${company.industry})`,
        userId: user.id,
      },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Growth companies POST error");
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
});
