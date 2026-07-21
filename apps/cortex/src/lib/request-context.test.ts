import { describe, it, expect } from "vitest";
import { runWithRequestContext, getRequestContext } from "./request-context";

describe("request-context", () => {
  it("returns undefined outside a context", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("provides context inside runWithRequestContext", () => {
    const ctx = {
      requestId: "req-123",
      method: "GET",
      path: "/api/test",
      startTime: Date.now(),
    };

    runWithRequestContext(ctx, () => {
      const result = getRequestContext();
      expect(result).toBeDefined();
      expect(result!.requestId).toBe("req-123");
      expect(result!.method).toBe("GET");
      expect(result!.path).toBe("/api/test");
    });
  });

  it("propagates correlationId when provided", () => {
    const ctx = {
      requestId: "req-456",
      correlationId: "mission-789",
      method: "POST",
      path: "/api/missions",
      startTime: Date.now(),
    };

    runWithRequestContext(ctx, () => {
      const result = getRequestContext();
      expect(result!.correlationId).toBe("mission-789");
    });
  });

  it("isolates contexts across nested calls", () => {
    const outer = { requestId: "outer", method: "GET", path: "/a", startTime: 1 };
    const inner = { requestId: "inner", method: "POST", path: "/b", startTime: 2 };

    runWithRequestContext(outer, () => {
      expect(getRequestContext()!.requestId).toBe("outer");

      runWithRequestContext(inner, () => {
        expect(getRequestContext()!.requestId).toBe("inner");
      });

      expect(getRequestContext()!.requestId).toBe("outer");
    });
  });

  it("works with async callbacks", async () => {
    const ctx = { requestId: "async-1", method: "GET", path: "/test", startTime: Date.now() };

    await runWithRequestContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 10));
      expect(getRequestContext()!.requestId).toBe("async-1");
    });
  });
});
