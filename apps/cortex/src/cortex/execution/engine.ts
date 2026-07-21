import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";
import { createLogger } from "@/lib/logger";

const log = createLogger("execution-engine");

// ─── Types ──────────────────────────────────────────────────────

export interface ExecutionUnit {
  id: string;
  sequence: number;
  status: string;
  handlerId: string;
  approvalRequired: boolean;
  input: string;
  output: string | null;
}

export interface UnitResult {
  success: boolean;
  data: Record<string, unknown>;
  reasoning?: string;
  approvalRequired?: boolean;
}

export type FailurePolicy = "fail-fast" | "continue-on-error";

export interface ExecutionAdapter {
  loadUnits(missionId: string): Promise<ExecutionUnit[]>;

  executeUnit(
    unit: ExecutionUnit,
    input: Record<string, unknown>,
    missionId: string,
  ): Promise<UnitResult>;

  buildInput(
    unit: ExecutionUnit,
    previousOutput: Record<string, unknown>,
    missionConfig: Record<string, unknown>,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;

  updateUnit(unitId: string, data: Record<string, unknown>): Promise<void>;

  cancelPendingUnits(missionId: string): Promise<void>;

  // Pre-execution approval (orchestrator pattern: check policy before running).
  // If not provided, approvalRequired units execute first and pause after.
  checkPreApproval?(
    missionId: string,
    unit: ExecutionUnit,
    input: Record<string, unknown>,
  ): Promise<{ approved: boolean }>;
}

interface ExecutionOptions {
  failurePolicy: FailurePolicy;
  source: string;
}

// ─── Execution Engine ───────────────────────────────────────────
// One sequential loop. Two adapter shapes. No third runtime.

class ExecutionEngineImpl {
  async run(
    missionId: string,
    adapter: ExecutionAdapter,
    options: ExecutionOptions,
  ): Promise<void> {
    const startTime = Date.now();

    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
    });
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    if (mission.status === "completed" || mission.status === "cancelled") {
      return;
    }

    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "executing" },
    });

    const missionConfig = safeJSON(mission.config);

    log.info({ missionId, type: mission.type }, "execution started");

    await eventBus.publish({
      type: "execution.started.v1",
      version: "1",
      payload: { missionId, type: mission.type },
      source: options.source,
      missionId,
      correlationId: missionId,
    });

    const units = await adapter.loadUnits(missionId);
    let lastOutput: Record<string, unknown> = {};
    let completedCount = 0;

    for (const unit of units) {
      if (unit.status === "completed" || unit.status === "skipped") {
        completedCount++;
        if (unit.output) {
          try {
            lastOutput = JSON.parse(unit.output) as Record<string, unknown>;
          } catch {
            // non-JSON output, skip
          }
        }
        continue;
      }

      const input = await adapter.buildInput(unit, lastOutput, missionConfig);

      // Pre-execution approval (orchestrator pattern)
      if (unit.approvalRequired && adapter.checkPreApproval) {
        const approval = await adapter.checkPreApproval(missionId, unit, input);
        if (!approval.approved) {
          await adapter.updateUnit(unit.id, { status: "awaiting_approval" });
          await prisma.mission.update({
            where: { id: missionId },
            data: {
              status: "awaiting_approval",
              progress: Math.round((completedCount / units.length) * 100),
            },
          });

          log.info({ missionId, unitId: unit.id }, "paused for pre-execution approval");

          await eventBus.publish({
            type: "execution.paused.v1",
            version: "1",
            payload: { missionId, unitId: unit.id, reason: "Awaiting approval" },
            source: options.source,
            missionId,
            correlationId: missionId,
          });
          return;
        }
      }

      await adapter.updateUnit(unit.id, { status: "running", startedAt: new Date() });

      const unitStart = Date.now();

      try {
        const result = await adapter.executeUnit(unit, input, missionId);
        const durationMs = Date.now() - unitStart;

        // Post-execution approval: executor requested it, or unit requires
        // approval and no pre-approval check was done (playbook pattern)
        const needsPostApproval =
          result.approvalRequired ||
          (unit.approvalRequired && !adapter.checkPreApproval);

        if (needsPostApproval) {
          await adapter.updateUnit(unit.id, {
            status: "waiting_approval",
            output: JSON.stringify(result.data),
            durationMs,
          });
          await prisma.mission.update({
            where: { id: missionId },
            data: { status: "awaiting_approval" },
          });

          log.info({ missionId, unitId: unit.id }, "paused for post-execution approval");

          await eventBus.publish({
            type: "execution.paused.v1",
            version: "1",
            payload: {
              missionId,
              unitId: unit.id,
              handlerId: unit.handlerId,
              reason: "Awaiting post-execution approval",
            },
            source: options.source,
            missionId,
            correlationId: missionId,
          });
          return;
        }

        if (!result.success) {
          const error = (result.data?.error as string) || "Execution failed";

          await adapter.updateUnit(unit.id, {
            status: "failed",
            error,
            completedAt: new Date(),
            durationMs,
          });

          log.error({ missionId, unitId: unit.id, error }, "unit failed");

          await eventBus.publish({
            type: "execution.unit_failed.v1",
            version: "1",
            payload: { missionId, unitId: unit.id, handlerId: unit.handlerId, error },
            source: options.source,
            missionId,
            correlationId: missionId,
          });

          if (options.failurePolicy === "fail-fast") {
            await this.fail(
              missionId,
              `Unit ${unit.sequence} (${unit.handlerId}): ${error}`,
              options.source,
              startTime,
            );
            return;
          }
          continue;
        }

        // Unit succeeded
        await adapter.updateUnit(unit.id, {
          status: "completed",
          output: JSON.stringify(result.data),
          reasoning: result.reasoning,
          completedAt: new Date(),
          durationMs,
        });

        lastOutput = result.data;
        completedCount++;

        const progress = Math.round((completedCount / units.length) * 100);

        await prisma.mission.update({
          where: { id: missionId },
          data: { progress },
        });

        await eventBus.publish({
          type: "execution.unit_completed.v1",
          version: "1",
          payload: {
            missionId,
            unitId: unit.id,
            handlerId: unit.handlerId,
            sequence: unit.sequence,
            progress,
          },
          source: options.source,
          missionId,
          correlationId: missionId,
        });
      } catch (err) {
        const durationMs = Date.now() - unitStart;
        const message = err instanceof Error ? err.message : "Unknown error";

        await adapter.updateUnit(unit.id, {
          status: "failed",
          error: message,
          completedAt: new Date(),
          durationMs,
        });

        log.error({ missionId, unitId: unit.id, err: message }, "unit threw");

        await eventBus.publish({
          type: "execution.unit_failed.v1",
          version: "1",
          payload: { missionId, unitId: unit.id, handlerId: unit.handlerId, error: message },
          source: options.source,
          missionId,
          correlationId: missionId,
        });

        if (options.failurePolicy === "fail-fast") {
          await this.fail(
            missionId,
            `Unit ${unit.sequence}: ${message}`,
            options.source,
            startTime,
          );
          return;
        }
      }
    }

    await this.finalize(missionId, options.source, startTime);
  }

  async finalize(missionId: string, source: string, startTime: number): Promise<void> {
    const durationMs = Date.now() - startTime;

    const costAgg = await prisma.llmUsageLog.aggregate({
      where: { correlationId: missionId },
      _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
    });

    await prisma.mission.update({
      where: { id: missionId },
      data: {
        status: "completed",
        progress: 100,
        completedAt: new Date(),
        durationMs,
        totalCostUsd: costAgg._sum.estimatedCost || null,
        inputTokens: costAgg._sum.inputTokens || null,
        outputTokens: costAgg._sum.outputTokens || null,
      },
    });

    log.info(
      {
        missionId,
        durationMs,
        totalCostUsd: costAgg._sum.estimatedCost,
        inputTokens: costAgg._sum.inputTokens,
        outputTokens: costAgg._sum.outputTokens,
      },
      "execution completed",
    );

    await eventBus.publish({
      type: "execution.completed.v1",
      version: "1",
      payload: {
        missionId,
        durationMs,
        totalCostUsd: costAgg._sum.estimatedCost,
        inputTokens: costAgg._sum.inputTokens,
        outputTokens: costAgg._sum.outputTokens,
      },
      source,
      missionId,
      correlationId: missionId,
    });
  }

  async fail(
    missionId: string,
    error: string,
    source: string,
    startTime?: number,
  ): Promise<void> {
    const durationMs = startTime ? Date.now() - startTime : null;

    log.error({ missionId, error, durationMs }, "execution failed");

    await prisma.mission.update({
      where: { id: missionId },
      data: {
        status: "failed",
        error,
        ...(durationMs !== null ? { durationMs } : {}),
      },
    });

    await eventBus.publish({
      type: "execution.failed.v1",
      version: "1",
      payload: { missionId, error, durationMs },
      source,
      missionId,
      correlationId: missionId,
    });
  }

  async retry(
    missionId: string,
    adapter: ExecutionAdapter,
    options: ExecutionOptions,
  ): Promise<void> {
    const mission = await prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission || mission.status !== "failed") {
      throw new Error("Mission not found or not in failed state");
    }

    const units = await adapter.loadUnits(missionId);
    const failedUnit = units.find((u) => u.status === "failed");
    if (failedUnit) {
      await adapter.updateUnit(failedUnit.id, {
        status: "pending",
        error: null,
        startedAt: null,
        completedAt: null,
      });
    }

    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "executing", error: null },
    });

    log.info({ missionId, retriedUnitId: failedUnit?.id }, "execution retried");

    await eventBus.publish({
      type: "execution.retried.v1",
      version: "1",
      payload: { missionId, retriedUnitId: failedUnit?.id },
      source: options.source,
      missionId,
      correlationId: missionId,
    });

    await this.run(missionId, adapter, options);
  }

  async cancel(
    missionId: string,
    adapter: ExecutionAdapter,
    options: ExecutionOptions,
  ): Promise<void> {
    await adapter.cancelPendingUnits(missionId);

    await prisma.mission.update({
      where: { id: missionId },
      data: { status: "cancelled", completedAt: new Date() },
    });

    log.info({ missionId }, "execution cancelled");

    await eventBus.publish({
      type: "execution.cancelled.v1",
      version: "1",
      payload: { missionId },
      source: options.source,
      missionId,
      correlationId: missionId,
    });
  }

  async resume(
    missionId: string,
    adapter: ExecutionAdapter,
    options: ExecutionOptions,
  ): Promise<void> {
    const mission = await prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission || mission.status !== "awaiting_approval") {
      throw new Error("Mission not found or not awaiting approval");
    }

    log.info({ missionId }, "execution resumed");
    await this.run(missionId, adapter, options);
  }
}

function safeJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const executionEngine = new ExecutionEngineImpl();
