import { NextResponse } from "next/server";
import {
  authenticateRequestAgent,
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
  const agent = authenticateRequestAgent(request);
  const { searchParams } = new URL(request.url);
  const listMode = searchParams.get("list") === "1";
  const agentEmail = searchParams.get("agentEmail") || undefined;

  if (listMode) {
    if (!agent) {
      return NextResponse.json(
        { error: "Adgang nægtet: API kræver gyldig autentificering." },
        { status: 401 }
      );
    }
    const cases = listCasesForAgent(agentEmail).map(({ profileSnapshot: _, ...summary }) => summary);
    return NextResponse.json({
      cases,
      budget: getTenantBudgetState("vejle-maegleren"),
    });
  }

  const id = searchParams.get("id") || "";
  const existsInStore = Boolean(id && id !== "default" && hasSellerCase(id));

  // Uautentificeret sælgerportal: kun adgang til specifik eksisterende sag uden interne mægler- eller agentliste-data
  if (!agent) {
    if (!existsInStore || id.length < 12) {
      return NextResponse.json(
        { error: "Adgang nægtet: API kræver gyldig autentificering." },
        { status: 401 }
      );
    }
    const record = getSellerCase(id);
    return NextResponse.json({
      id: record.id,
      address: record.address,
      sellerName: record.sellerName,
      skipSellerQuestionnaire: record.skipSellerQuestionnaire,
      dynamicQuestions: record.dynamicQuestions,
      disabledQuestionIds: record.disabledQuestionIds,
      answers: record.answers,
      followUpNotes: record.followUpNotes,
      generatedAfsnit11Clauses: record.generatedAfsnit11Clauses,
    });
  }

  const targetId = id || "default";
  const reopen = searchParams.get("reopen") === "1";
  let record = getSellerCase(targetId);

  if (reopen && hasSellerCase(targetId)) {
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
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json(
      { error: "Adgang nægtet: API kræver gyldig autentificering." },
      { status: 401 }
    );
  }
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
      profile: body.profile,
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
    const agentCases = listCasesForAgent(record.agentEmail).map(
      ({ profileSnapshot: _, ...summary }) => summary
    );
    return NextResponse.json({
      ...record,
      agentCases,
    });
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
    if (!id || typeof id !== "string" || id === "default" || !hasSellerCase(id)) {
      return NextResponse.json({ error: "Ugyldigt eller ukendt sags-ID" }, { status: 404 });
    }
    const updated = saveSellerCaseAnswers(id, answers || {}, followUpNotes || {});
    return NextResponse.json({
      id: updated.id,
      answers: updated.answers,
      followUpNotes: updated.followUpNotes,
      generatedAfsnit11Clauses: updated.generatedAfsnit11Clauses,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Kunne ikke gemme sælgersvar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json(
      { error: "Adgang nægtet: API kræver gyldig autentificering." },
      { status: 401 }
    );
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }
  const ok = deleteCaseById(id);
  return NextResponse.json({ deleted: ok });
}
