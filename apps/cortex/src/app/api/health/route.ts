import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllFlags } from "@/lib/features";
import { withApi } from "@/lib/api";

async function checkDatabase(): Promise<"connected" | "disconnected"> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return "connected";
  } catch {
    return "disconnected";
  }
}

async function checkMigrations(): Promise<"up_to_date" | "pending" | "unknown"> {
  try {
    const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`
    );
    const pending = Number(result[0]?.count ?? 0);
    return pending === 0 ? "up_to_date" : "pending";
  } catch {
    return "unknown";
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const GET = withApi(async () => {
  const [db, migration] = await Promise.all([
    checkDatabase(),
    checkMigrations(),
  ]);

  const healthy = db === "connected";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.1.0",
      uptime: formatUptime(process.uptime()),
      services: {
        database: db,
        migration,
        application: "healthy",
      },
      features: getAllFlags(),
    },
    { status: healthy ? 200 : 503 }
  );
});
