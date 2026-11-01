import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "192.168.86.30" ||
      host === "100.100.55.20" ||
      host.endsWith(".sslip.io")
    ) {
      return true;
    }
    // Tailscale CGNAT range 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigin = isAllowedOrigin(origin) ? origin || "*" : "*";

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host"
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
