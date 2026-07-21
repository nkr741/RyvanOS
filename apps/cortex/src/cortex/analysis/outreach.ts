import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/llm";
import { RYVAN_IDENTITY, RYVAN_SERVICES } from "@/cortex/knowledge/ryvan";

/**
 * AI SDR — generates a personalized cold-outreach email for a discovered
 * company, pitching Ryvan's QA-automation wedge (RYN). Grounded in the company's
 * real firmographics so it reads researched, not spammy. Ends with a booking CTA.
 *
 * The draft is stored on the candidate (analysisReport field, reused) for the
 * founder to review and send. We generate DRAFTS, not auto-sends — deliverability
 * and reputation matter more than volume early on.
 *
 * Config (env):
 *   RYVAN_BOOKING_LINK   your Calendly/Cal.com link (CTA)
 *   RYVAN_SENDER_NAME    signature name (default: founder)
 *   RYVAN_SENDER_EMAIL   reply-to / signature email
 */

export interface OutreachDraft {
  companyName: string;
  contactGuess: string | null;
  subject: string;
  body: string;
  /** "cached" = reused a stored draft, no LLM call and no cost. */
  generatedBy: "ai" | "heuristic" | "cached";
}

/** Extract a JSON object from an LLM reply that may be fenced or have preamble. */
function extractJson(text: string): string {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start !== -1 && end > start ? t.slice(start, end + 1) : t;
}

const BOOKING_LINK = process.env.RYVAN_BOOKING_LINK || "[your booking link]";
const SENDER_NAME = process.env.RYVAN_SENDER_NAME || "Naveen Kumar Reddy";
const SENDER_TITLE = process.env.RYVAN_SENDER_TITLE || "Co-Founder";
const SENDER_EMAIL = process.env.RYVAN_SENDER_EMAIL || "naveen@ryvanai.com";
const SENDER_PHONE = process.env.RYVAN_SENDER_PHONE || RYVAN_IDENTITY.phone || "";
const SENDER_LINKEDIN = process.env.RYVAN_LINKEDIN || "";
const SERVICE_LIST = RYVAN_SERVICES.map((s) => s.name).join(", ");

/** Formal signature block appended to every outreach email. */
const SIGNATURE_BLOCK = [
  "Kind regards,",
  SENDER_NAME,
  `${SENDER_TITLE}, ${RYVAN_IDENTITY.name} Private Limited`,
  `Website: ${RYVAN_IDENTITY.website}`,
  `Email: ${SENDER_EMAIL}`,
  SENDER_PHONE ? `Phone: ${SENDER_PHONE}` : null,
  SENDER_LINKEDIN ? `LinkedIn: ${SENDER_LINKEDIN}` : null,
]
  .filter(Boolean)
  .join("\n");

/** Parse a previously stored draft back into its parts. Null if unparseable. */
function parseStored(stored: string): { subject: string; body: string } | null {
  const m = stored.match(/^SUBJECT:\s*(.+?)\n(?:TO \(guess\):.*\n)?\n?([\s\S]+)$/);
  if (!m) return null;
  const subject = m[1].trim();
  const body = m[2].trim();
  return subject && body ? { subject, body } : null;
}

/**
 * Generate (or reuse) the outreach draft for a candidate.
 *
 * A draft costs an LLM call, and the company's facts rarely change between
 * clicks — so an existing draft is returned as-is. Pass `force` to rewrite.
 */
export async function generateOutreach(candidateId: string, force = false): Promise<OutreachDraft> {
  const candidate = await prisma.companyCandidate.findUnique({
    where: { id: candidateId },
    include: { signals: true },
  });
  if (!candidate) throw new Error("Candidate not found");

  const contactGuess = guessContactEmail(candidate.website);

  // Cache hit: reuse the stored draft rather than paying to regenerate it.
  if (!force && candidate.analysisReport && candidate.analyzedAt) {
    const cached = parseStored(candidate.analysisReport);
    if (cached) {
      return { companyName: candidate.companyName, contactGuess, ...cached, generatedBy: "cached" };
    }
  }
  const signalList = candidate.signals.map((s) => `${s.type}: ${s.value}`).join("; ") || "none";

  const companyBlock = [
    `Company: ${candidate.companyName}`,
    candidate.website ? `Website: ${candidate.website}` : null,
    candidate.industry ? `Industry: ${candidate.industry}` : null,
    candidate.size ? `Size: ${candidate.size} employees` : null,
    candidate.location ? `Location: ${candidate.location}` : null,
    candidate.description ? `About: ${candidate.description}` : null,
    `Signals: ${signalList}`,
  ]
    .filter(Boolean)
    .join("\n");

  // IT-services / outsourcing / consulting firms → propose a delivery PARTNERSHIP.
  // Product / software companies → pitch QA automation directly.
  const industry = (candidate.industry || "").toLowerCase();
  const isPartnerFirm = /it-services|information-technology-and-services|it-and-it-consulting|outsourc|business-process|consulting/.test(industry);

  const CLOSING =
    `End with a polite call to action offering a quick introductory call (or to share the company profile / capability deck), ` +
    `including the booking link, then the EXACT signature block below on its own lines. Do NOT alter the signature.\n\n` +
    `Book a 15-minute intro call: ${BOOKING_LINK}\n\n${SIGNATURE_BLOCK}`;

  const system = isPartnerFirm
    ? `You are ${SENDER_NAME}, ${SENDER_TITLE} of ${RYVAN_IDENTITY.name} Private Limited (${RYVAN_IDENTITY.website}), an AI-focused engineering studio based in India. ` +
      `You write professional, formal B2B partnership emails to IT-services / outsourcing / consulting firms, proposing Ryvan as a technology DELIVERY PARTNER — ` +
      `a trusted white-label / subcontract partner that takes on their overflow and specialised project work with senior engineers, outcome-based and on-demand.\n\n` +
      `Ryvan's core capabilities to present: ${SERVICE_LIST}.\n\n` +
      `Write it as a proper business letter:\n` +
      `1. Formal greeting: "Dear ${candidate.companyName} Team,".\n` +
      `2. A brief professional introduction — who you are (${SENDER_TITLE} of Ryvan Technologies, an AI-focused startup in India) and that you are writing to explore a technology delivery partnership with their firm.\n` +
      `3. A concise capabilities section presenting the core services above as a short readable bulleted list (use "- " bullets).\n` +
      `4. The partnership value: senior-led delivery, quality, transparency, long-term partnership, timely delivery, dedicated/overflow engineering teams, and India cost/timezone advantage.\n` +
      `5. A polite ask to discuss current or upcoming opportunities, share the company profile / portfolio, or arrange an introductory meeting.\n\n` +
      `Tone: professional, warm, formal-business. 160-220 words. Reference something specific about THEIR firm. No emoji. ` +
      `Do NOT invent facts, metrics, or a prior interaction (never claim you contacted their support or filled a form). ` +
      `Output STRICT JSON only: {"subject": "...", "body": "..."}. ` + CLOSING
    : `You are ${SENDER_NAME}, ${SENDER_TITLE} of ${RYVAN_IDENTITY.name} Private Limited (${RYVAN_IDENTITY.website}), a senior-led AI & engineering studio. ` +
      `Flagship: ${RYVAN_IDENTITY.flagship}. You write polished, professional B2B cold emails offering QA automation to ` +
      `software/product companies — outcome-based, senior-only, and far cheaper than building an in-house QA team.\n\n` +
      `Structure the email as:\n` +
      `1. A warm, specific opening line referencing something concrete about THEIR company (industry, product, or scale).\n` +
      `2. One or two sentences on the problem you solve (slow releases / flaky tests / QA headcount cost) and how RYN helps.\n` +
      `3. A brief credibility note (senior engineers, outcome-based, results in ~a week).\n` +
      `4. A single clear call to action.\n\n` +
      `Tone: professional, confident, human. 120-160 words. Proper greeting and paragraphs. No buzzwords, no "I hope this finds you well", no emoji. ` +
      `Do not invent facts, metrics, or a contact's name — if unknown, greet with "Dear ${candidate.companyName} Team,". ` +
      `Output STRICT JSON only: {"subject": "...", "body": "..."}. ` + CLOSING;

  const user = isPartnerFirm
    ? `Write a formal partnership outreach email proposing Ryvan Technologies as a technology delivery / white-label partner for this IT-services firm. Personalize using their actual details.\n\nTARGET:\n${companyBlock}`
    : `Write a professional cold outreach email pitching Ryvan's QA automation (RYN — an autonomous QA agent that writes and self-heals end-to-end tests, catching bugs before release without growing their headcount). Personalize using their actual details.\n\nTARGET:\n${companyBlock}`;

  const raw = await complete(system, user, { temperature: 0.55, maxTokens: 700, json: true });

  let subject = isPartnerFirm
    ? `Delivery partnership — ${candidate.companyName} + Ryvan`
    : `Cutting QA costs for ${candidate.companyName}`;
  let body = heuristicBody(candidate.companyName, contactGuess);
  let generatedBy: OutreachDraft["generatedBy"] = "heuristic";

  if (raw) {
    try {
      const parsed = JSON.parse(extractJson(raw)) as { subject?: string; body?: string };
      if (parsed.subject && parsed.body) {
        subject = parsed.subject.trim();
        body = parsed.body.trim();
        generatedBy = "ai";
      }
    } catch {
      // model returned non-JSON — keep heuristic fallback
    }
  }

  const stored = `SUBJECT: ${subject}\nTO (guess): ${contactGuess ?? "find on LinkedIn"}\n\n${body}`;
  await prisma.companyCandidate.update({
    where: { id: candidateId },
    data: { analysisReport: stored, analyzedAt: new Date() },
  });

  return { companyName: candidate.companyName, contactGuess, subject, body, generatedBy };
}

/** Best-effort generic contact email from the domain (founder verifies the real one). */
function guessContactEmail(website?: string | null): string | null {
  if (!website) return null;
  const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return domain ? `hello@${domain}` : null;
}

function heuristicBody(company: string, contact: string | null): string {
  return [
    `Hi ${company} team,`,
    ``,
    `I'm a senior QA engineer running Ryvan Technologies. We build autonomous QA automation (RYN) that writes and self-heals end-to-end tests — catching bugs before release without you adding QA headcount.`,
    ``,
    `If shipping speed or test coverage is a pain right now, I'd love to show you what we can automate in a week.`,
    ``,
    `Grab 15 min here: ${BOOKING_LINK}`,
    `— ${SENDER_NAME}, Ryvan Technologies (${SENDER_EMAIL})`,
    contact ? `` : ``,
  ].join("\n");
}
