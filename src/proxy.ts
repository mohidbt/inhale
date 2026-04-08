import { NextRequest, NextResponse } from "next/server";

// Better Auth session cookie names (better-auth prefix + session_token)
// In development: "better-auth.session_token"
// In production:  "__Secure-better-auth.session_token"
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_COOKIE_SECURE = "__Secure-better-auth.session_token";

export default async function proxy(request: NextRequest) {
  // Optimistic check: read the session token cookie directly.
  // This avoids a DB round-trip on every request.
  // Full session validation happens inside each protected route/layout.
  const sessionToken =
    request.cookies.get(SESSION_COOKIE)?.value ||
    request.cookies.get(SESSION_COOKIE_SECURE)?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/library/:path*", "/reader/:path*", "/settings/:path*"],
};
