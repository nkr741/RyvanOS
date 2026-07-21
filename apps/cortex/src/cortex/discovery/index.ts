import { discoveryEngine } from "./engine";
import { manualProvider } from "./providers/manual";
import { csvProvider } from "./providers/csv";
import { websiteProvider } from "./providers/website";
import { autonomousProvider } from "./providers/autonomous";
import { apolloProvider } from "./providers/apollo";
import { theCompaniesApiProvider } from "./providers/thecompaniesapi";

export function bootstrapDiscovery(): void {
  discoveryEngine.register(manualProvider);
  discoveryEngine.register(csvProvider);
  discoveryEngine.register(websiteProvider);
  discoveryEngine.register(autonomousProvider);
  discoveryEngine.register(apolloProvider);
  discoveryEngine.register(theCompaniesApiProvider);
}

export { discoveryEngine } from "./engine";
export type {
  DiscoveryProvider,
  DiscoveryProviderManifest,
  CompanyCandidateData,
  SignalData,
  DiscoveryResult,
  ProviderCapabilities,
} from "./types";
