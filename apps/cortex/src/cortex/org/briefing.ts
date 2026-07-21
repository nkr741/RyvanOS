import { prisma } from "@/lib/prisma";
import { DEPARTMENTS, agentLabel, MANAGER_LABEL } from "./index";
import { delegate, logMessage, fieldActivity } from "./delegation";

/**
 * The proactive half of the org: instead of waiting to be asked, Operations
 * pushes the founder a daily briefing and raises alerts.
 *
 * Cost note: alerts are pure SQL — a database lookup never needs an LLM. Only
 * the narrative briefing spends tokens, and only once a day.
 */

export interface Alert {
  type: "overdue" | "reminder" | "achievement";
  title: string;
  message: string;
  actionUrl?: string;
}

const OPS = DEPARTMENTS.find((d) => d.id === "ops")!;
const NOTIFIER = agentLabel(OPS.agents.find((a) => a.id === "notification")!);
const OPS_LEAD = agentLabel(OPS.head);

/** Deterministic checks over real data. No LLM, no tokens, exact answers. */
export async function detectAlerts(): Promise<Alert[]> {
  const now = new Date();
  const alerts: Alert[] = [];

  const [overdue, undrafted, topGrade, staleDiscovery] = await Promise.all([
    prisma.followUp.count({ where: { status: { not: "completed" }, scheduledAt: { lt: now } } }),
    prisma.companyCandidate.count({
      where: { analyzedAt: null, status: { notIn: ["rejected", "archived"] }, qualificationGrade: { in: ["A", "B"] } },
    }),
    prisma.companyCandidate.count({
      where: { qualificationGrade: "A", status: { notIn: ["rejected", "archived"] } },
    }),
    prisma.discoveryRun.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  if (overdue > 0) {
    alerts.push({
      type: "overdue",
      title: `${overdue} follow-up${overdue > 1 ? "s" : ""} overdue`,
      message: `${overdue} scheduled follow-up${overdue > 1 ? "s are" : " is"} past due.`,
      actionUrl: "/dashboard/followups",
    });
  }
  if (undrafted > 0) {
    alerts.push({
      type: "reminder",
      title: `${undrafted} high-grade lead${undrafted > 1 ? "s" : ""} with no outreach`,
      message: `${undrafted} A/B-grade lead${undrafted > 1 ? "s have" : " has"} no draft yet. Each is a warm shot going cold.`,
      actionUrl: "/admin/leads",
    });
  }
  if (topGrade > 0) {
    alerts.push({
      type: "achievement",
      title: `${topGrade} A-grade lead${topGrade > 1 ? "s" : ""} in the pipeline`,
      message: `${topGrade} lead${topGrade > 1 ? "s match" : " matches"} the Ryvan ICP closely. Worth a personal look.`,
      actionUrl: "/admin/leads",
    });
  }
  // The field team is people, not agents — the founder needs to know when
  // someone has gone quiet, and that answer lives in the surveys they file.
  const field = await fieldActivity(7);
  if (field.headcount > 0) {
    if (field.silentToday.length) {
      alerts.push({
        type: "reminder",
        title: `${field.silentToday.length} of ${field.headcount} BDEs haven't filed today's report`,
        message: `No daily report yet from: ${field.silentToday.join(", ")}.`,
        actionUrl: "/admin/reports",
      });
    }
    const dormant = field.team.filter((t) => t.vendorSurveys + t.riderSurveys === 0);
    if (dormant.length) {
      alerts.push({
        type: "overdue",
        title: `${dormant.length} BDE${dormant.length > 1 ? "s have" : " has"} logged no surveys in 7 days`,
        message: `No field surveys from: ${dormant.map((t) => t.bde).join(", ")}. Either they're blocked or they're not working the field.`,
        actionUrl: "/admin/team",
      });
    }
  }

  const hoursSince = staleDiscovery ? (now.getTime() - staleDiscovery.createdAt.getTime()) / 3_600_000 : Infinity;
  if (hoursSince > 48) {
    alerts.push({
      type: "reminder",
      title: "Discovery has gone quiet",
      message: staleDiscovery
        ? `No new companies found in ${Math.floor(hoursSince / 24)} days. The pipeline stops filling.`
        : "Discovery has never run. The pipeline is empty.",
      actionUrl: "/admin/discovery",
    });
  }
  return alerts;
}

/** Deliver notifications to every admin (the founder). */
async function notifyAdmins(items: Alert[]): Promise<number> {
  if (!items.length) return 0;
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
  if (!admins.length) return 0;

  await prisma.notification.createMany({
    data: admins.flatMap((u) =>
      items.map((a) => ({ userId: u.id, title: a.title, message: a.message, type: a.type, actionUrl: a.actionUrl })),
    ),
  });
  return admins.length * items.length;
}

export interface BriefingResult {
  briefing: string;
  alerts: Alert[];
  notificationsSent: number;
}

/**
 * The full proactive run: Ops raises alerts, then the Manager asks the Ops Lead
 * for the founder's briefing — through the same chain of command as any other
 * task, so it lands in the comms feed too.
 */
export async function runDailyBriefing(): Promise<BriefingResult> {
  const alerts = await detectAlerts();

  // The Notification Agent's work is real and worth logging up the chain.
  await logMessage(
    NOTIFIER,
    OPS_LEAD,
    "up",
    "ops",
    alerts.length
      ? `Raised ${alerts.length} alert(s) for the founder: ${alerts.map((a) => a.title).join("; ")}`
      : "Swept the data — nothing needs the founder's attention today.",
  );

  const run = await delegate(
    "ops",
    "Write today's founder briefing: what moved, what needs a decision, and what's stuck. Use only real metrics.",
  );
  // The founder wants the briefing itself — the Reporting Agent's actual
  // document — not the lead's "briefing completed, assigned to X" summary.
  const briefing = run.artifacts[run.artifacts.length - 1] || run.report;

  const notificationsSent = await notifyAdmins([
    ...alerts,
    { type: "system" as Alert["type"], title: "Your daily briefing is ready", message: briefing.slice(0, 500), actionUrl: "/admin/org" },
  ]);

  await logMessage(MANAGER_LABEL, "Naveen Kumar Reddy (Founder)", "up", "ops", briefing.slice(0, 1000));

  return { briefing, alerts, notificationsSent };
}
