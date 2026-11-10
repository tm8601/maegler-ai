import { NextResponse } from "next/server";
import {
  calculateFloorplanVsBbr,
  deleteCaseById,
  getSellerCase,
  hasSellerCase,
  listCasesForAgent,
  saveSellerCaseAnswers,
  upsertSellerCase,
} from "@/lib/case-store";
import { fetchFullPropertyProfile } from "@/lib/property-aggregator";
import { getTenantBudgetState } from "@/lib/ai-cost-guard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listMode = searchParams.get("list") === "1";
  const agentEmail = searchParams.get("agentEmail") || undefined;

  if (listMode) {
    const cases = listCasesForAgent(agentEmail).map(({ profileSnapshot: _, ...summary }) => summary);
    return NextResponse.json({
      cases,
      budget: getTenantBudgetState("vejle-maegleren"),
    });
  }

  const id = searchParams.get("id") || "default";
  const reopen = searchParams.get("reopen") === "1";
  const existsInStore = hasSellerCase(id);
  let record = getSellerCase(id);

  if (reopen && existsInStore) {
    let profile = record.profileSnapshot;
    if (!profile && record.address) {
      try {
        profile = await fetchFullPropertyProfile({ address: record.address });
      } catch {
        // Ignore
      }
    }
    if (profile) {
      record = upsertSellerCase({
        id: record.id,
        agentEmail: record.agentEmail,
        agentName: record.agentName,
        address: record.address,
        profile,
        triggerSmartWatch: true,
      });
    }
  }

  const agentCases = listCasesForAgent(record.agentEmail).map(
    ({ profileSnapshot: _, ...summary }) => summary
  );
  const budget = getTenantBudgetState("vejle-maegleren");

  return NextResponse.json({
    ...record,
    agentCases,
    budget,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let floorplanCheck = body.floorplanCheck;

    if (body.floorplanInput) {
      const fp = body.floorplanInput;
      floorplanCheck = calculateFloorplanVsBbr({
        sourceFileName: fp.sourceFileName || "Manuel / Plantegningskontrol (L×B)",
        indvendigLaengdeM: Number(fp.indvendigLaengdeM) || 0,
        indvendigBreddeM: Number(fp.indvendigBreddeM) || 0,
        antalIndervaegge: Number(fp.antalIndervaegge ?? 5),
        indervaegTykkelseCm: Number(fp.indervaegTykkelseCm ?? 10),
        ydervaegTykkelseCm: Number(fp.ydervaegTykkelseCm ?? 35),
        rumListe: fp.rumListe,
        bbrBoligarealM2: Number(fp.bbrBoligarealM2) || 88,
        isDetected: true,
      });
    }

    const record = upsertSellerCase({
      id: body.id,
      agentEmail: body.agentEmail,
      agentName: body.agentName,
      address: body.address || "H C Hansens Vej 29, 7100 Vejle",
      sellerName: body.sellerName,
      sellerEmail: body.sellerEmail,
      status: body.status,
      skipSellerQuestionnaire: body.skipSellerQuestionnaire,
      disabledQuestionIds: body.disabledQuestionIds,
      renovationLevel: body.renovationLevel,
      aiQuestions: body.aiQuestions,
      generatedAfsnit11Clauses: body.generatedAfsnit11Clauses,
      afsnit11Items: body.afsnit11Items,
      resolvedFlagIds: body.resolvedFlagIds,
      resolvedReminderIds: body.resolvedReminderIds,
      uploadedDocMeta: body.uploadedDocMeta,
      documentChecks: body.documentChecks,
      floorplanCheck,
      assistantMessages: body.assistantMessages,
      analysisReport: body.analysisReport,
    });
    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Kunne ikke gemme sag" },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: error.message || "Kunne ikke gemme sælgersvar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }
  const ok = deleteCaseById(id);
  return NextResponse.json({ deleted: ok });
}
