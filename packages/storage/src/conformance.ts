import { describe, expect, it } from "vitest";
import type { DocumentStore, KeyValueStore, VectorStore } from "./types.js";

/**
 * Shared conformance suites.
 *
 * Every driver runs the same assertions, which is the only way "swap Redis for
 * a map in tests" is a safe claim rather than a hopeful one. A behaviour that
 * differs between drivers shows up here instead of in production.
 *
 * Not named `*.test.ts` so vitest does not collect it on its own.
 */

export function keyValueConformance(name: string, create: () => Promise<KeyValueStore>): void {
  describe(`KeyValueStore conformance: ${name}`, () => {
    it("round-trips a structured value", async () => {
      const store = await create();
      await store.set("user:1", { id: 1, roles: ["admin"], nested: { ok: true } });

      expect(await store.get("user:1")).toEqual({
        id: 1,
        roles: ["admin"],
        nested: { ok: true },
      });
    });

    it("returns undefined for a missing key", async () => {
      expect(await (await create()).get("nope")).toBeUndefined();
    });

    it("reports presence", async () => {
      const store = await create();
      await store.set("a", 1);

      expect(await store.has("a")).toBe(true);
      expect(await store.has("b")).toBe(false);
    });

    it("deletes", async () => {
      const store = await create();
      await store.set("a", 1);

      expect(await store.delete("a")).toBe(true);
      expect(await store.delete("a")).toBe(false);
      expect(await store.get("a")).toBeUndefined();
    });

    it("expires a key after its ttl", async () => {
      const store = await create();
      await store.set("short", "value", { ttlMs: 60 });

      expect(await store.get("short")).toBe("value");
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(await store.get("short")).toBeUndefined();
      expect(await store.has("short")).toBe(false);
    });

    it("honours ifNotExists", async () => {
      const store = await create();

      expect(await store.set("once", "first", { ifNotExists: true })).toBe(true);
      expect(await store.set("once", "second", { ifNotExists: true })).toBe(false);
      expect(await store.get("once")).toBe("first");
    });

    it("increments atomically from absent", async () => {
      const store = await create();

      expect(await store.increment("hits")).toBe(1);
      expect(await store.increment("hits", 4)).toBe(5);
      expect(await store.increment("hits", -2)).toBe(3);
    });

    it("does not lose concurrent increments", async () => {
      const store = await create();

      await Promise.all(Array.from({ length: 50 }, () => store.increment("counter")));

      expect(await store.increment("counter", 0)).toBe(50);
    });

    it("lists keys by glob", async () => {
      const store = await create();
      await store.set("session:a", 1);
      await store.set("session:b", 2);
      await store.set("other:c", 3);

      expect((await store.keys("session:*")).sort()).toEqual(["session:a", "session:b"]);
    });

    it("clears by pattern and reports how many went", async () => {
      const store = await create();
      await store.set("tmp:a", 1);
      await store.set("tmp:b", 2);
      await store.set("keep:c", 3);

      expect(await store.clear("tmp:*")).toBe(2);
      expect(await store.get("tmp:a")).toBeUndefined();
      expect(await store.get("keep:c")).toBe(3);
    });
  });
}

export function documentConformance(name: string, create: () => Promise<DocumentStore>): void {
  describe(`DocumentStore conformance: ${name}`, () => {
    const doc = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      status: "active",
      createdAt: 1,
      ...extra,
    });

    it("round-trips a document", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { subject: { orgId: "acme" } }));

      expect(await store.get("missions", "m1")).toMatchObject({
        id: "m1",
        subject: { orgId: "acme" },
      });
    });

    it("overwrites on repeat put", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { status: "active" }));
      await store.put("missions", doc("m1", { status: "completed" }));

      expect(await store.get<{ status: string }>("missions", "m1")).toMatchObject({
        status: "completed",
      });
      expect(await store.count("missions")).toBe(1);
    });

    it("returns undefined for a missing document", async () => {
      expect(await (await create()).get("missions", "ghost")).toBeUndefined();
    });

    it("keeps collections separate", async () => {
      const store = await create();
      await store.put("missions", doc("shared"));
      await store.put("workflows", doc("shared", { status: "other" }));

      expect(await store.count("missions")).toBe(1);
      expect(await store.count("workflows")).toBe(1);
    });

    it("filters by exact field equality", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { status: "active" }));
      await store.put("missions", doc("m2", { status: "completed" }));

      const found = await store.find<{ id: string }>("missions", {
        where: { status: "completed" },
      });

      expect(found.map((m) => m.id)).toEqual(["m2"]);
    });

    it("filters on a nested field by dotted path", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { subject: { orgId: "acme" } }));
      await store.put("missions", doc("m2", { subject: { orgId: "globex" } }));

      const found = await store.find<{ id: string }>("missions", {
        where: { "subject.orgId": "acme" },
      });

      expect(found.map((m) => m.id)).toEqual(["m1"]);
    });

    it("counts with and without a filter", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { status: "active" }));
      await store.put("missions", doc("m2", { status: "active" }));
      await store.put("missions", doc("m3", { status: "failed" }));

      expect(await store.count("missions")).toBe(3);
      expect(await store.count("missions", { where: { status: "active" } })).toBe(2);
    });

    it("orders, limits, and offsets", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { createdAt: 3 }));
      await store.put("missions", doc("m2", { createdAt: 1 }));
      await store.put("missions", doc("m3", { createdAt: 2 }));

      const ascending = await store.find<{ id: string }>("missions", { orderBy: "createdAt" });
      expect(ascending.map((m) => m.id)).toEqual(["m2", "m3", "m1"]);

      const descending = await store.find<{ id: string }>("missions", {
        orderBy: "createdAt",
        direction: "desc",
      });
      expect(descending.map((m) => m.id)).toEqual(["m1", "m3", "m2"]);

      const page = await store.find<{ id: string }>("missions", {
        orderBy: "createdAt",
        limit: 1,
        offset: 1,
      });
      expect(page.map((m) => m.id)).toEqual(["m3"]);
    });

    it("deletes", async () => {
      const store = await create();
      await store.put("missions", doc("m1"));

      expect(await store.delete("missions", "m1")).toBe(true);
      expect(await store.delete("missions", "m1")).toBe(false);
      expect(await store.get("missions", "m1")).toBeUndefined();
    });

    it("does not let a caller mutate stored state through a returned document", async () => {
      const store = await create();
      await store.put("missions", doc("m1", { status: "active" }));

      const fetched = await store.get<{ status: string }>("missions", "m1");
      fetched!.status = "tampered";

      expect(await store.get<{ status: string }>("missions", "m1")).toMatchObject({
        status: "active",
      });
    });
  });
}

export function vectorConformance(
  name: string,
  create: () => Promise<VectorStore>,
  dimensions: number,
): void {
  describe(`VectorStore conformance: ${name}`, () => {
    /** A unit vector pointing along one axis, padded to the driver's width. */
    const axis = (index: number): number[] =>
      Array.from({ length: dimensions }, (_, i) => (i === index ? 1 : 0));

    /** Halfway between two axes — similar to both, identical to neither. */
    const between = (a: number, b: number): number[] =>
      Array.from({ length: dimensions }, (_, i) => (i === a || i === b ? 0.7071 : 0));

    it("upserts and finds the nearest vector", async () => {
      const store = await create();
      await store.upsert("docs", [
        { id: "a", embedding: axis(0), content: "alpha" },
        { id: "b", embedding: axis(1), content: "beta" },
      ]);

      const [top] = await store.query("docs", { embedding: axis(0), topK: 1 });

      expect(top?.id).toBe("a");
      expect(top?.content).toBe("alpha");
      expect(top?.score).toBeCloseTo(1, 5);
    });

    it("ranks by similarity", async () => {
      const store = await create();
      await store.upsert("docs", [
        { id: "same", embedding: axis(0) },
        { id: "near", embedding: between(0, 1) },
        { id: "far", embedding: axis(2) },
      ]);

      const results = await store.query("docs", { embedding: axis(0), topK: 3 });

      expect(results.map((r) => r.id)).toEqual(["same", "near", "far"]);
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
      expect(results[1]!.score).toBeGreaterThan(results[2]!.score);
    });

    it("honours topK", async () => {
      const store = await create();
      await store.upsert("docs", [
        { id: "a", embedding: axis(0) },
        { id: "b", embedding: axis(1) },
        { id: "c", embedding: axis(2) },
      ]);

      expect(await store.query("docs", { embedding: axis(0), topK: 2 })).toHaveLength(2);
    });

    it("filters on metadata before ranking", async () => {
      const store = await create();
      await store.upsert("docs", [
        { id: "acme", embedding: axis(0), metadata: { orgId: "acme" } },
        { id: "globex", embedding: axis(0), metadata: { orgId: "globex" } },
      ]);

      const results = await store.query("docs", {
        embedding: axis(0),
        filter: { orgId: "acme" },
      });

      expect(results.map((r) => r.id)).toEqual(["acme"]);
    });

    it("drops results below minScore", async () => {
      const store = await create();
      await store.upsert("docs", [
        { id: "same", embedding: axis(0) },
        { id: "orthogonal", embedding: axis(1) },
      ]);

      const results = await store.query("docs", { embedding: axis(0), minScore: 0.9 });

      expect(results.map((r) => r.id)).toEqual(["same"]);
    });

    it("overwrites on repeat upsert of the same id", async () => {
      const store = await create();
      await store.upsert("docs", [{ id: "a", embedding: axis(0), content: "first" }]);
      await store.upsert("docs", [{ id: "a", embedding: axis(0), content: "second" }]);

      expect(await store.count("docs")).toBe(1);
      const [top] = await store.query("docs", { embedding: axis(0), topK: 1 });
      expect(top?.content).toBe("second");
    });

    it("keeps namespaces separate", async () => {
      const store = await create();
      await store.upsert("alpha", [{ id: "a", embedding: axis(0) }]);
      await store.upsert("beta", [{ id: "b", embedding: axis(0) }]);

      expect(await store.count("alpha")).toBe(1);
      expect(await store.count("beta")).toBe(1);
      expect((await store.query("alpha", { embedding: axis(0) })).map((r) => r.id)).toEqual(["a"]);
    });

    it("deletes by id and reports how many went", async () => {
      const store = await create();
      await store.upsert("docs", [
        { id: "a", embedding: axis(0) },
        { id: "b", embedding: axis(1) },
      ]);

      expect(await store.delete("docs", ["a", "missing"])).toBe(1);
      expect(await store.count("docs")).toBe(1);
    });
  });
}
