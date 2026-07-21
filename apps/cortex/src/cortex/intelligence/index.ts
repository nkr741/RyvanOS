import { eventBus } from "@/cortex/runtime/event";
import { intelligenceEngine } from "./engine";
import { relationshipEngine } from "./relationships";
import { seedInferenceRules } from "./inference";
import { createLogger } from "@/lib/logger";

const log = createLogger("intelligence");

export function bootstrapIntelligence(): void {
  seedInferenceRules().catch((err) => {
    log.error({ err: err instanceof Error ? err.message : err }, "failed to seed inference rules");
  });

  eventBus.subscribe("prospect.created.v1", async (event) => {
    const { prospectId } = event.payload as { prospectId: string };
    try {
      await intelligenceEngine.requestIntelligence(prospectId, "prospect.created.v1");
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : err, prospectId },
        "failed to gather intelligence for prospect",
      );
    }
  });

  eventBus.subscribe("account.intelligence.completed.v1", async (event) => {
    const { prospectId } = event.payload as { prospectId: string };
    try {
      await relationshipEngine.buildGraph(prospectId);
      await relationshipEngine.detectCrossCompanyPatterns();
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : err, prospectId },
        "failed to build relationship graph",
      );
    }
  });
}

export { intelligenceEngine } from "./engine";
export { relationshipEngine } from "./relationships";
export { runInference, seedInferenceRules } from "./inference";
