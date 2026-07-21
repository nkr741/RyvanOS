import { prisma } from "@/lib/prisma";

/**
 * The Cortex agentic org — a real IT-company hierarchy of AI "employees",
 * grouped into departments under department heads, all reporting up to the
 * Cortex Manager, who reports to the founder.
 *
 * Dual purpose: (1) the tool Ryvan runs its own business on to generate revenue,
 * and (2) a productized "AI Agentic Workforce" Ryvan sells — with its own usage
 * as the testimonial. So this structure is the canonical, presentable org model.
 */

/** Drives which synthesized voice an agent speaks with. */
export type Gender = "male" | "female";

export interface OrgAgent {
  id: string;
  /** The person's name — every agent is a named employee, not a job slot. */
  name: string;
  /** Their job title, e.g. "Discovery Agent". */
  title: string;
  gender: Gender;
  role: string;
}

export interface Department {
  id: string;
  name: string;
  head: OrgAgent;
  mission: string;
  agents: OrgAgent[];
}

export const CORTEX_MANAGER = {
  id: "manager",
  name: "Cortex",
  title: "Delivery Manager",
  gender: "male" as Gender,
  role: "Breaks the founder's goals into projects, delegates to department heads, monitors each department's work, and reports consolidated status back to the founder.",
} as const;

/** How an employee is addressed in comms logs: "Aarav Mehta (Growth Lead)". */
export function agentLabel(a: { name: string; title: string }): string {
  return `${a.name} (${a.title})`;
}

export const MANAGER_LABEL = agentLabel(CORTEX_MANAGER);

export const DEPARTMENTS: Department[] = [
  {
    id: "growth",
    name: "Growth & Sales",
    head: { id: "growth-lead", name: "Aarav Mehta", title: "Growth Lead", gender: "male", role: "Runs the revenue engine: assigns discovery, qualification, and outreach work, and reports the pipeline to the Manager." },
    mission: "Generate revenue: discover fit companies, qualify them, and produce ready-to-send outreach.",
    agents: [
      { id: "discovery", name: "Diya Sharma", title: "Discovery Agent", gender: "female", role: "Finds new prospect (QA) and partner (IT-services) companies from B2B data sources." },
      { id: "research", name: "Kabir Nair", title: "Research Agent", gender: "male", role: "Enriches companies with firmographics and buying signals, and scores fit." },
      { id: "qualification", name: "Ananya Rao", title: "Qualification Agent", gender: "female", role: "Grades each lead against the Ryvan ICP so the team focuses on the best-fit ones." },
      { id: "outreach", name: "Rohan Kapoor", title: "Outreach Agent", gender: "male", role: "Writes personalized QA-sales and partnership emails grounded in the company's data." },
      { id: "crm", name: "Meera Iyer", title: "CRM Agent", gender: "female", role: "Tracks follow-ups, pipeline stage, and reply status across leads." },
    ],
  },
  {
    id: "delivery",
    name: "Delivery & Engineering",
    head: { id: "delivery-lead", name: "Vikram Desai", title: "Delivery Lead", gender: "male", role: "Owns client delivery: assigns build and QA work, tracks milestones, and reports risk to the Manager." },
    mission: "Execute the client work Ryvan sells: QA automation, software development, and proposals.",
    agents: [
      { id: "qa", name: "Riya Menon", title: "QA Automation Agent (RYN)", gender: "female", role: "Writes and self-heals end-to-end tests for client projects." },
      { id: "engineering", name: "Arjun Reddy", title: "Engineering Agent", gender: "male", role: "Full-stack development and delivery of client engagements." },
      { id: "review", name: "Sanjana Bose", title: "Code Review Agent", gender: "female", role: "Reviews code for bugs, security, and quality before delivery." },
      { id: "pm", name: "Neha Gupta", title: "Project Manager Agent", gender: "female", role: "Plans milestones, tracks progress, and flags risks on client projects." },
      { id: "proposal", name: "Karthik Subramanian", title: "Proposal Agent", gender: "male", role: "Scopes projects and drafts proposals and statements of work." },
    ],
  },
  {
    id: "marketing",
    name: "Marketing & Content",
    head: { id: "marketing-lead", name: "Ishaan Verma", title: "Marketing Lead", gender: "male", role: "Owns Ryvan's inbound presence and assigns content, SEO, and social work." },
    mission: "Build Ryvan's inbound presence: content, SEO, and social so prospects come to us.",
    agents: [
      { id: "content", name: "Tara Krishnan", title: "Content Agent", gender: "female", role: "Writes blog posts, case studies, and capability decks." },
      { id: "seo", name: "Aditya Joshi", title: "SEO Agent", gender: "male", role: "Researches keywords and optimizes content for discovery." },
      { id: "social", name: "Priya Malhotra", title: "Social Agent", gender: "female", role: "Drafts LinkedIn and social posts to grow reach." },
    ],
  },
  {
    id: "support",
    name: "Customer Support & Front Desk",
    head: { id: "support-lead", name: "Kavya Pillai", title: "Support Lead", gender: "female", role: "Owns the client experience: routes inbound contact and oversees support and success." },
    mission: "Be Ryvan's front door: answer inbound calls and inquiries, resolve support tickets, and keep clients happy.",
    agents: [
      { id: "deskrep", name: "Sneha Raghavan", title: "Front Desk Agent", gender: "female", role: "Answers inbound calls and inquiries, greets prospects, and routes them to the right team." },
      { id: "support", name: "Rahul Bhat", title: "Support Agent", gender: "male", role: "Handles client support tickets and product questions." },
      { id: "success", name: "Pooja Shetty", title: "Customer Success Agent", gender: "female", role: "Manages client accounts, check-ins, and renewals." },
    ],
  },
  {
    id: "finance",
    name: "Finance & Admin",
    head: { id: "finance-lead", name: "Rajesh Malhotra", title: "Finance Lead", gender: "male", role: "Owns the money: oversees invoicing, cash flow, and contracts, and reports runway to the Manager." },
    mission: "Keep the money and paperwork in order: invoices, cash flow, and contracts.",
    agents: [
      { id: "invoicing", name: "Divya Agarwal", title: "Invoicing Agent", gender: "female", role: "Raises and tracks client invoices and payment status." },
      { id: "cashflow", name: "Suresh Kulkarni", title: "Cash Flow Agent", gender: "male", role: "Monitors revenue, expenses, and runway." },
      { id: "contracts", name: "Lakshmi Narayan", title: "Contracts Agent", gender: "female", role: "Drafts and tracks NDAs, MSAs, and SOWs." },
    ],
  },
  {
    id: "ops",
    name: "Operations & Intelligence",
    head: { id: "ops-lead", name: "Nandini Hegde", title: "Ops Lead", gender: "female", role: "Keeps the business informed: owns reporting, alerts, field-team oversight, market intelligence, and the daily automations." },
    mission: "Keep the business informed and running: reporting, proactive alerts, field-team oversight, and market intelligence.",
    agents: [
      { id: "reporting", name: "Varun Saxena", title: "Reporting Agent", gender: "male", role: "Produces daily briefings, metrics, and pipeline summaries for the founder." },
      { id: "fieldops", name: "Rakesh Yadav", title: "Field Ops Agent", gender: "male", role: "Monitors what every BDE is doing in the field — surveys logged, visits, calls, and daily reports — and flags who has gone quiet." },
      { id: "notification", name: "Aisha Khan", title: "Notification Agent", gender: "female", role: "Sends proactive alerts — overdue follow-ups, new high-grade leads." },
      { id: "intelligence", name: "Siddharth Ghosh", title: "Intelligence Agent", gender: "male", role: "Monitors competitor and market signals." },
      { id: "scheduler", name: "Anjali Deshpande", title: "Scheduler Agent", gender: "female", role: "Runs the daily automations and books/reschedules calls." },
    ],
  },
  {
    id: "hr",
    name: "Human Resources (HR)",
    head: { id: "hr-lead", name: "Shruti Venkatesh", title: "HR Lead", gender: "female", role: "Owns the people function: sourcing, screening, onboarding, and policy." },
    mission: "Scale and support the human team: sourcing, screening, onboarding, and people ops.",
    agents: [
      { id: "recruiting", name: "Manish Tiwari", title: "Recruiting Agent", gender: "male", role: "Sources and screens candidates for open roles." },
      { id: "onboarding", name: "Ritu Chandra", title: "Onboarding Agent", gender: "female", role: "Onboards new hires with docs, access, and a ramp plan." },
      { id: "peopleops", name: "Deepak Mohan", title: "People Ops Agent", gender: "male", role: "Handles leave, policies, and team queries." },
    ],
  },
];

/** Every employee including the Manager — used for name → voice lookups. */
export const ALL_EMPLOYEES: OrgAgent[] = [
  { ...CORTEX_MANAGER },
  ...DEPARTMENTS.flatMap((d) => [d.head, ...d.agents]),
];

export interface EmployeeView {
  name: string;
  title: string;
  gender: Gender;
  role: string;
}

export interface DepartmentStatus {
  id: string;
  name: string;
  head: EmployeeView;
  state: "active" | "ready";
  summary: string;
  agents: EmployeeView[];
}

/**
 * Live status of every department, pulled from real data. Departments with no
 * activity yet are reported honestly as "ready" (not fabricated as busy).
 */
export async function getOrgStatus(): Promise<{
  manager: typeof CORTEX_MANAGER;
  departments: DepartmentStatus[];
}> {
  // Growth & Sales — real metrics from the discovery pipeline. Every other
  // department's state is derived from work it has actually done (its logged
  // chain-of-command messages) — never assumed, never hardcoded.
  const [totalLeads, drafted, recentRun, activity] = await Promise.all([
    prisma.companyCandidate.count({ where: { status: { notIn: ["rejected", "archived"] } } }),
    prisma.companyCandidate.count({ where: { analyzedAt: { not: null }, status: { notIn: ["rejected", "archived"] } } }),
    prisma.discoveryRun.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.agentMessage.groupBy({ by: ["department"], _count: { _all: true }, _max: { createdAt: true } }),
  ]);

  const worked = new Map(
    activity
      .filter((a) => !!a.department)
      .map((a) => [a.department as string, { count: a._count._all, last: a._max.createdAt }]),
  );

  const departments: DepartmentStatus[] = DEPARTMENTS.map((d) => {
    const done = worked.get(d.id);
    // Growth's real output is the pipeline itself — it is working whether or
    // not anyone has delegated to it through the chain of command today.
    const hasOutput = d.id === "growth" && totalLeads > 0;
    const state: DepartmentStatus["state"] = done || hasOutput ? "active" : "ready";

    let summary: string;
    if (hasOutput) {
      summary =
        `${totalLeads} leads in pipeline, ${drafted} outreach drafts written.` +
        (recentRun ? ` Last discovery ${timeAgo(recentRun.createdAt)}.` : "");
    } else if (done) {
      summary =
        `${done.count} chain-of-command message${done.count === 1 ? "" : "s"} handled` +
        (done.last ? `. Last active ${timeAgo(done.last)}.` : ".");
    } else {
      summary = `${d.agents.length} agents staffed. No work assigned yet — give ${d.head.name} a task.`;
    }

    const view = (a: OrgAgent): EmployeeView => ({ name: a.name, title: a.title, gender: a.gender, role: a.role });
    return { id: d.id, name: d.name, head: view(d.head), state, summary, agents: d.agents.map(view) };
  });

  return { manager: CORTEX_MANAGER, departments };
}

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
