import type { EmitOptions, IEventBus } from "./types.js";

/**
 * Emits events on behalf of one service.
 *
 * Every service had grown its own private `emit()` helper doing the same three
 * things: skip when no bus is configured, stamp `source`, and forward the
 * correlation id. Five copies is five chances for one of them to forget the
 * correlation id — which is exactly what breaks tracing, silently.
 *
 * Returns a no-op when no bus is supplied, so callers never branch.
 */
export function scopedEmitter(
  source: string,
  eventBus?: IEventBus,
): (type: string, data: Record<string, unknown>, options?: EmitOptions) => Promise<void> {
  if (!eventBus) {
    return async () => undefined;
  }

  return async (type, data, options) => {
    await eventBus.emit(type, data, { source, ...options });
  };
}

export type ScopedEmitter = ReturnType<typeof scopedEmitter>;
