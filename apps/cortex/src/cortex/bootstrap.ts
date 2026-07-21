import { agentRegistry } from "./runtime/registry";
import { toolRegistry, type ToolInput, type ToolOutput } from "./runtime/tool";
import { ResearchAgent } from "./agents/research-agent";
import { ProposalAgent } from "./agents/proposal-agent";
import { CRMAgent } from "./agents/crm-agent";
import { NotificationAgent } from "./agents/notification-agent";
import { GrowthAgent } from "./agents/growth-agent";
import { OutreachAgent } from "./agents/outreach-agent";
import {
  WebsiteCollector,
  TechnologyCollector,
  HiringCollector,
  NewsCollector,
  PeopleCollector,
  BuyingSignalCollector,
  EvidenceSynthesis,
} from "./intelligence/company";
import { bootstrapDiscovery } from "./discovery";
import { bootstrapIntelligence } from "./intelligence";
import { bootstrapExecution } from "./execution";

let initialized = false;

export function bootstrapCAO(): void {
  if (initialized) return;

  // Register tools
  toolRegistry.register({
    id: "ai-engine",
    name: "AI Decision Engine",
    description: "Cortex AI scoring, predictions, and recommendations",
    version: "1.0",
    execute: async (input: ToolInput): Promise<ToolOutput> => {
      return { success: true, data: { tool: "ai-engine", input } };
    },
  });

  toolRegistry.register({
    id: "database",
    name: "Database",
    description: "Prisma database access",
    version: "1.0",
    execute: async (input: ToolInput): Promise<ToolOutput> => {
      return { success: true, data: { tool: "database", input } };
    },
  });

  // Register agents
  agentRegistry.register(new ResearchAgent());
  agentRegistry.register(new ProposalAgent());
  agentRegistry.register(new CRMAgent());
  agentRegistry.register(new NotificationAgent());
  agentRegistry.register(new GrowthAgent());
  agentRegistry.register(new OutreachAgent());

  // Company Intelligence Evidence Collectors
  agentRegistry.register(new WebsiteCollector());
  agentRegistry.register(new TechnologyCollector());
  agentRegistry.register(new HiringCollector());
  agentRegistry.register(new NewsCollector());
  agentRegistry.register(new PeopleCollector());
  agentRegistry.register(new BuyingSignalCollector());
  agentRegistry.register(new EvidenceSynthesis());

  bootstrapDiscovery();
  bootstrapIntelligence();
  bootstrapExecution();

  initialized = true;
}
