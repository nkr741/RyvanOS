"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, Radio, Battery, Clock } from "lucide-react";
import type { LiveBde } from "@/components/map/live-map";

const LiveMap = dynamic(() => import("@/components/map/live-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/30">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function FieldPage() {
  const router = useRouter();
  const [bdes, setBdes] = useState<LiveBde[]>([]);
  const [loading, setLoading] = useState(true);
  const [pingMs, setPingMs] = useState(10_000);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/field/location?trail=true", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.status === 401) { router.replace("/"); return; }
      if (res.ok) {
        const data = await res.json();
        setBdes(data.bdes || []);
        setPingMs(data.pingIntervalMs || 10_000);
        setUpdatedAt(new Date());
      }
    } catch { /* keep the last known picture */ }
    finally { setLoading(false); }
  }, [router]);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount */
  useEffect(() => { load(); }, [load]);

  // Follow the fleet at the same cadence the devices report at.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => { void load(); }, pingMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load, pingMs]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const online = bdes.filter(b => b.online);
  const everLocated = bdes.filter(b => b.lat !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* The app shell's header already renders "Field Tracking". */}
        <p className="text-sm text-muted-foreground">
          Live positions for BDEs on shift. Tracking runs only while they are clocked in — never off-shift.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <Radio className={`h-3.5 w-3.5 ${online.length ? "animate-pulse text-emerald-500" : "text-muted-foreground"}`} />
          <span className="text-xs font-medium text-foreground">{online.length} of {bdes.length} on shift</span>
          {updatedAt && <span className="text-[10px] text-muted-foreground">· refreshed {updatedAt.toLocaleTimeString()}</span>}
        </div>
      </div>

      {bdes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No active BDEs on the team yet.</p>
        </div>
      ) : (
        <>
          <div className="h-[460px] overflow-hidden rounded-xl border border-border">
            {everLocated.length ? (
              <LiveMap bdes={bdes} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/30 text-center">
                <p className="text-sm font-medium text-foreground">No BDE has started a shift yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Positions appear here the moment a BDE taps &quot;Start shift&quot; on their dashboard and allows location access.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bdes.map(b => (
              <div key={b.bdeId} className={`rounded-xl border p-4 ${b.online ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{b.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${b.online ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-500/10 text-zinc-400"}`}>
                    {b.online ? "ON SHIFT" : "OFF SHIFT"}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Last fix {ago(b.lastSeen)}</p>
                  {b.battery != null && (
                    <p className="flex items-center gap-1.5">
                      <Battery className={`h-3 w-3 ${b.battery < 20 ? "text-red-500" : ""}`} />
                      Battery {b.battery}%{b.battery < 20 ? " — about to die" : ""}
                    </p>
                  )}
                  {b.speed != null && b.speed > 0.5 && <p>Moving {(b.speed * 3.6).toFixed(1)} km/h</p>}
                  {b.accuracy != null && <p>Accuracy ±{Math.round(b.accuracy)}m</p>}
                  {b.trail.length > 1 && <p>{b.trail.length} points on today&apos;s route</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
