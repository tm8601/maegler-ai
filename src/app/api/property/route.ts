import { NextResponse } from "next/server";
import { fetchFullPropertyProfile } from "@/lib/property-aggregator";
import { upsertSellerCase } from "@/lib/case-store";
import { getTenantBudgetState } from "@/lib/ai-cost-guard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("q") || searchParams.get("address") || "Kløvertoften 38, 7100 Vejle";
    const husnummerId = searchParams.get("id") || undefined;
    const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined;
    const lon = searchParams.get("lon") ? Number(searchParams.get("lon")) : undefined;

    const profile = await fetchFullPropertyProfile({
      address,
      husnummerId,
      lat,
      lon,
    });

    const sellerCase = upsertSellerCase({
      address: profile.adresse,
      aiQuestions: profile.krydsrevision.dynamiskeSaelgerSpoergsmaal,
      generatedAfsnit11Clauses: profile.krydsrevision.afsnit11Klausuler.map((k) => k.tekst),
    });

    const budget = getTenantBudgetState("vejle-maegleren");

    return NextResponse.json({
      profile,
      caseId: sellerCase.id,
      sellerCase,
      budget,
    });
  } catch (error: any) {
    console.error("Property lookup error:", error);
    return NextResponse.json({ error: error.message || "Kunne ikke hente ejendomsprofil" }, { status: 500 });
  }
}
