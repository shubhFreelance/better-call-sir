import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    /^\/(?:\.env(?:[./]|$)|\.git(?:\/|$)|\.cache(?:\/|$)|node_modules(?:\/|$))/i.test(
      pathname,
    ) ||
    (process.env.NODE_ENV === "production" && pathname.endsWith(".map"))
  )
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  if (
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/_next/webpack-hmr" ||
    pathname === "/favicon.ico"
  )
    return NextResponse.next();
  const nonce = randomBytes(16).toString("base64"),
    development = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://checkout.razorpay.com https://cdn.razorpay.com https://static.razorpay.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    `connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    ...(!development && process.env.WEB_ORIGIN?.startsWith("https://")
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: "/:path*" };
