import { prisma } from "@/lib/prisma";

/**
 * Field-team intelligence: where a BDE is, what they claim to have done, and
 * whether those two agree.
 *
 * The integrity check is the point. A survey records its own GPS, and the
 * device reports its position while on shift — so a survey filed somewhere the
 * BDE's phone never was is a claim with no evidence behind it. That is flagged,
 * not accused: bad GPS, an off-shift visit, or a dead battery all look similar,
 * so the founder gets the facts and makes the call.
 *
 * All of this is SQL and arithmetic. No LLM — location is a lookup.
 */

/** Metres between two coordinates (haversine). */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** How far a survey may sit from the BDE's track before it looks wrong. */
const PLAUSIBLE_RADIUS_M = 250;
/** GPS fixes this close in time to the survey count as corroboration. */
const TIME_WINDOW_MS = 20 * 60_000;

/**
 * Human-readable area for a coordinate, via OpenStreetMap's free reverse
 * geocoder. Best-effort only: if it's slow or down, the caller still gets
 * coordinates rather than an error.
 */
async function areaName(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Cortex/1.0 (Ryvan Technologies field ops)" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    const a = j.address || {};
    const parts = [a.neighbourhood || a.suburb || a.village, a.city || a.town || a.county, a.state].filter(Boolean);
    return parts.length ? parts.join(", ") : j.display_name || null;
  } catch {
    return null; // Geocoding is a nicety, never a dependency.
  }
}

export interface SurveyCheck {
  place: string;
  filedAt: string;
  status: string | null;
  claimedLocation: { lat: number; lng: number } | null;
  /** Closest the BDE's phone got to this survey, in metres. */
  metresFromTrack: number | null;
  verdict: "corroborated" | "no-gps-on-survey" | "no-track-nearby" | "off-track";
}

/**
 * Where is this BDE, what have they done today, and does it add up?
 * Accepts a full or partial name (as the founder would say it).
 */
export async function locateBde(nameOrId: string) {
  const bde = await prisma.user.findFirst({
    where: {
      role: "bde",
      OR: [{ id: nameOrId }, { name: { contains: nameOrId, mode: "insensitive" } }],
    },
    select: { id: true, name: true, phone: true },
  });
  if (!bde) return { error: `No BDE matches "${nameOrId}".` };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [latest, track, vendorSurveys, riderSurveys, report] = await Promise.all([
    prisma.bdeLocation.findFirst({ where: { bdeId: bde.id }, orderBy: { createdAt: "desc" } }),
    prisma.bdeLocation.findMany({
      where: { bdeId: bde.id, createdAt: { gte: startOfToday } },
      orderBy: { createdAt: "asc" },
      select: { lat: true, lng: true, createdAt: true },
    }),
    prisma.vendorSurvey.findMany({
      where: { bdeId: bde.id, createdAt: { gte: startOfToday } },
      select: { businessName: true, gpsLat: true, gpsLng: true, createdAt: true, leadStatus: true },
    }),
    prisma.riderSurvey.findMany({
      where: { bdeId: bde.id, createdAt: { gte: startOfToday } },
      select: { riderName: true, gpsLat: true, gpsLng: true, createdAt: true },
    }),
    prisma.dailyReport.findFirst({ where: { bdeId: bde.id, date: { gte: startOfToday } } }),
  ]);

  const onShift = !!latest && Date.now() - latest.createdAt.getTime() < 30_000;

  const check = (
    place: string,
    lat: number | null,
    lng: number | null,
    at: Date,
    status: string | null,
  ): SurveyCheck => {
    if (lat == null || lng == null) {
      return { place, filedAt: at.toISOString(), status, claimedLocation: null, metresFromTrack: null, verdict: "no-gps-on-survey" };
    }
    const near = track.filter((t) => Math.abs(t.createdAt.getTime() - at.getTime()) <= TIME_WINDOW_MS);
    if (!near.length) {
      return { place, filedAt: at.toISOString(), status, claimedLocation: { lat, lng }, metresFromTrack: null, verdict: "no-track-nearby" };
    }
    const min = Math.min(...near.map((t) => distanceM(t.lat, t.lng, lat, lng)));
    return {
      place,
      filedAt: at.toISOString(),
      status,
      claimedLocation: { lat, lng },
      metresFromTrack: Math.round(min),
      verdict: min <= PLAUSIBLE_RADIUS_M ? "corroborated" : "off-track",
    };
  };

  const surveys: SurveyCheck[] = [
    ...vendorSurveys.map((s) => check(s.businessName, s.gpsLat, s.gpsLng, s.createdAt, s.leadStatus)),
    ...riderSurveys.map((s) => check(s.riderName, s.gpsLat, s.gpsLng, s.createdAt, null)),
  ].sort((a, b) => a.filedAt.localeCompare(b.filedAt));

  const area = latest ? await areaName(latest.lat, latest.lng) : null;

  // Distance actually covered today, from the GPS track.
  let metresTravelled = 0;
  for (let i = 1; i < track.length; i++) {
    metresTravelled += distanceM(track[i - 1].lat, track[i - 1].lng, track[i].lat, track[i].lng);
  }

  const suspicious = surveys.filter((s) => s.verdict === "off-track" || s.verdict === "no-track-nearby");

  return {
    bde: bde.name,
    phone: bde.phone,
    onShiftNow: onShift,
    currentLocation: latest
      ? {
          area: area || "unknown area (reverse geocoding unavailable)",
          lat: latest.lat,
          lng: latest.lng,
          accuracyM: latest.accuracy,
          battery: latest.battery,
          asOf: latest.createdAt.toISOString(),
        }
      : null,
    today: {
      surveysFiled: surveys.length,
      gpsFixes: track.length,
      kmTravelled: Number((metresTravelled / 1000).toFixed(2)),
      dailyReportFiled: !!report,
      reportClaims: report
        ? { visited: report.visited, completed: report.completed, interested: report.interested, strongLeads: report.strongLeads }
        : null,
    },
    surveys,
    // The tally the founder asked for: claims vs evidence.
    integrity: {
      corroborated: surveys.filter((s) => s.verdict === "corroborated").length,
      unverifiable: suspicious.length,
      flags: suspicious.map((s) =>
        s.verdict === "off-track"
          ? `"${s.place}" was filed ${s.metresFromTrack}m from where the phone actually was.`
          : `"${s.place}" has no GPS track around the time it was filed — the BDE may have been off shift.`,
      ),
      reportVsReality:
        report && report.visited > 0 && surveys.length < report.visited
          ? `Daily report claims ${report.visited} visits but only ${surveys.length} survey(s) were filed today.`
          : null,
      note:
        "Flags are evidence gaps, not proof of fraud — poor GPS indoors, an off-shift visit, or a dead battery look the same. Verify before acting.",
    },
  };
}
