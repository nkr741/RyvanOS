export { bootstrap, createPlatform } from "./bootstrap.js";
export {
  policyApprovalGate,
  workflowRunner,
  missionPolicyGate,
  connectorPolicyGate,
  connectorResilienceGate,
} from "./adapters.js";
export { consoleSources } from "./console-sources.js";
export type { Platform, PlatformConfig, PlatformContainer, PlatformStatus } from "./types.js";
