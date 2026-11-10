import { NextResponse } from "next/server";
import { fetchFullPropertyProfile } from "@/lib/property-aggregator";
import { listCasesForAgent, upsertSellerCase } from "@/lib/case-store";
import { getTenantBudgetState } from "@/lib/ai-cost-guard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address =
      searchParams.get("q") ||
      searchParams.get("address") ||
      "H C Hansens Vej 29, 7100 Vejle";
    const husnummerId = searchParams.get("id") || undefined;
    const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined;
    const lon = searchParams.get("lon") ? Number(searchParams.get("lon")) : undefined;
    const agentEmail = searchParams.get("agentEmail") || "tobias@vejlemaegleren.dk";
    const agentName = searchParams.get("agentName") || "Tobias Meng";

    const profile = await fetchFullPropertyProfile({
      address,
      husnummerId,
      lat,
      lon,
    });

    const sellerCase = upsertSellerCase({
      agentEmail,
      agentName,
      address: profile.adresse,
      profile,
      aiQuestions: profile.saelgerSpoergsmaal,
    });

    const agentCases = listCasesForAgent(agentEmail).map(
      ({ profileSnapshot: _, ...summary }) => summary
    );

    const budget = getTenantBudgetState("vejle-maegleren");

    return NextResponse.json({
      profile,
      caseId: sellerCase.id,
      sellerCase,
      agentCases,
      budget,
    });
  } catch (error: any) {
    console.error("Property lookup error:", error);
    return NextResponse.json(
      { error: error.message || "Kunne ikke hente ejendomsprofil" },
      { status: 500 }
    );
  }
}
