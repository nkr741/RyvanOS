import { describe, expect, it } from "vitest";
import { validateDefinition } from "./validator.js";
import type { WorkflowDefinition, WorkflowStepDefinition } from "./types.js";

function definition(steps: WorkflowStepDefinition[]): WorkflowDefinition {
  return { id: "wf", name: "Test", version: "1.0.0", steps };
}

const action = (id: string, dependsOn?: string[]): WorkflowStepDefinition => ({
  id,
  name: id,
  kind: "action",
  handler: "noop",
  dependsOn,
});

describe("validateDefinition", () => {
  it("accepts a valid linear definition", () => {
    expect(() => validateDefinition(definition([action("a"), action("b", ["a"])]))).not.toThrow();
  });

  it("rejects an empty step list", () => {
    expect(() => validateDefinition(definition([]))).toThrow(/at least one step/);
  });

  it("rejects duplicate step ids", () => {
    expect(() => validateDefinition(definition([action("a"), action("a")]))).toThrow(
      /duplicate step id/,
    );
  });

  it("rejects a dependency on an unknown step", () => {
    expect(() => validateDefinition(definition([action("a", ["ghost"])]))).toThrow(
      /unknown step "ghost"/,
    );
  });

  it("rejects a self-dependency", () => {
    expect(() => validateDefinition(definition([action("a", ["a"])]))).toThrow(
      /cannot depend on itself/,
    );
  });

  it("rejects a dependency cycle", () => {
    expect(() =>
      validateDefinition(definition([action("a", ["c"]), action("b", ["a"]), action("c", ["b"])])),
    ).toThrow(/dependency cycle/);
  });

  it("requires a handler for action steps", () => {
    expect(() => validateDefinition(definition([{ id: "a", name: "a", kind: "action" }]))).toThrow(
      /handler/,
    );
  });

  it("requires a condition for conditional steps", () => {
    expect(() =>
      validateDefinition(definition([{ id: "a", name: "a", kind: "conditional" }])),
    ).toThrow(/condition/);
  });

  it("requires a reason for approval steps", () => {
    expect(() =>
      validateDefinition(definition([{ id: "a", name: "a", kind: "approval" }])),
    ).toThrow(/reason/);
  });

  it("requires a type for event steps", () => {
    expect(() => validateDefinition(definition([{ id: "a", name: "a", kind: "event" }]))).toThrow(
      /event.type/,
    );
  });

  it("requires a delay or absolute time for schedule steps", () => {
    expect(() =>
      validateDefinition(definition([{ id: "a", name: "a", kind: "schedule" }])),
    ).toThrow(/delayMs/);
  });

  it("rejects an unknown step kind", () => {
    expect(() =>
      validateDefinition(
        definition([{ id: "a", name: "a", kind: "teleport" as never, handler: "noop" }]),
      ),
    ).toThrow(/unknown kind/);
  });
});
