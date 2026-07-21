"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, MapPinOff, Loader2 } from "lucide-react";

/**
 * On-shift location sharing for BDEs.
 *
 * Pings only while the BDE has explicitly started their shift and the app is
 * open — this is paid working time, not their personal time. Ending the shift
 * (or closing the app) stops it immediately. The indicator is always visible
 * so the BDE can see exactly when they are being tracked.
 */

const FALLBACK_INTERVAL_MS = 10_000;

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
}

interface BatteryLike { level: number }

async function readBattery(): Promise<number | undefined> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  if (!nav.getBattery) return undefined;
  try {
    const b = await nav.getBattery();
    return Math.round(b.level * 100);
  } catch {
    return undefined;
  }
}

export function ShiftTracker() {
  const [onShift, setOnShift] = useState(false);
  const [status, setStatus] = useState<"idle" | "starting" | "sharing" | "denied" | "error">("idle");
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [intervalMs, setIntervalMs] = useState(FALLBACK_INTERVAL_MS);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);

  const send = useCallback(async () => {
    const pos = latest.current;
    if (!pos) return;
    try {
      const res = await fetch("/api/field/location", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed ?? undefined,
          battery: await readBattery(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.nextPingMs === "number") setIntervalMs(data.nextPingMs);
        setLastPing(new Date());
        setStatus("sharing");
      }
    } catch {
      // Offline in the field is normal — keep the shift running and retry.
    }
  }, []);

  const stop = useCallback(() => {
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    latest.current = null;
    setStatus("idle");
    setLastPing(null);
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) { setStatus("error"); return; }
    setStatus("starting");
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => { latest.current = pos; },
      (err) => { setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"); },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    void send();
    timerRef.current = setInterval(() => { void send(); }, intervalMs);
  }, [send, intervalMs]);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- geolocation is a browser subscription; status reflects its callbacks */
  useEffect(() => {
    if (onShift) start(); else stop();
    return stop;
  }, [onShift, start, stop]);

  // Never keep tracking after the BDE leaves the app.
  useEffect(() => {
    const bye = () => stop();
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [stop]);

  const sharing = onShift && status === "sharing";

  return (
    <div className={`rounded-xl border p-4 transition-colors ${sharing ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sharing ? "bg-emerald-500/10" : "bg-muted"}`}>
            {onShift && status === "starting"
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : sharing
                ? <MapPin className="h-4 w-4 text-emerald-500" />
                : <MapPinOff className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {sharing ? "On shift — sharing location" : onShift ? "Starting…" : "Off shift"}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "denied" ? "Location permission denied — enable it to start your shift."
                : status === "error" ? "Location unavailable on this device."
                : sharing ? `Updated ${lastPing ? lastPing.toLocaleTimeString() : "just now"} · every ${Math.round(intervalMs / 1000)}s`
                : "Your location is shared only while you are on shift."}
            </p>
          </div>
        </div>

        <button
          onClick={() => setOnShift(v => !v)}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            onShift ? "border border-border text-foreground hover:bg-muted" : "bg-foreground text-background hover:opacity-90"
          }`}
        >
          {onShift ? "End shift" : "Start shift"}
        </button>
      </div>
    </div>
  );
}
