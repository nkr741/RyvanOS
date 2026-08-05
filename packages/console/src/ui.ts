/**
 * The console UI: one self-contained HTML document, no build step and no CDN.
 *
 * A platform inspector that needed its own bundler, lockfile and deploy would
 * be one more thing to keep working at 3am. This is served by the same handler
 * as the API and has no dependencies at all.
 */
export function renderConsoleHtml(basePath = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RyvanOS Console</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfbfd; --panel: #fff; --ink: #14161a; --muted: #6b7280;
    --line: #e5e7eb; --accent: #3b5bdb; --ok: #147a4b; --warn: #a15c07; --bad: #b42318;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d0f13; --panel:#151920; --ink:#e6e8ec; --muted:#9099a8;
            --line:#252b35; --accent:#8098f9; --ok:#4ade80; --warn:#fbbf24; --bad:#f87171; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-size:14px; }
  header { display:flex; align-items:center; gap:16px; padding:14px 20px;
           border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; z-index:5; }
  h1 { font-size:15px; margin:0; font-weight:650; letter-spacing:-0.01em; }
  h1 span { color:var(--muted); font-weight:400; }
  nav { display:flex; gap:2px; flex-wrap:wrap; }
  nav button { background:none; border:0; color:var(--muted); padding:6px 11px;
               border-radius:6px; cursor:pointer; font:inherit; }
  nav button:hover { background:var(--bg); color:var(--ink); }
  nav button[aria-current="true"] { background:var(--accent); color:#fff; }
  main { padding:20px; max-width:1400px; margin:0 auto; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-bottom:22px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; }
  .card .label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .card .value { font-size:26px; font-weight:600; margin-top:6px; font-variant-numeric:tabular-nums; }
  table { width:100%; border-collapse:collapse; background:var(--panel);
          border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:600; }
  tr:last-child td { border-bottom:0; }
  tbody tr:hover { background:var(--bg); }
  code, .mono { font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:12px; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
  .warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}
  .bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
  .neutral{color:var(--muted);background:color-mix(in srgb,var(--muted) 14%,transparent)}
  button.act { background:var(--accent); color:#fff; border:0; padding:5px 10px;
               border-radius:6px; cursor:pointer; font:inherit; font-size:12px; }
  button.act.ghost { background:transparent; color:var(--accent); border:1px solid var(--line); }
  .muted { color:var(--muted); }
  .empty { padding:36px; text-align:center; color:var(--muted); background:var(--panel);
           border:1px solid var(--line); border-radius:10px; }
  .err { background:color-mix(in srgb,var(--bad) 10%,transparent); color:var(--bad);
         padding:10px 14px; border-radius:8px; margin-bottom:14px; }
  .span-row td:first-child { white-space:nowrap; }
  .bar { height:8px; background:var(--accent); border-radius:2px; min-width:2px; opacity:.85; }
  dialog { border:1px solid var(--line); border-radius:12px; background:var(--panel);
           color:var(--ink); padding:20px; max-width:420px; width:90%; }
  dialog::backdrop { background:rgba(0,0,0,.5); }
  input { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:6px;
          background:var(--bg); color:var(--ink); font:inherit; margin-top:6px; }
</style>
</head>
<body>
<header>
  <h1>RyvanOS <span>Console</span></h1>
  <nav id="nav"></nav>
  <div style="margin-left:auto" class="muted mono" id="clock"></div>
</header>
<main><div id="view"><div class="empty">Loading…</div></div></main>

<dialog id="auth">
  <form method="dialog">
    <strong>Console token</strong>
    <p class="muted" style="margin:8px 0 0">Required. Set <code>console.token</code> when booting the platform.</p>
    <input id="token" type="password" autocomplete="off" placeholder="Bearer token">
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      <button class="act" value="ok">Connect</button>
    </div>
  </form>
</dialog>

<script>
const BASE = ${JSON.stringify(basePath)};
const TABS = [
  ["overview","Overview"], ["missions","Missions"], ["traces","Traces"],
  ["approvals","Approvals"], ["runs","Runs"], ["audit","Audit"],
  ["circuits","Resilience"], ["connectors","Connectors"], ["policies","Policy"],
];
let tab = location.hash.slice(1) || "overview";
let token = sessionStorage.getItem("ryvan.console.token") || "";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
const ago = (t) => {
  if (!t) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return Math.floor(s) + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
};
const ms = (d) => d === undefined || d === null ? "—" : d < 1000 ? d + "ms" : (d/1000).toFixed(2) + "s";
const usd = (n) => "$" + (n ?? 0).toFixed(4);

const TONE = {
  completed:"ok", ok:"ok", granted:"ok", closed:"ok", connected:"ok", active:"ok", running:"neutral",
  pending:"warn", awaiting_approval:"warn", suspended:"warn", waiting:"warn", half_open:"warn", degraded:"warn",
  failed:"bad", error:"bad", denied:"bad", open:"bad", cancelled:"neutral", expired:"neutral", skipped:"neutral",
};
const pill = (s) => '<span class="pill ' + (TONE[s] || "neutral") + '">' + esc(s) + "</span>";

async function api(path, options) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "authorization": "Bearer " + token, "content-type": "application/json",
               ...(options && options.headers) },
  });
  if (res.status === 401) { askToken(); throw new Error("Unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function askToken() {
  const dialog = $("auth");
  dialog.showModal();
  dialog.addEventListener("close", () => {
    token = $("token").value.trim();
    if (token) { sessionStorage.setItem("ryvan.console.token", token); render(); }
  }, { once: true });
}

function table(columns, rows, renderRow) {
  if (!rows.length) return '<div class="empty">Nothing here yet.</div>';
  return "<table><thead><tr>" + columns.map((c) => "<th>" + c + "</th>").join("") +
    "</tr></thead><tbody>" + rows.map(renderRow).join("") + "</tbody></table>";
}

const views = {
  async overview() {
    const d = await api("/api/overview");
    const cards = [
      ["Missions", d.missions.total],
      ["Awaiting approval", d.approvalsPending],
      ["Open circuits", d.openCircuits],
      ["Dead letters", d.deadLetters],
      ["Spend", usd(d.cost.totalUsd)],
      ["Tokens", (d.cost.totalTokens || 0).toLocaleString()],
    ].map(([l, v]) => '<div class="card"><div class="label">' + l + '</div><div class="value">' + esc(v) + "</div></div>").join("");

    const audit = d.audit
      ? (d.audit.valid
          ? '<span class="pill ok">chain intact · ' + d.audit.entryCount + " entries</span>"
          : '<span class="pill bad">TAMPERED at ' + d.audit.brokenAt.join(", ") + "</span>")
      : '<span class="muted">no ledger</span>';

    return '<div class="cards">' + cards + "</div>" +
      "<h3>Audit ledger</h3><p>" + audit + "</p>" +
      "<h3>Services</h3>" +
      table(["Service","Status"], d.services, (s) =>
        "<tr><td class='mono'>" + esc(s.name) + "</td><td>" + pill(s.status) + "</td></tr>") +
      "<h3 style='margin-top:22px'>Storage</h3>" +
      table(["Driver","Reachable","Latency"], d.storage, (s) =>
        "<tr><td class='mono'>" + esc(s.kind) + "</td><td>" + pill(s.reachable ? "ok" : "error") +
        "</td><td>" + ms(s.latencyMs) + "</td></tr>");
  },

  async missions() {
    const { missions } = await api("/api/missions");
    return table(["Mission","Type","Status","Created","Run",""], missions.slice().reverse(), (m) =>
      "<tr><td><a href='#mission/" + esc(m.id) + "' class='mono'>" + esc(m.id.slice(0, 14)) + "</a>" +
      "<div class='muted'>" + esc(m.goal || m.name) + "</div></td>" +
      "<td class='mono'>" + esc(m.type) + "</td><td>" + pill(m.status) +
      (m.error ? "<div class='muted'>" + esc(m.error) + "</div>" : "") + "</td>" +
      "<td class='muted'>" + ago(m.createdAt) + "</td>" +
      "<td class='mono muted'>" + esc(m.runId ? m.runId.slice(0, 12) : "—") + "</td>" +
      "<td>" + (["completed","failed","cancelled"].includes(m.status)
        ? "" : "<button class='act ghost' data-cancel='" + esc(m.id) + "'>Cancel</button>") + "</td></tr>");
  },

  async mission(id) {
    const { mission, trace, spans } = await api("/api/missions/" + encodeURIComponent(id));
    return "<p><a href='#missions'>&larr; Missions</a></p>" +
      "<h2 class='mono'>" + esc(mission.id) + "</h2>" +
      "<p>" + pill(mission.status) + " &middot; <span class='mono'>" + esc(mission.type) + "</span></p>" +
      (mission.error ? "<div class='err'>" + esc(mission.error) + "</div>" : "") +
      (trace ? '<div class="cards">' +
        '<div class="card"><div class="label">Duration</div><div class="value">' + ms(trace.durationMs) + "</div></div>" +
        '<div class="card"><div class="label">Spans</div><div class="value">' + trace.spanCount + "</div></div>" +
        '<div class="card"><div class="label">Errors</div><div class="value">' + trace.errorCount + "</div></div>" +
        '<div class="card"><div class="label">Cost</div><div class="value">' + usd(trace.totalCostUsd) + "</div></div>" +
        "</div>" : "") +
      "<h3>Timeline</h3>" + timeline(spans) +
      "<h3 style='margin-top:22px'>Result</h3><pre class='mono card'>" +
      esc(JSON.stringify(mission.result ?? null, null, 2)) + "</pre>";
  },

  async traces() {
    const { traces } = await api("/api/traces?limit=100");
    return table(["Trace","Status","Duration","Spans","Errors","Cost","When"], traces, (t) =>
      "<tr><td><a class='mono' href='#trace/" + esc(t.traceId) + "'>" + esc(t.traceId.slice(0, 16)) + "</a></td>" +
      "<td>" + pill(t.status) + "</td><td>" + ms(t.durationMs) + "</td><td>" + t.spanCount + "</td>" +
      "<td>" + (t.errorCount ? "<span class='pill bad'>" + t.errorCount + "</span>" : "0") + "</td>" +
      "<td>" + usd(t.totalCostUsd) + "</td><td class='muted'>" + ago(t.startedAt) + "</td></tr>");
  },

  async trace(id) {
    const { trace, spans } = await api("/api/traces/" + encodeURIComponent(id));
    return "<p><a href='#traces'>&larr; Traces</a></p><h2 class='mono'>" + esc(trace.traceId) + "</h2>" +
      "<p>" + pill(trace.status) + " &middot; " + ms(trace.durationMs) + " &middot; " + usd(trace.totalCostUsd) + "</p>" +
      timeline(spans);
  },

  async approvals() {
    const { approvals } = await api("/api/approvals");
    return table(["Action","Reason","Requested","Expires",""], approvals, (a) =>
      "<tr><td class='mono'>" + esc(a.action) + (a.resource ? "<div class='muted'>" + esc(a.resource) + "</div>" : "") + "</td>" +
      "<td>" + esc(a.reason) + "</td><td class='muted'>" + ago(a.requestedAt) + "</td>" +
      "<td class='muted'>" + new Date(a.expiresAt).toLocaleString() + "</td>" +
      "<td><button class='act' data-grant='" + esc(a.id) + "'>Grant</button> " +
      "<button class='act ghost' data-deny='" + esc(a.id) + "'>Deny</button></td></tr>");
  },

  async runs() {
    const { runs } = await api("/api/runs");
    return table(["Run","Workflow","Status","Steps","When"], runs.slice().reverse(), (r) => {
      const steps = Object.values(r.steps || {});
      const done = steps.filter((s) => s.status === "completed").length;
      return "<tr><td class='mono'>" + esc(r.id.slice(0, 14)) + "</td>" +
        "<td class='mono'>" + esc(r.definitionId) + "</td><td>" + pill(r.status) +
        (r.error ? "<div class='muted'>" + esc(r.error) + "</div>" : "") + "</td>" +
        "<td>" + done + "/" + steps.length + "</td><td class='muted'>" + ago(r.createdAt) + "</td></tr>";
    });
  },

  async audit() {
    const [{ entries }, verify] = await Promise.all([api("/api/audit?limit=200"), api("/api/audit/verify")]);
    const banner = verify.valid
      ? '<p><span class="pill ok">chain intact</span> <span class="muted">' + verify.entryCount + " entries verified</span></p>"
      : '<div class="err">Chain broken at sequence ' + verify.brokenAt.join(", ") + "</div>";
    return banner + table(["#","Action","Resource","Outcome","Actor","When"], entries.slice().reverse(), (e) =>
      "<tr><td class='mono muted'>" + e.sequence + "</td><td class='mono'>" + esc(e.action) + "</td>" +
      "<td class='mono muted'>" + esc(e.resource || "—") + "</td><td>" + pill(e.outcome) + "</td>" +
      "<td class='muted'>" + esc(e.actor.userId || e.actor.agentId || e.actor.kind || "system") + "</td>" +
      "<td class='muted'>" + ago(e.timestamp) + "</td></tr>");
  },

  async circuits() {
    const [{ circuits }, { letters }] = await Promise.all([api("/api/circuits"), api("/api/dead-letters")]);
    return "<h3>Circuits</h3>" +
      table(["Target","State","Failures","Calls","Last error",""], circuits, (c) =>
        "<tr><td class='mono'>" + esc(c.key) + "</td><td>" + pill(c.state) + "</td>" +
        "<td>" + c.consecutiveFailures + "</td><td class='muted'>" + c.totalFailures + "/" + c.totalCalls + "</td>" +
        "<td class='muted'>" + esc(c.lastError || "—") + "</td>" +
        "<td>" + (c.state === "closed" ? "" :
          "<button class='act ghost' data-reset='" + esc(c.key) + "'>Reset</button>") + "</td></tr>") +
      "<h3 style='margin-top:22px'>Dead letters</h3>" +
      table(["Target","Error","Attempts","When"], letters, (l) =>
        "<tr><td class='mono'>" + esc(l.key) + "</td><td>" + esc(l.error) + "</td>" +
        "<td>" + l.attempts + "</td><td class='muted'>" + ago(l.createdAt) + "</td></tr>");
  },

  async connectors() {
    const { connectors } = await api("/api/connectors");
    return table(["Connector","Vendor","Health","Latency","Operations"], connectors, (c) =>
      "<tr><td class='mono'>" + esc(c.id) + "</td><td>" + esc(c.vendor) + "</td>" +
      "<td>" + pill(c.health.status) + "</td><td>" + ms(c.health.latencyMs) + "</td>" +
      "<td class='mono muted'>" + c.operations.map((o) => esc(o.name) + (o.mutates ? "*" : "")).join(", ") + "</td></tr>");
  },

  async policies() {
    const { rules, budgets } = await api("/api/policies");
    return "<h3>Rules</h3>" +
      table(["Rule","Effect","Enabled"], rules, (r) =>
        "<tr><td>" + esc(r.name) + "<div class='mono muted'>" + esc(r.id) + "</div></td>" +
        "<td>" + pill(r.effect) + "</td><td>" + (r.enabled === false ? "no" : "yes") + "</td></tr>") +
      "<h3 style='margin-top:22px'>Budgets</h3>" +
      table(["Budget","Period","Spent","Limit"], budgets, (b) => {
        const pct = b.limitUsd ? Math.min(100, (b.spentUsd / b.limitUsd) * 100) : 0;
        return "<tr><td class='mono'>" + esc(b.id) + "</td><td>" + esc(b.period) + "</td>" +
          "<td>" + usd(b.spentUsd) + '<div class="bar" style="width:' + pct + '%"></div></td>' +
          "<td>" + usd(b.limitUsd) + "</td></tr>";
      });
  },
};

/** Renders the span tree as an indented timeline with proportional bars. */
function timeline(spans) {
  if (!spans || !spans.length) return '<div class="empty">No spans recorded.</div>';

  const flat = [];
  const walk = (nodes, depth) => nodes.forEach((n) => {
    flat.push({ ...n, depth });
    if (n.children) walk(n.children, depth + 1);
  });
  walk(spans, 0);

  const start = Math.min(...flat.map((s) => s.startedAt));
  const end = Math.max(...flat.map((s) => s.startedAt + (s.durationMs || 0)));
  const total = Math.max(1, end - start);

  return table(["Span","Kind","Status","Duration","Timeline"], flat, (s) =>
    "<tr class='span-row'><td>" + "&nbsp;".repeat(s.depth * 4) + esc(s.name) + "</td>" +
    "<td class='mono muted'>" + esc(s.kind) + "</td><td>" + pill(s.status) + "</td>" +
    "<td>" + ms(s.durationMs) + (s.costUsd ? " <span class='muted'>" + usd(s.costUsd) + "</span>" : "") + "</td>" +
    "<td style='width:38%'><div class='bar' style='margin-left:" +
      (((s.startedAt - start) / total) * 100).toFixed(1) + "%;width:" +
      Math.max(1, ((s.durationMs || 0) / total) * 100).toFixed(1) + "%'></div>" +
    (s.error ? "<div class='muted'>" + esc(s.error) + "</div>" : "") + "</td></tr>");
}

async function render() {
  if (!token) return askToken();

  $("nav").innerHTML = TABS.map(([id, label]) =>
    '<button data-tab="' + id + '" aria-current="' + (tab.split("/")[0] === id) + '">' + label + "</button>").join("");

  const [name, arg] = tab.split("/");
  const view = views[name] || views.overview;

  try {
    $("view").innerHTML = await view(decodeURIComponent(arg || ""));
  } catch (err) {
    $("view").innerHTML = '<div class="err">' + esc(err.message) + "</div>";
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-tab],[data-grant],[data-deny],[data-reset],[data-cancel]");
  if (!target) return;

  const d = target.dataset;
  try {
    if (d.tab) { location.hash = d.tab; return; }

    if (d.grant || d.deny) {
      // Recorded on the audit entry — an approval with no decider is a rumour.
      const decidedBy = prompt("Your name or user id (recorded in the audit trail):");
      if (!decidedBy) return;
      await api("/api/approvals/" + encodeURIComponent(d.grant || d.deny) + "/" + (d.grant ? "grant" : "deny"),
        { method: "POST", body: JSON.stringify({ decidedBy }) });
    }
    if (d.reset) await api("/api/circuits/" + encodeURIComponent(d.reset) + "/reset", { method: "POST" });
    if (d.cancel && confirm("Cancel this mission?")) {
      await api("/api/missions/" + encodeURIComponent(d.cancel) + "/cancel", { method: "POST" });
    }
    render();
  } catch (err) {
    alert(err.message);
  }
});

window.addEventListener("hashchange", () => { tab = location.hash.slice(1) || "overview"; render(); });
setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString(); }, 1000);
setInterval(() => { if (document.visibilityState === "visible" && !tab.includes("/")) render(); }, 10000);
render();
</script>
</body>
</html>`;
}
