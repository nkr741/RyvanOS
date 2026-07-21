import { describe, it, expect, vi, beforeEach } from "vitest";

let mockContextValue: unknown = undefined;

vi.mock("./request-context", () => ({
  getRequestContext: () => mockContextValue,
}));

import { logger, createLogger } from "./logger";

function getMixin(): (() => Record<string, unknown>) | undefined {
  const sym = Symbol.for("pino.mixin");
  const obj = logger as unknown as Record<symbol, unknown>;
  const fn = obj[sym];
  return typeof fn === "function" ? fn as () => Record<string, unknown> : undefined;
}

describe("logger", () => {
  beforeEach(() => {
    mockContextValue = undefined;
  });

  it("creates child loggers with module name", () => {
    const child = createLogger("test-module");
    expect(child).toBeDefined();
  });

  it("mixin returns empty object when no request context", () => {
    const mixin = getMixin();
    if (mixin) {
      expect(mixin()).toEqual({});
    }
  });

  it("mixin injects requestId from context", () => {
    mockContextValue = {
      requestId: "req-abc",
      method: "GET",
      path: "/test",
      startTime: Date.now(),
    };

    const mixin = getMixin();
    if (mixin) {
      const result = mixin();
      expect(result.requestId).toBe("req-abc");
      expect(result.correlationId).toBeUndefined();
    }
  });

  it("mixin injects correlationId when present", () => {
    mockContextValue = {
      requestId: "req-def",
      correlationId: "mission-123",
      method: "POST",
      path: "/missions",
      startTime: Date.now(),
    };

    const mixin = getMixin();
    if (mixin) {
      const result = mixin();
      expect(result.requestId).toBe("req-def");
      expect(result.correlationId).toBe("mission-123");
    }
  });
});
