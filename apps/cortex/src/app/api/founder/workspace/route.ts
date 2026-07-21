import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { eventBus } from "@/cortex/runtime/event";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:founder:workspace");

export const GET = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [
      prospectsDiscoveredYesterday,
      prospectsQualifiedYesterday,
      totalProspects,
      gradeAProspects,
      intelligenceCompletedYesterday,
      pendingApprovalWorkItems,
      activeMissions,
      completedMissions,
      totalMissions,
      outcomes,
      opportunities,
      recentOutcomes,
      playbooks,
      notifications,
    ] = await Promise.all([
      prisma.prospect.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.prospect.count({
        where: {
          createdAt: { gte: yesterdayStart, lt: todayStart },
          qualificationGrade: { in: ["A", "B"] },
        },
      }),
      prisma.prospect.count(),
      prisma.prospect.count({ where: { qualificationGrade: "A" } }),
      prisma.accountIntelligence.count({
        where: { publishedAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.workItem.findMany({
        where: { status: "waiting_approval" },
        include: {
          mission: { select: { title: true, prospectId: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.mission.count({
        where: { type: "playbook_execution", status: { in: ["executing", "awaiting_approval"] } },
      }),
      prisma.mission.count({
        where: { type: "playbook_execution", status: "completed" },
      }),
      prisma.mission.count({ where: { type: "playbook_execution" } }),
      prisma.outcome.findMany({
        include: { mission: { select: { title: true, playbookName: true } } },
      }),
      prisma.opportunity.findMany({
        where: { stage: { not: "lost" } },
        select: { estimatedValue: true, probability: true, stage: true },
      }),
      prisma.outcome.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { mission: { select: { title: true } } },
      }),
      prisma.playbook.findMany({
        where: { active: true },
        select: { name: true, displayName: true, metrics: true },
      }),
      prisma.notification.findMany({
        where: { userId: user.id, read: false },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    // Pipeline calculation
    const pipelineValue = opportunities.reduce((sum, o) => sum + (o.estimatedValue || 0), 0);
    const weightedPipeline = opportunities.reduce(
      (sum, o) => sum + (o.estimatedValue || 0) * ((o.probability || 0) / 100),
      0,
    );

    // Mission health
    const wonOutcomes = outcomes.filter((o) => o.result === "won").length;
    const totalOutcomes = outcomes.length;
    const missionSuccessRate =
      totalOutcomes > 0 ? Math.round((wonOutcomes / totalOutcomes) * 100) : 0;
    const totalRevenue = outcomes
      .filter((o) => o.result === "won")
      .reduce((sum, o) => sum + (o.revenue || 0), 0);

    // Today's priorities
    const priorities: Array<{
      id: string;
      type: string;
      title: string;
      subtitle: string;
      action: string;
      actionData?: Record<string, unknown>;
    }> = [];

    for (const wi of pendingApprovalWorkItems) {
      priorities.push({
        id: wi.id,
        type: "approval",
        title: `Approve ${wi.stageName}`,
        subtitle: wi.mission.title,
        action: "approve",
        actionData: { workItemId: wi.id },
      });
    }

    // Prospects needing intelligence
    const prospectsWithoutIntel = await prisma.prospect.findMany({
      where: {
        qualificationGrade: "A",
        intelligence: { none: {} },
      },
      take: 3,
      select: { id: true, companyName: true },
    });
    for (const p of prospectsWithoutIntel) {
      priorities.push({
        id: `intel-${p.id}`,
        type: "research",
        title: `Build intelligence for ${p.companyName}`,
        subtitle: "Grade A prospect with no research",
        action: "research",
        actionData: { prospectId: p.id },
      });
    }

    // Grade A prospects with no active missions
    const prospectsMissions = await prisma.mission.findMany({
      where: { type: "playbook_execution", status: { not: "completed" } },
      select: { prospectId: true },
    });
    const activeProspectIds = new Set(prospectsMissions.map((m) => m.prospectId).filter(Boolean));
    const unexecutedProspects = await prisma.prospect.findMany({
      where: {
        qualificationGrade: "A",
        id: { notIn: Array.from(activeProspectIds) as string[] },
      },
      take: 3,
      select: { id: true, companyName: true },
    });
    for (const p of unexecutedProspects) {
      if (!priorities.some((pr) => pr.actionData?.prospectId === p.id)) {
        priorities.push({
          id: `exec-${p.id}`,
          type: "execute",
          title: `Launch mission for ${p.companyName}`,
          subtitle: "Grade A prospect — no active mission",
          action: "launch",
          actionData: { prospectId: p.id },
        });
      }
    }

    // Recommendation
    let recommendation = "";
    if (pendingApprovalWorkItems.length > 0) {
      recommendation = `You have ${pendingApprovalWorkItems.length} item${pendingApprovalWorkItems.length > 1 ? "s" : ""} waiting for approval. Start there.`;
    } else if (gradeAProspects > 0 && activeMissions === 0) {
      recommendation = `${gradeAProspects} Grade A prospects with no active missions. Time to launch execution.`;
    } else if (totalMissions === 0) {
      recommendation =
        "No missions running. Discover new prospects or launch your first execution mission.";
    } else if (missionSuccessRate >= 80) {
      recommendation = `${missionSuccessRate}% success rate — your playbooks are working. Keep executing.`;
    } else {
      recommendation = "Review recent outcomes and refine your approach based on what's working.";
    }

    // Industry focus recommendation
    const industryProspects = await prisma.prospect.groupBy({
      by: ["industry"],
      _count: { id: true },
      where: { qualificationGrade: "A", industry: { not: null } },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    });
    const focusIndustry = industryProspects[0]?.industry;
    if (focusIndustry && !recommendation.includes(focusIndustry)) {
      recommendation += ` Focus on ${focusIndustry} today.`;
    }

    // Time-based greeting
    const hour = now.getHours();
    let greeting: string;
    if (hour < 12) greeting = "Good morning";
    else if (hour < 17) greeting = "Good afternoon";
    else greeting = "Good evening";

    // Revenue goal tracking
    const REVENUE_GOAL = 10000000; // ₹1 Crore
    const revenueProgress = Math.min(100, Math.round((totalRevenue / REVENUE_GOAL) * 100));

    // Milestone tracking
    const proposalsSent = await prisma.workItem.count({
      where: { executorType: "proposal", status: "completed" },
    });
    const meetingsCount = await prisma.workItem.count({
      where: { executorType: "meeting", status: "completed" },
    });
    const clientsWon = wonOutcomes;

    const milestones = [
      {
        id: 1,
        label: "100 Companies Discovered",
        current: totalProspects,
        target: 100,
        done: totalProspects >= 100,
      },
      {
        id: 2,
        label: "20 Grade A Prospects",
        current: gradeAProspects,
        target: 20,
        done: gradeAProspects >= 20,
      },
      {
        id: 3,
        label: "10 Meetings",
        current: meetingsCount,
        target: 10,
        done: meetingsCount >= 10,
      },
      {
        id: 4,
        label: "5 Proposals Sent",
        current: proposalsSent,
        target: 5,
        done: proposalsSent >= 5,
      },
      { id: 5, label: "First Client Won", current: clientsWon, target: 1, done: clientsWon >= 1 },
    ];

    // Business Learning Score
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      industriesThisMonth,
      gapReflectionsCount,
      outcomesThisMonth,
      manualReflectionsCount,
      lastMonthGapCount,
      lastMonthManualCount,
      lastMonthOutcomesCount,
      lastMonthIndustries,
    ] = await Promise.all([
      prisma.prospect.findMany({
        where: { createdAt: { gte: monthStart }, industry: { not: null } },
        select: { industry: true },
        distinct: ["industry"],
      }),
      prisma.cortexEvent.count({
        where: { type: "founder.reflection.gap.v1", createdAt: { gte: monthStart } },
      }),
      prisma.outcome.count({
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.cortexEvent.count({
        where: { type: "founder.reflection.manual.v1", createdAt: { gte: monthStart } },
      }),
      prisma.cortexEvent.count({
        where: {
          type: "founder.reflection.gap.v1",
          createdAt: { gte: lastMonthStart, lt: monthStart },
        },
      }),
      prisma.cortexEvent.count({
        where: {
          type: "founder.reflection.manual.v1",
          createdAt: { gte: lastMonthStart, lt: monthStart },
        },
      }),
      prisma.outcome.count({
        where: { createdAt: { gte: lastMonthStart, lt: monthStart } },
      }),
      prisma.prospect.findMany({
        where: { createdAt: { gte: lastMonthStart, lt: monthStart }, industry: { not: null } },
        select: { industry: true },
        distinct: ["industry"],
      }),
    ]);

    const thisMonthTotal =
      industriesThisMonth.length + gapReflectionsCount + outcomesThisMonth + manualReflectionsCount;
    const lastMonthTotal =
      lastMonthIndustries.length +
      lastMonthGapCount +
      lastMonthOutcomesCount +
      lastMonthManualCount;
    const knowledgeGrowth =
      lastMonthTotal > 0
        ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
        : thisMonthTotal > 0
          ? 100
          : 0;

    // Recent reflections (today's logs)
    const recentReflections = await prisma.cortexEvent.findMany({
      where: {
        type: { in: ["founder.reflection.gap.v1", "founder.reflection.manual.v1"] },
        createdAt: { gte: yesterdayStart },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      greeting: `${greeting}, ${user.name?.split(" ")[0] || "Naveen"}.`,
      date: now.toISOString(),
      yesterday: {
        prospectsDiscovered: prospectsDiscoveredYesterday,
        qualified: prospectsQualifiedYesterday,
        researchCompleted: intelligenceCompletedYesterday,
      },
      pipeline: {
        total: pipelineValue,
        weighted: weightedPipeline,
        opportunities: opportunities.length,
      },
      missions: {
        active: activeMissions,
        completed: completedMissions,
        total: totalMissions,
        successRate: missionSuccessRate,
        totalRevenue,
      },
      revenueGoal: {
        target: REVENUE_GOAL,
        current: totalRevenue,
        progress: revenueProgress,
      },
      milestones,
      priorities,
      recommendation,
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        createdAt: n.createdAt,
      })),
      health: {
        prospects: totalProspects,
        gradeA: gradeAProspects,
        pendingApprovals: pendingApprovalWorkItems.length,
        playbooks: playbooks.length,
      },
      learningScore: {
        industriesLearned: industriesThisMonth.length,
        objectionsCaptures: gapReflectionsCount,
        outcomePatterns: outcomesThisMonth,
        processInsights: manualReflectionsCount,
        totalLearnings: thisMonthTotal,
        growth: knowledgeGrowth,
      },
      reflections: recentReflections.map((r) => {
        const payload = JSON.parse(r.payload);
        return {
          id: r.id,
          type: r.type === "founder.reflection.gap.v1" ? "gap" : "manual",
          text: payload.text || "",
          createdAt: r.createdAt,
        };
      }),
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to load workspace");
    return NextResponse.json({ error: "Failed to load workspace" }, { status: 500 });
  }
});

export const POST = withApi(async (request) => {
  try {
    const user = getCurrentUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "log_reflection") {
      const { type, text } = body;
      if (!type || !text) {
        return NextResponse.json({ error: "type and text required" }, { status: 400 });
      }

      const eventType =
        type === "gap" ? "founder.reflection.gap.v1" : "founder.reflection.manual.v1";

      await eventBus.publish({
        type: eventType,
        version: "1",
        source: "founder.workspace",
        payload: { text, userId: user.id, userName: user.name },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to save reflection");
    return NextResponse.json({ error: "Failed to save reflection" }, { status: 500 });
  }
});
