import { describe, expect, it } from "vitest";
import {
  InMemoryPromptStore,
  PromptRegistry,
  compareVersions,
  extractVariables,
  render,
} from "./registry.js";
import type { PromptTemplate } from "./types.js";

const summarise: PromptTemplate = {
  id: "payroll.summarise",
  version: "1.0.0",
  template: "Summarise payroll for {{month}} in {{org}}.",
  variables: ["month", "org"],
};

describe("render", () => {
  it("substitutes placeholders", () => {
    expect(render("Hello {{name}}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(render("Hello {{  name  }}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("substitutes every occurrence", () => {
    expect(render("{{a}} and {{a}}", { a: "x" })).toBe("x and x");
  });

  it("coerces numbers and booleans", () => {
    expect(render("{{n}}/{{b}}", { n: 7, b: false })).toBe("7/false");
  });

  it("throws rather than rendering a missing variable as empty", () => {
    // An empty substitution produces a plausible prompt that quietly means
    // something else — the exact failure this package exists to prevent.
    expect(() => render("Pay {{amount}} to {{who}}", { who: "Ada" })).toThrow(/amount/);
  });

  it("names every missing variable at once", () => {
    expect(() => render("{{a}} {{b}}", {})).toThrow(/a, b/);
  });

  it("treats null as missing", () => {
    expect(() => render("{{a}}", { a: null as unknown as string })).toThrow(/a/);
  });

  it("leaves text with no placeholders untouched", () => {
    expect(render("plain text", {})).toBe("plain text");
  });

  it("has no conditional or loop syntax", () => {
    // A prompt containing logic is code outside the type system, outside
    // review, and outside the tests. Unknown syntax is left as literal text
    // rather than silently interpreted.
    const template = "{{#if x}}yes{{/if}}";
    expect(() => render(template, {})).toThrow();
  });
});

describe("extractVariables", () => {
  it("finds each variable once, in order", () => {
    expect(extractVariables("{{b}} {{a}} {{b}}")).toEqual(["b", "a"]);
  });

  it("returns nothing for a static template", () => {
    expect(extractVariables("static")).toEqual([]);
  });

  it("supports dotted names", () => {
    expect(extractVariables("{{subject.orgId}}")).toEqual(["subject.orgId"]);
  });
});

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    // "1.10.0" < "1.9.0" as strings, which would silently make the latest
    // prompt an older one after the tenth release.
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("treats absent segments as zero", () => {
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
  });
});

describe("PromptRegistry", () => {
  it("registers and renders", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);

    const rendered = await registry.render("payroll.summarise", { month: "July", org: "Acme" });

    expect(rendered.text).toBe("Summarise payroll for July in Acme.");
    expect(rendered.promptId).toBe("payroll.summarise");
    expect(rendered.version).toBe("1.0.0");
  });

  it("returns the version used, for the trace", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);
    await registry.register({ ...summarise, version: "2.0.0", template: "v2 {{month}} {{org}}" });

    // "Which prompt produced this answer" is unanswerable afterwards unless
    // the answer was recorded at the time.
    expect((await registry.render("payroll.summarise", { month: "J", org: "A" })).version).toBe(
      "2.0.0",
    );
  });

  it("records the values used, for replay", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);

    const rendered = await registry.render("payroll.summarise", { month: "July", org: "Acme" });

    expect(rendered.variables).toEqual({ month: "July", org: "Acme" });
  });

  it("refuses to redefine a version", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);

    await expect(
      registry.register({ ...summarise, template: "different {{month}} {{org}}" }),
    ).rejects.toThrow(/already registered/);
  });

  it("pins an explicit version", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);
    await registry.register({ ...summarise, version: "2.0.0", template: "v2 {{month}} {{org}}" });

    const pinned = await registry.render("payroll.summarise", { month: "J", org: "A" }, "1.0.0");

    expect(pinned.text).toContain("Summarise payroll");
  });

  it("orders versions numerically when choosing the latest", async () => {
    const registry = new PromptRegistry();
    for (const version of ["1.0.0", "1.9.0", "1.10.0"]) {
      await registry.register({ ...summarise, version, template: `${version} {{month}} {{org}}` });
    }

    expect((await registry.render("payroll.summarise", { month: "m", org: "o" })).version).toBe(
      "1.10.0",
    );
  });

  it("throws for an unknown prompt or version", async () => {
    const registry = new PromptRegistry();

    await expect(registry.render("nope")).rejects.toThrow();
    await registry.register(summarise);
    await expect(registry.render("payroll.summarise", {}, "9.9.9")).rejects.toThrow();
  });

  it("rejects a supplied variable the template does not declare", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);

    // Nearly always a typo, which would otherwise surface as a missing-variable
    // error naming a different key.
    await expect(
      registry.render("payroll.summarise", { month: "J", org: "A", moth: "typo" }),
    ).rejects.toThrow(/unexpected: moth/);
  });

  it("rejects a template using an undeclared placeholder", async () => {
    const registry = new PromptRegistry();

    await expect(
      registry.register({
        id: "bad",
        version: "1.0.0",
        template: "{{declared}} and {{surprise}}",
        variables: ["declared"],
      }),
    ).rejects.toThrow(/undeclared variables: surprise/);
  });

  it("rejects a template declaring a variable it never uses", async () => {
    const registry = new PromptRegistry();

    // A caller supplying it would be rejected as unexpected — a contradiction
    // that is cheaper to catch at registration than at first use.
    await expect(
      registry.register({
        id: "bad",
        version: "1.0.0",
        template: "{{used}}",
        variables: ["used", "never"],
      }),
    ).rejects.toThrow(/unused variables: never/);
  });

  it("infers variables when none are declared", async () => {
    const registry = new PromptRegistry();
    await registry.register({ id: "inferred", version: "1.0.0", template: "Hi {{name}}" });

    expect((await registry.render("inferred", { name: "Ada" })).text).toBe("Hi Ada");
  });

  it("rejects a malformed template", async () => {
    const registry = new PromptRegistry();

    await expect(registry.register({ id: "", version: "1", template: "x" })).rejects.toThrow();
    await expect(registry.register({ id: "a", version: "", template: "x" })).rejects.toThrow();
    await expect(registry.register({ id: "a", version: "1", template: "" })).rejects.toThrow();
  });

  it("renders deterministically", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);

    const first = await registry.render("payroll.summarise", { month: "July", org: "Acme" });
    const second = await registry.render("payroll.summarise", { month: "July", org: "Acme" });

    expect(first).toEqual(second);
  });

  it("lists versions in order", async () => {
    const registry = new PromptRegistry();
    for (const version of ["1.10.0", "1.0.0", "1.9.0"]) {
      await registry.register({ ...summarise, version, template: `${version} {{month}} {{org}}` });
    }

    expect(await registry.versions("payroll.summarise")).toEqual(["1.0.0", "1.9.0", "1.10.0"]);
  });

  it("recovers its latest-version index from a durable store", async () => {
    const store = new InMemoryPromptStore();

    const before = new PromptRegistry({ store });
    await before.register(summarise);
    await before.register({ ...summarise, version: "2.0.0", template: "v2 {{month}} {{org}}" });

    // A fresh registry over the same store, as after a restart.
    const after = new PromptRegistry({ store });
    expect(await after.load()).toBe(2);
    expect((await after.render("payroll.summarise", { month: "m", org: "o" })).version).toBe(
      "2.0.0",
    );
  });

  it("does not let a caller mutate a stored template", async () => {
    const registry = new PromptRegistry();
    await registry.register(summarise);

    const fetched = await registry.get("payroll.summarise");
    fetched.template = "tampered {{month}} {{org}}";

    expect((await registry.get("payroll.summarise")).template).toContain("Summarise payroll");
  });
});
