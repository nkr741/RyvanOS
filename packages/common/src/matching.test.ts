import { describe, expect, it } from "vitest";
import {
  applyRange,
  expandPaths,
  getByPath,
  globToRegExp,
  matchesGlob,
  matchesWhere,
} from "./matching.js";

describe("globToRegExp", () => {
  it("treats * as any run of characters, including none", () => {
    expect(globToRegExp("tool:*").test("tool:send_email")).toBe(true);
    expect(globToRegExp("tool:*").test("tool:")).toBe(true);
    expect(globToRegExp("*").test("anything")).toBe(true);
  });

  it("anchors, so a prefix is not a match", () => {
    expect(globToRegExp("tool").test("tool:send")).toBe(false);
    expect(globToRegExp("send").test("tool:send")).toBe(false);
  });

  it("escapes regex metacharacters", () => {
    // Without escaping, "a.b" would match "axb" — a policy rule meant for one
    // action would silently cover others.
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
    expect(globToRegExp("a.b").test("axb")).toBe(false);
    expect(globToRegExp("a+b").test("a+b")).toBe(true);
    expect(globToRegExp("a(b)").test("a(b)")).toBe(true);
  });

  it("matches against any pattern in the list", () => {
    expect(matchesGlob("tool:send", ["mission:*", "tool:*"])).toBe(true);
    expect(matchesGlob("tool:send", ["mission:*"])).toBe(false);
    expect(matchesGlob("tool:send", [])).toBe(false);
  });
});

describe("getByPath", () => {
  const subject = { id: "1", subject: { orgId: "acme", nested: { deep: true } } };

  it("reads a top-level key", () => {
    expect(getByPath(subject, "id")).toBe("1");
  });

  it("reads a nested key by dotted path", () => {
    expect(getByPath(subject, "subject.orgId")).toBe("acme");
    expect(getByPath(subject, "subject.nested.deep")).toBe(true);
  });

  it("yields undefined rather than throwing on a broken path", () => {
    expect(getByPath(subject, "subject.missing.deep")).toBeUndefined();
    expect(getByPath(subject, "id.nope")).toBeUndefined();
    expect(getByPath(undefined, "a.b")).toBeUndefined();
    expect(getByPath(null, "a")).toBeUndefined();
  });
});

describe("expandPaths", () => {
  it("expands a dotted key into the object it describes", () => {
    expect(expandPaths({ "subject.orgId": "acme" })).toEqual({ subject: { orgId: "acme" } });
  });

  it("merges several keys under one parent", () => {
    expect(expandPaths({ "a.b": 1, "a.c": 2 })).toEqual({ a: { b: 1, c: 2 } });
  });

  it("leaves undotted keys alone", () => {
    expect(expandPaths({ status: "active", "a.b": 1 })).toEqual({
      status: "active",
      a: { b: 1 },
    });
  });

  it("handles depth beyond two", () => {
    expect(expandPaths({ "a.b.c": 1 })).toEqual({ a: { b: { c: 1 } } });
  });

  it("agrees with getByPath, which is what keeps the two drivers consistent", () => {
    const flat = { "subject.orgId": "acme" };
    const expanded = expandPaths(flat);

    for (const [path, value] of Object.entries(flat)) {
      expect(getByPath(expanded, path)).toBe(value);
    }
  });
});

describe("matchesWhere", () => {
  const doc = { status: "active", subject: { orgId: "acme" } };

  it("requires every key to match", () => {
    expect(matchesWhere(doc, { status: "active" })).toBe(true);
    expect(matchesWhere(doc, { status: "active", "subject.orgId": "acme" })).toBe(true);
    expect(matchesWhere(doc, { status: "active", "subject.orgId": "globex" })).toBe(false);
  });

  it("matches everything on an empty filter", () => {
    expect(matchesWhere(doc, {})).toBe(true);
  });

  it("does not match an absent field against a value", () => {
    expect(matchesWhere(doc, { missing: "x" })).toBe(false);
  });
});

describe("applyRange", () => {
  const items = [1, 2, 3, 4, 5].map((n) => ({ n, at: n * 100 }));
  const at = (item: { at: number }) => item.at;

  it("returns everything when no options are given", () => {
    expect(applyRange(items, undefined, at)).toHaveLength(5);
    expect(applyRange(items, {}, at)).toHaveLength(5);
  });

  it("applies since and until inclusively", () => {
    expect(applyRange(items, { since: 300 }, at).map((i) => i.n)).toEqual([3, 4, 5]);
    expect(applyRange(items, { until: 300 }, at).map((i) => i.n)).toEqual([1, 2, 3]);
    expect(applyRange(items, { since: 200, until: 400 }, at).map((i) => i.n)).toEqual([2, 3, 4]);
  });

  it("keeps the most recent entries but preserves order", () => {
    // Order matters: the audit ledger walks its result to verify a hash chain,
    // so limiting must drop from the front, not reverse the list.
    expect(applyRange(items, { limit: 2 }, at).map((i) => i.n)).toEqual([4, 5]);
  });

  it("is a no-op when the limit exceeds the list", () => {
    expect(applyRange(items, { limit: 99 }, at)).toHaveLength(5);
  });

  it("applies the window before the limit", () => {
    expect(applyRange(items, { until: 300, limit: 2 }, at).map((i) => i.n)).toEqual([2, 3]);
  });

  it("handles an empty list", () => {
    expect(applyRange([], { since: 1, limit: 5 }, at)).toEqual([]);
  });
});
