import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Clear the auth cookie by overwriting it with an expired, empty value.
  // Attributes (name, path, secure) must match how login set it, otherwise the
  // browser won't treat this as the same cookie and won't clear it.
  // `secure` follows the request protocol so the clear also works over plain
  // HTTP (a Secure Set-Cookie is ignored by the browser on an HTTP connection).
  const isHttps = request.headers.get("x-forwarded-proto") === "https";

  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: "token",
    value: "",
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
