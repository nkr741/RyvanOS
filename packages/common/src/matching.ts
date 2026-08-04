const REGEX_SPECIALS = /[.+?^${}()|[\]\\]/g;

/**
 * Converts a glob pattern into an anchored RegExp. Only `*` is special — it
 * matches any run of characters, including none. Everything else is escaped,
 * so `a.b` matches the literal string and not `axb`.
 *
 * Shared because policy rules (`tool:*`) and key/value keyspaces (`session:*`)
 * must agree on what a pattern means; two implementations would eventually
 * disagree on an edge case and the difference would be a security bug.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(REGEX_SPECIALS, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesGlob(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

/**
 * Reads a possibly-nested property by dotted path — `"subject.orgId"`.
 * A path that runs into a non-object yields undefined rather than throwing.
 */
export function getByPath(source: unknown, path: string): unknown {
  if (!path.includes(".")) {
    return source && typeof source === "object"
      ? (source as Record<string, unknown>)[path]
      : undefined;
  }

  return path.split(".").reduce<unknown>((value, part) => {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)[part]
      : undefined;
  }, source);
}

/**
 * Expands dotted keys into the nested object they describe:
 * `{ "subject.orgId": "acme" }` becomes `{ subject: { orgId: "acme" } }`.
 *
 * Used to turn a flat filter into a shape a document store can match against
 * structurally (Postgres `@>` containment, for instance).
 */
export function expandPaths(flat: Record<string, unknown>): Record<string, unknown> {
  const nested: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes(".")) {
      nested[key] = value;
      continue;
    }

    const parts = key.split(".");
    let cursor = nested;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (typeof cursor[part] !== "object" || cursor[part] === null) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1]!] = value;
  }

  return nested;
}

/** True when every key in `where` matches the value at that path on `subject`. */
export function matchesWhere(subject: unknown, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (getByPath(subject, key) !== expected) return false;
  }
  return true;
}

export interface RangeOptions {
  since?: number;
  until?: number;
  limit?: number;
}

/**
 * Applies a time window and a count cap to an ordered list.
 *
 * `limit` keeps the most *recent* entries while preserving the list's existing
 * order — dropping from the front rather than the back. Anything that walks a
 * sequence, such as the audit hash chain, depends on that ordering surviving.
 */
export function applyRange<T>(
  items: T[],
  options: RangeOptions | undefined,
  timestampOf: (item: T) => number,
): T[] {
  if (!options) return items;

  let result = items;

  if (options.since !== undefined) {
    result = result.filter((item) => timestampOf(item) >= options.since!);
  }
  if (options.until !== undefined) {
    result = result.filter((item) => timestampOf(item) <= options.until!);
  }
  if (options.limit !== undefined && result.length > options.limit) {
    result = result.slice(-options.limit);
  }

  return result;
}
