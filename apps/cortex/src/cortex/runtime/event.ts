/**
 * Cortex EventBus — AIOS adapter layer.
 *
 * Routes through @ryvan/events EventBus under the hood.
 * Adds a middleware that persists every event to the CortexEvent Prisma table
 * (preserving existing DB persistence behavior).
 *
 * API surface is UNCHANGED — consumers import { eventBus } and call
 * publish(), subscribe(), replay(), getEventsByCorrelation() as before.
 */

import type { EventBus as AIOSEventBus } from "@ryvan/events";
import { getAIOS } from "../../lib/aios";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("eventbus");

// ─── Types (unchanged — consumers depend on these) ─────────────

export interface CortexEventData {
  id?: string;
  type: string;
  version: string;
  payload: Record<string, unknown>;
  source: string;
  correlationId?: string;
  missionId?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export type EventHandler = (event: CortexEventData) => Promise<void>;

// ─── Adapter class ─────────────────────────────────────────────

class CortexEventBusAdapter {
  private aiosBus: AIOSEventBus | null = null;
  private middlewareInstalled = false;

  private getAIOSBus(): AIOSEventBus {
    if (!this.aiosBus) {
      this.aiosBus = getAIOS().container.resolve<AIOSEventBus>("events");

      if (!this.middlewareInstalled) {
        this.middlewareInstalled = true;
        this.aiosBus.use(async (event, next) => {
          await next();

          try {
            await prisma.cortexEvent.create({
              data: {
                id: event.id,
                type: event.type,
                version: (event.metadata?.version as string) ?? "1.0",
                payload: JSON.stringify(event.data),
                source: event.source ?? "cortex",
                correlationId: event.correlationId ?? null,
                missionId: (event.metadata?.missionId as string) ?? null,
                processedAt: new Date(),
              },
            });
          } catch (err) {
            log.error(
              { err: err instanceof Error ? err.message : err, eventType: event.type },
              "failed to persist event",
            );
          }
        });
      }
    }
    return this.aiosBus;
  }

  async publish(event: CortexEventData): Promise<string> {
    const bus = this.getAIOSBus();

    const emitted = await bus.emit(event.type, event.payload, {
      source: event.source,
      correlationId: event.correlationId,
      metadata: {
        version: event.version,
        missionId: event.missionId,
        ...event.metadata,
      },
    });

    return emitted.id;
  }

  subscribe(pattern: string, handler: EventHandler): () => void {
    const bus = this.getAIOSBus();
    const subscriptions: Array<{ unsubscribe: () => void }> = [];

    const wrappedHandler = async (ryvanEvent: {
      id: string;
      type: string;
      data: unknown;
      timestamp: number;
      source?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const cortexEvent: CortexEventData = {
        id: ryvanEvent.id,
        type: ryvanEvent.type,
        version: (ryvanEvent.metadata?.version as string) ?? "1.0",
        payload: ryvanEvent.data as Record<string, unknown>,
        source: ryvanEvent.source ?? "cortex",
        correlationId: ryvanEvent.correlationId,
        missionId: ryvanEvent.metadata?.missionId as string | undefined,
        timestamp: new Date(ryvanEvent.timestamp).toISOString(),
        metadata: ryvanEvent.metadata,
      };
      await handler(cortexEvent);
    };

    if (pattern.includes("*")) {
      // AIOS EventBus doesn't support wildcard subscriptions.
      // Cortex currently only uses exact patterns, so this path is unreachable.
      throw new Error(`Wildcard event patterns not yet supported via AIOS adapter: "${pattern}"`);
    }

    const sub = bus.on(pattern, wrappedHandler);
    subscriptions.push(sub);

    return () => {
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
    };
  }

  async replay(missionId: string): Promise<CortexEventData[]> {
    const events = await prisma.cortexEvent.findMany({
      where: { missionId },
      orderBy: { createdAt: "asc" },
    });

    return events.map(
      (e: {
        id: string;
        type: string;
        version: string;
        payload: string;
        source: string;
        correlationId: string | null;
        missionId: string | null;
        createdAt: Date;
      }) => ({
        id: e.id,
        type: e.type,
        version: e.version,
        payload: JSON.parse(e.payload) as Record<string, unknown>,
        source: e.source,
        correlationId: e.correlationId || undefined,
        missionId: e.missionId || undefined,
        timestamp: e.createdAt.toISOString(),
      }),
    );
  }

  async getEventsByCorrelation(correlationId: string): Promise<CortexEventData[]> {
    const events = await prisma.cortexEvent.findMany({
      where: { correlationId },
      orderBy: { createdAt: "asc" },
    });

    return events.map(
      (e: {
        id: string;
        type: string;
        version: string;
        payload: string;
        source: string;
        correlationId: string | null;
        missionId: string | null;
        createdAt: Date;
      }) => ({
        id: e.id,
        type: e.type,
        version: e.version,
        payload: JSON.parse(e.payload) as Record<string, unknown>,
        source: e.source,
        correlationId: e.correlationId || undefined,
        missionId: e.missionId || undefined,
        timestamp: e.createdAt.toISOString(),
      }),
    );
  }
}

export const eventBus = new CortexEventBusAdapter();
