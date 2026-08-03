import { NotFoundError, ValidationError } from "@ryvan/common";
import type { Mission, MissionPlan, MissionPlanner } from "./types.js";

export interface MissionTemplate {
  /** Mission type this template satisfies, e.g. "payroll.run". */
  type: string;
  workflowId: string;
  workflowVersion?: string;
  /** Merged under the mission input, so the caller can override any default. */
  defaults?: Record<string, unknown>;
  description?: string;
}

/**
 * Maps a mission type to a registered workflow.
 *
 * This is deliberately not an LLM planner. Most enterprise missions are known
 * shapes, and a deterministic mapping is auditable. A product that needs
 * generated plans implements `MissionPlanner` itself — the port exists for that.
 */
export class TemplateMissionPlanner implements MissionPlanner {
  private readonly templates = new Map<string, MissionTemplate>();

  constructor(templates: MissionTemplate[] = []) {
    for (const template of templates) {
      this.register(template);
    }
  }

  register(template: MissionTemplate): void {
    if (!template.type) {
      throw new ValidationError("template.type", "must not be empty");
    }
    if (!template.workflowId) {
      throw new ValidationError("template.workflowId", "must not be empty");
    }
    this.templates.set(template.type, template);
  }

  list(): MissionTemplate[] {
    return Array.from(this.templates.values());
  }

  plan(mission: Mission): MissionPlan {
    const template = this.templates.get(mission.type);
    if (!template) {
      throw new NotFoundError("MissionTemplate", mission.type);
    }

    return {
      workflowId: template.workflowId,
      workflowVersion: template.workflowVersion,
      input: { ...(template.defaults ?? {}), ...mission.input },
      rationale: template.description ?? `Template for mission type "${mission.type}"`,
    };
  }
}
