import { eventBus } from "@/cortex/runtime/event";
import { intelligenceEngine } from "./engine";
import { relationshipEngine } from "./relationships";
import { seedInferenceRules } from "./inference";

export function bootstrapIntelligence(): void {
  seedInferenceRules().catch((err) => {
    console.error("[intelligence] Failed to seed inference rules:", err);
  });

  eventBus.subscribe("prospect.created.v1", async (event) => {
    const { prospectId } = event.payload as { prospectId: string };
    try {
      await intelligenceEngine.requestIntelligence(prospectId, "prospect.created.v1");
    } catch (err) {
      console.error(
        `[intelligence] Failed to gather intelligence for prospect ${prospectId}:`,
        err,
      );
    }
  });

  eventBus.subscribe("account.intelligence.completed.v1", async (event) => {
    const { prospectId } = event.payload as { prospectId: string };
    try {
      await relationshipEngine.buildGraph(prospectId);
      await relationshipEngine.detectCrossCompanyPatterns();
    } catch (err) {
      console.error(
        `[intelligence] Failed to build relationship graph for prospect ${prospectId}:`,
        err,
      );
    }
  });
}

export { intelligenceEngine } from "./engine";
export { relationshipEngine } from "./relationships";
export { runInference, seedInferenceRules } from "./inference";
