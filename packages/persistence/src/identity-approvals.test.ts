import { IdentityService, InMemoryIdentityStore } from "@ryvan/identity";
import type { IdentityStore } from "@ryvan/identity";
import { approvalStoreConformance } from "@ryvan/policy-engine/testing";
import { InMemoryDocumentStore } from "@ryvan/storage";
import { describe, expect, it } from "vitest";
import { DocumentApprovalStore } from "./approval-store.js";
import { DocumentIdentityStore } from "./identity-store.js";

// The durable store must behave exactly like the in-memory one, or "approvals
// survive a restart" would quietly change semantics along with storage.
approvalStoreConformance(
  "document-backed",
  async () => new DocumentApprovalStore(new InMemoryDocumentStore()),
);

describe("DocumentApprovalStore durability", () => {
  it("recovers a pending approval through a fresh store instance", async () => {
    const documents = new InMemoryDocumentStore();

    const before = new DocumentApprovalStore(documents);
    const raised = await before.raise({
      action: "connector:execute",
      subject: { userId: "u1", orgId: "acme" },
      reason: "moves money",
    });

    // A brand new store over the same documents — as after a process restart.
    const after = new DocumentApprovalStore(documents);

    expect(await after.pending()).toHaveLength(1);
    expect((await after.get(raised.id))?.status).toBe("pending");

    const granted = await after.grant(raised.id, "u-cfo");
    expect(granted.status).toBe("granted");
  });
});

/** Runs the same assertions against both identity stores. */
function identityStoreConformance(name: string, create: () => IdentityStore): void {
  describe(`IdentityStore conformance: ${name}`, () => {
    const user = (id: string, email: string, orgId = "org1") => ({
      id,
      email,
      name: "Test User",
      passwordHash: "$2a$12$fakehashfakehashfakehashfakehashfakehashfake",
      organizationId: orgId,
      roles: ["org:member"],
      status: "active" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    it("round-trips a user", async () => {
      const store = create();
      await store.saveUser(user("u1", "a@example.com"));

      expect(await store.getUser("u1")).toMatchObject({ id: "u1", email: "a@example.com" });
      expect(await store.getUser("ghost")).toBeUndefined();
    });

    it("finds a user by email, case- and space-insensitively", async () => {
      const store = create();
      await store.saveUser(user("u1", "Person@Example.COM"));

      expect((await store.getUserByEmail("person@example.com"))?.id).toBe("u1");
      expect((await store.getUserByEmail("  PERSON@EXAMPLE.com  "))?.id).toBe("u1");
      expect(await store.getUserByEmail("nobody@example.com")).toBeUndefined();
      expect(await store.getUserByEmail("")).toBeUndefined();
    });

    it("lists users", async () => {
      const store = create();
      await store.saveUser(user("u1", "a@example.com"));
      await store.saveUser(user("u2", "b@example.com"));

      expect((await store.listUsers()).map((u) => u.id).sort()).toEqual(["u1", "u2"]);
    });

    it("round-trips an organization and finds it by slug", async () => {
      const store = create();
      await store.saveOrganization({
        id: "org1",
        name: "Acme",
        slug: "acme",
        plan: "free",
        settings: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect((await store.getOrganization("org1"))?.name).toBe("Acme");
      expect((await store.getOrganizationBySlug("acme"))?.id).toBe("org1");
      expect(await store.getOrganizationBySlug("nope")).toBeUndefined();
    });

    it("round-trips a project", async () => {
      const store = create();
      await store.saveProject({
        id: "prj1",
        name: "Payroll",
        organizationId: "org1",
        description: "",
        settings: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect((await store.getProject("prj1"))?.name).toBe("Payroll");
    });

    it("finds an API key by its public prefix and lists by owner", async () => {
      const store = create();
      const key = {
        id: "key1",
        name: "CI",
        keyHash: "$2a$12$fake",
        prefix: "abcd1234",
        userId: "u1",
        organizationId: "org1",
        permissions: ["project:read"],
        createdAt: Date.now(),
      };

      await store.saveApiKey(key);

      expect((await store.getApiKeyByPrefix("abcd1234"))?.id).toBe("key1");
      expect(await store.getApiKeyByPrefix("wrong")).toBeUndefined();
      expect(await store.listApiKeysByUser("u1")).toHaveLength(1);
      expect(await store.listApiKeysByOrg("org1")).toHaveLength(1);
      expect(await store.listApiKeysByUser("u2")).toHaveLength(0);

      expect(await store.deleteApiKey("key1")).toBe(true);
      expect(await store.deleteApiKey("key1")).toBe(false);
    });
  });
}

identityStoreConformance("in-memory", () => new InMemoryIdentityStore());
identityStoreConformance(
  "document-backed",
  () => new DocumentIdentityStore(new InMemoryDocumentStore()),
);

describe("IdentityService on a durable store", () => {
  const config = (store: IdentityStore) => ({
    token: { secret: "test-secret-value-at-least-32-chars-long", expiresIn: "1h", issuer: "test" },
    store,
  });

  it("recovers users and their roles across a restart", async () => {
    const documents = new InMemoryDocumentStore();

    const first = new IdentityService(config(new DocumentIdentityStore(documents)));
    await first.start();
    const org = await first.createOrganization({ name: "Acme", slug: "acme" });
    const created = await first.createUser({
      email: "person@example.com",
      name: "Person",
      password: "Str0ng!Passw0rd",
      organizationId: org.id,
    });
    expect(first.authorize(created.id, "project:read", { orgId: org.id })).toBe(true);
    await first.stop();

    // Fresh service over the same documents — as after a process restart.
    const second = new IdentityService(config(new DocumentIdentityStore(documents)));
    await second.start();

    // The user survived...
    expect((await second.getUser(created.id))?.email).toBe("person@example.com");
    expect((await second.getOrganization(org.id))?.slug).toBe("acme");

    // ...and can still authenticate with the password they set before.
    const auth = await second.authenticateWithPassword("person@example.com", "Str0ng!Passw0rd");
    expect(auth.user.id).toBe(created.id);

    // Roles were rehydrated into the RBAC engine, so they are still authorised.
    // Without rehydration they would authenticate but be permitted nothing.
    expect(second.authorize(created.id, "project:read", { orgId: org.id })).toBe(true);
  }, 30_000);

  it("keeps an issued API key valid across a restart", async () => {
    const documents = new InMemoryDocumentStore();

    const first = new IdentityService(config(new DocumentIdentityStore(documents)));
    await first.start();
    const org = await first.createOrganization({ name: "Acme", slug: "acme" });
    const user = await first.createUser({
      email: "person@example.com",
      name: "Person",
      password: "Str0ng!Passw0rd",
      organizationId: org.id,
    });
    const { rawKey } = await first.apiKeys.generate(user.id, org.id, "CI", ["project:read"]);
    await first.stop();

    const second = new IdentityService(config(new DocumentIdentityStore(documents)));
    await second.start();

    const auth = await second.authenticateWithAPIKey(rawKey);
    expect(auth.user.id).toBe(user.id);
  }, 30_000);

  it("refuses a duplicate email and a duplicate org slug", async () => {
    const service = new IdentityService(
      config(new DocumentIdentityStore(new InMemoryDocumentStore())),
    );
    await service.start();

    const org = await service.createOrganization({ name: "Acme", slug: "acme" });
    await service.createUser({
      email: "person@example.com",
      name: "Person",
      password: "Str0ng!Passw0rd",
      organizationId: org.id,
    });

    await expect(
      service.createUser({
        email: "PERSON@example.com",
        name: "Impostor",
        password: "Str0ng!Passw0rd",
        organizationId: org.id,
      }),
    ).rejects.toThrow(/already exists/);

    await expect(service.createOrganization({ name: "Other", slug: "acme" })).rejects.toThrow(
      /already exists/,
    );
  }, 30_000);

  it("refuses a user in an organization that does not exist", async () => {
    const service = new IdentityService(config(new InMemoryIdentityStore()));
    await service.start();

    await expect(
      service.createUser({
        email: "person@example.com",
        name: "Person",
        password: "Str0ng!Passw0rd",
        organizationId: "org_missing",
      }),
    ).rejects.toThrow(/not found/);
  });
});
