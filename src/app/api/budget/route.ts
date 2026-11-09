import { NextResponse } from "next/server";
import { getTenantBudgetState } from "@/lib/ai-cost-guard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "vejle-maegleren";
  const state = getTenantBudgetState(tenantId);
  return NextResponse.json(state);
}
