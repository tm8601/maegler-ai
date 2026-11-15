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
  return NextResponse.json({
    user,
    agents: user ? listPublicAgents() : [],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const name = body.name ? String(body.name).trim() : undefined;

    if (!email || !email.includes("@") || !password) {
      return NextResponse.json(
        { error: "Forkert e-mail eller adgangskode." },
        { status: 401 }
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
  } catch {
    return NextResponse.json(
      { error: "Forkert e-mail eller adgangskode." },
      { status: 401 }
    );
  }
}
