import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_EXACT = new Set([
  "https://maegler.ai-beregner.dk",
  "https://maegler-ai.ai-beregner.dk",
  "https://olietank.ai-beregner.dk",
  "http://localhost:3000",
  "http://localhost:3011",
  "http://localhost:3030",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3011",
  "http://127.0.0.1:3030",
]);

const ipRateBuckets = new Map<string, number[]>();

function checkRateLimit(ip: string, bucket: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const prev = (ipRateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (prev.length >= maxRequests) {
    ipRateBuckets.set(key, prev);
    return false;
  }
  prev.push(now);
  ipRateBuckets.set(key, prev);
  return true;
}

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
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
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
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");
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

  const pathname = request.nextUrl.pathname;
  const isHealthCheck = pathname === "/api/health" || pathname === "/sags-api/health";
  const isWatchdogBudget =
    (pathname === "/api/budget" || pathname === "/sags-api/budget") &&
    (request.headers.get("user-agent") || "").includes("Antigravity-Watchdog");

  if (!isHealthCheck && !isWatchdogBudget) {
    const hasAuthCookie = Boolean(request.cookies.get("maegler_token")?.value);
    const authHeader = request.headers.get("authorization") || "";
    const hasBearer = authHeader.startsWith("Bearer ") && authHeader.length > 10;
    const hasCfAccess = Boolean(request.headers.get("cf-access-jwt-assertion"));
    const isSameOriginBrowser =
      secFetchSite === "same-origin" ||
      secFetchSite === "same-site" ||
      allowed ||
      isAllowedOrigin(referer);

    if (!hasAuthCookie && !hasBearer && !hasCfAccess && !isSameOriginBrowser) {
      return NextResponse.json(
        { error: "Adgang nægtet: API kræver autentificering." },
        { status: 401 }
      );
    }

    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    if (pathname.includes("/mail") && !checkRateLimit(clientIp, "mail", 10, 60_000)) {
      return NextResponse.json(
        { error: "Rate limit overskredet for e-mailudsendelse. Prøv igen om 1 minut." },
        { status: 429 }
      );
    }
    if (
      (pathname.includes("/analyze") || pathname.includes("/case-assistant")) &&
      !checkRateLimit(clientIp, "ai", 15, 60_000)
    ) {
      return NextResponse.json(
        { error: "Rate limit overskredet for AI-opslag. Prøv igen om 1 minut." },
        { status: 429 }
      );
    }
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
