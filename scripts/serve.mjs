/**
 * Runs RyvanOS as a service.
 *
 * The platform is a library — products embed it. This entry point exists so it
 * can also run standalone: in Docker, as a systemd unit, or locally while you
 * poke at the console. It reads configuration from the environment and starts
 * nothing that has not been configured.
 */
import { bootstrap } from "@ryvan/bootstrap";
import { createServer } from "node:http";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    console.error("See .env.example for the full list.");
    process.exit(1);
  }
  return value;
}

const postgresUrl = process.env.RYVAN_POSTGRES_URL;

if (!postgresUrl) {
  // Loud, because the failure mode is silent data loss on the next restart
  // rather than an error anyone would notice.
  console.warn(
    "RYVAN_POSTGRES_URL is not set — running fully in memory. Nothing will survive a restart.",
  );
}

const platform = await bootstrap({
  logger: undefined,
  identity: {
    tokenSecret: required("RYVAN_JWT_SECRET"),
    tokenIssuer: process.env.RYVAN_JWT_ISSUER ?? "ryvan-platform",
  },
  models: { defaultModel: process.env.RYVAN_DEFAULT_MODEL ?? "claude-haiku-4-5" },
  storage: {
    postgresUrl,
    redisUrl: process.env.RYVAN_REDIS_URL,
    tablePrefix: process.env.RYVAN_TABLE_PREFIX,
    vectorDimensions: process.env.RYVAN_VECTOR_DIMENSIONS
      ? Number(process.env.RYVAN_VECTOR_DIMENSIONS)
      : undefined,
  },
  console: process.env.RYVAN_CONSOLE_TOKEN
    ? {
        token: process.env.RYVAN_CONSOLE_TOKEN,
        port: Number(process.env.RYVAN_CONSOLE_PORT ?? 4500),
        host: process.env.RYVAN_CONSOLE_HOST ?? "127.0.0.1",
        basePath: process.env.RYVAN_CONSOLE_BASE_PATH,
      }
    : undefined,
});

platform.enableGracefulShutdown();

/**
 * Unauthenticated liveness and readiness, on its own port.
 *
 * Separate from the console because a load balancer cannot present a bearer
 * token, and the console must not become reachable without one just to make
 * health checks work. This endpoint reveals only whether the platform is up
 * and whether its storage answers — never mission data.
 */
const healthPort = Number(process.env.RYVAN_HEALTH_PORT ?? 4501);

const health = createServer((request, response) => {
  void (async () => {
    if (request.url !== "/healthz" && request.url !== "/readyz") {
      response.writeHead(404).end();
      return;
    }

    const running = platform.status() === "running";

    // /healthz asks "is the process alive"; /readyz asks "can it serve".
    // Restarting a pod because Postgres blipped would turn a dependency
    // outage into an availability outage.
    if (request.url === "/healthz") {
      response.writeHead(running ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: platform.status() }));
      return;
    }

    let storageOk = true;
    try {
      const documents = platform.container.resolve("documents");
      if (typeof documents.health === "function") {
        storageOk = (await documents.health()).reachable;
      }
    } catch {
      storageOk = false;
    }

    const ready = running && storageOk;
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: platform.status(), storage: storageOk }));
  })();
});

health.listen(healthPort, "0.0.0.0", () => {
  console.log(`RyvanOS health endpoint on :${healthPort} (/healthz, /readyz)`);
  if (process.env.RYVAN_CONSOLE_TOKEN) {
    console.log(`Console on :${process.env.RYVAN_CONSOLE_PORT ?? 4500}`);
  } else {
    console.log("Console disabled — set RYVAN_CONSOLE_TOKEN to enable it.");
  }
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => health.close());
}
