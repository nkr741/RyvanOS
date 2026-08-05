import { ConflictError, NotFoundError, ValidationError, deepClone } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import type {
  PromptRegistryOptions,
  PromptStore,
  PromptTemplate,
  RenderedPrompt,
} from "./types.js";

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

/**
 * Handlebars-style control syntax: `{{#if}}`, `{{/each}}`, `{{^unless}}`.
 *
 * Rejected rather than ignored. Left alone, `{{#if x}}` is sent to the model
 * as literal text — a silent degradation that looks like a prompt-quality
 * problem rather than the templating mistake it is.
 */
const TEMPLATE_LOGIC = /\{\{\s*[#/^]/;

function rejectTemplateLogic(template: string): void {
  if (TEMPLATE_LOGIC.test(template)) {
    throw new ValidationError(
      "template",
      "control syntax ({{#if}}, {{/each}}) is not supported — compose the value and pass it in",
    );
  }
}

/** Every placeholder a template references, in order of first appearance. */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    found.add(match[1]!);
  }
  return Array.from(found);
}

/**
 * Substitutes `{{variable}}` placeholders.
 *
 * There is deliberately no conditional, loop or expression syntax. A prompt
 * containing logic is code that lives outside the type system, outside review,
 * and outside the test suite — and it is always discovered during an incident
 * rather than before one. Anything needing logic composes the value first and
 * passes it in.
 *
 * A missing variable throws (Article 16). Rendering `{{amount}}` as an empty
 * string produces a plausible prompt that quietly means something else, which
 * is the failure mode this package exists to prevent.
 */
export function render(
  template: string,
  variables: Record<string, string | number | boolean>,
): string {
  rejectTemplateLogic(template);

  const missing: string[] = [];

  const text = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null) {
      missing.push(name);
      return "";
    }
    return String(value);
  });

  if (missing.length > 0) {
    throw new ValidationError("variables", `missing: ${[...new Set(missing)].join(", ")}`);
  }

  return text;
}

/** Process-local template storage. */
export class InMemoryPromptStore implements PromptStore {
  private readonly templates = new Map<string, PromptTemplate>();

  async put(template: PromptTemplate): Promise<void> {
    this.templates.set(`${template.id}@${template.version}`, deepClone(template));
  }

  async get(id: string, version: string): Promise<PromptTemplate | undefined> {
    const template = this.templates.get(`${id}@${version}`);
    return template ? deepClone(template) : undefined;
  }

  async list(id?: string): Promise<PromptTemplate[]> {
    return Array.from(this.templates.values())
      .filter((template) => !id || template.id === id)
      .map((template) => deepClone(template));
  }
}

/**
 * Versioned, immutable prompt storage.
 *
 * Mirrors `WorkflowRegistry` deliberately: same versioning rules, same
 * immutability, same "publish a new version rather than edit" discipline. A
 * platform where workflows and prompts version differently is a platform where
 * someone eventually assumes the wrong one.
 */
export class PromptRegistry {
  private readonly store: PromptStore;
  private readonly latest = new Map<string, string>();
  private readonly logger?: ILogger;

  constructor(options: PromptRegistryOptions = {}) {
    this.store = options.store ?? new InMemoryPromptStore();
    this.logger = options.logger;

    for (const template of options.templates ?? []) {
      // Constructor registration is synchronous by necessity; the in-memory
      // store resolves immediately and a durable one is loaded via `load()`.
      void this.register(template);
    }
  }

  /**
   * Registers a template. Registering the same `id@version` twice is a
   * conflict — publish a new version instead (Article 6).
   */
  async register(template: PromptTemplate): Promise<void> {
    this.validate(template);

    if (await this.store.get(template.id, template.version)) {
      throw new ConflictError(
        "PromptTemplate",
        `"${template.id}@${template.version}" is already registered; publish a new version`,
      );
    }

    await this.store.put(template);
    this.rememberLatest(template);

    this.logger?.debug("Prompt registered", { id: template.id, version: template.version });
  }

  /** Rebuilds the latest-version index from a durable store after a restart. */
  async load(): Promise<number> {
    const templates = await this.store.list();
    for (const template of templates) {
      this.rememberLatest(template);
    }
    return templates.length;
  }

  /** Resolves a template, defaulting to the highest registered version. */
  async get(id: string, version?: string): Promise<PromptTemplate> {
    const resolved = version ?? this.latest.get(id);
    if (!resolved) {
      throw new NotFoundError("PromptTemplate", id);
    }

    const template = await this.store.get(id, resolved);
    if (!template) {
      throw new NotFoundError("PromptTemplate", `${id}@${resolved}`);
    }

    return template;
  }

  /**
   * Renders a template, returning the text **and the version used**.
   *
   * Callers must record the version alongside the output. Without it, "which
   * prompt produced this" is unanswerable the moment a new version ships.
   */
  async render(
    id: string,
    variables: Record<string, string | number | boolean> = {},
    version?: string,
  ): Promise<RenderedPrompt> {
    const template = await this.get(id, version);

    const declared = template.variables ?? extractVariables(template.template);
    const supplied = Object.keys(variables);

    // An unexpected variable is nearly always a typo in its name, which would
    // otherwise surface as a missing-variable error naming a different key.
    const unexpected = supplied.filter((name) => !declared.includes(name));
    if (unexpected.length > 0) {
      throw new ValidationError(
        "variables",
        `unexpected: ${unexpected.join(", ")} (declared: ${declared.join(", ") || "none"})`,
      );
    }

    return {
      promptId: template.id,
      version: template.version,
      text: render(template.template, variables),
      variables: Object.fromEntries(
        Object.entries(variables).map(([key, value]) => [key, String(value)]),
      ),
    };
  }

  async versions(id: string): Promise<string[]> {
    return (await this.store.list(id)).map((template) => template.version).sort(compareVersions);
  }

  async list(): Promise<PromptTemplate[]> {
    return this.store.list();
  }

  private validate(template: PromptTemplate): void {
    if (!template.id) {
      throw new ValidationError("template.id", "must not be empty");
    }
    if (!template.version) {
      throw new ValidationError("template.version", "must not be empty");
    }
    if (!template.template) {
      throw new ValidationError("template.template", "must not be empty");
    }

    // Caught at registration rather than at first use, so the mistake surfaces
    // in a test run instead of in a production prompt.
    rejectTemplateLogic(template.template);

    // A declared list that disagrees with the text is a defect either way:
    // an undeclared placeholder cannot be validated, and a declared-but-unused
    // variable means a caller will be rejected for supplying it.
    if (template.variables) {
      const used = extractVariables(template.template);

      const undeclared = used.filter((name) => !template.variables!.includes(name));
      if (undeclared.length > 0) {
        throw new ValidationError(
          `template.${template.id}.variables`,
          `template uses undeclared variables: ${undeclared.join(", ")}`,
        );
      }

      const unused = template.variables.filter((name) => !used.includes(name));
      if (unused.length > 0) {
        throw new ValidationError(
          `template.${template.id}.variables`,
          `declares unused variables: ${unused.join(", ")}`,
        );
      }
    }
  }

  private rememberLatest(template: PromptTemplate): void {
    const current = this.latest.get(template.id);
    if (!current || compareVersions(template.version, current) > 0) {
      this.latest.set(template.id, template.version);
    }
  }
}

/**
 * Compares dotted versions numerically.
 *
 * String comparison would order "1.10.0" before "1.9.0", so the latest version
 * of a prompt would silently become an older one after the tenth release.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
