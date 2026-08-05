import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { ILogger, Service, Status } from "@ryvan/common";
import { ConsoleApi } from "./api.js";
import type { ConsoleOptions } from "./types.js";

/** Bodies above this are refused rather than buffered. */
const MAX_BODY_BYTES = 1_000_000;

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    // An unbounded read is a denial-of-service vector on any public port.
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body is not valid JSON");
  }
}

/**
 * Adapts the console to node:http.
 *
 * The API itself takes and returns plain objects, so this adapter is the only
 * part that knows about sockets — mounting the console inside Express, Fastify
 * or a Next.js route means writing an equivalent five-line shim, not forking
 * the console.
 */
export function createConsoleHandler(
  options: ConsoleOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const api = new ConsoleApi(options);

  return (request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", "http://localhost");

        const result = await api.handle({
          method: request.method ?? "GET",
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          body: await readBody(request),
          headers: request.headers as Record<string, string | string[] | undefined>,
        });

        response.writeHead(result.status, {
          ...result.headers,
          // The console renders untrusted values (errors, connector names), so
          // deny it any script or frame capability it does not need.
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        });
        response.end(result.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.logger?.error("Console request failed", { error: message });

        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: message }));
      }
    })();
  };
}

export interface ConsoleServiceOptions extends ConsoleOptions {
  /** Port to listen on. Default 4500. */
  port?: number;
  /** Interface to bind. Default "127.0.0.1" — see the note on `start()`. */
  host?: string;
}

/**
 * Runs the console on its own port.
 *
 * Binds to loopback by default. The console shows every mission's inputs, the
 * audit trail, and the approval buttons; exposing it on 0.0.0.0 should be a
 * decision someone typed, not a default they inherited.
 */
export class ConsoleService implements Service {
  readonly name = "console";

  private state: Status = "stopped";
  private server?: Server;
  private readonly port: number;
  private readonly host: string;
  private readonly logger?: ILogger;
  private readonly options: ConsoleServiceOptions;

  constructor(options: ConsoleServiceOptions) {
    // Constructing the API here surfaces a missing or weak token at wiring
    // time rather than on the first request.
    new ConsoleApi(options);

    this.options = options;
    this.port = options.port ?? 4500;
    this.host = options.host ?? "127.0.0.1";
    this.logger = options.logger;
  }

  async start(): Promise<void> {
    if (this.state === "running") return;
    this.state = "starting";

    this.server = createServer(createConsoleHandler(this.options));

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, this.host, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });

    this.state = "running";
    this.logger?.info("Console listening", { url: `http://${this.host}:${this.port}` });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      this.state = "stopped";
      return;
    }

    this.state = "stopping";
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
    this.state = "stopped";
    this.logger?.info("Console stopped");
  }

  status(): Status {
    return this.state;
  }

  /** The bound address, useful when the port was chosen as 0. */
  address(): string | undefined {
    const address = this.server?.address();
    if (!address || typeof address === "string") return address ?? undefined;
    return `http://${this.host}:${address.port}`;
  }
}
