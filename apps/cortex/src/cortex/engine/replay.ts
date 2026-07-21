import { prisma } from "@/lib/prisma";
import { type CortexEventData, eventBus } from "../runtime/event";

// ─── Mission Replay ─────────────────────────────────────────────
// Every mission is reproducible from its event history.
// Replay in dev to inspect every decision and understand divergence.

export interface MissionReplayData {
  missionId: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  steps: MissionStepReplay[];
  events: CortexEventData[];
  timeline: TimelineEntry[];
}

export interface MissionStepReplay {
  id: string;
  sequence: number;
  agentId: string;
  title: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  reasoning: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  durationMs: number | null;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface TimelineEntry {
  timestamp: string;
  type: "event" | "step_start" | "step_complete" | "step_fail" | "approval" | "mission_status";
  title: string;
  detail: string;
  agentId?: string;
  stepSequence?: number;
}

export async function replayMission(missionId: string): Promise<MissionReplayData> {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: {
      steps: {
        orderBy: { sequence: "asc" },
        include: {
          approvedBy: { select: { name: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!mission) throw new Error("Mission not found");

  const events = await eventBus.replay(missionId);

  const steps: MissionStepReplay[] = mission.steps.map(s => {
    let durationMs: number | null = null;
    if (s.startedAt && s.completedAt) {
      durationMs = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
    }

    return {
      id: s.id,
      sequence: s.sequence,
      agentId: s.agentId,
      title: s.title,
      status: s.status,
      input: JSON.parse(s.input) as Record<string, unknown>,
      output: s.output ? JSON.parse(s.output) as Record<string, unknown> : null,
      reasoning: s.reasoning,
      startedAt: s.startedAt?.toISOString() || null,
      completedAt: s.completedAt?.toISOString() || null,
      error: s.error,
      durationMs,
      approvalRequired: s.approvalRequired,
      approvedBy: s.approvedBy?.name || null,
      approvedAt: s.approvedAt?.toISOString() || null,
    };
  });

  const timeline: TimelineEntry[] = [];

  timeline.push({
    timestamp: mission.createdAt.toISOString(),
    type: "mission_status",
    title: "Mission Created",
    detail: `"${mission.title}" created by ${mission.createdBy.name}`,
  });

  for (const step of steps) {
    if (step.startedAt) {
      timeline.push({
        timestamp: step.startedAt,
        type: "step_start",
        title: `Step ${step.sequence}: ${step.title}`,
        detail: `Agent: ${step.agentId}`,
        agentId: step.agentId,
        stepSequence: step.sequence,
      });
    }
    if (step.completedAt && step.status === "completed") {
      timeline.push({
        timestamp: step.completedAt,
        type: "step_complete",
        title: `Step ${step.sequence} completed`,
        detail: step.durationMs ? `${step.durationMs}ms` : "completed",
        agentId: step.agentId,
        stepSequence: step.sequence,
      });
    }
    if (step.status === "failed" && step.completedAt) {
      timeline.push({
        timestamp: step.completedAt,
        type: "step_fail",
        title: `Step ${step.sequence} failed`,
        detail: step.error || "Unknown error",
        agentId: step.agentId,
        stepSequence: step.sequence,
      });
    }
    if (step.approvedAt) {
      timeline.push({
        timestamp: step.approvedAt,
        type: "approval",
        title: `Approval for Step ${step.sequence}`,
        detail: `${step.status === "failed" ? "Denied" : "Granted"} by ${step.approvedBy || "system"}`,
        agentId: step.agentId,
        stepSequence: step.sequence,
      });
    }
  }

  for (const evt of events) {
    timeline.push({
      timestamp: evt.timestamp || "",
      type: "event",
      title: evt.type,
      detail: JSON.stringify(evt.payload).slice(0, 200),
    });
  }

  timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (mission.completedAt) {
    timeline.push({
      timestamp: mission.completedAt.toISOString(),
      type: "mission_status",
      title: `Mission ${mission.status === "completed" ? "Completed" : mission.status}`,
      detail: `Final status: ${mission.status}`,
    });
  }

  return {
    missionId: mission.id,
    title: mission.title,
    type: mission.type,
    status: mission.status,
    createdAt: mission.createdAt.toISOString(),
    completedAt: mission.completedAt?.toISOString() || null,
    config: JSON.parse(mission.config) as Record<string, unknown>,
    result: mission.result ? JSON.parse(mission.result) as Record<string, unknown> : null,
    steps,
    events,
    timeline,
  };
}
