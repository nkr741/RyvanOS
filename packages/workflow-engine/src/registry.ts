import { ConflictError, NotFoundError, ValidationError } from "@ryvan/common";
import { validateDefinition } from "./validator.js";
import type { StepHandler, WorkflowDefinition } from "./types.js";

function key(id: string, version: string): string {
  return `${id}@${version}`;
}

/**
 * Holds workflow definitions and the named handlers their steps invoke.
 *
 * Definitions are versioned and immutable: registering the same id+version
 * twice is a conflict. Products publish a new version instead of mutating one
 * that runs in production may still be mid-flight against.
 */
export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly latest = new Map<string, string>();
  private readonly handlers = new Map<string, StepHandler>();

  register(definition: WorkflowDefinition): void {
    validateDefinition(definition);

    const id = key(definition.id, definition.version);
    if (this.definitions.has(id)) {
      throw new ConflictError("WorkflowDefinition", `"${id}" is already registered`);
    }

    this.definitions.set(id, definition);
    this.latest.set(definition.id, definition.version);
  }

  /** Resolves a definition, defaulting to the most recently registered version. */
  get(definitionId: string, version?: string): WorkflowDefinition {
    const resolved = version ?? this.latest.get(definitionId);
    if (!resolved) {
      throw new NotFoundError("WorkflowDefinition", definitionId);
    }

    const definition = this.definitions.get(key(definitionId, resolved));
    if (!definition) {
      throw new NotFoundError("WorkflowDefinition", key(definitionId, resolved));
    }

    return definition;
  }

  has(definitionId: string, version?: string): boolean {
    const resolved = version ?? this.latest.get(definitionId);
    return resolved !== undefined && this.definitions.has(key(definitionId, resolved));
  }

  list(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  registerHandler(name: string, handler: StepHandler): void {
    if (!name) {
      throw new ValidationError("handler.name", "must not be empty");
    }
    if (typeof handler !== "function") {
      throw new ValidationError("handler", "must be a function");
    }
    this.handlers.set(name, handler);
  }

  getHandler(name: string): StepHandler | undefined {
    return this.handlers.get(name);
  }

  handlerNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Reports handler names a definition references but which are not registered.
   * Call before starting a run to fail fast instead of mid-execution.
   */
  missingHandlers(definition: WorkflowDefinition): string[] {
    const missing = new Set<string>();

    for (const step of definition.steps) {
      if (step.handler && !this.handlers.has(step.handler)) {
        missing.add(step.handler);
      }
      if (step.compensate && !this.handlers.has(step.compensate)) {
        missing.add(step.compensate);
      }
    }

    return Array.from(missing);
  }
}
