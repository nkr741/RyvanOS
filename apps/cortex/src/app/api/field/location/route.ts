import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:field:location");

/**
 * Live BDE location tracking.
 *
 * POST — a BDE's device reports its position while on shift.
 * GET  — an admin reads every BDE's latest position (and optionally the trail).
 *
 * Deliberately NOT 1Hz: at one ping per second a phone's GPS drains the
 * battery in a couple of hours and writes ~86k rows per BDE per day, for
 * deltas smaller than GPS accuracy. PING_INTERVAL_MS is the single source of
 * truth for the cadence — the client reads it from GET so changing it here
 * changes the whole fleet.
 */
export const PING_INTERVAL_MS = 10_000;

/** Ignore pings this close together (clock skew, double-fires, retries). */
const MIN_GAP_MS = 4_000;

/** A trail longer than this is noise on a map. */
const MAX_TRAIL_POINTS = 200;

export const POST = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { lat, lng, accuracy, speed, battery } = await request.json();
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "lat and lng are required numbers" }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "lat/lng out of range" }, { status: 400 });
    }

    // Drop pings that arrive faster than the agreed cadence.
    const last = await prisma.bdeLocation.findFirst({
      where: { bdeId: user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < MIN_GAP_MS) {
      return NextResponse.json({ ok: true, skipped: "too soon" });
    }

    await prisma.bdeLocation.create({
      data: {
        bdeId: user.id,
        lat,
        lng,
        accuracy: typeof accuracy === "number" ? accuracy : null,
        speed: typeof speed === "number" ? speed : null,
        battery: typeof battery === "number" ? Math.round(battery) : null,
      },
    });
    return NextResponse.json({ ok: true, nextPingMs: PING_INTERVAL_MS });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Location ping error");
    return NextResponse.json({ error: "Failed to record location" }, { status: 500 });
  }
});

/** Admin-only live view: every BDE's latest fix, plus today's trail. */
export const GET = withApi(async (request) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const withTrail = request.nextUrl.searchParams.get("trail") === "true";
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const bdes = await prisma.user.findMany({
      where: { role: "bde", active: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    });

    const live = await Promise.all(
      bdes.map(async (b) => {
        const latest = await prisma.bdeLocation.findFirst({
          where: { bdeId: b.id },
          orderBy: { createdAt: "desc" },
        });
        const trail = withTrail && latest
          ? await prisma.bdeLocation.findMany({
              where: { bdeId: b.id, createdAt: { gte: startOfToday } },
              orderBy: { createdAt: "asc" },
              select: { lat: true, lng: true, createdAt: true },
              take: MAX_TRAIL_POINTS,
            })
          : [];

        const ageMs = latest ? Date.now() - latest.createdAt.getTime() : null;
        return {
          bdeId: b.id,
          name: b.name,
          phone: b.phone,
          // "live" only if we've heard from them within ~3 ping cycles.
          online: ageMs !== null && ageMs < PING_INTERVAL_MS * 3,
          lastSeen: latest?.createdAt ?? null,
          lat: latest?.lat ?? null,
          lng: latest?.lng ?? null,
          accuracy: latest?.accuracy ?? null,
          speed: latest?.speed ?? null,
          battery: latest?.battery ?? null,
          trail: trail.map((t) => ({ lat: t.lat, lng: t.lng, at: t.createdAt })),
        };
      }),
    );

    return NextResponse.json({
      pingIntervalMs: PING_INTERVAL_MS,
      headcount: bdes.length,
      online: live.filter((l) => l.online).length,
      bdes: live,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Location read error");
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 });
  }
});
