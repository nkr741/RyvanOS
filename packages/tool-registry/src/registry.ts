import { ConflictError, ValidationError } from "@ryvan/common";
import type { ToolDefinition, ToolHandler } from "./types.js";

export class ToolRegistry {
  private definitions = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (!definition.name || !definition.name.trim()) {
      throw new ValidationError("name", "tool name must not be empty");
    }
    if (this.definitions.has(definition.name)) {
      throw new ConflictError(definition.name, "tool already registered");
    }
    this.definitions.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  unregister(name: string): boolean {
    const existed = this.definitions.delete(name);
    this.handlers.delete(name);
    return existed;
  }

  get(name: string): ToolDefinition | undefined {
    return this.definitions.get(name);
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  list(filter?: { category?: string; search?: string }): ToolDefinition[] {
    let tools = Array.from(this.definitions.values());

    if (filter?.category) {
      const cat = filter.category;
      tools = tools.filter((t) => t.category === cat);
    }

    if (filter?.search) {
      const term = filter.search.toLowerCase();
      tools = tools.filter(
        (t) => t.name.toLowerCase().includes(term) || t.description.toLowerCase().includes(term),
      );
    }

    return tools;
  }

  toModelFormat(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return Array.from(this.definitions.values()).map((def) => ({
      name: def.name,
      description: def.description,
      parameters: this.toJsonSchema(def),
    }));
  }

  private toJsonSchema(def: ToolDefinition): Record<string, unknown> {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const param of def.parameters) {
      const prop: Record<string, unknown> = {
        type: param.type,
        description: param.description,
      };

      if (param.enum !== undefined) {
        prop.enum = param.enum;
      }

      if (param.default !== undefined) {
        prop.default = param.default;
      }

      if (param.schema !== undefined) {
        Object.assign(prop, param.schema);
      }

      properties[param.name] = prop;

      if (param.required) {
        required.push(param.name);
      }
    }

    const schema: Record<string, unknown> = {
      type: "object",
      properties,
    };

    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }
}
