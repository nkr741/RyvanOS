import { prisma } from "@/lib/prisma";

const DECAY_RATE_PER_DAY = 2;
const REFRESH_THRESHOLD = 50;

export async function updateProspectFreshness(): Promise<{
  updated: number;
  refreshRequired: number;
}> {
  const prospects = await prisma.prospect.findMany({
    where: { status: { notIn: ["promoted", "rejected", "archived"] } },
    select: { id: true, lastRefreshedAt: true, freshness: true },
  });

  let updated = 0;
  let refreshRequired = 0;

  for (const prospect of prospects) {
    const daysSinceRefresh = Math.floor(
      (Date.now() - prospect.lastRefreshedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const newFreshness = Math.max(0, 100 - daysSinceRefresh * DECAY_RATE_PER_DAY);
    const needsRefresh = newFreshness < REFRESH_THRESHOLD;

    if (newFreshness !== prospect.freshness || needsRefresh) {
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          freshness: newFreshness,
          refreshRequired: needsRefresh,
        },
      });
      updated++;
      if (needsRefresh) refreshRequired++;
    }
  }

  return { updated, refreshRequired };
}

export async function markRefreshed(prospectId: string): Promise<void> {
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      freshness: 100,
      lastRefreshedAt: new Date(),
      refreshRequired: false,
    },
  });
}
