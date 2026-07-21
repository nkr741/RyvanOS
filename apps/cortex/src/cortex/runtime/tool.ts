/**
 * Tool Registry — AIOS adapter layer.
 *
 * Bridges Cortex's CortexTool interface to @ryvan/tool-registry ToolService.
 * When a tool is registered here, it's also registered in AIOS ToolService
 * so tools are available through both Cortex and AIOS paths.
 *
 * API surface is UNCHANGED — consumers import { toolRegistry } and call
 * register(), get(), list(), has(), execute() as before.
 */

import type { ToolService } from "@ryvan/tool-registry";
import { getAIOS } from "../../lib/aios";

// ─── Types (unchanged — consumers depend on these) ─────────────

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface CortexTool {
  id: string;
  name: string;
  description: string;
  version: string;
  execute(input: ToolInput): Promise<ToolOutput>;
}

// ─── Adapter class ─────────────────────────────────────────────

class ToolRegistryAdapter {
  private tools = new Map<string, CortexTool>();
  private aiosService: ToolService | null = null;

  private getAIOSService(): ToolService | null {
    if (!this.aiosService) {
      try {
        this.aiosService = getAIOS().container.resolve<ToolService>("tools");
      } catch {
        return null;
      }
    }
    return this.aiosService;
  }

  register(tool: CortexTool): void {
    this.tools.set(tool.id, tool);

    const aios = this.getAIOSService();
    if (aios) {
      try {
        aios.register(
          {
            name: tool.id,
            description: tool.description,
            version: tool.version,
            category: "cortex",
            parameters: [],
            returns: { type: "object", description: "Tool output" },
            permissions: [],
            timeout: 30000,
            retryable: false,
          },
          async (ctx) => {
            const result = await tool.execute(ctx.input);
            return {
              success: result.success,
              output: result.data,
              error: result.error,
              executionTimeMs: 0,
            };
          },
        );
      } catch {
        // AIOS registration failed — tool still works via local registry
      }
    }
  }

  get(id: string): CortexTool | undefined {
    return this.tools.get(id);
  }

  list(): CortexTool[] {
    return Array.from(this.tools.values());
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  async execute(toolId: string, input: ToolInput): Promise<ToolOutput> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { success: false, data: null, error: `Tool '${toolId}' not found` };
    }
    try {
      return await tool.execute(input);
    } catch (err) {
      console.error(`[tool-registry] Tool '${toolId}' execution failed:`, err);
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "Tool execution failed",
      };
    }
  }
}

export const toolRegistry = new ToolRegistryAdapter();
