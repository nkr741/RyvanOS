import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it } from "vitest";
import { deriveKey, seal, unseal } from "./crypto.js";
import { InMemorySecretStore, SecretsService, secretId } from "./secrets-service.js";

const KEY = { id: "k1", material: "a-long-enough-development-key-material" };
const KEY2 = { id: "k2", material: "a-second-development-key-material-xyz" };

function service(options: Partial<ConstructorParameters<typeof SecretsService>[0]> = {}) {
  const eventBus = new EventBus();
  return {
    eventBus,
    secrets: new SecretsService({ keys: [KEY], eventBus, ...options }),
  };
}

describe("crypto", () => {
  it("round-trips a value", () => {
    const key = deriveKey(KEY.material);

    expect(unseal(seal("hunter2", key), key)).toBe("hunter2");
  });

  it("produces a different ciphertext each time", () => {
    const key = deriveKey(KEY.material);

    // A reused IV under the same key destroys GCM's security, so identical
    // plaintexts must not produce identical records.
    const a = seal("same", key);
    const b = seal("same", key);

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses to decrypt tampered ciphertext", () => {
    const key = deriveKey(KEY.material);
    const sealed = seal("transfer 100", key);

    // Without an auth tag, someone with database write access could alter a
    // credential and the platform would decrypt and use the result.
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 0xff;

    expect(() => unseal({ ...sealed, ciphertext: bytes.toString("base64") }, key)).toThrow();
  });

  it("refuses to decrypt with the wrong key", () => {
    const sealed = seal("secret", deriveKey(KEY.material));

    expect(() => unseal(sealed, deriveKey(KEY2.material))).toThrow();
  });

  it("derives a 32-byte key from any sufficiently long material", () => {
    expect(deriveKey(KEY.material)).toHaveLength(32);
    expect(deriveKey(Buffer.alloc(32, 7).toString("base64"))).toHaveLength(32);
  });

  it("rejects material that is too short to be a key", () => {
    expect(() => deriveKey("tooshort")).toThrow();
    expect(() => deriveKey("")).toThrow();
  });
});

describe("SecretsService", () => {
  it("stores and reveals a value", async () => {
    const { secrets } = service();

    const meta = await secrets.set({ name: "sap.password", value: "hunter2" });

    expect(meta.version).toBe(1);
    expect(await secrets.reveal("sap.password")).toBe("hunter2");
  });

  it("never returns the value from set, describe or list", async () => {
    const { secrets } = service();
    await secrets.set({ name: "sap.password", value: "hunter2" });

    const meta = await secrets.set({ name: "other", value: "v" });
    const described = await secrets.describe("sap.password");
    const listed = await secrets.list();

    // Only reveal() should ever produce plaintext — that is what keeps
    // credentials out of logs, traces and console screenshots.
    for (const shape of [meta, described, ...listed]) {
      expect(JSON.stringify(shape)).not.toContain("hunter2");
    }
  });

  it("scopes secrets per tenant", async () => {
    const { secrets } = service();

    await secrets.set({ name: "api.key", value: "acme-key", scope: { orgId: "acme" } });
    await secrets.set({ name: "api.key", value: "globex-key", scope: { orgId: "globex" } });

    expect(await secrets.reveal("api.key", { orgId: "acme" })).toBe("acme-key");
    expect(await secrets.reveal("api.key", { orgId: "globex" })).toBe("globex-key");

    // One tenant's secret is invisible to another.
    expect(await secrets.list({ orgId: "acme" })).toHaveLength(1);
    await expect(secrets.reveal("api.key", { orgId: "initech" })).rejects.toThrow();
  });

  it("bumps the version on rotation without exposing either value", async () => {
    const { secrets } = service();

    await secrets.set({ name: "k", value: "old" });
    const rotated = await secrets.set({ name: "k", value: "new" });

    expect(rotated.version).toBe(2);
    expect(await secrets.reveal("k")).toBe("new");
  });

  it("refuses to serve an expired secret", async () => {
    const { secrets } = service();
    await secrets.set({ name: "temp", value: "v", expiresAt: Date.now() - 1 });

    // Serving it would look like it worked until the vendor rejects it.
    await expect(secrets.reveal("temp")).rejects.toThrow(/expired/);
  });

  it("throws for an unknown secret", async () => {
    await expect(service().secrets.reveal("nope")).rejects.toThrow();
  });

  it("records access, so an audit can answer who read a credential", async () => {
    const { secrets, eventBus } = service();
    await secrets.set({ name: "k", value: "v" });

    await secrets.reveal("k");
    await secrets.reveal("k");

    expect((await secrets.describe("k"))?.accessCount).toBe(2);
    expect(eventBus.history(EVENTS.SECRET_ACCESSED)).toHaveLength(2);
  });

  it("deletes", async () => {
    const { secrets } = service();
    await secrets.set({ name: "k", value: "v" });

    expect(await secrets.delete("k")).toBe(true);
    expect(await secrets.delete("k")).toBe(false);
    await expect(secrets.reveal("k")).rejects.toThrow();
  });

  it("rejects an empty name or value", async () => {
    const { secrets } = service();

    await expect(secrets.set({ name: "", value: "v" })).rejects.toThrow();
    await expect(secrets.set({ name: "k", value: "" })).rejects.toThrow();
  });

  it("refuses to construct without a key", () => {
    expect(() => new SecretsService({ keys: [] })).toThrow();
  });

  it("stores only ciphertext, never the plaintext", async () => {
    const store = new InMemorySecretStore();
    const secrets = new SecretsService({ keys: [KEY], store });

    await secrets.set({ name: "k", value: "hunter2" });

    const sealed = await store.get(secretId("k"));
    expect(JSON.stringify(sealed)).not.toContain("hunter2");
    expect(sealed?.ciphertext).toBeTruthy();
    expect(sealed?.authTag).toBeTruthy();
  });
});

describe("key rotation", () => {
  it("reads secrets sealed with an older key", async () => {
    const store = new InMemorySecretStore();

    const before = new SecretsService({ keys: [KEY], store });
    await before.set({ name: "k", value: "v" });

    // KEY2 is now active, KEY is retained — nothing breaks mid-rotation.
    const after = new SecretsService({ keys: [KEY2, KEY], store });
    expect(await after.reveal("k")).toBe("v");
  });

  it("re-seals old secrets with the active key", async () => {
    const store = new InMemorySecretStore();

    const before = new SecretsService({ keys: [KEY], store });
    await before.set({ name: "a", value: "1" });
    await before.set({ name: "b", value: "2" });

    const after = new SecretsService({ keys: [KEY2, KEY], store });
    expect(await after.rotate()).toEqual({ rotated: 2, skipped: 0 });

    // Now readable with the new key alone.
    const rotated = new SecretsService({ keys: [KEY2], store });
    expect(await rotated.reveal("a")).toBe("1");
    expect(await rotated.reveal("b")).toBe("2");
  });

  it("skips secrets already on the active key", async () => {
    const store = new InMemorySecretStore();
    const secrets = new SecretsService({ keys: [KEY], store });

    await secrets.set({ name: "k", value: "v" });

    expect(await secrets.rotate()).toEqual({ rotated: 0, skipped: 1 });
  });

  it("reports rather than deletes a secret whose key is gone", async () => {
    const store = new InMemorySecretStore();

    const before = new SecretsService({ keys: [KEY], store });
    await before.set({ name: "k", value: "v" });

    // KEY is no longer configured, so this secret cannot be read or re-sealed.
    const orphaned = new SecretsService({ keys: [KEY2], store });

    expect(await orphaned.rotate()).toEqual({ rotated: 0, skipped: 1 });
    // Left in place: losing a credential silently is the worse outcome.
    expect(await store.get(secretId("k"))).toBeDefined();
    await expect(orphaned.reveal("k")).rejects.toThrow(/not configured/);
  });
});
