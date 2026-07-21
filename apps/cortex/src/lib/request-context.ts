import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  correlationId?: string;
  method: string;
  path: string;
  startTime: number;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return store.getStore();
}
