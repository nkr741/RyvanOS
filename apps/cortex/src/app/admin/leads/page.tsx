"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Mail, Copy, Check, Building2, MapPin, RefreshCw, Send, Handshake, Target } from "lucide-react";

interface Signal { type: string; value: string; importance: string }
interface Lead {
  id: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  signals: Signal[];
  analysisReport: string | null;
}

/** Parse a stored outreach draft ("SUBJECT: …\nTO (guess): …\n\nbody"). */
function parseStoredDraft(text: string | null): Draft | null {
  if (!text || !text.startsWith("SUBJECT:")) return null;
  const lines = text.split("\n");
  const subject = lines[0].replace(/^SUBJECT:\s*/, "").trim();
  const toLine = lines[1] || "";
  const contactGuess = /TO \(guess\):/.test(toLine) ? toLine.replace(/^TO \(guess\):\s*/, "").trim() : null;
  const body = lines.slice(3).join("\n").trim();
  return { subject, body, contactGuess: contactGuess === "find on LinkedIn" ? null : contactGuess, generatedBy: "saved" };
}
interface Draft { subject: string; body: string; contactGuess: string | null; generatedBy: string }

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
}
function headers(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

const GRADE_COLOR: Record<string, string> = {
  A: "bg-emerald-500/10 text-emerald-500",
  B: "bg-blue-500/10 text-blue-500",
  C: "bg-amber-500/10 text-amber-500",
  D: "bg-orange-500/10 text-orange-500",
  F: "bg-zinc-500/10 text-zinc-400",
};

/** Classify a lead as a Partner firm (IT-services/outsourcing) or a QA prospect. */
function leadType(industry: string | null): { label: string; partner: boolean } {
  const partner = /it-services|information-technology-and-services|it-and-it-consulting|outsourc|business-process|consulting/i.test(industry || "");
  return { label: partner ? "Partner" : "QA", partner };
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/growth/discovery?view=candidates&status=qualified", { headers: headers() });
      if (res.status === 401) { router.replace("/"); return; }
      if (res.ok) {
        const data = await res.json();
        // Keep the API order (newest discovered first) so fresh leads surface at top.
        const cands: Lead[] = data.candidates || [];
        setLeads(cands);
        // Pre-populate drafts that the daily batch already generated.
        const stored: Record<string, Draft> = {};
        for (const c of cands) {
          const d = parseStoredDraft(c.analysisReport);
          if (d) stored[c.id] = d;
        }
        setDrafts(prev => ({ ...stored, ...prev }));
      }
    } catch { setError("Failed to load leads"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function findLeads(config: Record<string, unknown>, label: string) {
    setFinding(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/growth/discovery", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ action: "autonomous_run", config }),
      });
      if (res.ok) {
        const r = await res.json().catch(() => ({} as { discovered?: number }));
        const n = r.discovered ?? 0;
        setNotice(n > 0
          ? `Found ${n} new ${label} — newest are at the top.`
          : `No new ${label} right now (already discovered). Try the other list or run again later.`);
      } else {
        setError("Discovery failed — check your data-source API key.");
      }
      await load();
    } catch { setError("Discovery failed"); }
    finally { setFinding(false); }
  }
  // QA prospects: software/product companies (US/UK) → pitch QA automation.
  const QA_ICP = { industries: ["software-development", "saas"], countries: ["us", "gb"], limit: 8 };
  // Partner firms: IT-services/outsourcing companies (India) → propose a delivery partnership.
  const PARTNER_ICP = { industries: ["information-technology-and-services", "it-services-and-it-consulting", "outsourcing"], countries: ["in"], employeeRanges: ["50-200", "200-500", "500-1k"], limit: 8 };

  async function writeOutreach(id: string) {
    setBusyId(id); setError("");
    try {
      const res = await fetch("/api/growth/discovery", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ action: "outreach", candidateId: id }),
      });
      if (res.ok) {
        const d = await res.json();
        setDrafts(prev => ({ ...prev, [id]: d }));
      } else { setError("Outreach generation failed — is Ollama running?"); }
    } catch { setError("Outreach generation failed"); }
    finally { setBusyId(null); }
  }

  function copyDraft(id: string, d: Draft) {
    const text = `Subject: ${d.subject}\nTo: ${d.contactGuess || "(find on LinkedIn)"}\n\n${d.body}`;
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-primary" /> AI SDR — Leads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Autonomously discovered software companies + ready-to-send QA outreach.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => findLeads(QA_ICP, "QA prospects")}
            disabled={finding}
            className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            QA Prospects
          </button>
          <button
            onClick={() => findLeads(PARTNER_ICP, "partner firms")}
            disabled={finding}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
            Partner Firms
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500">{notice}</div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Mail className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No leads yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Click “QA Prospects” or “Partner Firms” to discover companies.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(lead => {
            const draft = drafts[lead.id];
            return (
              <div key={lead.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">{lead.companyName}</h3>
                      {lead.qualificationGrade && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GRADE_COLOR[lead.qualificationGrade] || GRADE_COLOR.F}`}>
                          {lead.qualificationGrade} · {lead.qualificationScore}
                        </span>
                      )}
                      {(() => {
                        const t = leadType(lead.industry);
                        return (
                          <span
                            title={t.partner ? "Partner firm — propose a delivery partnership" : "QA prospect — pitch QA automation"}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.partner ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"}`}
                          >
                            {t.partner ? <Handshake className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                            {t.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground"><Building2 className="h-3 w-3" />{lead.website.replace(/^https?:\/\//, "")}</a>}
                      {lead.size && <span>{lead.size} emp</span>}
                      {lead.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.location}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => writeOutreach(lead.id)}
                    disabled={busyId === lead.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {busyId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {busyId === lead.id ? "Writing…" : draft ? "Rewrite" : "Write Outreach"}
                  </button>
                </div>

                {draft && (
                  <div className="mt-3 rounded-lg border border-border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Draft · to {draft.contactGuess || "(find on LinkedIn)"} · {draft.generatedBy}
                      </span>
                      <button onClick={() => copyDraft(lead.id, draft)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                        {copiedId === lead.id ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                      </button>
                    </div>
                    <p className="text-xs font-semibold text-foreground">{draft.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{draft.body}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
