import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter (single instance - sufficient for single VPS deployment)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 300_000);

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)"
  );
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request);

  // Rate limit auth endpoints: 10 attempts per minute per IP
  if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
    if (request.method === "POST") {
      const allowed = rateLimit(`auth:${ip}`, 10, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: "Too many attempts. Try again later." },
          { status: 429 }
        );
      }
    }
  }

  // Rate limit file uploads: 20 per minute per IP
  if (pathname === "/api/upload" && request.method === "POST") {
    const allowed = rateLimit(`upload:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded." },
        { status: 429 }
      );
    }
  }

  // General API rate limit: 200 requests per minute per IP
  if (pathname.startsWith("/api/")) {
    const allowed = rateLimit(`api:${ip}`, 200, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429 }
      );
    }
  }

  // Protect admin routes - require auth token
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("token")?.value;
    const authHeader = request.headers.get("Authorization");
    if (!token && !authHeader) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
