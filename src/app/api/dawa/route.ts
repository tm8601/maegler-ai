import { NextResponse } from "next/server";
import { searchAddresses } from "@/lib/property-aggregator";
import { authenticateRequestAgent } from "@/lib/case-store";

export async function GET(request: Request) {
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json(
      { error: "Adgang nægtet: API kræver gyldig autentificering." },
      { status: 401 }
    );
  }
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  const suggestions = await searchAddresses(q);
  return NextResponse.json(suggestions);
}
