import { NextResponse } from "next/server";
import { getTenantBudgetState } from "@/lib/ai-cost-guard";
import { authenticateRequestAgent } from "@/lib/case-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "vejle-maegleren";
  const state = getTenantBudgetState(tenantId);
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json({
      tenantId: "redacted",
      date: state.date,
      spentDkk: state.spentDkk,
      totalHistoricalSpentDkk: state.totalHistoricalSpentDkk,
      maxDailyBudgetDkk: state.maxDailyBudgetDkk,
      maxCaseBudgetDkk: state.maxCaseBudgetDkk,
      callsToday: state.callsToday,
      cacheHitsToday: state.cacheHitsToday,
      blockedCallsToday: state.blockedCallsToday,
      inputTokensToday: state.inputTokensToday,
      outputTokensToday: state.outputTokensToday,
      caseSpendByKey: {},
      caseCallsByKey: {},
      lastModelUsed: state.lastModelUsed,
      lastCallAt: state.lastCallAt,
      lastError: null,
    });
  }
  return NextResponse.json(state);
}
