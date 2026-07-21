import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:auth:login");

export const POST = withApi(async (request) => {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { error: "Account is deactivated. Contact your administrator." },
        { status: 403 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = createToken(user);

    const { password: _pw, ...userWithoutPassword } = user;

    // Return the token in the body AND set it as an httpOnly cookie.
    // - Body token: the client stores it in localStorage and sends it as an
    //   `Authorization: Bearer` header on every API call (all API routes
    //   authenticate via getCurrentUser() → the Bearer header). Do NOT remove it.
    // - Cookie: browser navigations to /admin don't carry the Authorization
    //   header, so middleware needs the cookie to guard page loads.
    // `secure` follows the request protocol so the cookie is still stored while
    // we're on plain HTTP (pre-TLS); it becomes Secure automatically over HTTPS.
    const isHttps = request.headers.get("x-forwarded-proto") === "https";

    const response = NextResponse.json({
      token,
      user: userWithoutPassword,
    });

    response.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h — matches the JWT's expiresIn in createToken()
    });

    return response;
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "Login error");
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
});
