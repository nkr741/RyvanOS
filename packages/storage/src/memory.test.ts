import { describe, expect, it } from "vitest";
import { documentConformance, keyValueConformance, vectorConformance } from "./conformance.js";
import {
  InMemoryDocumentStore,
  InMemoryKeyValueStore,
  InMemoryObjectStore,
  InMemoryVectorStore,
} from "./memory.js";
import { cosineSimilarity } from "./similarity.js";

keyValueConformance("in-memory", async () => new InMemoryKeyValueStore());
documentConformance("in-memory", async () => new InMemoryDocumentStore());
vectorConformance("in-memory", async () => new InMemoryVectorStore(), 8);

describe("cosineSimilarity", () => {
  it("scores identical vectors 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
  });

  it("scores orthogonal vectors 0.5, not 0", () => {
    // Rescaled to 0..1, so orthogonal sits in the middle. Reading 0 as "no
    // similarity" is the mistake this normalisation exists to prevent.
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.5, 10);
  });

  it("scores opposite vectors 0", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(0, 10);
  });

  it("ignores magnitude", () => {
    expect(cosineSimilarity([1, 1], [50, 50])).toBeCloseTo(1, 10);
  });

  it("scores a zero vector 0 rather than claiming a match", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("rejects a dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/dimension mismatch/);
  });
});

describe("InMemoryKeyValueStore specifics", () => {
  it("preserves an existing deadline when incrementing without a new ttl", async () => {
    const store = new InMemoryKeyValueStore();
    // Long enough that both increments land inside the window even under load —
    // otherwise the first key expires between them and the second creates a
    // fresh one with no deadline, failing for the wrong reason.
    await store.increment("hits", 1, 400);
    await store.increment("hits", 1);

    expect(await store.get("hits")).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // The second increment must not have extended the original deadline.
    expect(await store.get("hits")).toBeUndefined();
  });

  it("rejects an empty key", async () => {
    await expect(new InMemoryKeyValueStore().set("", 1)).rejects.toThrow();
  });
});

describe("InMemoryVectorStore specifics", () => {
  it("rejects a record with no embedding", async () => {
    const store = new InMemoryVectorStore();

    await expect(store.upsert("docs", [{ id: "a", embedding: [] }])).rejects.toThrow();
  });

  it("rejects a query with no embedding", async () => {
    await expect(new InMemoryVectorStore().query("docs", { embedding: [] })).rejects.toThrow();
  });
});

describe("InMemoryObjectStore", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("round-trips an object with metadata", async () => {
    const store = new InMemoryObjectStore();
    const meta = await store.put("reports/q1.csv", bytes("a,b,c"), "text/csv");

    expect(meta).toMatchObject({ key: "reports/q1.csv", size: 5, contentType: "text/csv" });
    expect(new TextDecoder().decode(await store.get("reports/q1.csv"))).toBe("a,b,c");
  });

  it("returns undefined for a missing object", async () => {
    expect(await new InMemoryObjectStore().get("nope")).toBeUndefined();
    expect(await new InMemoryObjectStore().head("nope")).toBeUndefined();
  });

  it("lists by prefix, sorted", async () => {
    const store = new InMemoryObjectStore();
    await store.put("reports/b", bytes("1"));
    await store.put("reports/a", bytes("1"));
    await store.put("exports/c", bytes("1"));

    expect((await store.list("reports/")).map((o) => o.key)).toEqual(["reports/a", "reports/b"]);
  });

  it("copies on write and on read, so callers cannot mutate stored bytes", async () => {
    const store = new InMemoryObjectStore();
    const source = bytes("original");
    await store.put("k", source);

    source[0] = 0;
    const fetched = (await store.get("k"))!;
    fetched[1] = 0;

    expect(new TextDecoder().decode(await store.get("k"))).toBe("original");
  });

  it("deletes", async () => {
    const store = new InMemoryObjectStore();
    await store.put("k", bytes("1"));

    expect(await store.delete("k")).toBe(true);
    expect(await store.delete("k")).toBe(false);
  });
});
