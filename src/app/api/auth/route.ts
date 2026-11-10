import { NextResponse } from "next/server";
import {
  authenticateOrRegisterAgent,
  listCasesForAgent,
  listPublicAgents,
  verifyAgentToken,
} from "@/lib/case-store";
import { getTenantBudgetState } from "@/lib/ai-cost-guard";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const user = verifyAgentToken(token);
  const agents = listPublicAgents();
  return NextResponse.json({
    user,
    agents,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim();
    const password = String(body.password || "vejle2026");
    const name = body.name ? String(body.name).trim() : undefined;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Indtast venligst en gyldig e-mailadresse" },
        { status: 400 }
      );
    }

    const { user, token } = authenticateOrRegisterAgent({
      email,
      password,
      name,
    });

    const cases = listCasesForAgent(user.email).map(({ profileSnapshot: _, ...summary }) => summary);
    const budget = getTenantBudgetState("vejle-maegleren");

    const response = NextResponse.json({ user, token, cases, budget });
    response.cookies.set("maegler_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error: any) {
    const isAuthErr = String(error?.message || "").toLowerCase().includes("adgangskode");
    return NextResponse.json(
      { error: error.message || "Fejl ved login" },
      { status: isAuthErr ? 401 : 500 }
    );
  }
}
