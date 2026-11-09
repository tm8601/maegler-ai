import { NextResponse } from "next/server";
import { getSellerCase, saveSellerCaseAnswers, upsertSellerCase } from "@/lib/case-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "default";
  const record = getSellerCase(id);
  return NextResponse.json(record);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const record = upsertSellerCase({
      id: body.id,
      address: body.address || "Kløvertoften 38, 7100 Vejle",
      sellerName: body.sellerName,
      sellerEmail: body.sellerEmail,
      status: body.status || "sendt",
      aiQuestions: body.aiQuestions,
      generatedAfsnit11Clauses: body.generatedAfsnit11Clauses,
    });
    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Kunne ikke gemme sag" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, answers, followUpNotes } = body;
    if (!id) {
      return NextResponse.json({ error: "Mangler sags-ID" }, { status: 400 });
    }
    const updated = saveSellerCaseAnswers(id, answers || {}, followUpNotes || {});
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Kunne ikke gemme besvarelse" }, { status: 500 });
  }
}
