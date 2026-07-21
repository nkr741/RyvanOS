import { NextRequest, NextResponse } from "next/server";
import { runWithRequestContext } from "./request-context";
import { createLogger } from "./logger";

const log = createLogger("api");

type RouteContext = { params: Promise<Record<string, string>> };

type ApiHandler = (
  request: NextRequest,
  ctx: RouteContext,
) => Promise<NextResponse>;

export function withApi(handler: ApiHandler): ApiHandler {
  return (request, ctx) => {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const method = request.method;
    const path = request.nextUrl.pathname;

    return runWithRequestContext(
      { requestId, method, path, startTime: Date.now() },
      async () => {
        try {
          return await handler(request, ctx);
        } catch (error) {
          log.error(
            { err: error instanceof Error ? error.message : String(error) },
            `${method} ${path} unhandled error`,
          );
          return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    );
  };
}
