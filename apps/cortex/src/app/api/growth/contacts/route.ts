import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      companyId: string;
      name: string;
      title?: string;
      email?: string;
      phone?: string;
      linkedin?: string;
      role?: string;
      notes?: string;
    };

    if (!body.companyId || !body.name) {
      return NextResponse.json({ error: "companyId and name are required" }, { status: 400 });
    }

    const contact = await prisma.contact.create({
      data: {
        companyId: body.companyId,
        name: body.name,
        title: body.title,
        email: body.email,
        phone: body.phone,
        linkedin: body.linkedin,
        role: body.role,
        notes: body.notes,
      },
    });

    await prisma.growthActivity.create({
      data: {
        companyId: body.companyId,
        type: "discovery",
        content: `Contact added: ${body.name}${body.title ? ` (${body.title})` : ""}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("Growth contacts POST error:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
