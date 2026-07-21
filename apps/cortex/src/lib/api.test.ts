import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
  }),
}));

import { withApi } from "./api";
import { getRequestContext } from "./request-context";
import { NextRequest, NextResponse } from "next/server";

function makeRequest(
  method: string,
  path: string,
  headers?: Record<string, string>,
): NextRequest {
  const url = `http://localhost:3000${path}`;
  return new NextRequest(url, {
    method,
    headers: { "x-request-id": "test-req-id", ...headers },
  });
}

describe("withApi", () => {
  it("sets request context for the handler", async () => {
    let capturedCtx: ReturnType<typeof getRequestContext>;

    const handler = withApi(async () => {
      capturedCtx = getRequestContext();
      return NextResponse.json({ ok: true });
    });

    const req = makeRequest("GET", "/api/test");
    await handler(req, { params: Promise.resolve({}) });

    expect(capturedCtx!).toBeDefined();
    expect(capturedCtx!.requestId).toBe("test-req-id");
    expect(capturedCtx!.method).toBe("GET");
    expect(capturedCtx!.path).toBe("/api/test");
  });

  it("generates requestId when header is missing", async () => {
    let capturedCtx: ReturnType<typeof getRequestContext>;

    const handler = withApi(async () => {
      capturedCtx = getRequestContext();
      return NextResponse.json({ ok: true });
    });

    const req = new NextRequest("http://localhost:3000/api/test");
    await handler(req, { params: Promise.resolve({}) });

    expect(capturedCtx!.requestId).toBeDefined();
    expect(capturedCtx!.requestId).not.toBe("unknown");
  });

  it("catches unhandled errors and returns 500", async () => {
    const handler = withApi(async () => {
      throw new Error("boom");
    });

    const req = makeRequest("POST", "/api/broken");
    const res = await handler(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("passes through successful responses unchanged", async () => {
    const handler = withApi(async () => {
      return NextResponse.json({ result: "success" }, { status: 201 });
    });

    const req = makeRequest("POST", "/api/items");
    const res = await handler(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.result).toBe("success");
  });

  it("passes route context to handler", async () => {
    let capturedParams: Record<string, string> | undefined;

    const handler = withApi(async (_req, ctx) => {
      capturedParams = await ctx.params;
      return NextResponse.json({ ok: true });
    });

    const req = makeRequest("GET", "/api/items/123");
    await handler(req, { params: Promise.resolve({ id: "123" }) });

    expect(capturedParams).toEqual({ id: "123" });
  });
});
