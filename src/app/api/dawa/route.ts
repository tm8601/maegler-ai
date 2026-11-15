import { NextResponse } from "next/server";
import { searchAddresses } from "@/lib/property-aggregator";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  const suggestions = await searchAddresses(q);
  return NextResponse.json(suggestions);
}
