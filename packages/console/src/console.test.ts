import { describe, expect, it, vi } from "vitest";
import { ConsoleApi } from "./api.js";
import type { ConsoleRequest, ConsoleSources } from "./types.js";

const TOKEN = "console-token-at-least-16-chars";

const mission = {
  id: "msn_1",
  type: "payroll.run",
  name: "Run payroll",
  goal: "Run July payroll",
  status: "completed",
  runId: "wfr_1",
  correlationId: "corr_1",
  createdAt: 1,
};

function sources(overrides: Partial<ConsoleSources> = {}): ConsoleSources {
  return {
    missions: {
      list: async () => [mission],
      get: async (id) => (id === "msn_1" ? mission : undefined),
      cancel: async () => ({ ...mission, status: "cancelled" }),
    },
    traces: {
      list: async () => [
        {
          traceId: "corr_1",
          status: "ok",
          durationMs: 120,
          spanCount: 3,
          errorCount: 0,
          totalCostUsd: 0.25,
          totalTokens: 900,
          startedAt: 1,
        },
      ],
      get: async () => ({
        traceId: "corr_1",
        status: "ok",
        durationMs: 120,
        spanCount: 3,
        errorCount: 0,
        totalCostUsd: 0.25,
        totalTokens: 900,
        startedAt: 1,
      }),
      tree: async () => [
        {
          id: "s1",
          traceId: "corr_1",
          name: "payroll.run",
          kind: "mission",
          status: "ok",
          startedAt: 1,
          durationMs: 120,
          children: [],
        },
      ],
    },
    approvals: {
      pending: async () => [
        {
          id: "appr_1",
          action: "workflow:step:execute",
          reason: "moves money",
          status: "pending",
          requestedAt: 1,
          expiresAt: 2,
        },
      ],
      grant: async (id, decidedBy) => ({
        id,
        action: "a",
        reason: "r",
        status: "granted",
        requestedAt: 1,
        expiresAt: 2,
        subject: { userId: decidedBy },
      }),
      deny: async (id) => ({
        id,
        action: "a",
        reason: "r",
        status: "denied",
        requestedAt: 1,
        expiresAt: 2,
      }),
    },
    audit: {
      query: async () => [
        {
          id: "aud_1",
          sequence: 1,
          timestamp: 1,
          action: "mission:completed",
          outcome: "success",
          actor: { userId: "u1" },
        },
      ],
      verify: async () => ({ valid: true, entryCount: 1, brokenAt: [] }),
    },
    circuits: { list: () => [], reset: vi.fn() },
    deadLetters: { list: async () => [] },
    health: {
      services: () => [{ name: "mission", status: "running" }],
      storage: async () => [{ kind: "postgres", reachable: true, latencyMs: 3 }],
    },
    ...overrides,
  };
}

function api(overrides: Partial<ConsoleSources> = {}, basePath?: string) {
  return new ConsoleApi({ sources: sources(overrides), token: TOKEN, basePath });
}

function get(path: string, query?: Record<string, string>): ConsoleRequest {
  return { method: "GET", path, query, headers: { authorization: `Bearer ${TOKEN}` } };
}

function post(path: string, body?: unknown): ConsoleRequest {
  return { method: "POST", path, body, headers: { authorization: `Bearer ${TOKEN}` } };
}

const parse = (body: string) => JSON.parse(body);

describe("ConsoleApi authentication", () => {
  it("refuses to construct without a strong token", () => {
    // A console with no token exposes the audit trail and the approval buttons
    // to anyone who can reach the port, so this fails at wiring time.
    expect(() => new ConsoleApi({ sources: sources(), token: "" })).toThrow();
    expect(() => new ConsoleApi({ sources: sources(), token: "short" })).toThrow();
  });

  it("rejects a request with no token", async () => {
    const response = await api().handle({ method: "GET", path: "/api/missions" });

    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
  });

  it("rejects a wrong token and a wrong scheme", async () => {
    expect(
      (
        await api().handle({
          method: "GET",
          path: "/api/missions",
          headers: { authorization: "Bearer nope-nope-nope-nope" },
        })
      ).status,
    ).toBe(401);

    expect(
      (
        await api().handle({
          method: "GET",
          path: "/api/missions",
          headers: { authorization: `Basic ${TOKEN}` },
        })
      ).status,
    ).toBe(401);
  });

  it("accepts the right token", async () => {
    expect((await api().handle(get("/api/missions"))).status).toBe(200);
  });

  it("checks auth before routing, so an unknown path leaks nothing", async () => {
    const response = await api().handle({ method: "GET", path: "/api/secret" });

    expect(response.status).toBe(401);
  });
});

describe("ConsoleApi routes", () => {
  it("serves the UI at the root", async () => {
    const response = await api().handle(get("/"));

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("RyvanOS");
  });

  it("lists missions", async () => {
    const response = await api().handle(get("/api/missions"));

    expect(parse(response.body).missions).toHaveLength(1);
  });

  it("returns a mission with its trace and spans", async () => {
    const response = await api().handle(get("/api/missions/msn_1"));
    const payload = parse(response.body);

    // Status alone does not tell an operator which step failed or what it cost.
    expect(payload.mission.id).toBe("msn_1");
    expect(payload.trace.totalCostUsd).toBe(0.25);
    expect(payload.spans).toHaveLength(1);
  });

  it("404s an unknown mission", async () => {
    expect((await api().handle(get("/api/missions/ghost"))).status).toBe(404);
  });

  it("cancels a mission", async () => {
    const response = await api().handle(post("/api/missions/msn_1/cancel"));

    expect(parse(response.body).mission.status).toBe("cancelled");
  });

  it("grants and denies approvals", async () => {
    const granted = await api().handle(post("/api/approvals/appr_1/grant", { decidedBy: "u-cfo" }));
    expect(parse(granted.body).approval.status).toBe("granted");

    const denied = await api().handle(post("/api/approvals/appr_1/deny", { decidedBy: "u-cfo" }));
    expect(parse(denied.body).approval.status).toBe("denied");
  });

  it("refuses to decide an approval with no decider", async () => {
    const response = await api().handle(post("/api/approvals/appr_1/grant", {}));

    // An approval with no decider is not an audit trail, it is a rumour.
    expect(response.status).toBe(400);
    expect(parse(response.body).error).toContain("decidedBy");
  });

  it("reports audit entries and chain verification", async () => {
    expect(parse((await api().handle(get("/api/audit"))).body).entries).toHaveLength(1);
    expect(parse((await api().handle(get("/api/audit/verify"))).body).valid).toBe(true);
  });

  it("summarises the platform in one request", async () => {
    const payload = parse((await api().handle(get("/api/overview"))).body);

    expect(payload.missions.total).toBe(1);
    expect(payload.missions.byStatus.completed).toBe(1);
    expect(payload.approvalsPending).toBe(1);
    expect(payload.cost.totalUsd).toBeCloseTo(0.25);
    expect(payload.audit.valid).toBe(true);
    expect(payload.services).toHaveLength(1);
  });

  it("resets a circuit, decoding a key that contains slashes", async () => {
    const reset = vi.fn();
    const response = await api({ circuits: { list: () => [], reset } }).handle(
      post(`/api/circuits/${encodeURIComponent("connector:sap:read")}/reset`),
    );

    expect(response.status).toBe(200);
    expect(reset).toHaveBeenCalledWith("connector:sap:read");
  });

  it("404s an unknown route", async () => {
    const response = await api().handle(get("/api/nope"));

    expect(response.status).toBe(404);
  });
});

describe("ConsoleApi resilience to partial platforms", () => {
  it("returns empty rather than failing when a source is absent", async () => {
    const bare = new ConsoleApi({ sources: {}, token: TOKEN });

    expect(parse((await bare.handle(get("/api/missions"))).body).missions).toEqual([]);
    expect(parse((await bare.handle(get("/api/circuits"))).body).circuits).toEqual([]);
    expect(parse((await bare.handle(get("/api/audit"))).body).entries).toEqual([]);
  });

  it("explains clearly when an action needs a source that is absent", async () => {
    const bare = new ConsoleApi({ sources: {}, token: TOKEN });

    const response = await bare.handle(post("/api/approvals/a/grant", { decidedBy: "u" }));

    expect(response.status).toBe(400);
    expect(parse(response.body).error).toContain("not available");
  });

  it("turns an unexpected source failure into a 500, not a crash", async () => {
    const broken = api({
      missions: {
        list: async () => {
          throw new Error("database gone");
        },
        get: async () => undefined,
        cancel: async () => mission,
      },
    });

    const response = await broken.handle(get("/api/missions"));

    expect(response.status).toBe(500);
    expect(parse(response.body).error).toBe("database gone");
  });
});

describe("ConsoleApi mounting", () => {
  it("serves under a base path", async () => {
    const mounted = api({}, "/console");

    expect((await mounted.handle(get("/console"))).status).toBe(200);
    expect(parse((await mounted.handle(get("/console/api/missions"))).body).missions).toHaveLength(
      1,
    );
  });

  it("404s paths outside its base path without checking auth", async () => {
    const mounted = api({}, "/console");

    const response = await mounted.handle({ method: "GET", path: "/somewhere/else" });

    // Outside the mount it must behave as if it is not there at all, rather
    // than challenging for credentials on someone else's route.
    expect(response.status).toBe(404);
  });
});
