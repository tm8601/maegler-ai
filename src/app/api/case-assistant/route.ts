import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  checkAndReserveAiBudget,
  COST_PER_ASSISTANT_TURN_DKK,
  finalizeAiCallUsage,
  getTenantBudgetState,
  LOCKED_FLASH_MODEL,
  releaseInFlightLock,
} from "@/lib/ai-cost-guard";
import {
  computeMissingRemindersForCase,
  detectReminderMatchFromFilename,
  getSellerCase,
  listCasesForAgent,
  makeCaseId,
  saveUploadedFileToDisk,
  upsertSellerCase,
} from "@/lib/case-store";
import { fetchFullPropertyProfile, RenovationLevelKey } from "@/lib/property-aggregator";

const ASSISTANT_SYSTEM_PROMPT = `
Du er Vejle Mæglerens intelligente Sags-AI.
Mægleren skriver til dig for at:
1) Rette eller afklare punkter på sagen (f.eks. at et BBR-forhold, et skur/carport, en olietank eller et dokument nu er kommet på plads).
2) Tilføje eller rette en klausul i købsaftalens Afsnit 11.
3) Få tjekket nye bilag op imod sagens verificerede BBR-, Matrikel- og Plandata.
4) Spørge til sagens status og hvilke dokumenter der mangler.

REGLER (UFRAVIGELIGE):
- Gæt ALDRIG. Brug kun sagens hårde registerfakta og mæglerens egne oplysninger.
- Svar kort, præcist og professionelt på dansk (maks 3-4 sætninger).
- Du SKAL svare i gyldigt JSON med præcis dette skema:
{
  "replyText": "Dit korte svar til mægleren på dansk",
  "resolveFlagIds": ["evt. id på roedeFlag som mægleren siger er løst/afklaret"],
  "resolveReminderIds": ["evt. id på dokument-påmindelse (rem-tingbogsattest, rem-byggesag, rem-tilstand-el-energi) som nu er på plads"],
  "addAfsnit11Clause": "evt. ny eller tilpasset Afsnit 11 klausul-tekst hvis mægleren beder om det, ellers null",
  "setRenovationLevel": "gennemrenoveret | mellemrenoveret | ikke_renoveret | null",
  "actionsSummary": ["Kort liste over hvad du har opdateret på sagen, f.eks. 'Markerede BBR-observandum som afklaret'"]
}
`;

export async function POST(request: Request) {
  let lockKey = "default";
  try {
    const contentType = request.headers.get("content-type") || "";
    let caseId = "";
    let address = "";
    let agentEmail = "tobias@vejlemaegleren.dk";
    let agentName = "Tobias Meng";
    let message = "";
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      caseId = String(formData.get("caseId") || "").trim();
      address = String(formData.get("address") || "").trim();
      agentEmail = String(formData.get("agentEmail") || "tobias@vejlemaegleren.dk").trim();
      agentName = String(formData.get("agentName") || "Tobias Meng").trim();
      message = String(formData.get("message") || "").trim();
      files = formData.getAll("files") as File[];
    } else {
      const body = await request.json();
      caseId = String(body.caseId || "").trim();
      address = String(body.address || "").trim();
      agentEmail = String(body.agentEmail || "tobias@vejlemaegleren.dk").trim();
      agentName = String(body.agentName || "Tobias Meng").trim();
      message = String(body.message || "").trim();
    }

    if (!message && files.length === 0) {
      return NextResponse.json({ error: "Skriv en besked eller vedhæft et bilag" }, { status: 400 });
    }

    const resolvedId = caseId || makeCaseId(agentEmail, address || "H C Hansens Vej 29, 7100 Vejle");
    const currentCase = getSellerCase(resolvedId);
    const targetAddress = address || currentCase.address || "H C Hansens Vej 29, 7100 Vejle";
    lockKey = targetAddress;

    const profile =
      currentCase.profileSnapshot || (await fetchFullPropertyProfile({ address: targetAddress }));
    lockKey = profile.adresse;

    // Håndtér evt. vedhæftede bilag i beskeden
    const nowTime = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const nextDocMetas = [...(currentCase.uploadedDocMeta || [])];
    const resolvedReminders = new Set(currentCase.resolvedReminderIds || []);
    const resolvedFlags = new Set(currentCase.resolvedFlagIds || []);
    const clauses = [...(currentCase.generatedAfsnit11Clauses || [])];
    const actionsTaken: string[] = [];
    const fileParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];
    const uploadedNames: string[] = [];

    for (const file of files) {
      uploadedNames.push(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const matchedRem = detectReminderMatchFromFilename(file.name);
      if (matchedRem) {
        resolvedReminders.add(matchedRem);
        actionsTaken.push(`Registrerede ${file.name} i Dokumentrum`);
      }
      const existingMeta = nextDocMetas.find((d) => d.name === file.name);
      const docId = existingMeta?.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const isPdfMagic = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
      const isPngMagic =
        buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isJpgMagic = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isImage =
        isPngMagic || isJpgMagic || file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(file.name);
      saveUploadedFileToDisk(
        resolvedId,
        docId,
        file.name,
        file.type || (isImage ? "image/png" : "application/pdf"),
        buffer
      );
      if (!existingMeta) {
        nextDocMetas.push({
          id: docId,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          type: isImage ? "photo" : "document",
          mimeType: file.type || (isImage ? "image/png" : "application/pdf"),
          uploadedAt: nowTime,
          matchedReminderId: matchedRem,
        });
      }
      if (isPdfMagic) {
        fileParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } });
      } else if (isPngMagic) {
        fileParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "image/png" } });
      } else if (isJpgMagic) {
        fileParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "image/jpeg" } });
      } else {
        fileParts.push({ text: `--- BILAG: ${file.name} ---\n${buffer.toString("utf8").slice(0, 40000)}` });
      }
    }

    // Deterministisk forhåndstolkning af mæglerens instruks (sikrer at opdateringer altid slår igennem, også ved fallback)
    const lowerMsg = message.toLowerCase();
    if (
      lowerMsg.includes("styr på") ||
      lowerMsg.includes("afklaret") ||
      lowerMsg.includes("godkendt") ||
      lowerMsg.includes("lovlig") ||
      lowerMsg.includes("fjern") ||
      lowerMsg.includes("rettet")
    ) {
      for (const flag of profile.roedeFlag) {
        if (
          ((lowerMsg.includes("sekundær") ||
            lowerMsg.includes("carport") ||
            lowerMsg.includes("udhus") ||
            lowerMsg.includes("skur") ||
            lowerMsg.includes("garage") ||
            lowerMsg.includes("bbr-anmærkning")) &&
            flag.id.includes("sekundaer")) ||
          ((lowerMsg.includes("tag") || lowerMsg.includes("asbest") || lowerMsg.includes("eternit")) &&
            flag.id.includes("asbest")) ||
          ((lowerMsg.includes("olie") || lowerMsg.includes("tank") || lowerMsg.includes("fyr")) &&
            (flag.id.includes("olie") || flag.id.includes("tek"))) ||
          (lowerMsg.includes("kloak") && flag.id.includes("kloak")) ||
          (lowerMsg.includes("cvr") && flag.id.includes("cvr")) ||
          (lowerMsg.includes("byggesag") && flag.id.includes("byggesag")) ||
          ((lowerMsg.includes("lokalplan") || lowerMsg.includes("bebyggelsesprocent")) &&
            flag.register === "Plandata") ||
          lowerMsg.includes("alle observanda") ||
          lowerMsg.includes("alle røde flag")
        ) {
          resolvedFlags.add(flag.id);
          actionsTaken.push(`Afklarede: ${flag.title}`);
        }
      }
      if (lowerMsg.includes("tingbog") || lowerMsg.includes("servitut")) {
        resolvedReminders.add("rem-tingbogsattest");
        actionsTaken.push("Markerede Tingbogsattest som modtaget");
      }
      if (lowerMsg.includes("byggesag") || lowerMsg.includes("tegning")) {
        resolvedReminders.add("rem-byggesag");
        actionsTaken.push("Markerede Byggesagsarkiv som modtaget");
      }
      if (lowerMsg.includes("tilstand") || lowerMsg.includes("elrapport") || lowerMsg.includes("energi")) {
        resolvedReminders.add("rem-tilstand-el-energi");
        actionsTaken.push("Markerede Tilstands-/El-rapport som modtaget");
      }
    }

    let nextRenovationLevel: RenovationLevelKey = currentCase.renovationLevel || "mellemrenoveret";
    if (lowerMsg.includes("gennemrenoveret")) {
      nextRenovationLevel = "gennemrenoveret";
      actionsTaken.push("Ændrede stand til Gennemrenoveret");
    } else if (lowerMsg.includes("ikke renoveret") || lowerMsg.includes("urenoveret")) {
      nextRenovationLevel = "ikke_renoveret";
      actionsTaken.push("Ændrede stand til Ikke renoveret");
    } else if (lowerMsg.includes("mellemrenoveret")) {
      nextRenovationLevel = "mellemrenoveret";
      actionsTaken.push("Ændrede stand til Mellemrenoveret");
    }

    // Tilføj mæglerens egen besked i loggen
    const agentMsgText =
      message || `Uploadede bilag: ${uploadedNames.join(", ")}`;
    const baseMessages = [
      ...(currentCase.assistantMessages || []),
      {
        id: `msg-agent-${Date.now()}`,
        sender: "agent" as const,
        text: agentMsgText,
        createdAt: new Date().toISOString(),
      },
    ];

    // Tjek AI budget (Zero-Limbo)
    const budgetCheck = checkAndReserveAiBudget({
      tenantId: "vejle-maegleren",
      caseKey: profile.adresse,
      estimatedCostDkk: COST_PER_ASSISTANT_TURN_DKK + files.length * 0.04,
    });

    let aiReplyText = "";
    let finalBudget = budgetCheck.state;

    if (budgetCheck.allowed && process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const activeFlagsForPrompt = profile.roedeFlag.map((f) => ({
        id: f.id,
        register: f.register,
        title: f.title,
        resolved: resolvedFlags.has(f.id),
      }));
      const missingBefore = computeMissingRemindersForCase({
        ...currentCase,
        uploadedDocMeta: nextDocMetas,
        resolvedReminderIds: Array.from(resolvedReminders),
        profileSnapshot: profile,
      });

      const promptText = `
SAG: ${profile.adresse} (BFE ${profile.bbr.bfeNummer}, Matr. ${profile.matrikel.matrikelnummer})
NUVÆRENDE FAKTA: Boligareal ${profile.bbr.boligarealM2} m², Bebygget total ${profile.bbr.samletBebyggetArealM2} m², Grund ${profile.matrikel.registreretArealM2} m², Opført ${profile.bbr.opfoerelsesaar}, Tag: ${profile.bbr.tagmaterialeTekst}.
AKTIVE OBSERVANDA PÅ SAGEN: ${JSON.stringify(activeFlagsForPrompt)}
MANGLENDE DOKUMENTER PÅ SAGEN: ${JSON.stringify(missingBefore.map((m) => ({ id: m.id, titel: m.titel })))}
EKSISTERENDE AFSNIT 11 KLAUSULER: ${JSON.stringify(clauses)}

MÆGLERENS INPUT: "${agentMsgText}"
${uploadedNames.length > 0 ? `NYE VEDHÆFTEDE BILAG: ${uploadedNames.join(", ")}` : ""}
`;

      const parts: any[] = [{ text: promptText }, ...fileParts];
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
      const aiPromise = ai.models
        .generateContent({
          model: LOCKED_FLASH_MODEL,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: ASSISTANT_SYSTEM_PROMPT,
            temperature: 0.0,
            maxOutputTokens: 900,
            thinkingConfig: { thinkingBudget: 512 },
            responseMimeType: "application/json",
          },
        })
        .catch(() => null);

      const aiRes = await Promise.race([aiPromise, timeoutPromise]);
      finalBudget = finalizeAiCallUsage({
        tenantId: "vejle-maegleren",
        caseKey: profile.adresse,
        reservedDkk: budgetCheck.reservedDkk,
        usageMetadata: aiRes?.usageMetadata,
      });

      if (aiRes?.text) {
        try {
          const parsed = JSON.parse(aiRes.text);
          if (typeof parsed.replyText === "string" && parsed.replyText.trim()) {
            aiReplyText = parsed.replyText.trim();
          }
          if (Array.isArray(parsed.resolveFlagIds)) {
            for (const fid of parsed.resolveFlagIds) {
              if (typeof fid === "string" && profile.roedeFlag.some((f) => f.id === fid)) {
                resolvedFlags.add(fid);
              }
            }
          }
          const validReminderIds = new Set([
            "rem-tingbogsattest",
            "rem-byggesag",
            "rem-tilstand-el-energi",
            ...profile.paamindelseDokumenter.map((d) => d.id),
          ]);
          if (Array.isArray(parsed.resolveReminderIds)) {
            for (const rid of parsed.resolveReminderIds) {
              if (typeof rid === "string" && validReminderIds.has(rid)) {
                resolvedReminders.add(rid);
              }
            }
          }
          if (typeof parsed.addAfsnit11Clause === "string" && parsed.addAfsnit11Clause.trim().length > 10) {
            const newCl = parsed.addAfsnit11Clause.trim();
            if (!clauses.includes(newCl)) {
              clauses.unshift(newCl);
              actionsTaken.push("Opdaterede Afsnit 11-klausul");
            }
          }
          if (
            parsed.setRenovationLevel === "gennemrenoveret" ||
            parsed.setRenovationLevel === "mellemrenoveret" ||
            parsed.setRenovationLevel === "ikke_renoveret"
          ) {
            nextRenovationLevel = parsed.setRenovationLevel;
          }
          if (Array.isArray(parsed.actionsSummary)) {
            for (const act of parsed.actionsSummary) {
              if (typeof act === "string" && !actionsTaken.includes(act)) {
                actionsTaken.push(act);
              }
            }
          }
        } catch {
          aiReplyText = aiRes.text.slice(0, 600);
        }
      }
    } else {
      releaseInFlightLock(profile.adresse);
    }

    // Sikr at eksplicit ønske om Afsnit 11-klausul altid tilføjes, selv hvis AI kun skrev replyText
    if (
      (lowerMsg.includes("klausul") || lowerMsg.includes("afsnit 11") || lowerMsg.includes("tilføj")) &&
      !actionsTaken.some((a) => a.toLowerCase().includes("afsnit 11"))
    ) {
      const cleanedNote = message.replace(/^(tilføj|ret|indsæt)\s*(til\s*afsnit\s*11)?[:\s-]*/i, "").trim();
      if (cleanedNote.length > 8) {
        const newClause = `Særskilt oplysning registreret af mægler: ${cleanedNote}`;
        if (!clauses.includes(newClause)) {
          clauses.unshift(newClause);
          actionsTaken.push("Tilføjede klausul til Afsnit 11");
        }
      }
    }

    // Deterministisk fallback-svar hvis AI ikke svarede eller hvis mægleren blot skrev en hurtig kommando
    if (!aiReplyText) {

      const tempCase = {
        ...currentCase,
        uploadedDocMeta: nextDocMetas,
        resolvedReminderIds: Array.from(resolvedReminders),
        profileSnapshot: profile,
      };
      const remainingMissing = computeMissingRemindersForCase(tempCase);
      const missingText =
        remainingMissing.length > 0
          ? ` Sagen afventer fortsat: ${remainingMissing.map((m) => m.titel.split("(")[0].trim()).join(", ")}.`
          : " Alle sagens dokumentkrav er nu opfyldt.";

      aiReplyText =
        actionsTaken.length > 0
          ? `Sagen er opdateret (${actionsTaken.join(", ")}).${missingText}`
          : `Noteret på ${profile.adresse}.${missingText}`;
    }

    const updatedMessages = [
      ...baseMessages,
      {
        id: `msg-ai-${Date.now()}`,
        sender: "ai" as const,
        text: aiReplyText,
        createdAt: new Date().toISOString(),
        actionsTaken: actionsTaken.length > 0 ? actionsTaken : undefined,
      },
    ];

    const updatedCase = upsertSellerCase({
      id: resolvedId,
      agentEmail,
      agentName,
      address: profile.adresse,
      profile,
      renovationLevel: nextRenovationLevel,
      generatedAfsnit11Clauses: clauses,
      resolvedFlagIds: Array.from(resolvedFlags),
      resolvedReminderIds: Array.from(resolvedReminders),
      uploadedDocMeta: nextDocMetas,
      assistantMessages: updatedMessages,
    });

    const agentCases = listCasesForAgent(agentEmail).map(
      ({ profileSnapshot: _, ...summary }) => summary
    );

    return NextResponse.json({
      sellerCase: updatedCase,
      agentCases,
      budget: finalBudget,
    });
  } catch (error: any) {
    releaseInFlightLock(lockKey);
    console.error("Case assistant error:", error);
    return NextResponse.json(
      { error: error.message || "Kunne ikke opdatere sagen" },
      { status: 500 }
    );
  }
}
