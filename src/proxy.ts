import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_EXACT = new Set([
  "https://maegler.ai-beregner.dk",
  "https://maegler-ai.ai-beregner.dk",
  "http://localhost:3000",
  "http://localhost:3011",
  "http://localhost:3030",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3011",
  "http://127.0.0.1:3030",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_EXACT.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "ai-beregner.dk" ||
      host.endsWith(".ai-beregner.dk") ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin);
  const corsOrigin = allowed && origin ? origin : "https://maegler.ai-beregner.dk";

  if (request.method === "OPTIONS") {
    if (origin && !allowed) {
      return new NextResponse(null, { status: 403 });
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", corsOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Vary", "Origin");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/sags-api/:path*"],
};
