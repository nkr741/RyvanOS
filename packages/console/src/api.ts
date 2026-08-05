import { ValidationError } from "@ryvan/common";
import type { ILogger } from "@ryvan/common";
import { renderConsoleHtml } from "./ui.js";
import type { ConsoleOptions, ConsoleRequest, ConsoleResponse, ConsoleSources } from "./types.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const HTML_HEADERS = { "content-type": "text/html; charset=utf-8" };

function json(status: number, payload: unknown): ConsoleResponse {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

/**
 * Compares two strings without leaking their difference through timing.
 *
 * A plain `===` bails on the first mismatched byte, so an attacker can recover
 * a token one character at a time by measuring the response. The cost of doing
 * this properly is a few microseconds.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * The Developer Console, as a framework-free request handler.
 *
 * `handle()` takes a plain object and returns a plain object, so it mounts
 * inside node:http, Express, Fastify, or a Next.js route without the console
 * caring which — and it is fully testable without opening a socket.
 *
 * Read-heavy by design. The few actions it exposes (grant an approval, reset a
 * circuit, cancel a mission) are the ones an operator genuinely needs at 3am;
 * everything else belongs in the product, not in the platform's inspector.
 */
export class ConsoleApi {
  private readonly sources: ConsoleSources;
  private readonly token: string;
  private readonly basePath: string;
  private readonly logger?: ILogger;

  constructor(options: ConsoleOptions) {
    if (!options.token || options.token.length < 16) {
      // Refusing to construct is the point: a console with no token exposes the
      // audit trail and the approval buttons to anyone who can reach the port.
      throw new ValidationError("token", "must be at least 16 characters");
    }

    this.sources = options.sources;
    this.token = options.token;
    this.basePath = options.basePath ?? "";
    this.logger = options.logger;
  }

  async handle(request: ConsoleRequest): Promise<ConsoleResponse> {
    const path = this.stripBase(request.path);

    if (path === null) {
      return json(404, { error: "Not found" });
    }

    if (!this.authorised(request)) {
      return {
        status: 401,
        headers: { ...JSON_HEADERS, "www-authenticate": "Bearer" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    try {
      return await this.route(request.method.toUpperCase(), path, request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.error("Console request failed", { path, error: message });

      // Validation problems are the caller's; anything else is ours.
      const status = err instanceof ValidationError ? 400 : 500;
      return json(status, { error: message });
    }
  }

  // --- routing --------------------------------------------------------------

  private async route(
    method: string,
    path: string,
    request: ConsoleRequest,
  ): Promise<ConsoleResponse> {
    const query = request.query ?? {};
    const limit = query.limit ? Number(query.limit) : undefined;

    if (method === "GET" && (path === "/" || path === "")) {
      return { status: 200, headers: HTML_HEADERS, body: renderConsoleHtml(this.basePath) };
    }

    if (method === "GET" && path === "/api/overview") {
      return json(200, await this.overview());
    }

    // --- missions ---
    if (method === "GET" && path === "/api/missions") {
      return json(200, {
        missions:
          (await this.sources.missions?.list({
            status: query.status,
            orgId: query.orgId,
          })) ?? [],
      });
    }

    const missionMatch = /^\/api\/missions\/([^/]+)$/.exec(path);
    if (method === "GET" && missionMatch) {
      const mission = await this.sources.missions?.get(missionMatch[1]!);
      if (!mission) return json(404, { error: "Mission not found" });

      // The trace is what makes a mission page useful — status alone does not
      // tell an operator which step failed or what it cost.
      const tree = mission.correlationId
        ? await this.sources.traces?.tree(mission.correlationId)
        : undefined;
      const trace = mission.correlationId
        ? await this.sources.traces?.get(mission.correlationId)
        : undefined;

      return json(200, { mission, trace, spans: tree ?? [] });
    }

    const cancelMatch = /^\/api\/missions\/([^/]+)\/cancel$/.exec(path);
    if (method === "POST" && cancelMatch) {
      return json(200, { mission: await this.require("missions").cancel(cancelMatch[1]!) });
    }

    // --- traces ---
    if (method === "GET" && path === "/api/traces") {
      return json(200, {
        traces: (await this.sources.traces?.list({ orgId: query.orgId, limit })) ?? [],
      });
    }

    const traceMatch = /^\/api\/traces\/([^/]+)$/.exec(path);
    if (method === "GET" && traceMatch) {
      const traceId = traceMatch[1]!;
      const trace = await this.sources.traces?.get(traceId);
      if (!trace) return json(404, { error: "Trace not found" });

      return json(200, { trace, spans: (await this.sources.traces?.tree(traceId)) ?? [] });
    }

    // --- workflow runs ---
    if (method === "GET" && path === "/api/runs") {
      return json(200, {
        runs: (await this.sources.workflows?.list({ status: query.status })) ?? [],
      });
    }

    const runMatch = /^\/api\/runs\/([^/]+)$/.exec(path);
    if (method === "GET" && runMatch) {
      const run = await this.sources.workflows?.get(runMatch[1]!);
      return run ? json(200, { run }) : json(404, { error: "Run not found" });
    }

    // --- approvals ---
    if (method === "GET" && path === "/api/approvals") {
      return json(200, { approvals: (await this.sources.approvals?.pending()) ?? [] });
    }

    const decideMatch = /^\/api\/approvals\/([^/]+)\/(grant|deny)$/.exec(path);
    if (method === "POST" && decideMatch) {
      const body = (request.body ?? {}) as { decidedBy?: string; note?: string };
      if (!body.decidedBy) {
        // An approval with no decider is not an audit trail, it is a rumour.
        throw new ValidationError("decidedBy", "is required to decide an approval");
      }

      const approvals = this.require("approvals");
      const approval =
        decideMatch[2] === "grant"
          ? await approvals.grant(decideMatch[1]!, body.decidedBy, body.note)
          : await approvals.deny(decideMatch[1]!, body.decidedBy, body.note);

      return json(200, { approval });
    }

    // --- audit ---
    if (method === "GET" && path === "/api/audit") {
      return json(200, {
        entries:
          (await this.sources.audit?.query({ orgId: query.orgId, limit: limit ?? 100 })) ?? [],
      });
    }

    if (method === "GET" && path === "/api/audit/verify") {
      const verification = await this.sources.audit?.verify();
      return json(200, verification ?? { valid: true, entryCount: 0, brokenAt: [] });
    }

    // --- policy ---
    if (method === "GET" && path === "/api/policies") {
      return json(200, {
        rules: this.sources.policies?.rules() ?? [],
        budgets: this.sources.policies?.budgets() ?? [],
      });
    }

    // --- resilience ---
    if (method === "GET" && path === "/api/circuits") {
      return json(200, { circuits: this.sources.circuits?.list() ?? [] });
    }

    const resetMatch = /^\/api\/circuits\/(.+)\/reset$/.exec(path);
    if (method === "POST" && resetMatch) {
      this.require("circuits").reset(decodeURIComponent(resetMatch[1]!));
      return json(200, { ok: true });
    }

    if (method === "GET" && path === "/api/dead-letters") {
      return json(200, {
        letters:
          (await this.sources.deadLetters?.list({
            replayed: query.replayed === undefined ? false : query.replayed === "true",
          })) ?? [],
      });
    }

    // --- connectors & health ---
    if (method === "GET" && path === "/api/connectors") {
      return json(200, { connectors: this.sources.connectors?.list() ?? [] });
    }

    if (method === "GET" && path === "/api/health") {
      return json(200, {
        services: this.sources.health?.services() ?? [],
        storage: (await this.sources.health?.storage()) ?? [],
      });
    }

    return json(404, { error: `No route for ${method} ${path}` });
  }

  /** Cross-cutting summary, so the landing page is one request rather than eight. */
  private async overview(): Promise<Record<string, unknown>> {
    const [missions, approvals, letters, verification, storage] = await Promise.all([
      this.sources.missions?.list() ?? Promise.resolve([]),
      this.sources.approvals?.pending() ?? Promise.resolve([]),
      this.sources.deadLetters?.list({ replayed: false }) ?? Promise.resolve([]),
      this.sources.audit?.verify() ?? Promise.resolve(undefined),
      this.sources.health?.storage() ?? Promise.resolve([]),
    ]);

    const circuits = this.sources.circuits?.list() ?? [];
    const traces = (await this.sources.traces?.list({ limit: 200 })) ?? [];

    const byStatus: Record<string, number> = {};
    for (const mission of missions) {
      byStatus[mission.status] = (byStatus[mission.status] ?? 0) + 1;
    }

    return {
      missions: { total: missions.length, byStatus },
      approvalsPending: approvals.length,
      deadLetters: letters.length,
      openCircuits: circuits.filter((circuit) => circuit.state !== "closed").length,
      circuits,
      audit: verification,
      storage,
      services: this.sources.health?.services() ?? [],
      cost: {
        totalUsd: traces.reduce((sum, trace) => sum + trace.totalCostUsd, 0),
        totalTokens: traces.reduce((sum, trace) => sum + trace.totalTokens, 0),
        traceCount: traces.length,
      },
    };
  }

  // --- helpers --------------------------------------------------------------

  /** Returns the path below `basePath`, or null when the request is outside it. */
  private stripBase(path: string): string | null {
    if (!this.basePath) return path;
    if (path === this.basePath) return "/";
    if (!path.startsWith(`${this.basePath}/`)) return null;

    return path.slice(this.basePath.length);
  }

  private authorised(request: ConsoleRequest): boolean {
    const header = request.headers?.authorization ?? request.headers?.Authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return false;

    const [scheme, token] = value.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return false;

    return safeEqual(token, this.token);
  }

  /** Reads a source that a route needs, with a clear error when it is absent. */
  private require<K extends keyof ConsoleSources>(name: K): NonNullable<ConsoleSources[K]> {
    const source = this.sources[name];
    if (!source) {
      throw new ValidationError(String(name), "is not available on this platform");
    }
    return source as NonNullable<ConsoleSources[K]>;
  }
}
