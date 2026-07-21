import { describe, it, expect, vi, beforeEach } from "vitest";

const missionStore = new Map<string, Record<string, unknown>>();
const unitStore = new Map<string, Record<string, unknown>>();
const publishedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mission: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        return missionStore.get(where.id) || null;
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const m = missionStore.get(where.id);
        if (m) Object.assign(m, data);
        return m;
      }),
    },
    llmUsageLog: {
      aggregate: vi.fn(() => ({
        _sum: { estimatedCost: 0.05, inputTokens: 1000, outputTokens: 500 },
      })),
    },
  },
}));

vi.mock("@/cortex/runtime/event", () => ({
  eventBus: {
    publish: vi.fn(async (event: { type: string; payload: Record<string, unknown> }) => {
      publishedEvents.push({ type: event.type, payload: event.payload });
      return "evt-1";
    }),
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { executionEngine, type ExecutionAdapter, type ExecutionUnit, type UnitResult } from "./engine";

function makeMission(id: string, overrides: Record<string, unknown> = {}) {
  const m = {
    id,
    type: "test",
    status: "planning",
    config: JSON.stringify({}),
    ...overrides,
  };
  missionStore.set(id, m);
  return m;
}

function makeAdapter(
  units: ExecutionUnit[],
  handler: (unit: ExecutionUnit, input: Record<string, unknown>) => Promise<UnitResult>,
  opts: { checkPreApproval?: ExecutionAdapter["checkPreApproval"] } = {},
): ExecutionAdapter {
  return {
    loadUnits: vi.fn(async () => units),
    executeUnit: vi.fn(async (unit, input) => handler(unit, input)),
    buildInput: vi.fn((unit, prev, config) => ({
      ...JSON.parse(unit.input),
      previousOutput: prev,
      missionConfig: config,
    })),
    updateUnit: vi.fn(async (id, data) => {
      const u = unitStore.get(id);
      if (u) Object.assign(u, data);
    }),
    cancelPendingUnits: vi.fn(async () => {}),
    ...(opts.checkPreApproval ? { checkPreApproval: opts.checkPreApproval } : {}),
  };
}

function makeUnit(overrides: Partial<ExecutionUnit> = {}): ExecutionUnit {
  const u: ExecutionUnit = {
    id: `unit-${Math.random().toString(36).slice(2, 6)}`,
    sequence: 1,
    status: "pending",
    handlerId: "test-handler",
    approvalRequired: false,
    input: JSON.stringify({}),
    output: null,
    ...overrides,
  };
  unitStore.set(u.id, { ...u });
  return u;
}

beforeEach(() => {
  missionStore.clear();
  unitStore.clear();
  publishedEvents.length = 0;
  vi.clearAllMocks();
});

describe("ExecutionEngine.run", () => {
  it("executes units sequentially and finalizes", async () => {
    makeMission("m1");
    const u1 = makeUnit({ id: "u1", sequence: 1 });
    const u2 = makeUnit({ id: "u2", sequence: 2 });

    const adapter = makeAdapter(
      [u1, u2],
      async () => ({ success: true, data: { result: "ok" } }),
    );

    await executionEngine.run("m1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(2);
    expect(missionStore.get("m1")?.status).toBe("completed");
    expect(missionStore.get("m1")?.progress).toBe(100);

    const eventTypes = publishedEvents.map((e) => e.type);
    expect(eventTypes).toContain("execution.started.v1");
    expect(eventTypes).toContain("execution.unit_completed.v1");
    expect(eventTypes).toContain("execution.completed.v1");
  });

  it("skips already completed units", async () => {
    makeMission("m2");
    const done = makeUnit({ id: "done1", sequence: 1, status: "completed", output: '{"v":1}' });
    const pending = makeUnit({ id: "pend1", sequence: 2 });

    const adapter = makeAdapter(
      [done, pending],
      async () => ({ success: true, data: { v: 2 } }),
    );

    await executionEngine.run("m2", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(1);
    const callArgs = (adapter.buildInput as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toEqual({ v: 1 });
  });

  it("pipes previous output to next unit", async () => {
    makeMission("m3");
    const u1 = makeUnit({ id: "a1", sequence: 1 });
    const u2 = makeUnit({ id: "a2", sequence: 2 });

    const outputs: Record<string, unknown>[] = [];
    const adapter = makeAdapter([u1, u2], async (_unit, input) => {
      outputs.push(input);
      return { success: true, data: { step: _unit.sequence } };
    });

    await executionEngine.run("m3", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(outputs[1]).toHaveProperty("previousOutput", { step: 1 });
  });

  it("fail-fast stops on first failure", async () => {
    makeMission("m4");
    const u1 = makeUnit({ id: "f1", sequence: 1 });
    const u2 = makeUnit({ id: "f2", sequence: 2 });

    const adapter = makeAdapter([u1, u2], async (unit) => {
      if (unit.id === "f1") return { success: false, data: { error: "boom" } };
      return { success: true, data: {} };
    });

    await executionEngine.run("m4", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(1);
    expect(missionStore.get("m4")?.status).toBe("failed");
    expect(publishedEvents.some((e) => e.type === "execution.unit_failed.v1")).toBe(true);
    expect(publishedEvents.some((e) => e.type === "execution.failed.v1")).toBe(true);
  });

  it("continue-on-error skips failed unit and completes", async () => {
    makeMission("m5");
    const u1 = makeUnit({ id: "c1", sequence: 1 });
    const u2 = makeUnit({ id: "c2", sequence: 2 });

    const adapter = makeAdapter([u1, u2], async (unit) => {
      if (unit.id === "c1") return { success: false, data: { error: "oops" } };
      return { success: true, data: { ok: true } };
    });

    await executionEngine.run("m5", adapter, {
      failurePolicy: "continue-on-error",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(2);
    expect(missionStore.get("m5")?.status).toBe("completed");
  });

  it("handles thrown errors with fail-fast", async () => {
    makeMission("m6");
    const u1 = makeUnit({ id: "t1", sequence: 1 });

    const adapter = makeAdapter([u1], async () => {
      throw new Error("unexpected crash");
    });

    await executionEngine.run("m6", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(missionStore.get("m6")?.status).toBe("failed");
    expect(unitStore.get("t1")?.error).toBe("unexpected crash");
  });
});

describe("pre-execution approval", () => {
  it("pauses when checkPreApproval returns not approved", async () => {
    makeMission("ma1");
    const u1 = makeUnit({ id: "ap1", sequence: 1, approvalRequired: true });

    const adapter = makeAdapter(
      [u1],
      async () => ({ success: true, data: {} }),
      { checkPreApproval: vi.fn(async () => ({ approved: false })) },
    );

    await executionEngine.run("ma1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).not.toHaveBeenCalled();
    expect(missionStore.get("ma1")?.status).toBe("awaiting_approval");
    expect(unitStore.get("ap1")?.status).toBe("awaiting_approval");
    expect(publishedEvents.some((e) => e.type === "execution.paused.v1")).toBe(true);
  });

  it("continues when checkPreApproval returns approved", async () => {
    makeMission("ma2");
    const u1 = makeUnit({ id: "ap2", sequence: 1, approvalRequired: true });

    const adapter = makeAdapter(
      [u1],
      async () => ({ success: true, data: { done: true } }),
      { checkPreApproval: vi.fn(async () => ({ approved: true })) },
    );

    await executionEngine.run("ma2", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(1);
    expect(missionStore.get("ma2")?.status).toBe("completed");
  });
});

describe("post-execution approval", () => {
  it("pauses when result.approvalRequired is true", async () => {
    makeMission("mp1");
    const u1 = makeUnit({ id: "pa1", sequence: 1 });

    const adapter = makeAdapter([u1], async () => ({
      success: true,
      data: { draft: "email content" },
      approvalRequired: true,
    }));

    await executionEngine.run("mp1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(1);
    expect(missionStore.get("mp1")?.status).toBe("awaiting_approval");
    expect(unitStore.get("pa1")?.status).toBe("waiting_approval");
    expect(unitStore.get("pa1")?.output).toContain("email content");
  });

  it("pauses when approvalRequired flag set but no checkPreApproval", async () => {
    makeMission("mp2");
    const u1 = makeUnit({ id: "pa2", sequence: 1, approvalRequired: true });

    const adapter = makeAdapter([u1], async () => ({
      success: true,
      data: { proposal: "draft" },
    }));
    // No checkPreApproval on adapter — playbook pattern

    await executionEngine.run("mp2", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(1);
    expect(missionStore.get("mp2")?.status).toBe("awaiting_approval");
    expect(unitStore.get("pa2")?.status).toBe("waiting_approval");
  });
});

describe("retry", () => {
  it("resets failed unit and re-runs", async () => {
    makeMission("mr1", { status: "failed", error: "prev error" });
    const u1 = makeUnit({ id: "r1", sequence: 1, status: "completed", output: '{"v":1}' });
    const u2 = makeUnit({ id: "r2", sequence: 2, status: "failed" });

    let callCount = 0;
    const adapter = makeAdapter([u1, u2], async () => {
      callCount++;
      return { success: true, data: { retried: true } };
    });

    await executionEngine.retry("mr1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(unitStore.get("r2")?.status).not.toBe("failed");
    expect(missionStore.get("mr1")?.status).toBe("completed");
    expect(publishedEvents.some((e) => e.type === "execution.retried.v1")).toBe(true);
  });
});

describe("cancel", () => {
  it("cancels mission and pending units", async () => {
    makeMission("mc1", { status: "executing" });

    const adapter = makeAdapter([], async () => ({ success: true, data: {} }));

    await executionEngine.cancel("mc1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(missionStore.get("mc1")?.status).toBe("cancelled");
    expect(adapter.cancelPendingUnits).toHaveBeenCalledWith("mc1");
    expect(publishedEvents.some((e) => e.type === "execution.cancelled.v1")).toBe(true);
  });
});

describe("resume", () => {
  it("resumes from awaiting_approval", async () => {
    makeMission("mres1", { status: "awaiting_approval" });
    const u1 = makeUnit({ id: "res1", sequence: 1, status: "completed", output: '{}' });
    const u2 = makeUnit({ id: "res2", sequence: 2, status: "pending" });

    const adapter = makeAdapter([u1, u2], async () => ({
      success: true,
      data: { resumed: true },
    }));

    await executionEngine.resume("mres1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    expect(adapter.executeUnit).toHaveBeenCalledTimes(1);
    expect(missionStore.get("mres1")?.status).toBe("completed");
  });

  it("throws when mission is not awaiting approval", async () => {
    makeMission("mres2", { status: "completed" });
    const adapter = makeAdapter([], async () => ({ success: true, data: {} }));

    await expect(
      executionEngine.resume("mres2", adapter, {
        failurePolicy: "fail-fast",
        source: "test",
      }),
    ).rejects.toThrow("Mission not found or not awaiting approval");
  });
});

describe("finalization", () => {
  it("aggregates cost data on completion", async () => {
    makeMission("mf1");
    const u1 = makeUnit({ id: "fin1", sequence: 1 });

    const adapter = makeAdapter([u1], async () => ({
      success: true,
      data: {},
    }));

    await executionEngine.run("mf1", adapter, {
      failurePolicy: "fail-fast",
      source: "test",
    });

    const m = missionStore.get("mf1");
    expect(m?.totalCostUsd).toBe(0.05);
    expect(m?.inputTokens).toBe(1000);
    expect(m?.outputTokens).toBe(500);
    expect(m?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
