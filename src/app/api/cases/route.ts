import { NextResponse } from "next/server";
import {
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

  // Hvis mægleren genåbner en gemt sag fra sagslisten, sikrer vi at profilen er gemt og at smart-watcher evt. minder om manglende dokumenter (maks 2 gange totalt!)
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
    const record = upsertSellerCase({
      id: body.id,
      agentEmail: body.agentEmail,
      agentName: body.agentName,
      address: body.address || "H C Hansens Vej 29, 7100 Vejle",
      sellerName: body.sellerName,
      sellerEmail: body.sellerEmail,
      status: body.status,
      renovationLevel: body.renovationLevel,
      aiQuestions: body.aiQuestions,
      generatedAfsnit11Clauses: body.generatedAfsnit11Clauses,
      resolvedFlagIds: body.resolvedFlagIds,
      resolvedReminderIds: body.resolvedReminderIds,
      uploadedDocMeta: body.uploadedDocMeta,
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
      { error: error.message || "Kunne ikke gemme besvarelse" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Mangler sags-ID" }, { status: 400 });
  }
  const ok = deleteCaseById(id);
  return NextResponse.json({ deleted: ok });
}
