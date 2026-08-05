/**
 * A prompt template.
 *
 * Declarative, serialisable, versioned and immutable — Constitution Article 6.
 * A prompt is behaviour: it decides what a model does. Treating it as data
 * rather than as a string literal in code is what makes it diffable,
 * reviewable, attributable in a trace, and replayable in an evaluation.
 */
export interface PromptTemplate {
  id: string;
  /** Semantic version. `id@version` is unique and may never be redefined. */
  version: string;
  /** Template text. `{{variable}}` placeholders only — no logic. See `render`. */
  template: string;
  /**
   * Variables the template requires. Declared rather than inferred, so a
   * template can be validated at registration instead of at first use.
   */
  variables?: string[];
  description?: string;
  /** Free-form labels — owner, product, evaluation set. */
  metadata?: Record<string, unknown>;
}

/**
 * A rendered prompt, carrying the version it came from.
 *
 * The version travels with the text because it must reach the span and the
 * audit entry. "Which prompt produced this answer" is unanswerable afterwards
 * unless the answer was recorded at the time.
 */
export interface RenderedPrompt {
  promptId: string;
  version: string;
  text: string;
  /** The values used, for replay. */
  variables: Record<string, string>;
}

export interface PromptStore {
  put(template: PromptTemplate): Promise<void>;
  get(id: string, version: string): Promise<PromptTemplate | undefined>;
  list(id?: string): Promise<PromptTemplate[]>;
}

export interface PromptRegistryOptions {
  store?: PromptStore;
  templates?: PromptTemplate[];
  logger?: import("@ryvan/common").ILogger;
}
