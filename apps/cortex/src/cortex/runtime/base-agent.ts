import { AgentContext } from "./context";
import { createLogger } from "@/lib/logger";

const log = createLogger("base-agent");

// ─── Agent Manifest ─────────────────────────────────────────────
// Every agent must declare capabilities. No agent without a manifest.

export interface AgentManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  owner: string;
  permissions: string[];
  subscribes: string[];
  publishes: string[];
  tools: string[];
  memoryScopes: string[];
}

// ─── Agent State Machine ────────────────────────────────────────
// Idle → Awakened → Planning → Executing → Waiting → Validating → Publishing → Completed → Sleeping
// Never invent new states.

export type AgentState =
  | "idle"
  | "awakened"
  | "planning"
  | "executing"
  | "waiting"
  | "validating"
  | "publishing"
  | "completed"
  | "sleeping"
  | "failed";

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ["awakened"],
  awakened: ["planning", "failed"],
  planning: ["executing", "failed"],
  executing: ["waiting", "validating", "failed"],
  waiting: ["executing", "validating", "failed"],
  validating: ["publishing", "executing", "failed"],
  publishing: ["completed", "failed"],
  completed: ["sleeping"],
  sleeping: ["idle"],
  failed: ["sleeping"],
};

// ─── Execution Plan & Result ────────────────────────────────────

export interface AgentPlan {
  steps: string[];
  estimatedDurationMs: number;
  requiresApproval: boolean;
  approvalReason?: string;
}

export interface AgentResult {
  success: boolean;
  data: Record<string, unknown>;
  reasoning: string;
  eventsToPublish: { type: string; payload: Record<string, unknown> }[];
}

export interface AgentValidation {
  valid: boolean;
  issues: string[];
  confidence: number;
}

// ─── Base Agent ─────────────────────────────────────────────────
// Every agent inherits this. No exceptions.

export abstract class BaseAgent {
  abstract readonly manifest: AgentManifest;
  private _state: AgentState = "idle";

  get state(): AgentState {
    return this._state;
  }

  private transition(to: AgentState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed?.includes(to)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${to}. Allowed: ${allowed?.join(", ")}`,
      );
    }
    this._state = to;
  }

  abstract canHandle(eventType: string): boolean;

  abstract plan(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentPlan>;

  abstract execute(
    ctx: AgentContext,
    plan: AgentPlan,
    input: Record<string, unknown>,
  ): Promise<AgentResult>;

  abstract validate(ctx: AgentContext, result: AgentResult): Promise<AgentValidation>;

  async run(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<AgentResult> {
    try {
      // Awaken
      this.transition("awakened");
      ctx.addReasoning(`Agent ${this.manifest.id} awakened`);

      // Plan
      this.transition("planning");
      const plan = await this.plan(ctx, input);
      ctx.addReasoning(
        `Plan: ${plan.steps.length} steps, approval=${plan.requiresApproval}`,
      );

      // Execute
      this.transition("executing");
      const result = await this.execute(ctx, plan, input);
      ctx.addReasoning(
        `Execution: success=${result.success}, events=${result.eventsToPublish.length}`,
      );

      if (!result.success) {
        this.transition("failed");
        this.transition("sleeping");
        this._state = "idle";
        return result;
      }

      // Validate
      this.transition("validating");
      const validation = await this.validate(ctx, result);
      ctx.addReasoning(
        `Validation: valid=${validation.valid}, confidence=${validation.confidence}%`,
      );

      if (!validation.valid) {
        this.transition("failed");
        this.transition("sleeping");
        this._state = "idle";
        return {
          ...result,
          success: false,
          data: {
            ...result.data,
            validationIssues: validation.issues,
          },
        };
      }

      // Publish events
      this.transition("publishing");
      for (const evt of result.eventsToPublish) {
        await ctx.publishEvent(evt.type, evt.payload);
      }
      ctx.addReasoning(`Published ${result.eventsToPublish.length} events`);

      // Complete
      this.transition("completed");
      this.transition("sleeping");
      this._state = "idle";

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      ctx.addReasoning(`FAILED: ${msg}`);

      if (this._state !== "failed" && this._state !== "sleeping" && this._state !== "idle") {
        try { this.transition("failed"); } catch { log.debug({ agent: this.manifest.id }, "transition to failed skipped — already in terminal state"); }
        try { this.transition("sleeping"); } catch { log.debug({ agent: this.manifest.id }, "transition to sleeping skipped"); }
        this._state = "idle";
      }

      return {
        success: false,
        data: { error: msg },
        reasoning: ctx.getReasoning(),
        eventsToPublish: [],
      };
    }
  }
}
