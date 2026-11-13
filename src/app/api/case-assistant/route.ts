import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  checkAndReserveAiBudget,
  COST_PER_ASSISTANT_TURN_DKK,
  finalizeAiCallUsage,
  LOCKED_FLASH_MODEL,
  releaseInFlightLock,
} from "@/lib/ai-cost-guard";
import {
  buildDefaultCheckForMeta,
  computeMissingRemindersForCase,
  detectDocumentCategoryFromContent,
  extractPrintableTextFromBuffer,
  getSellerCase,
  listCasesForAgent,
  listUploadedFilesFromDisk,
  makeCaseId,
  normalizeAgentEmail,
  saveUploadedFileToDisk,
  upsertSellerCase,
  type CaseDocumentCheckItem,
  type CaseUploadedDocMeta,
} from "@/lib/case-store";
import { fetchFullPropertyProfile, PropertyFullProfile, RenovationLevelKey } from "@/lib/property-aggregator";

const ASSISTANT_SYSTEM_PROMPT = `
Du er Vejle Mæglerens intelligente Sags-AI og Olietank-Vagthund (juridisk og byggeteknisk dokumentkontrol-assistent).
Mægleren skriver til dig for at:
1) Spørge til sagens status, hvor langt du er med gennemgangen, og hvad du har fundet i BBR, Matrikel, Plandata, dokumenter og fotos.
2) Spørge specifikt til olietanke, BBR_TekniskAnlaeg og synlige tegn på olietank på billeder (påfyldningsstuds i sokkel, udluftningsrør/svanehals med paddehat-hætte ved sokkel/skel, afblændede kobberrør ved skorsten/fyr, sætninger i fliser på 1x1 m, skjolder på betongulv).
3) Rette eller afklare punkter på sagen (f.eks. at et BBR-forhold, et skur/carport, en olietank eller et dokument nu er kommet på plads).
4) Tilføje eller rette en klausul i købsaftalens Afsnit 11 (HUSK: Skriv ALDRIG at køber ikke kan rette krav mod "ejendomsmægler", da mægler ikke er part i købsaftalen).
5) Få oplyst arealer (inkl. 1. sal / udnyttet tagetage), bebyggelsesprocent (BR18), vurdering eller Golden Standard beslutningsmail til sælger/bobestyrer (Mulighed 1, 2 og 3).

REGLER (UFRAVIGELIGE):
- Gæt ALDRIG. Brug kun sagens verificerede registerfakta, de uploadede dokumenter/fotos og mæglerens egne oplysninger.
- Svar direkte, konkret og hjælpsomt på mæglerens spørgsmål på dansk (3-6 sætninger). Undgå generiske standardsvar!
- Du SKAL svare i gyldigt JSON med præcis dette skema:
{
  "replyText": "Dit direkte, præcise svar på mæglerens spørgsmål på dansk",
  "resolveFlagIds": ["evt. id på roedeFlag som mægleren siger er løst/afklaret"],
  "resolveReminderIds": ["evt. id på dokument-påmindelse (rem-tingbogsattest, rem-byggesag, rem-tilstand-el-energi) som nu er på plads"],
  "addAfsnit11Clause": "evt. ny eller tilpasset Afsnit 11 klausul-tekst hvis mægleren beder om det, ellers null",
  "setRenovationLevel": "gennemrenoveret | mellemrenoveret | ikke_renoveret | null",
  "actionsSummary": ["Kort liste over hvad du har opdateret på sagen"]
}
`;

function buildIntelligentCaseAssistantReply(params: {
  message: string;
  profile: PropertyFullProfile;
  uploadedDocMetas: CaseUploadedDocMeta[];
  documentChecks: CaseDocumentCheckItem[];
  resolvedFlags: Set<string>;
  remainingMissingTitles: string[];
  actionsTaken: string[];
  newUploadedNames: string[];
}): string {
  const {
    message,
    profile,
    uploadedDocMetas,
    documentChecks,
    resolvedFlags,
    remainingMissingTitles,
    actionsTaken,
    newUploadedNames,
  } = params;
  const lower = message.toLowerCase();
  const bbr = profile.bbr;
  const mat = profile.matrikel;
  const plan = profile.plandata;

  const photos = uploadedDocMetas.filter(
    (d) => d.type === "photo" || /\.(png|jpg|jpeg|webp)$/i.test(d.name)
  );
  const docs = uploadedDocMetas.filter(
    (d) => d.type !== "photo" && !/\.(png|jpg|jpeg|webp)$/i.test(d.name)
  );
  const activeFlags = profile.roedeFlag.filter((f) => !resolvedFlags.has(f.id));
  const firstFloorM2 =
    bbr.udnyttetTagetageM2 > 0
      ? bbr.udnyttetTagetageM2
      : bbr.antalEtager > 1 && bbr.boligarealM2 > bbr.bebyggetArealHovedbygningM2
      ? Math.max(0, bbr.boligarealM2 - bbr.bebyggetArealHovedbygningM2 - bbr.lovligBeboelseKaelderM2)
      : 0;

  const tankSummary =
    bbr.tekniskeAnlaeg.length > 0
      ? `I BBR_TekniskAnlaeg er der registreret ${bbr.tekniskeAnlaeg.length} tank(e): ${bbr.tekniskeAnlaeg
          .map(
            (t) =>
              `${t.indholdTekst} (${t.volumenLiter ? `${t.volumenLiter} L, ` : ""}${t.placering}, etableret ${t.etableringsaar || "ukendt år"}, status: ${t.driftstatusTekst})`
          )
          .join("; ")}.`
      : `I BBR_TekniskAnlaeg er der registreret 0 olietanke på ejendommen, og nuværende opvarmning er ${bbr.varmeinstallationTekst} (${bbr.opvarmningsmiddelTekst}).`;

  const photoChecks = documentChecks.filter((c) => c.fileType === "photo");
  const oilDocChecks = documentChecks.filter(
    (c) =>
      c.kategori.toLowerCase().includes("olie") ||
      c.fundOverskrift.toLowerCase().includes("olie") ||
      c.fundOverskrift.toLowerCase().includes("tank")
  );

  const photoInspectionSummary =
    photos.length > 0
      ? `Jeg har gennemgået sagens ${photos.length} uploadede billede(r) (${photos.map((p) => p.name).join(", ")}) for visuelle olietankspor (påfyldningsstuds i sokkel, udluftningsrør/svanehals med hætte ved sokkel/skel, afblændede kobberrør ved skorsten/fyr og 1×1 m sætninger i fliser): ${
          photoChecks.length > 0
            ? photoChecks.map((c) => c.fundOverskrift).join(" | ")
            : "Billederne er registreret og tjekket mod BBR."
        }`
      : `Der ligger endnu 0 besigtigelsesfotos på sagen. Upload gerne fotos af sokkel, have/skel, flisebelægning og fyr-/teknikrum her i chatten eller i Dokumentrum, så scanner jeg dem straks for udluftningsrør (svanehals/paddehat), påfyldningsstudse, afblændede kobberrør og lunker i fliserne.`;

  const asksAboutOilOrPhotos =
    /olie|tank|billede|foto|synlige tegn|udluftning|svanehals|påfyldning|sløjf|jordforurening|fyringsolie/.test(
      lower
    );
  const asksAboutProgressOrStatus =
    /hvor langt|status|hvad mangler|overblik|tjekket|gennemgået|hvad har du fundet/.test(
      lower
    );
  const asksAboutAreaOrBbr =
    /areal|m2|m²|1\.\s*sal|førstesal|tagetage|bebygget|bbr|etage|kælder|carport|udhus|skur|bebyggelsesprocent|br18/.test(
      lower
    );
  const asksAboutMailOrOptions =
    /mail|sælger|bobestyrer|kommune|weblager|mulighed 1|mulighed 2|mulighed 3|beslutningsmail/.test(
      lower
    );
  const asksAboutValuation = /vurdering|pris|kvm|renover/.test(lower);

  const parts: string[] = [];

  if (newUploadedNames.length > 0) {
    const recList = uploadedDocMetas
      .filter((m) => newUploadedNames.includes(m.name))
      .map((m) => `${m.name} → genkendt som "${m.detectedCategory || "Sagsdokument"}"`)
      .join(", ");
    parts.push(`Jeg har læst og indholdsklassificeret: ${recList || newUploadedNames.join(", ")}.`);
  }

  if (asksAboutProgressOrStatus) {
    parts.push(
      `Status på ${profile.adresse} (BFE ${bbr.bfeNummer}, Matr.nr. ${mat.matrikelnummer}): Alle 5 offentlige registre (DAWA, BBR, Matrikel, Plandata/Byggeret og Klimatilpasning) er færdiggransket. Boligarealet er ${bbr.boligarealM2} m² (Bebygget hus/total: ${bbr.bebyggetArealHovedbygningM2} / ${bbr.samletBebyggetArealM2} m²${firstFloorM2 > 0 ? `, heraf 1. sal: ${firstFloorM2} m²` : ""}).`
    );
    parts.push(
      `Dokumenter & Fotos: Der er uploadet og genkendt ${docs.length} dokument(er) og ${photos.length} foto(s) i Dokumentrummet (${
        uploadedDocMetas.length > 0
          ? uploadedDocMetas.map((d) => `${d.detectedCategory || d.name}`).join(", ")
          : "ingen brugeruploadede filer endnu"
      }).`
    );
    if (!asksAboutOilOrPhotos) {
      parts.push(`${tankSummary}`);
    }
  }

  if (asksAboutOilOrPhotos) {
    parts.push(`Olietank- & Billedkontrol: ${tankSummary} ${photoInspectionSummary}`);
    if (oilDocChecks.length > 0) {
      parts.push(
        `Dokumentfund vedr. olietank: ${oilDocChecks.map((c) => c.fundOverskrift).join(" ")}`
      );
    }
    parts.push(
      `Under fanen "Særlige Forhold (Afsnit 11 & Olietank)" ligger både den færdige Golden Standard beslutningsmail til sælger/bobestyrer (med Mulighed 1, 2 og 3), forespørgselsmail til kommunens byggesagsarkiv samt Afsnit 11-klausul klar til brug.`
    );
  }

  if (asksAboutAreaOrBbr && !asksAboutProgressOrStatus) {
    const secStr =
      bbr.sekundaereBygninger.length > 0
        ? bbr.sekundaereBygninger.map((s) => `${s.typeTekst}: ${s.arealM2} m²`).join(", ")
        : "Ingen sekundære bygninger";
    parts.push(
      `BBR & Arealer på ${profile.adresse}: Boligareal ${bbr.boligarealM2} m² fordelt på ${bbr.antalEtager} plan. Bebygget areal (Hus / Total): ${bbr.bebyggetArealHovedbygningM2} / ${bbr.samletBebyggetArealM2} m²${
        firstFloorM2 > 0 ? ` · 1. sal / udnyttet tagetage: ${firstFloorM2} m²` : ""
      }${bbr.kaelderArealM2 > 0 ? ` · Kælder: ${bbr.kaelderArealM2} m²` : ""}. Sekundære bygninger: ${secStr}. BR18-bebyggelsesprocent: ${plan.faktiskBebyggelsesprocent} % af grundens ${mat.registreretArealM2} m² (maks. ${plan.tilladtBebyggelsesprocent} %).`
    );
  }

  if (asksAboutMailOrOptions) {
    parts.push(
      `Beslutningsmailen til sælger/bobestyrer (Golden Standard) er klar under fanen "Særlige Forhold (Afsnit 11 & Olietank)". Den gennemgår objektivt og loyalt: Mulighed 1 (Fuld undersøgelse og evt. opgravning/sløjfning nu), Mulighed 2 (Aftale med køber om deling/prisnedslag kombineret med fuld oplysning i Afsnit 11) og Mulighed 3 (Salg med fuld og loyal oplysning uden forudgående undersøgelse), så sælger/bobestyrer selv træffer valget.`
    );
  }

  if (asksAboutValuation) {
    const v = profile.vurdering;
    parts.push(
      `Vurderingsinterval på ${profile.adresse} (${v.omraadeNavn}): Gennemrenoveret: ${(v.niveauer.gennemrenoveret.estimatDkk / 1_000_000).toFixed(2)} mio. kr. (${v.niveauer.gennemrenoveret.m2PrisDkk.toLocaleString("da-DK")} kr./m²) · Mellemrenoveret: ${(v.niveauer.mellemrenoveret.estimatDkk / 1_000_000).toFixed(2)} mio. kr. · Ikke renoveret: ${(v.niveauer.ikke_renoveret.estimatDkk / 1_000_000).toFixed(2)} mio. kr.`
    );
  }

  if (actionsTaken.length > 0) {
    parts.push(`Opdateringer udført på sagen: ${actionsTaken.join(", ")}.`);
  }

  if (parts.length === 0) {
    parts.push(
      `Her er status på ${profile.adresse}: Boligareal ${bbr.boligarealM2} m², Bebygget (Hus / Total) ${bbr.bebyggetArealHovedbygningM2} / ${bbr.samletBebyggetArealM2} m²${
        firstFloorM2 > 0 ? ` (1. sal: ${firstFloorM2} m²)` : ""
      }, Grund ${mat.registreretArealM2} m². ${tankSummary} Der er ${activeFlags.length} aktive OBS-punkter på forsiden og ${uploadedDocMetas.length} uploadede filer i Dokumentrummet.`
    );
  }

  if (remainingMissingTitles.length > 0 && (asksAboutProgressOrStatus || parts.length === 1)) {
    parts.push(`Manglende dokumenter i Dokumentrum: ${remainingMissingTitles.join(", ")}.`);
  }

  return parts.join("\n\n");
}


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

    agentEmail = normalizeAgentEmail(agentEmail);
    const resolvedId = caseId || makeCaseId(agentEmail, address || "H C Hansens Vej 29, 7100 Vejle");
    const currentCase = getSellerCase(resolvedId);
    const targetAddress = address || currentCase.address || "H C Hansens Vej 29, 7100 Vejle";
    lockKey = targetAddress;

    const profile =
      currentCase.profileSnapshot || (await fetchFullPropertyProfile({ address: targetAddress }));
    lockKey = profile.adresse;

    // Håndtér evt. vedhæftede bilag i beskeden (med automatisk indholdsgenkendelse uanset filnavn)
    const nowTime = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const nextDocMetas = [...(currentCase.uploadedDocMeta || [])];
    const nextDocumentChecks = [...(currentCase.documentChecks || [])];
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
      const extractedText = extractPrintableTextFromBuffer(buffer);
      const catInfo = detectDocumentCategoryFromContent(file.name, extractedText);
      const matchedRem = catInfo.reminderId;
      if (matchedRem) {
        resolvedReminders.add(matchedRem);
      }
      actionsTaken.push(`Genkendte ${file.name} som "${catInfo.categoryLabel}"`);

      const existingIdx = nextDocMetas.findIndex((d) => d.name === file.name);
      const docId =
        existingIdx >= 0
          ? nextDocMetas[existingIdx].id
          : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
      const newMeta: CaseUploadedDocMeta = {
        id: docId,
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        type: isImage ? "photo" : "document",
        mimeType: file.type || (isImage ? "image/png" : "application/pdf"),
        uploadedAt: nowTime,
        matchedReminderId: matchedRem,
        detectedCategory: isImage && catInfo.categoryLabel === "Sagsdokument" ? "Besigtigelsesfoto" : catInfo.categoryLabel,
        extractedSummary: extractedText ? extractedText.slice(0, 300) : undefined,
      };
      if (existingIdx >= 0) {
        nextDocMetas[existingIdx] = newMeta;
      } else {
        nextDocMetas.push(newMeta);
      }
      const checkItem = buildDefaultCheckForMeta(newMeta, profile);
      const chkIdx = nextDocumentChecks.findIndex((c) => c.fileName === file.name);
      if (chkIdx >= 0) {
        nextDocumentChecks[chkIdx] = checkItem;
      } else {
        nextDocumentChecks.unshift(checkItem);
      }

      if (isPdfMagic) {
        fileParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } });
      } else if (isPngMagic) {
        fileParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "image/png" } });
      } else if (isJpgMagic) {
        fileParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "image/jpeg" } });
      } else {
        fileParts.push({ text: `--- BILAG: ${file.name} ---\n${extractedText || buffer.toString("utf8").slice(0, 40000)}` });
      }
    }

    // Hvis mægleren spørger til billeder/olietank og ikke vedhæftede nye filer i selve beskeden, medsend allerede uploadede fotos fra sagen (maks 4 stk.)
    const lowerMsg = message.toLowerCase();
    if (
      fileParts.length === 0 &&
      /billede|foto|olietank|tank|synlige tegn|udluftning|påfyldning/.test(lowerMsg)
    ) {
      const diskFiles = listUploadedFilesFromDisk(resolvedId);
      for (const df of diskFiles.slice(0, 4)) {
        const isImg =
          df.mimeType.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(df.fileName);
        if (isImg && df.buffer.length < 4_000_000) {
          fileParts.push({
            inlineData: {
              data: df.buffer.toString("base64"),
              mimeType: df.mimeType.startsWith("image/") ? df.mimeType : "image/jpeg",
            },
          });
        }
      }
    }

    // Deterministisk forhåndstolkning af mæglerens instruks (sikrer at opdateringer altid slår igennem, også ved fallback)
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

      const firstFloorM2 =
        profile.bbr.udnyttetTagetageM2 > 0
          ? profile.bbr.udnyttetTagetageM2
          : profile.bbr.antalEtager > 1 && profile.bbr.boligarealM2 > profile.bbr.bebyggetArealHovedbygningM2
          ? Math.max(
              0,
              profile.bbr.boligarealM2 -
                profile.bbr.bebyggetArealHovedbygningM2 -
                profile.bbr.lovligBeboelseKaelderM2
            )
          : 0;

      const promptText = `
SAG: ${profile.adresse} (BFE ${profile.bbr.bfeNummer}, Matr. ${profile.matrikel.matrikelnummer})
NUVÆRENDE FAKTA: Boligareal ${profile.bbr.boligarealM2} m² (${profile.bbr.antalEtager} plan), Bebygget (Hus / Total): ${profile.bbr.bebyggetArealHovedbygningM2} / ${profile.bbr.samletBebyggetArealM2} m², 1. sal / udnyttet tagetage: ${firstFloorM2} m², Grund ${profile.matrikel.registreretArealM2} m², Opført ${profile.bbr.opfoerelsesaar}, Tag: ${profile.bbr.tagmaterialeTekst}, Varme: ${profile.bbr.varmeinstallationTekst} (${profile.bbr.opvarmningsmiddelTekst}).
BBR_TEKNISKANLÆG (OLIETANKE): ${JSON.stringify(profile.bbr.tekniskeAnlaeg)}
UPLOADEDE FILER OG FOTOS PÅ SAGEN: ${JSON.stringify(
        nextDocMetas.map((d) => ({
          name: d.name,
          type: d.type,
          detectedCategory: d.detectedCategory,
        }))
      )}
DOKUMENT- OG BILLEDKONTROL FUND: ${JSON.stringify(
        nextDocumentChecks.slice(0, 12).map((c) => ({
          fileName: c.fileName,
          kategori: c.kategori,
          status: c.status,
          fundOverskrift: c.fundOverskrift,
        }))
      )}
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

    // Intelligent fagligt svar hvis AI ikke svarede eller hvis svaret skal suppleres
    if (!aiReplyText || aiReplyText.startsWith("Noteret på ")) {
      const tempCase = {
        ...currentCase,
        uploadedDocMeta: nextDocMetas,
        resolvedReminderIds: Array.from(resolvedReminders),
        profileSnapshot: profile,
      };
      const remainingMissing = computeMissingRemindersForCase(tempCase);
      aiReplyText = buildIntelligentCaseAssistantReply({
        message: agentMsgText,
        profile,
        uploadedDocMetas: nextDocMetas,
        documentChecks: nextDocumentChecks,
        resolvedFlags,
        remainingMissingTitles: remainingMissing.map((m) => m.titel.split("(")[0].trim()),
        actionsTaken,
        newUploadedNames: uploadedNames,
      });
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
      documentChecks: nextDocumentChecks,
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
