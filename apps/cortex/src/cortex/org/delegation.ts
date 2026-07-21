import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { DEPARTMENTS, MANAGER_LABEL, CORTEX_MANAGER, agentLabel, type OrgAgent } from "./index";
import { discoveryEngine } from "@/cortex/discovery";
import { generateOutreach } from "@/cortex/analysis/outreach";
import { bootstrapCAO } from "@/cortex/bootstrap";
import { complete } from "@/lib/llm";
import { locateBde } from "./field";
import { createLogger } from "@/lib/logger";

const log = createLogger("delegation");

/**
 * Chain-of-command delegation, like a real IT company.
 *
 *   Founder → Manager → Department Lead → Agent   (task flows DOWN)
 *   Agent → Department Lead → Manager → Founder   (results flow UP)
 *
 * Every hop is persisted as an AgentMessage so the whole conversation between
 * agents is auditable and visible in the org UI. Nothing is fabricated: a lead
 * only reports what its agents' tools actually returned, and departments whose
 * capabilities aren't built yet say so plainly.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const MANAGER = MANAGER_LABEL;

/** Look up an employee by department + agent id. */
function member(deptId: string, agentId: string): OrgAgent {
  const d = DEPARTMENTS.find((x) => x.id === deptId)!;
  const a = d.agents.find((x) => x.id === agentId);
  if (!a) throw new Error(`No agent "${agentId}" in department "${deptId}"`);
  return a;
}
const growthMember = (id: string) => member("growth", id);
const growthAgent = (id: string) => agentLabel(growthMember(id));
const growthAgentName = (id: string) => growthMember(id).name;

/**
 * An agent whose deliverable IS text (a proposal, a JD, a post) produces it for
 * real via the LLM, grounded in facts passed from a real query. It is never a
 * canned string — but it is also never allowed to invent Ryvan's track record.
 */
async function produce(
  deptId: string,
  agentId: string,
  task: string,
  brief: string,
  facts: string,
): Promise<Assignment> {
  const a = member(deptId, agentId);
  const text = await complete(
    `You are ${a.name}, ${a.title} at Ryvan Technologies — a small, bootstrapped Indian AI/QA-automation startup founded by ` +
      `Naveen Kumar Reddy. ${brief}\n\n` +
      `Ground every claim in the facts you are given. Ryvan has no case studies, no named clients, and no revenue history — ` +
      `never invent them, and never invent metrics. If the facts are empty, say plainly that there is nothing to work with.`,
    `${facts}\n\n${task}`,
    { maxTokens: 700 },
  );
  return {
    agent: agentLabel(a),
    task,
    result: text
      ? { deliverable: text }
      : { error: "No LLM backend configured — nothing was produced." },
  };
}

/** Count-style reads never touch an LLM — plain SQL is cheaper and exact. */
const activeLeads = { status: { notIn: ["rejected", "archived"] } };

export async function logMessage(
  fromAgent: string,
  toAgent: string,
  direction: "down" | "up",
  department: string | null,
  content: string,
): Promise<void> {
  await prisma.agentMessage.create({
    data: { fromAgent, toAgent, direction, department, content: content.slice(0, 2000) },
  });
}

interface Assignment {
  agent: string;
  task: string;
  result: unknown;
}

interface DeptRuntime {
  tools: Anthropic.Tool[];
  run(name: string, input: Record<string, unknown>): Promise<Assignment>;
}

const obj = (props: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object" as const,
  properties: props,
  required,
  additionalProperties: false,
});

/** Tools the Growth Lead uses to assign work to its agents. */
const GROWTH_TOOLS: Anthropic.Tool[] = [
  {
    name: "assign_discovery",
    description: `Assign ${growthAgentName("discovery")} (Discovery Agent) to find new companies. icp 'qa' = software/SaaS (US/UK); 'partner' = IT-services/outsourcing firms (India).`,
    input_schema: {
      type: "object",
      properties: { icp: { type: "string", enum: ["qa", "partner"] }, limit: { type: "integer" } },
      required: ["icp"],
      additionalProperties: false,
    },
  },
  {
    name: "assign_outreach",
    description: `Assign ${growthAgentName("outreach")} (Outreach Agent) to draft a personalized email for a named company that has already been discovered.`,
    input_schema: {
      type: "object",
      properties: { company: { type: "string" } },
      required: ["company"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_crm",
    description: `Ask ${growthAgentName("crm")} (CRM Agent) for the current pipeline snapshot (lead counts, how many drafted).`,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Executes a Growth-department assignment and reports which agent did it. */
async function runGrowthAssignment(
  name: string,
  input: Record<string, unknown>,
): Promise<Assignment> {
  if (name === "assign_discovery") {
    const agent = growthAgent("discovery");
    const icp = input.icp === "partner" ? "partner firms" : "QA prospects";
    const limit = Math.min(Number(input.limit) || 8, 15);
    const task = `Find ${limit} new ${icp}`;
    bootstrapCAO();
    const config =
      input.icp === "partner"
        ? {
            industries: [
              "information-technology-and-services",
              "it-services-and-it-consulting",
              "outsourcing",
            ],
            countries: ["in"],
            employeeRanges: ["50-200", "200-500", "500-1k"],
            limit,
          }
        : { industries: ["software-development", "saas"], countries: ["us", "gb"], limit };
    const provider = process.env.THE_COMPANIES_API_KEY ? "thecompaniesapi" : "autonomous_search";
    const r = await discoveryEngine.runDiscovery(provider, config, "growth-lead");
    const fresh = await prisma.companyCandidate.findMany({
      where: { runId: r.runId },
      select: { id: true },
    });
    let qualified = 0;
    for (const c of fresh) {
      try {
        await discoveryEngine.extractSignals(c.id);
        await discoveryEngine.qualifyCandidate(c.id);
        qualified++;
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : err, candidateId: c.id },
          "failed to qualify candidate",
        );
      }
    }
    return {
      agent,
      task,
      result: { discovered: r.discovered, qualified, errors: r.errors.slice(0, 2) },
    };
  }

  if (name === "assign_outreach") {
    const agent = growthAgent("outreach");
    const task = `Draft outreach for ${String(input.company)}`;
    const cand = await prisma.companyCandidate.findFirst({
      where: {
        companyName: { contains: String(input.company), mode: "insensitive" },
        status: { notIn: ["rejected", "archived"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!cand)
      return { agent, task, result: { error: `No discovered lead matches "${input.company}".` } };
    const d = await generateOutreach(cand.id);
    return {
      agent,
      task,
      result: { company: d.companyName, subject: d.subject, contact: d.contactGuess },
    };
  }

  if (name === "ask_crm") {
    const agent = growthAgent("crm");
    const task = "Report the current pipeline snapshot";
    const [total, drafted] = await Promise.all([
      prisma.companyCandidate.count({ where: { status: { notIn: ["rejected", "archived"] } } }),
      prisma.companyCandidate.count({
        where: { analyzedAt: { not: null }, status: { notIn: ["rejected", "archived"] } },
      }),
    ]);
    return { agent, task, result: { totalLeads: total, drafted, awaitingDraft: total - drafted } };
  }

  return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
}

/** Real company context for a named lead — shared by several departments. */
async function companyFacts(name: string): Promise<string | null> {
  const c = await prisma.companyCandidate.findFirst({
    where: { companyName: { contains: name, mode: "insensitive" }, ...activeLeads },
    orderBy: { createdAt: "desc" },
    select: {
      companyName: true,
      industry: true,
      website: true,
      location: true,
      size: true,
      employees: true,
      description: true,
      qualificationGrade: true,
      qualificationScore: true,
    },
  });
  if (!c) return null;
  return `Company facts from our database:\n${JSON.stringify(c, null, 2)}`;
}

/**
 * What the field team (BDEs) has actually been doing — straight from the
 * surveys, activities, and daily reports they file. Pure SQL: monitoring the
 * team is a database question, not a reasoning one.
 */
export async function fieldActivity(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const bdes = await prisma.user.findMany({
    where: { role: "bde" },
    select: { id: true, name: true },
  });
  const byId = new Map(bdes.map((b) => [b.id, b.name]));

  const [vendor, rider, acts, reports, todayReports, fixes] = await Promise.all([
    prisma.vendorSurvey.groupBy({
      by: ["bdeId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.riderSurvey.groupBy({
      by: ["bdeId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.activity.groupBy({
      by: ["userId", "type"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.dailyReport.groupBy({
      by: ["bdeId"],
      where: { date: { gte: since } },
      _sum: { visited: true, completed: true, interested: true, strongLeads: true },
    }),
    prisma.dailyReport.findMany({
      where: { date: { gte: startOfToday } },
      select: { bdeId: true },
    }),
    prisma.bdeLocation.groupBy({
      by: ["bdeId"],
      where: { createdAt: { gte: startOfToday } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);

  const filedToday = new Set(todayReports.map((r) => r.bdeId));
  const ON_SHIFT_MS = 30_000; // ~3 ping cycles
  const num = (arr: { _count: { _all: number } }[] | undefined) => arr?.[0]?._count._all ?? 0;

  const team = bdes.map((b) => {
    const v = vendor.find((x) => x.bdeId === b.id);
    const r = rider.find((x) => x.bdeId === b.id);
    const rep = reports.find((x) => x.bdeId === b.id);
    const channels: Record<string, number> = {};
    for (const a of acts.filter((x) => x.userId === b.id)) channels[a.type] = a._count._all;
    const lastSeen = [v?._max.createdAt, r?._max.createdAt].filter(Boolean).sort().pop() as
      Date | undefined;
    const fix = fixes.find((x) => x.bdeId === b.id);
    const lastFix = fix?._max.createdAt;
    return {
      bde: b.name,
      onShiftNow: !!lastFix && Date.now() - lastFix.getTime() < ON_SHIFT_MS,
      locationPingsToday: fix?._count._all ?? 0,
      lastLocationFix: lastFix ? lastFix.toISOString() : "not on shift today",
      vendorSurveys: num(v ? [v] : undefined),
      riderSurveys: num(r ? [r] : undefined),
      activityByChannel: channels,
      reported: {
        visited: rep?._sum.visited ?? 0,
        completed: rep?._sum.completed ?? 0,
        interested: rep?._sum.interested ?? 0,
        strongLeads: rep?._sum.strongLeads ?? 0,
      },
      filedTodaysReport: filedToday.has(b.id),
      lastFieldActivity: lastSeen ? lastSeen.toISOString() : "no surveys in this window",
    };
  });

  return {
    windowDays: days,
    headcount: bdes.length,
    onShiftNow: team.filter((t) => t.onShiftNow).map((t) => t.bde),
    team,
    silentToday: team.filter((t) => !t.filedTodaysReport).map((t) => t.bde),
    note: byId.size ? undefined : "No BDE users exist yet.",
  };
}

const RUNTIMES: Record<string, DeptRuntime> = {
  growth: {
    tools: GROWTH_TOOLS,
    run: runGrowthAssignment,
  },

  delivery: {
    tools: [
      {
        name: "ask_workload",
        description: `Ask ${member("delivery", "pm").name} (Project Manager Agent) for the real current delivery workload from the database.`,
        input_schema: obj(),
      },
      {
        name: "assign_proposal",
        description: `Assign ${member("delivery", "proposal").name} (Proposal Agent) to draft a real proposal for a company we have discovered.`,
        input_schema: obj({ company: { type: "string" } }, ["company"]),
      },
      {
        name: "assign_qa_plan",
        description: `Assign ${member("delivery", "qa").name} (QA Automation Agent) to draft a QA automation test plan for a discovered company.`,
        input_schema: obj({ company: { type: "string" } }, ["company"]),
      },
    ],
    async run(name, input) {
      if (name === "ask_workload") {
        const [missions, workItems, opps] = await Promise.all([
          prisma.mission.count(),
          prisma.workItem.count(),
          prisma.opportunity.count({ where: { stage: { notIn: ["won", "lost"] } } }),
        ]);
        const a = member("delivery", "pm");
        return {
          agent: agentLabel(a),
          task: "Report the current delivery workload",
          result: { missions, workItems, openOpportunities: opps },
        };
      }
      const co = String(input.company || "");
      const facts = await companyFacts(co);
      if (name === "assign_proposal") {
        if (!facts)
          return {
            agent: agentLabel(member("delivery", "proposal")),
            task: `Draft a proposal for ${co}`,
            result: { error: `"${co}" is not in our database. Growth needs to discover it first.` },
          };
        return produce(
          "delivery",
          "proposal",
          `Draft a short proposal for ${co}.`,
          "Write a concise, honest proposal: the problem you can infer from their profile, what Ryvan would do (QA automation / software delivery), a phased approach, and next step. No pricing unless asked — the founder sets price.",
          facts,
        );
      }
      if (name === "assign_qa_plan") {
        if (!facts)
          return {
            agent: agentLabel(member("delivery", "qa")),
            task: `Draft a QA plan for ${co}`,
            result: { error: `"${co}" is not in our database.` },
          };
        return produce(
          "delivery",
          "qa",
          `Draft a QA automation test plan for ${co}.`,
          "Write a practical QA automation plan: what to cover first, suggested tooling, and how it would be phased. Be explicit that scope must be confirmed with the client.",
          facts,
        );
      }
      return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
    },
  },

  marketing: {
    tools: [
      {
        name: "assign_content",
        description: `Assign ${member("marketing", "content").name} (Content Agent) to write a real piece of content.`,
        input_schema: obj(
          {
            topic: { type: "string" },
            format: { type: "string", enum: ["blog", "case-study-outline", "capability-deck"] },
          },
          ["topic"],
        ),
      },
      {
        name: "assign_social",
        description: `Assign ${member("marketing", "social").name} (Social Agent) to draft a real LinkedIn post.`,
        input_schema: obj({ topic: { type: "string" } }, ["topic"]),
      },
      {
        name: "assign_seo",
        description: `Assign ${member("marketing", "seo").name} (SEO Agent) to suggest keyword angles for a topic. NOTE: we have no keyword-volume data source, so these are suggestions only, never search volumes.`,
        input_schema: obj({ topic: { type: "string" } }, ["topic"]),
      },
    ],
    async run(name, input) {
      const topic = String(input.topic || "");
      if (name === "assign_content") {
        return produce(
          "marketing",
          "content",
          `Write a ${String(input.format || "blog")} on: ${topic}`,
          "Write publish-ready content in Ryvan's voice: practical, technical, no hype, no fabricated customer stories.",
          "Ryvan Technologies: bootstrapped Indian startup. Services: QA automation, AI agents, software delivery. No public case studies yet.",
        );
      }
      if (name === "assign_social") {
        return produce(
          "marketing",
          "social",
          `Draft a LinkedIn post on: ${topic}`,
          "Write one LinkedIn post: a strong hook, a concrete insight, a soft CTA. Under 150 words. No emojis-as-bullets, no hype.",
          "Ryvan Technologies: bootstrapped Indian startup doing QA automation and AI agent systems.",
        );
      }
      if (name === "assign_seo") {
        return produce(
          "marketing",
          "seo",
          `Suggest keyword angles for: ${topic}`,
          "Suggest keyword/topic angles and search intent. You have NO volume data — never state search volumes or difficulty scores as if measured; present these as hypotheses to validate.",
          "Ryvan sells QA automation and AI agent development, mainly to software/SaaS firms and IT-services partners.",
        );
      }
      return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
    },
  },

  support: {
    tools: [
      {
        name: "ask_inbox",
        description: `Ask ${member("support", "deskrep").name} (Front Desk Agent) for the real inbound/follow-up queue from the database.`,
        input_schema: obj(),
      },
      {
        name: "assign_reply",
        description: `Assign ${member("support", "support").name} (Support Agent) to draft a real reply to a client question.`,
        input_schema: obj({ question: { type: "string" } }, ["question"]),
      },
    ],
    async run(name, input) {
      if (name === "ask_inbox") {
        const [pending, overdue, contacts] = await Promise.all([
          prisma.followUp.count({ where: { status: { not: "completed" } } }),
          prisma.followUp.count({
            where: { status: { not: "completed" }, scheduledAt: { lt: new Date() } },
          }),
          prisma.contact.count(),
        ]);
        const a = member("support", "deskrep");
        return {
          agent: agentLabel(a),
          task: "Report the inbound queue",
          result: { pendingFollowUps: pending, overdue, knownContacts: contacts },
        };
      }
      if (name === "assign_reply") {
        return produce(
          "support",
          "support",
          `Draft a reply to: ${String(input.question)}`,
          "Draft a professional, concise reply from Ryvan's support. If you don't know a fact, say what you'd need to confirm rather than guessing.",
          "Ryvan Technologies: QA automation and AI agent development. Founder: Naveen Kumar Reddy.",
        );
      }
      return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
    },
  },

  finance: {
    tools: [
      {
        name: "ask_financials",
        description: `Ask ${member("finance", "cashflow").name} (Cash Flow Agent) for the real financial picture from the database (opportunity pipeline value, won deals).`,
        input_schema: obj(),
      },
      {
        name: "assign_contract",
        description: `Assign ${member("finance", "contracts").name} (Contracts Agent) to draft a real contract document.`,
        input_schema: obj(
          {
            type: { type: "string", enum: ["NDA", "MSA", "SOW"] },
            counterparty: { type: "string" },
          },
          ["type"],
        ),
      },
    ],
    async run(name, input) {
      if (name === "ask_financials") {
        const [open, won, invoices] = await Promise.all([
          prisma.opportunity.aggregate({
            where: { stage: { notIn: ["won", "lost"] } },
            _sum: { estimatedValue: true },
            _count: true,
          }),
          prisma.opportunity.aggregate({
            where: { stage: "won" },
            _sum: { estimatedValue: true },
            _count: true,
          }),
          Promise.resolve(null), // No invoice model exists yet — report that honestly.
        ]);
        const a = member("finance", "cashflow");
        return {
          agent: agentLabel(a),
          task: "Report the financial picture",
          result: {
            openOpportunities: open._count,
            openPipelineValue: open._sum.estimatedValue ?? 0,
            wonDeals: won._count,
            wonValue: won._sum.estimatedValue ?? 0,
            invoicing:
              invoices === null
                ? "Not tracked — Cortex has no invoice model yet, so I cannot report AR or cash position."
                : invoices,
          },
        };
      }
      if (name === "assign_contract") {
        const cp = String(input.counterparty || "the counterparty");
        return produce(
          "finance",
          "contracts",
          `Draft a ${String(input.type)} with ${cp}.`,
          "Draft a clear, standard document with the usual clauses. Mark every blank that needs the founder's input as [TO CONFIRM]. State at the top that this is a draft requiring legal review — you are not a lawyer.",
          `Ryvan Technologies Private Limited, India. Counterparty: ${cp}. No GST registration yet (turnover below the ₹20L threshold).`,
        );
      }
      return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
    },
  },

  ops: {
    tools: [
      {
        name: "ask_metrics",
        description: `Ask ${member("ops", "reporting").name} (Reporting Agent) for real business metrics straight from the database.`,
        input_schema: obj(),
      },
      {
        name: "assign_briefing",
        description: `Assign ${member("ops", "reporting").name} (Reporting Agent) to write the founder's briefing from the real metrics.`,
        input_schema: obj(),
      },
      {
        name: "ask_field_activity",
        description: `Ask ${member("ops", "fieldops").name} (Field Ops Agent) what every BDE has actually been doing in the field: surveys logged, activity by channel, daily reports, and who has gone quiet.`,
        input_schema: obj({
          days: { type: "integer", description: "Look-back window in days (default 7)" },
        }),
      },
      {
        name: "locate_bde",
        description: `Ask ${member("ops", "fieldops").name} (Field Ops Agent) where one BDE is right now, what they surveyed today, and whether their GPS track corroborates those surveys.`,
        input_schema: obj({ name: { type: "string" } }, ["name"]),
      },
    ],
    async run(name, input) {
      if (name === "ask_field_activity") {
        return {
          agent: agentLabel(member("ops", "fieldops")),
          task: `Report field-team activity`,
          result: await fieldActivity(Number(input?.days) || 7),
        };
      }
      if (name === "locate_bde") {
        return {
          agent: agentLabel(member("ops", "fieldops")),
          task: `Locate ${String(input.name)} and verify today's surveys`,
          result: await locateBde(String(input.name)),
        };
      }
      const [leads, drafted, runs, lastRun, msgs] = await Promise.all([
        prisma.companyCandidate.count({ where: activeLeads }),
        prisma.companyCandidate.count({ where: { analyzedAt: { not: null }, ...activeLeads } }),
        prisma.discoveryRun.count(),
        prisma.discoveryRun.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.agentMessage.count(),
      ]);
      const metrics = {
        totalLeads: leads,
        outreachDrafted: drafted,
        awaitingDraft: leads - drafted,
        discoveryRuns: runs,
        lastDiscovery: lastRun?.createdAt?.toISOString() ?? "never",
        agentMessages: msgs,
      };
      if (name === "ask_metrics") {
        return {
          agent: agentLabel(member("ops", "reporting")),
          task: "Report business metrics",
          result: metrics,
        };
      }
      if (name === "assign_briefing") {
        return produce(
          "ops",
          "reporting",
          "Write the founder's briefing.",
          "Write a tight briefing for the founder: what moved, what needs a decision, what's stuck. Use only the numbers given. No filler.",
          `Real metrics from the database:\n${JSON.stringify(metrics, null, 2)}`,
        );
      }
      return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
    },
  },

  hr: {
    tools: [
      {
        name: "ask_team",
        description: `Ask ${member("hr", "peopleops").name} (People Ops Agent) for the real human team roster from the database.`,
        input_schema: obj(),
      },
      {
        name: "assign_jd",
        description: `Assign ${member("hr", "recruiting").name} (Recruiting Agent) to draft a real job description.`,
        input_schema: obj({ role: { type: "string" } }, ["role"]),
      },
    ],
    async run(name, input) {
      if (name === "ask_team") {
        const users = await prisma.user.findMany({
          select: { name: true, role: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        });
        const a = member("hr", "peopleops");
        return {
          agent: agentLabel(a),
          task: "Report the human team roster",
          result: {
            headcount: users.length,
            team: users.map((u) => ({ name: u.name, role: u.role })),
          },
        };
      }
      if (name === "assign_jd") {
        return produce(
          "hr",
          "recruiting",
          `Draft a job description for: ${String(input.role)}`,
          "Write an honest JD for a bootstrapped startup: real scope, real expectations. Do not promise salary, equity, or benefits — mark those [FOUNDER TO CONFIRM].",
          "Ryvan Technologies: early-stage bootstrapped Indian AI/QA-automation startup. Small team. Founder-led.",
        );
      }
      return { agent: "Unknown Agent", task: name, result: { error: "Unknown assignment" } };
    },
  },
};

export interface DelegationResult {
  /** The lead's summary back to the Manager. */
  report: string;
  /** Artifacts the agents actually produced (a proposal, a briefing, a JD…). */
  artifacts: string[];
}

/** Thin wrapper for callers that only want the lead's report. */
export async function delegateToDepartment(deptId: string, task: string): Promise<string> {
  return (await delegate(deptId, task)).report;
}

/**
 * The Manager delegates a task to a department lead. The lead assigns its
 * agents, then reports back up.
 *
 * Returns both the lead's report AND any artifacts produced — because a lead's
 * report is a *status summary*, not the deliverable. When the founder asks for
 * a briefing they want the briefing, not "briefing completed, assigned to X".
 */
export async function delegate(deptId: string, task: string): Promise<DelegationResult> {
  const dept = DEPARTMENTS.find((d) => d.id === deptId);
  if (!dept) return { report: `There is no department with id "${deptId}".`, artifacts: [] };
  const lead = agentLabel(dept.head);

  await logMessage(MANAGER, lead, "down", dept.id, task);

  const runtime = RUNTIMES[dept.id];
  if (!runtime) {
    const report = `I have no tools wired up yet, so I can't action that. Nothing was executed.`;
    await logMessage(lead, MANAGER, "up", dept.id, report);
    return { report, artifacts: [] };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const report = "Cannot run: the Claude API key isn't configured for this environment.";
    await logMessage(lead, MANAGER, "up", dept.id, report);
    return { report, artifacts: [] };
  }

  const artifacts: string[] = [];

  const client = new Anthropic({ apiKey });
  const system =
    `You are ${dept.head.name}, the ${dept.head.title} at Ryvan Technologies, running the ${dept.name} department. ` +
    `Mission: ${dept.mission}\n` +
    `Your team: ${dept.agents.map((a) => `${a.name} (${a.title}) — ${a.role}`).join("; ")}.\n\n` +
    `${CORTEX_MANAGER.name}, the ${CORTEX_MANAGER.title}, has assigned you a task. Use your tools to assign the work to your ` +
    `team, then report back to the Manager concisely: who you assigned it to (use their name), what they actually produced, ` +
    `and anything blocked. Never invent results — report only what the tools returned. Keep the report under 100 words.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Task from the Delivery Manager: ${task}` },
  ];

  for (let step = 0; step < 5; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      // A lead's persona + team roster never changes between steps or calls.
      // Note: a lead's prompt is smaller than the Manager's, so this is also
      // below Haiku's 2048-token cache minimum today — see the assistant's
      // note. Harmless, and self-activating if a lead's toolset grows.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: runtime.tools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const report =
        res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim() || "(no report)";
      await logMessage(lead, MANAGER, "up", dept.id, report);
      return { report, artifacts };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        let out: Assignment;
        try {
          out = await runtime.run(block.name, block.input as Record<string, unknown>);
        } catch (e) {
          out = {
            agent: "Unknown Agent",
            task: block.name,
            result: { error: e instanceof Error ? e.message : "failed" },
          };
        }
        // Keep the real deliverable, not just the lead's summary of it.
        const produced = (out.result as { deliverable?: unknown })?.deliverable;
        if (typeof produced === "string" && produced.trim()) artifacts.push(produced.trim());

        // Log the real chain: Lead → Agent (task), Agent → Lead (result).
        await logMessage(lead, out.agent, "down", dept.id, out.task);
        await logMessage(out.agent, lead, "up", dept.id, JSON.stringify(out.result).slice(0, 500));
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(out.result),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  const report = "I hit my step limit before finishing the task.";
  await logMessage(lead, MANAGER, "up", dept.id, report);
  return { report, artifacts };
}

/** Recent chain-of-command messages, newest first (for the comms feed). */
export async function getRecentMessages(limit = 40) {
  return prisma.agentMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}
