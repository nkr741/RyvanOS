"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, TrendingUp, Code2, Megaphone, Headphones,
  Wallet, Settings, Users, ChevronRight, ArrowDown, ArrowUp, Send, RadioTower, Volume2,
  AlertTriangle, Sparkles,
} from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
import { NeuralOrb, DEPT_HUE } from "@/components/agent/neural-orb";

type Gender = "male" | "female";
interface Alert { type: string; title: string; message: string; actionUrl?: string }
interface OrgAgentView { name: string; title: string; gender: Gender; role: string }
interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  direction: "down" | "up";
  department: string | null;
  content: string;
  createdAt: string;
}
interface DepartmentStatus {
  id: string;
  name: string;
  head: OrgAgentView;
  state: "active" | "ready";
  summary: string;
  agents: OrgAgentView[];
}
interface Org {
  manager: { name: string; title: string; gender: Gender; role: string };
  departments: DepartmentStatus[];
}

const DEPT_ICON: Record<string, React.ElementType> = {
  growth: TrendingUp,
  delivery: Code2,
  marketing: Megaphone,
  support: Headphones,
  finance: Wallet,
  ops: Settings,
  hr: Users,
};

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
}

export default function OrgPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openDept, setOpenDept] = useState<string | null>("growth");
  const [comms, setComms] = useState<AgentMessage[]>([]);
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [taskText, setTaskText] = useState("");
  const [sending, setSending] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [briefing, setBriefing] = useState("");
  const [briefing_busy, setBriefingBusy] = useState(false);
  // The org page never listens; it only plays employees' voices.
  const voice = useVoice(() => {});
  // Whose orb should be talking right now.
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);

  const speakAs = useCallback((who: string, text: string, gender: Gender) => {
    setSpeakingAgent(who);
    voice.speak(text, gender, () => setSpeakingAgent(null));
  }, [voice]);

  const loadComms = useCallback(async () => {
    try {
      const res = await fetch("/api/org/comms?limit=40", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setComms((await res.json()).messages || []);
    } catch (err) { console.error("[admin/org] Failed to fetch communication feed", err); }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/org/briefing", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setAlerts((await res.json()).alerts || []);
    } catch (err) { console.error("[admin/org] Failed to fetch briefing alerts", err); }
  }, []);

  async function runBriefing() {
    if (briefing_busy) return;
    setBriefingBusy(true);
    try {
      const res = await fetch("/api/org/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setBriefing(data.briefing || "");
        await Promise.all([loadComms(), loadAlerts()]);
      }
    } catch (err) { console.error("[admin/org] Failed to run daily briefing generation", err); }
    finally { setBriefingBusy(false); }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/org", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.status === 401) { router.replace("/"); return; }
      if (res.ok) setOrg(await res.json());
      else setError("Failed to load the org.");
    } catch { setError("Failed to load the org."); }
    finally { setLoading(false); }
  }, [router]);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount */
  useEffect(() => { load(); loadComms(); loadAlerts(); }, [load, loadComms, loadAlerts]);

  async function assign(deptId: string) {
    if (!taskText.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/org/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ department: deptId, task: taskText.trim() }),
      });
      setTaskText("");
      setTaskFor(null);
      await Promise.all([load(), loadComms()]);
    } catch (err) { console.error("[admin/org] Failed to send delegation task", err); }
    finally { setSending(false); }
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !org) {
    return <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">{error || "No org data."}</div>;
  }

  const totalAgents = org.departments.reduce((n, d) => n + d.agents.length, 0);
  const activeCount = org.departments.filter(d => d.state === "active").length;
  const speakingNow = voice.speaking;

  // Comms are logged as "Aarav Mehta (Growth Lead)" — resolve back to the
  // person so each message plays in their own voice.
  const everyone: OrgAgentView[] = [
    { name: org.manager.name, title: org.manager.title, gender: org.manager.gender, role: org.manager.role },
    ...org.departments.flatMap(d => [d.head, ...d.agents]),
  ];
  const genderOf = (label: string): Gender =>
    everyone.find(e => label.startsWith(e.name))?.gender ?? "male";

  return (
    <div className="space-y-6">
      {/* No <h1> here — the app shell's header already renders the page title. */}
      <p className="text-sm text-muted-foreground">
        Ryvan&apos;s AI workforce — the Manager and every department reporting to it.
      </p>

      {/* Manager */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center">
            <NeuralOrb hue={DEPT_HUE.manager} size={48} state={speakingNow ? "speaking" : activeCount > 0 ? "active" : "idle"} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{org.manager.name}</h2>
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                {org.manager.title}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{org.manager.role}</p>
          </div>
          <div className="hidden shrink-0 gap-6 sm:flex">
            <Stat label="Departments" value={org.departments.length} />
            <Stat label="Agents" value={totalAgents} />
            <Stat label="Active" value={activeCount} />
          </div>
        </div>
      </div>

      {/* What the org is proactively telling the founder */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${alerts.length ? "text-amber-500" : "text-muted-foreground"}`} />
            <h2 className="text-sm font-semibold text-foreground">What needs your attention</h2>
            <span className="text-xs text-muted-foreground">
              · {alerts.length ? `${alerts.length} raised by Operations` : "nothing flagged"}
            </span>
          </div>
          <button
            onClick={runBriefing}
            disabled={briefing_busy}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            {briefing_busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {briefing_busy ? "Nandini is writing…" : "Ask Ops for a briefing"}
          </button>
        </div>

        {alerts.length > 0 && (
          <div className="mt-3 space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 ${
                  a.type === "overdue" ? "border-red-500/20 bg-red-500/5"
                  : a.type === "achievement" ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
                }`}
              >
                <p className="text-xs font-semibold text-foreground">{a.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{a.message}</p>
              </div>
            ))}
          </div>
        )}

        {briefing && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold text-foreground">Briefing from Nandini Hegde (Ops Lead)</p>
              {voice.ttsSupported && (
                <button
                  onClick={() => speakAs("Nandini Hegde", briefing, "female")}
                  title="Hear the briefing"
                  className="rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <Volume2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/80">{briefing}</p>
          </div>
        )}
      </div>

      {/* Connector */}
      <div className="flex justify-center"><div className="h-4 w-px bg-border" /></div>

      {/* Departments */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {org.departments.map((d, i) => {
          const Icon = DEPT_ICON[d.id] || Users;
          const open = openDept === d.id;
          const active = d.state === "active";
          return (
            <div key={d.id} className={`rounded-xl border bg-card p-4 transition-colors ${active ? "border-emerald-500/30" : "border-border"}`}>
              <button onClick={() => setOpenDept(open ? null : d.id)} className="flex w-full items-start gap-3 text-left">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                  <NeuralOrb hue={DEPT_HUE[d.id] ?? 200} size={36} state={sending && taskFor === d.id ? "working" : active ? "active" : "idle"} seed={i} />
                  <Icon className="pointer-events-none absolute h-3 w-3 text-white/80 mix-blend-screen" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold leading-tight text-foreground">{d.name}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-500/10 text-zinc-400"}`}>
                      {active ? "ACTIVE" : "READY"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Led by {d.head.name} ({d.head.title}) · {d.agents.length} agents
                  </p>
                  <p className="mt-1.5 text-xs text-foreground/80">{d.summary}</p>
                </div>
                <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
              </button>

              {open && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {d.agents.map((a, ai) => (
                    <div key={a.name} className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">
                        <NeuralOrb
                          hue={DEPT_HUE[d.id] ?? 200}
                          size={22}
                          seed={ai + 1}
                          state={speakingAgent === a.name ? "speaking" : sending && taskFor === d.id ? "working" : active ? "active" : "idle"}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">
                          {a.name} <span className="font-normal text-muted-foreground">· {a.title}</span>
                        </p>
                        <p className="text-[11px] leading-snug text-muted-foreground">{a.role}</p>
                      </div>
                      {voice.ttsSupported && (
                        <button
                          onClick={() => speakAs(a.name, `Hello, I'm ${a.name}, ${a.title} at Ryvan Technologies. ${a.role}`, a.gender)}
                          title={`Hear ${a.name}`}
                          className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {taskFor === d.id ? (
                    <div className="!mt-3 space-y-2">
                      <textarea
                        value={taskText}
                        onChange={e => setTaskText(e.target.value)}
                        rows={2}
                        autoFocus
                        placeholder={`Brief ${d.head.name}…`}
                        className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => assign(d.id)}
                          disabled={sending || !taskText.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background disabled:opacity-40"
                        >
                          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          {sending ? "Working…" : "Assign"}
                        </button>
                        <button
                          onClick={() => { setTaskFor(null); setTaskText(""); }}
                          disabled={sending}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTaskFor(d.id); setTaskText(""); }}
                      className="!mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <Send className="h-3 w-3" /> Assign task to {d.head.name}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Chain-of-command feed */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <RadioTower className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Chain of Command</h2>
          <span className="text-xs text-muted-foreground">· live agent-to-agent comms</span>
        </div>

        {comms.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            No messages yet. Assign a task to a department lead above (or ask the Cortex Assistant to delegate) and the
            full conversation — Manager → Lead → Agent and back — appears here.
          </p>
        ) : (
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {comms.map(m => {
              const down = m.direction === "down";
              return (
                <div key={m.id} className={`rounded-lg border px-3 py-2 ${down ? "border-border bg-muted/30" : "border-emerald-500/20 bg-emerald-500/5"}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {down
                      ? <ArrowDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      : <ArrowUp className="h-3 w-3 shrink-0 text-emerald-500" />}
                    <span className="text-[11px] font-semibold text-foreground">{m.fromAgent}</span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-foreground">{m.toAgent}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {voice.ttsSupported && (
                      <button
                        onClick={() => speakAs(m.fromAgent.split(" (")[0], m.content, genderOf(m.fromAgent))}
                        title={`Hear ${m.fromAgent}`}
                        className="shrink-0 rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                      >
                        <Volume2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/80">{m.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
