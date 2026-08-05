/**
 * Boots the platform from its built output, under plain Node.
 *
 * This exists because vitest bundles. A CommonJS import that native ESM cannot
 * resolve passes every test and then fails on the first line of production —
 * which is exactly what happened with bcryptjs. Running the real dist/ under
 * `node` is the only way to catch that class of bug.
 *
 * Deliberately dependency-free: no test runner, no bundler, no transpile.
 */
import { bootstrap } from "@ryvan/bootstrap";

const EXPECTED_SERVICES = [
  "logger",
  "events",
  "identity",
  "models",
  "memory",
  "tools",
  "policy",
  "resilience",
  "observability",
  "audit",
  "connectors",
  "workflow",
  "mission",
  "agent-runtime",
  "agent-sdk",
  "documents",
  "cache",
];

function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`  ok  ${message}`);
  return true;
}

const workflow = {
  id: "smoke",
  name: "Smoke workflow",
  version: "1.0.0",
  steps: [
    { id: "one", name: "First", kind: "action", handler: "echo" },
    { id: "two", name: "Second", kind: "action", handler: "echo", dependsOn: ["one"] },
  ],
};

console.log("Booting RyvanOS from built output...\n");

const platform = await bootstrap({
  identity: { tokenSecret: "smoke-secret-value-at-least-32-characters" },
  models: { defaultModel: "claude-haiku-4-5" },
  workflow: { definitions: [workflow] },
  mission: { templates: [{ type: "smoke.run", workflowId: "smoke" }] },
});

try {
  check(platform.status() === "running", "platform reaches running");

  for (const name of EXPECTED_SERVICES) {
    check(platform.container.has(name), `container exposes "${name}"`);
  }

  const wf = platform.container.resolve("workflow");
  wf.registerHandler("echo", (ctx) => ({ step: ctx.stepId }));

  // Identity exercises bcryptjs and jsonwebtoken — both CommonJS, both the
  // kind of dependency that only misbehaves outside a bundler.
  const identity = platform.container.resolve("identity");
  const org = await identity.createOrganization({ name: "Smoke", slug: "smoke" });
  const user = await identity.createUser({
    email: "smoke@example.com",
    name: "Smoke",
    password: "Str0ng!Passw0rd",
    organizationId: org.id,
  });
  const auth = await identity.authenticateWithPassword("smoke@example.com", "Str0ng!Passw0rd");
  check(auth.user.id === user.id, "password auth works under native ESM");
  check(typeof auth.token === "string" && auth.token.length > 0, "JWT signing works");

  const { rawKey } = await identity.apiKeys.generate(user.id, org.id, "smoke", ["project:read"]);
  const keyAuth = await identity.authenticateWithAPIKey(rawKey);
  check(keyAuth.user.id === user.id, "API key auth works under native ESM");

  // A mission end to end, which touches policy, workflow, audit and tracing.
  const mission = platform.container.resolve("mission");
  const run = await mission.launch({
    type: "smoke.run",
    subject: { userId: user.id, orgId: org.id },
  });
  check(run.status === "completed", `mission completes (got "${run.status}")`);

  const audit = platform.container.resolve("audit");
  const entries = await audit.query();
  check(entries.length > 0, `audit recorded ${entries.length} entries`);
  check((await audit.verify()).valid, "audit hash chain verifies");

  const observability = platform.container.resolve("observability");
  const trace = await observability.trace(run.correlationId);
  check(trace !== undefined, "mission produced a trace");
  check((trace?.spanCount ?? 0) >= 3, `trace has ${trace?.spanCount ?? 0} spans`);
} finally {
  await platform.stop();
}

if (process.exitCode === 1) {
  console.error("\nSmoke test FAILED");
} else {
  console.log("\nSmoke test passed — the platform runs under plain Node.");
}
