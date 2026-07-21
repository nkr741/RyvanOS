import { executorRegistry } from "./registry";
import { playbookRuntime } from "./playbook";
import { seedExecutionRules } from "./rules";
import { proposalExecutor } from "./executors/proposal";
import { emailExecutor } from "./executors/email";
import { meetingExecutor } from "./executors/meeting";
import { crmExecutor } from "./executors/crm";
import type { PlaybookDefinition } from "./types";

const DEFAULT_PLAYBOOKS: PlaybookDefinition[] = [
  {
    id: "acquire-enterprise-client",
    displayName: "Acquire Enterprise Client",
    description:
      "Full acquisition playbook for enterprise prospects  - proposal, outreach, meeting prep, CRM setup",
    version: "1.0",
    domain: "growth",
    stages: [
      {
        id: "proposal",
        name: "Proposal Draft",
        executorType: "proposal",
        approvalRequired: true,
        autoAdvance: false,
      },
      {
        id: "outreach",
        name: "Email & LinkedIn Draft",
        executorType: "email",
        approvalRequired: true,
        autoAdvance: false,
      },
      {
        id: "meeting",
        name: "Meeting Preparation",
        executorType: "meeting",
        approvalRequired: false,
        autoAdvance: true,
      },
      {
        id: "crm",
        name: "CRM Setup",
        executorType: "crm",
        approvalRequired: false,
        autoAdvance: true,
      },
    ],
  },
  {
    id: "acquire-midmarket-client",
    displayName: "Acquire Mid-Market Client",
    description:
      "Streamlined acquisition for mid-market prospects  - outreach first, proposal on demand",
    version: "1.0",
    domain: "growth",
    stages: [
      {
        id: "outreach",
        name: "Email & LinkedIn Draft",
        executorType: "email",
        approvalRequired: true,
        autoAdvance: false,
      },
      {
        id: "meeting",
        name: "Meeting Preparation",
        executorType: "meeting",
        approvalRequired: false,
        autoAdvance: true,
      },
      {
        id: "crm",
        name: "CRM Setup",
        executorType: "crm",
        approvalRequired: false,
        autoAdvance: true,
      },
    ],
  },
  {
    id: "nurture-prospect",
    displayName: "Nurture Prospect",
    description:
      "Gentle nurture sequence for Grade B prospects  - build relationship before pitching",
    version: "1.0",
    domain: "growth",
    stages: [
      {
        id: "outreach",
        name: "Introduction Email",
        executorType: "email",
        approvalRequired: true,
        autoAdvance: false,
      },
      {
        id: "crm",
        name: "Follow-up Schedule",
        executorType: "crm",
        approvalRequired: false,
        autoAdvance: true,
      },
    ],
  },
  {
    id: "qa-automation-pitch",
    displayName: "QA Automation Pitch",
    description:
      "Specialized playbook for QA Automation opportunities  - lead with testing expertise",
    version: "1.0",
    domain: "growth",
    stages: [
      {
        id: "proposal",
        name: "QA Proposal Draft",
        executorType: "proposal",
        approvalRequired: true,
        autoAdvance: false,
      },
      {
        id: "outreach",
        name: "QA-Focused Outreach",
        executorType: "email",
        approvalRequired: true,
        autoAdvance: false,
      },
      {
        id: "meeting",
        name: "QA Deep-Dive Prep",
        executorType: "meeting",
        approvalRequired: false,
        autoAdvance: true,
      },
      {
        id: "crm",
        name: "Pipeline Setup",
        executorType: "crm",
        approvalRequired: false,
        autoAdvance: true,
      },
    ],
  },
];

export function bootstrapExecution(): void {
  executorRegistry.register(proposalExecutor);
  executorRegistry.register(emailExecutor);
  executorRegistry.register(meetingExecutor);
  executorRegistry.register(crmExecutor);

  for (const playbook of DEFAULT_PLAYBOOKS) {
    playbookRuntime.seedPlaybook(playbook).catch((err) => {
      console.error(`[execution] Failed to seed playbook "${playbook.id}":`, err);
    });
  }

  seedExecutionRules().catch((err) => {
    console.error("[execution] Failed to seed execution rules:", err);
  });
}

export { playbookRuntime } from "./playbook";
export { executorRegistry } from "./registry";
export { outcomeEngine } from "./outcome";
export { matchPlaybook, seedExecutionRules } from "./rules";
export type {
  PlaybookDefinition,
  PlaybookStage,
  Executor,
  ExecutorInput,
  ExecutorOutput,
  OutcomeData,
} from "./types";
