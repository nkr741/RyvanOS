import { generateId } from "@ryvan/common";
import type { ExecutionPlan, PlannerStrategy } from "./types.js";

class DefaultPlannerStrategy implements PlannerStrategy {
  readonly name = "default";

  async plan(goal: string, context?: Record<string, unknown>): Promise<ExecutionPlan> {
    return {
      id: generateId("plan"),
      taskId: "",
      steps: [
        {
          id: generateId("step"),
          name: "execute",
          description: goal,
          type: "model_call",
          config: context ?? {},
          dependencies: [],
          status: "pending",
        },
      ],
      strategy: "sequential",
      createdAt: Date.now(),
    };
  }
}

export class Planner {
  private readonly strategies = new Map<string, PlannerStrategy>();
  private defaultStrategyName = "default";

  constructor() {
    this.registerStrategy(new DefaultPlannerStrategy());
  }

  registerStrategy(strategy: PlannerStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  setDefaultStrategy(name: string): void {
    if (!this.strategies.has(name)) {
      throw new Error(`Planning strategy "${name}" not registered`);
    }
    this.defaultStrategyName = name;
  }

  async plan(
    goal: string,
    context?: Record<string, unknown>,
    strategyName?: string,
    taskId?: string,
  ): Promise<ExecutionPlan> {
    const name = strategyName ?? this.defaultStrategyName;
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Planning strategy "${name}" not registered`);
    }
    const plan = await strategy.plan(goal, context);
    if (taskId) {
      plan.taskId = taskId;
    }
    return plan;
  }
}
