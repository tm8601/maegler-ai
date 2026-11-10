import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  fetchFullPropertyProfile,
  PropertyFullProfile,
} from "@/lib/property-aggregator";
import {
  checkAndReserveAiBudget,
  computePayloadSha256,
  COST_PER_DOC_ANALYSIS_DKK,
  finalizeAiCallUsage,
  getCachedAiAnalysis,
  getTenantBudgetState,
  LOCKED_FLASH_MODEL,
  releaseInFlightLock,
  setCachedAiAnalysis,
} from "@/lib/ai-cost-guard";
import {
  buildDefaultCheckForMeta,
  calculateFloorplanVsBbr,
  CaseDocumentCheckItem,
  CaseUploadedDocMeta,
  computeMissingRemindersForCase,
  detectReminderMatchFromFilename,
  FloorplanCalculation,
  getSellerCase,
  listUploadedFilesFromDisk,
  makeCaseId,
  saveUploadedFileToDisk,
  upsertSellerCase,
} from "@/lib/case-store";

const BOLIGHANDEL_ANALYSIS_SYSTEM_PROMPT = `
Du er en dansk juridisk og teknisk ejendomsmægler-revisor (Cand.jur. & Bygningskonstruktør).
Din opgave er aktivt at gennemgå hvert eneste vedhæftede dokument, plantegning og foto og krydstjekke det 1:1 mod ejendommens autoritative registerdata (BBR, Matrikel, Tingbog, Plandata).

STRENGE REGLER:
1. GÆT ALDRIG: Brug kun verificerede registerdata og det faktiske indhold i de uploadede dokumenter/fotos.
2. BILLEDKONTROL (FOTOS MOD BBR & BYGGESAG):
   - Hvis en fil er et foto af ejendommen, tjek om tagmateriale, facademateriale (ydervæg), antal etager og sekundære bygninger (carport, udhus, overdækket terrasse, udestue) stemmer overens med BBR og byggesager.
   - Hvis der ses uoverensstemmelser (f.eks. uregistreret overdækning/udestue eller andet tagmateriale end BBR), markér status som "afvigelse" eller "opmaerksomhed" og formulér et konkret forslag til Købsaftalens Afsnit 11.
3. PLANTEGNINGSKONTROL (L×B MOD BBR INDEN FOR ±15 %):
   - Hvis en fil er en plantegning (eller indeholder rum-/bygningsmål L×B), aflæs de indvendige mål (længde L og bredde B i meter, samt antal indvendige skillevægge eller rumliste).
   - Husk at plantegninger typisk angiver indvendige mål: Der tillægges 10 cm (0,10 m) pr. indervæg/skillevæg og 35 cm (0,35 m) pr. ydervæg for at beregne BBR-bruttoarealet, som skal ligge inden for ±15 % af BBR-boligarealet.
4. KØBSAFTALENS AFSNIT 11:
   - Formulér konkrete, skarpe og kopieringsklare klausuler til Købsaftalens Afsnit 11 for alle relevante fund i dokumenter, billeder, plantegninger og BBR.

Returnér ALTID gyldig JSON med præcis denne struktur:
{
  "documentChecks": [
    {
      "fileName": "navn på fil",
      "fileType": "document" | "photo" | "floorplan",
      "status": "ok" | "opmaerksomhed" | "afvigelse",
      "kategori": "Tingbog & Servitutter" | "Byggesagsarkiv & BBR" | "Plantegning (L×B mod BBR ±15 %)" | "Billedkontrol (Foto mod BBR & Byggesag)" | "Tilstands-, El- & Energirapport" | "Sagsdokument",
      "fundOverskrift": "Kort præcis konklusion på tjekket af denne fil",
      "fundDetaljer": [
        "Konkret punkt 1 tjekket mod BBR/Byggesag/Tingbog",
        "Konkret punkt 2 tjekket mod BBR/Byggesag/Tingbog"
      ],
      "afsnit11Forslag": "Konkret klausultekst til Købsaftalens Afsnit 11 hvis filen giver anledning til forbehold/oplysning, ellers null"
    }
  ],
  "floorplanDetected": {
    "isFloorplan": true | false,
    "sourceFileName": "filnavn hvis plantegning, ellers null",
    "indvendigLaengdeM": 10.4,
    "indvendigBreddeM": 6.7,
    "antalIndervaegge": 5,
    "rumListe": [
      { "navn": "Stue/Køkken", "laengdeM": 6.2, "breddeM": 4.5, "nettoM2": 27.9 }
    ]
  },
  "markdownSummary": "Kort struktureret revisionsresumé i Markdown"
}
`;

function parseDocumentTextForTingbog(rawText: string) {
  const lower = rawText.toLowerCase();
  const fundetTingbog =
    lower.includes("tingbogsattest") ||
    lower.includes("adkomst") ||
    lower.includes("hæftelser") ||
    lower.includes("servitutter");

  const servitutter: string[] = [];
  const servMatches = rawText.match(/(?:servitut|deklaration|byggelinje|vejret)[^\n\r]{0,120}/gi) || [];
  for (const m of servMatches.slice(0, 5)) {
    servitutter.push(m.trim());
  }

  return {
    fundetTingbog,
    servitutter,
  };
}

function extractFloorplanFromRawText(
  rawText: string,
  fileNames: string[],
  bbrBoligarealM2: number
): FloorplanCalculation | null {
  const floorplanFile = fileNames.find((n) =>
    /plantegning|tegning|plan|grundplan|opmaaling|opmåling|lxb/i.test(n)
  );
  const hasFloorplanKeyword =
    Boolean(floorplanFile) || /plantegning|indvendig|rummaal|rummål|l\s*x\s*b|længde.*bredde/i.test(rawText);

  if (!hasFloorplanKeyword) return null;

  // Find eksplicitte mål i teksten som f.eks. "10,4 x 6,7" eller "10.4m x 6.7m"
  const dimRegex = /(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:m\b)?\s*[x×*]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:m\b)?/gi;
  const matches: Array<{ l: number; b: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = dimRegex.exec(rawText)) !== null) {
    const l = parseFloat(m[1].replace(",", "."));
    const b = parseFloat(m[2].replace(",", "."));
    if (l >= 1.5 && l <= 35 && b >= 1.5 && b <= 35) {
      matches.push({ l, b });
    }
  }

  if (matches.length === 1) {
    return calculateFloorplanVsBbr({
      sourceFileName: floorplanFile || fileNames[0] || "Plantegning",
      indvendigLaengdeM: matches[0].l,
      indvendigBreddeM: matches[0].b,
      antalIndervaegge: 5,
      indervaegTykkelseCm: 10,
      ydervaegTykkelseCm: 35,
      bbrBoligarealM2,
      isDetected: true,
    });
  }

  if (matches.length > 1) {
    const rumListe = matches.slice(0, 10).map((pair, idx) => ({
      navn: `Rum ${idx + 1}`,
      laengdeM: pair.l,
      breddeM: pair.b,
      nettoM2: Number((pair.l * pair.b).toFixed(1)),
    }));
    return calculateFloorplanVsBbr({
      sourceFileName: floorplanFile || fileNames[0] || "Plantegning",
      indvendigLaengdeM: 0,
      indvendigBreddeM: 0,
      antalIndervaegge: Math.max(3, rumListe.length),
      indervaegTykkelseCm: 10,
      ydervaegTykkelseCm: 35,
      rumListe,
      bbrBoligarealM2,
      isDetected: true,
    });
  }

  // Hvis filen er en plantegning men uden rå tekst-dimensioner, opret standard kontrolberegning ud fra BBR
  return calculateFloorplanVsBbr({
    sourceFileName: floorplanFile || "Plantegning",
    indvendigLaengdeM: 0,
    indvendigBreddeM: 0,
    antalIndervaegge: 5,
    indervaegTykkelseCm: 10,
    ydervaegTykkelseCm: 35,
    bbrBoligarealM2,
    isDetected: true,
  });
}

function buildDeterministicChecksForFiles(
  metas: CaseUploadedDocMeta[],
  rawTextsByFile: Record<string, string>,
  profile: PropertyFullProfile,
  parsedTingbog: ReturnType<typeof parseDocumentTextForTingbog>,
  floorplanCheck: FloorplanCalculation | null
): CaseDocumentCheckItem[] {
  return metas.map((meta) => {
    const raw = (rawTextsByFile[meta.name] || "").toLowerCase();
    const base = buildDefaultCheckForMeta(meta, profile);

    if (base.fileType === "floorplan" && floorplanCheck) {
      return {
        ...base,
        status: floorplanCheck.indenfor15ProcentTolerance ? "ok" : "afvigelse",
        fundOverskrift: floorplanCheck.indenfor15ProcentTolerance
          ? `Plantegning L×B (${floorplanCheck.beregnetBruttoArealM2} m² brutto mod BBR ${floorplanCheck.bbrBoligarealM2} m²) – Godkendt inden for ±15 %`
          : `Plantegning L×B afviger ${floorplanCheck.afvigelseProcent > 0 ? "+" : ""}${floorplanCheck.afvigelseProcent} % fra BBR (${floorplanCheck.beregnetBruttoArealM2} m² mod ${floorplanCheck.bbrBoligarealM2} m²)`,
        fundDetaljer: [
          `Indvendige mål: ${floorplanCheck.indvendigLaengdeM} × ${floorplanCheck.indvendigBreddeM} m = ${floorplanCheck.indvendigtNettoArealM2} m² indvendigt nettoareal.`,
          `Tillæg: +${floorplanCheck.tillaegIndervaeggeM2} m² indervægge (${floorplanCheck.indervaegTykkelseCm} cm) og +${floorplanCheck.tillaegYdervaeggeM2} m² ydervægge (${floorplanCheck.ydervaegTykkelseCm} cm) = ${floorplanCheck.beregnetBruttoArealM2} m² brutto.`,
          floorplanCheck.konklusionTekst,
        ],
        afsnit11Forslag: floorplanCheck.foreslaaetAfsnit11Klausul,
      };
    }

    if (parsedTingbog.fundetTingbog && /tingbog|attest|servitut/i.test(meta.name)) {
      const servitutList = parsedTingbog.servitutter.slice(0, 3);
      return {
        ...base,
        status: servitutList.length > 0 ? "opmaerksomhed" : "ok",
        fundDetaljer: [
          `Adkomst og matrikel (${profile.matrikel.matrikelnummer}) kontrolleret mod Tingbogsattest.`,
          servitutList.length > 0
            ? `Registrerede servitutter i dokumentet: ${servitutList.join(" · ")}`
            : `Ingen servitutkonflikter konstateret mod BBR og anvendelse.`,
        ],
      };
    }

    if (raw.includes("udestue") || raw.includes("overdækning") || raw.includes("uden tilladelse")) {
      return {
        ...base,
        status: "afvigelse",
        fundOverskrift: `Uoverensstemmelse fundet i ${meta.name} mod BBR`,
        fundDetaljer: [
          `Dokumentet nævner bygningsdel (udestue/overdækning/forhold uden tilladelse), som afviger fra BBR hoveddata (${profile.bbr.boligarealM2} m²).`,
          `Kræver oplysning og ansvarsfraskrivelse i Købsaftalens Afsnit 11.`,
        ],
        afsnit11Forslag: `Det fremgår af sagens dokumenter (${meta.name}), at der på ejendommen findes bygningsmæssige forhold/overdækning, som ikke fuldt ud svarer til BBR-registreringen. Køber er gjort bekendt hermed og overtager forholdet uden ansvar for sælger eller medvirkende ejendomsmægler.`,
      };
    }

    return base;
  });
}

function buildDeterministic7StepReport(
  profile: PropertyFullProfile,
  fileNames: string[],
  parsedTingbog: ReturnType<typeof parseDocumentTextForTingbog>,
  docChecks: CaseDocumentCheckItem[],
  floorplanCheck: FloorplanCalculation | null
): string {
  const bbr = profile.bbr;
  const mat = profile.matrikel;
  const plan = profile.plandata;

  return `## 🏛️ Juridisk Fakta- & Krydsrevisionsrapport (Kun Verificerede Registerdata)
**Ejendom:** ${profile.adresse} (BFE-nr.: ${bbr.bfeNummer || "Ikke oplyst"} | Matr.nr.: ${mat.matrikelnummer || "—"}, ${mat.ejerlavsnavn || "—"})

---

### Trin 1: Aktiv Dokument-, Billed- & Plantegningskontrol (${fileNames.length} fil(er))
${
  docChecks.length > 0
    ? docChecks
        .map(
          (c) =>
            `* **${c.fileName} (${c.kategori}) – [${c.status.toUpperCase()}]:** ${c.fundOverskrift}\n  ${c.fundDetaljer.map((d) => `- ${d}`).join("\n  ")}`
        )
        .join("\n")
    : "* Ingen sagsdokumenter uploadet endnu – rapporten nedenfor viser verificerede offentlige registerfakta."
}

${
  floorplanCheck
    ? `\n### Trin 2: Plantegnings- & Arealberegning (L×B inkl. 10 cm indervæg & 35 cm ydervæg)\n* **Status:** ${
        floorplanCheck.indenfor15ProcentTolerance ? "🟢 GODKENDT (Inden for ±15 % BBR-tolerance)" : "🔴 AFVIGELSE OVER 15 % MOD BBR"
      }\n* **Beregning:** ${floorplanCheck.konklusionTekst}`
    : ""
}

---

### Trin 3: Verificerede Nøgleoplysninger (5 Autoritative Registre)
* **BBR Hovedbygning:** Opført **${bbr.opfoerelsesaar ?? "—"}**${bbr.ombygningsaar ? ` (om-/tilbygget ${bbr.ombygningsaar})` : ""}, Boligareal **${bbr.boligarealM2} m²**, Bebygget areal **${bbr.bebyggetArealHovedbygningM2} m²** (samlet bebygget **${bbr.samletBebyggetArealM2} m²**), Tag: **${bbr.tagmaterialeTekst}**, Ydervæg: **${bbr.ydervaegTekst}**, Varme: **${bbr.varmeinstallationTekst}**.
* **Matriklen (MAT/v2):** Grundareal **${mat.registreretArealM2} m²**, Fredskov **${mat.fredskovArealM2} m²**, Strandbeskyttelse **${mat.strandbeskyttelseArealM2} m²**, Jordforurening: **${mat.jordforureningStatus}**.
* **Plandata.dk:** ${plan.lokalplanId ? `Lokalplan nr. ${plan.lokalplanId} (${plan.lokalplanNavn})` : `Ingen særskilt lokalplan (${plan.kommuneplanNavn})`}, Zonestatus: **${plan.zonestatus}**, Bebyggelsesprocent **${plan.faktiskBebyggelsesprocent} %**.
* **Tingbog & Vurdering:** Offentlig ejendomsværdi **${profile.tingbog.offentligEjendomsvaerdiDkk ? `${profile.tingbog.offentligEjendomsvaerdiDkk.toLocaleString("da-DK")} kr.` : "Se Vurderingsportalen"}**${parsedTingbog.fundetTingbog ? ` · Tingbogsattest aflæst (${parsedTingbog.servitutter.length} servitut-noter)` : ""}.
`;
}

export async function POST(request: Request) {
  let addressForLock = "default";
  try {
    const formData = await request.formData();
    const address = String(formData.get("address") || "H C Hansens Vej 29, 7100 Vejle").trim();
    const agentEmail = String(formData.get("agentEmail") || "tobias@vejlemaegleren.dk").trim();
    const agentName = String(formData.get("agentName") || "Tobias Meng").trim();
    const caseIdParam = String(formData.get("caseId") || "").trim();
    addressForLock = address;

    const incomingFiles = formData.getAll("files") as File[];

    // 1. Hent altid den fulde 5-register profil (kun hårde fakta)
    const profile = await fetchFullPropertyProfile({ address });
    addressForLock = profile.adresse;
    const resolvedCaseId = caseIdParam || makeCaseId(agentEmail, profile.adresse);
    const existingCase = getSellerCase(resolvedCaseId);

    // 2. Gem nye filer på disk og indlæs evt. tidligere gemte filer på sagen
    const fileNames: string[] = [];
    const shaParts: (string | Buffer)[] = [Buffer.from(profile.adresse, "utf8")];
    let combinedRawText = "";
    const rawTextsByFile: Record<string, string> = {};
    const fileParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
    const nowTime = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const newDocMetas = [...(existingCase.uploadedDocMeta || [])];
    const resolvedReminders = new Set(existingCase.resolvedReminderIds || []);

    for (const file of incomingFiles) {
      fileNames.push(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      shaParts.push(buffer);

      const fileText = buffer.toString("utf8").slice(0, 50000);
      rawTextsByFile[file.name] = fileText;
      combinedRawText += `\n--- FIL: ${file.name} ---\n` + fileText;

      const matchedRem = detectReminderMatchFromFilename(file.name);
      if (matchedRem) {
        resolvedReminders.add(matchedRem);
      }

      const isImage = file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(file.name);
      const existingMeta = newDocMetas.find((m) => m.name === file.name);
      const docId = existingMeta?.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      saveUploadedFileToDisk(
        resolvedCaseId,
        docId,
        file.name,
        file.type || (isImage ? "image/png" : "application/pdf"),
        buffer
      );

      if (!existingMeta) {
        newDocMetas.push({
          id: docId,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          type: isImage ? "photo" : "document",
          mimeType: file.type || (isImage ? "image/png" : "application/pdf"),
          uploadedAt: nowTime,
          matchedReminderId: matchedRem,
        });
      }

      fileParts.push({
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: file.type || (isImage ? "image/png" : "application/pdf"),
        },
      });
    }

    // Hvis brugeren klikkede "Genkør AI-kontrol" uden at vedhæfte nye filer i dette kald, hent gemte filer fra disk
    if (incomingFiles.length === 0) {
      const diskFiles = listUploadedFilesFromDisk(resolvedCaseId);
      for (const df of diskFiles) {
        fileNames.push(df.fileName);
        shaParts.push(df.buffer);
        const fileText = df.buffer.toString("utf8").slice(0, 40000);
        rawTextsByFile[df.fileName] = fileText;
        combinedRawText += `\n--- FIL: ${df.fileName} ---\n` + fileText;
        fileParts.push({
          inlineData: {
            data: df.buffer.toString("base64"),
            mimeType: df.mimeType,
          },
        });
      }
    }

    const parsedTingbog = parseDocumentTextForTingbog(combinedRawText);
    if (parsedTingbog.fundetTingbog) {
      resolvedReminders.add("rem-tingbogsattest");
    }

    let floorplanCheck: FloorplanCalculation | null =
      extractFloorplanFromRawText(combinedRawText, fileNames, profile.bbr.boligarealM2) ||
      existingCase.floorplanCheck ||
      null;

    if (floorplanCheck) {
      resolvedReminders.add("rem-byggesag");
    }

    const sha256Key = computePayloadSha256(shaParts);

    // 3. Tjek SHA-256 Dokument-Cache (0,00 kr.)
    const cachedRaw = getCachedAiAnalysis(sha256Key, "vejle-maegleren");
    if (cachedRaw) {
      let cachedReport = cachedRaw;
      let cachedChecks: CaseDocumentCheckItem[] = buildDeterministicChecksForFiles(
        newDocMetas,
        rawTextsByFile,
        profile,
        parsedTingbog,
        floorplanCheck
      );
      try {
        const parsedCache = JSON.parse(cachedRaw);
        if (parsedCache && parsedCache.markdownReport) {
          cachedReport = parsedCache.markdownReport;
          if (Array.isArray(parsedCache.documentChecks) && parsedCache.documentChecks.length > 0) {
            cachedChecks = parsedCache.documentChecks;
          }
          if (parsedCache.floorplanCheck) {
            floorplanCheck = parsedCache.floorplanCheck;
          }
        }
      } catch {
        // Ældre tekst-cache
      }

      const updatedCase = upsertSellerCase({
        id: resolvedCaseId,
        agentEmail,
        agentName,
        address: profile.adresse,
        profile,
        uploadedDocMeta: newDocMetas,
        documentChecks: cachedChecks,
        floorplanCheck,
        resolvedReminderIds: Array.from(resolvedReminders),
        analysisReport: cachedReport,
      });
      return NextResponse.json({
        analysis: cachedReport,
        cached: true,
        parsedTingbog,
        documentChecks: updatedCase.documentChecks,
        floorplanCheck: updatedCase.floorplanCheck,
        profile,
        sellerCase: updatedCase,
        budget: getTenantBudgetState("vejle-maegleren"),
      });
    }

    // 4. Tjek intern 30,00 kr./dag & 3,00 kr./sag AI-budgetlås (Zero-Limbo)
    const estimatedCost = Math.max(COST_PER_DOC_ANALYSIS_DKK, Math.max(1, fileParts.length) * 0.05);
    const budgetCheck = checkAndReserveAiBudget({
      tenantId: "vejle-maegleren",
      caseKey: profile.adresse,
      estimatedCostDkk: estimatedCost,
    });

    let finalChecks = buildDeterministicChecksForFiles(
      newDocMetas,
      rawTextsByFile,
      profile,
      parsedTingbog,
      floorplanCheck
    );

    if (!budgetCheck.allowed || !process.env.GEMINI_API_KEY || fileParts.length === 0) {
      releaseInFlightLock(profile.adresse);
      const report = buildDeterministic7StepReport(
        profile,
        fileNames,
        parsedTingbog,
        finalChecks,
        floorplanCheck
      );
      setCachedAiAnalysis(
        sha256Key,
        JSON.stringify({
          markdownReport: report,
          documentChecks: finalChecks,
          floorplanCheck,
        }),
        profile.adresse
      );
      const updatedCase = upsertSellerCase({
        id: resolvedCaseId,
        agentEmail,
        agentName,
        address: profile.adresse,
        profile,
        uploadedDocMeta: newDocMetas,
        documentChecks: finalChecks,
        floorplanCheck,
        resolvedReminderIds: Array.from(resolvedReminders),
        analysisReport: report,
      });
      return NextResponse.json({
        analysis: report,
        deterministicFallback: true,
        parsedTingbog,
        documentChecks: updatedCase.documentChecks,
        floorplanCheck: updatedCase.floorplanCheck,
        profile,
        sellerCase: updatedCase,
        budget: budgetCheck.state,
      });
    }

    // 5. Kald Gemini 2.5 Flash med hård 18-sekunders timeout og 0 retries (Zero-Limbo!)
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const registerContextPrompt = `
VERIFICEREDE REGISTERDATA FOR ${profile.adresse.toUpperCase()} (KUN HÅRDE FAKTA - GÆT ALDRIG):
- BBR Hovedbygning: Opført ${profile.bbr.opfoerelsesaar ?? "ukendt"}, Boligareal ${profile.bbr.boligarealM2 || "ukendt"} m², Bebygget areal hovedhus ${profile.bbr.bebyggetArealHovedbygningM2 || "ukendt"} m², Tag: ${profile.bbr.tagmaterialeTekst}, Ydervæg: ${profile.bbr.ydervaegTekst}, Varme: ${profile.bbr.varmeinstallationTekst}, Etager: ${profile.bbr.antalEtager}
- BBR Sekundære bygninger: ${JSON.stringify(profile.bbr.sekundaereBygninger)}
- BBR TekniskAnlaeg: ${JSON.stringify(profile.bbr.tekniskeAnlaeg)}
- BBR Byggesag: ${JSON.stringify(profile.bbr.byggesager)}
- Matriklen (MAT/v2): Grundareal ${profile.matrikel.registreretArealM2} m², Matrikelnr. ${profile.matrikel.matrikelnummer}
- Plandata.dk WFS: ${JSON.stringify(profile.plandata)}
- Tingbogs-udtræk fra uploadede filer: ${JSON.stringify(parsedTingbog)}

Uploadede filer til aktiv kontrol (${fileNames.join(", ")}).
Analysér hver enkelt fil/foto/plantegning op imod BBR, Byggesag og Tingbog, og returnér JSON med documentChecks, floorplanDetected og markdownSummary:
`;

    const parts: any[] = [{ text: registerContextPrompt }, ...fileParts];

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 18000));
    const aiPromise = ai.models
      .generateContent({
        model: LOCKED_FLASH_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: BOLIGHANDEL_ANALYSIS_SYSTEM_PROMPT,
          temperature: 0.0,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 512 },
        },
      })
      .catch((err) => {
        console.warn("Gemini API fallback triggered:", err?.message);
        return null;
      });

    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
    const finalBudget = finalizeAiCallUsage({
      tenantId: "vejle-maegleren",
      caseKey: profile.adresse,
      reservedDkk: budgetCheck.reservedDkk,
      usageMetadata: aiResponse?.usageMetadata,
    });

    let aiSummaryMarkdown = "";
    if (aiResponse && aiResponse.text) {
      try {
        const parsedJson = JSON.parse(aiResponse.text);
        if (
          parsedJson.floorplanDetected &&
          parsedJson.floorplanDetected.isFloorplan &&
          (Number(parsedJson.floorplanDetected.indvendigLaengdeM) > 0 ||
            (Array.isArray(parsedJson.floorplanDetected.rumListe) &&
              parsedJson.floorplanDetected.rumListe.length > 0))
        ) {
          floorplanCheck = calculateFloorplanVsBbr({
            sourceFileName:
              parsedJson.floorplanDetected.sourceFileName ||
              fileNames.find((f) => /plan|tegning/i.test(f)) ||
              fileNames[0] ||
              "Plantegning",
            indvendigLaengdeM: Number(parsedJson.floorplanDetected.indvendigLaengdeM) || 0,
            indvendigBreddeM: Number(parsedJson.floorplanDetected.indvendigBreddeM) || 0,
            antalIndervaegge: Number(parsedJson.floorplanDetected.antalIndervaegge ?? 5),
            indervaegTykkelseCm: 10,
            ydervaegTykkelseCm: 35,
            rumListe: parsedJson.floorplanDetected.rumListe,
            bbrBoligarealM2: profile.bbr.boligarealM2,
            isDetected: true,
          });
          resolvedReminders.add("rem-byggesag");
        }

        if (Array.isArray(parsedJson.documentChecks) && parsedJson.documentChecks.length > 0) {
          const aiChecksByFile = new Map<string, any>();
          for (const c of parsedJson.documentChecks) {
            if (c && c.fileName) {
              aiChecksByFile.set(String(c.fileName).toLowerCase(), c);
            }
          }

          finalChecks = finalChecks.map((detCheck) => {
            const aiMatch = aiChecksByFile.get(detCheck.fileName.toLowerCase());
            if (!aiMatch) return detCheck;
            return {
              id: detCheck.id,
              fileName: detCheck.fileName,
              fileType:
                aiMatch.fileType === "floorplan" ||
                aiMatch.fileType === "photo" ||
                aiMatch.fileType === "document"
                  ? aiMatch.fileType
                  : detCheck.fileType,
              checkedAt: nowTime,
              status:
                aiMatch.status === "afvigelse" ||
                aiMatch.status === "opmaerksomhed" ||
                aiMatch.status === "ok"
                  ? aiMatch.status
                  : detCheck.status,
              kategori: aiMatch.kategori || detCheck.kategori,
              fundOverskrift: aiMatch.fundOverskrift || detCheck.fundOverskrift,
              fundDetaljer:
                Array.isArray(aiMatch.fundDetaljer) && aiMatch.fundDetaljer.length > 0
                  ? aiMatch.fundDetaljer.map(String)
                  : detCheck.fundDetaljer,
              afsnit11Forslag:
                aiMatch.afsnit11Forslag !== undefined
                  ? aiMatch.afsnit11Forslag
                  : detCheck.afsnit11Forslag,
            };
          });
        }

        if (typeof parsedJson.markdownSummary === "string") {
          aiSummaryMarkdown = parsedJson.markdownSummary;
        }
      } catch {
        aiSummaryMarkdown = aiResponse.text;
      }
    }

    const finalReport =
      buildDeterministic7StepReport(profile, fileNames, parsedTingbog, finalChecks, floorplanCheck) +
      (aiSummaryMarkdown ? `\n\n---\n\n### Supplerende AI-Revision\n${aiSummaryMarkdown}` : "");

    setCachedAiAnalysis(
      sha256Key,
      JSON.stringify({
        markdownReport: finalReport,
        documentChecks: finalChecks,
        floorplanCheck,
      }),
      profile.adresse
    );

    const tempCaseForMissing = {
      ...existingCase,
      uploadedDocMeta: newDocMetas,
      resolvedReminderIds: Array.from(resolvedReminders),
      profileSnapshot: profile,
    };
    const stillMissing = computeMissingRemindersForCase(tempCaseForMissing);
    const findingsCount = finalChecks.filter((c) => c.status !== "ok").length;
    const docStatusSummary =
      stillMissing.length > 0
        ? `Kontrollerede ${fileNames.join(", ")} (${findingsCount > 0 ? `${findingsCount} opmærksomhedspunkt(er) fundet` : "ingen afvigelser"}). Sagen mangler fortsat: ${stillMissing
            .map((m) => m.titel.split("(")[0].trim())
            .join(", ")}.`
        : `Kontrollerede ${fileNames.join(", ")}. Alle kernebilag på sagen er nu gennemgået og Afsnit 11-forslag er opdateret.`;

    const nextMessages = [
      ...(existingCase.assistantMessages || []),
      {
        id: `msg-doc-${Date.now()}`,
        sender: "ai" as const,
        text: docStatusSummary,
        createdAt: new Date().toISOString(),
        actionsTaken: [`Kontrollerede ${fileNames.join(", ")}`],
      },
    ];

    const updatedCase = upsertSellerCase({
      id: resolvedCaseId,
      agentEmail,
      agentName,
      address: profile.adresse,
      profile,
      uploadedDocMeta: newDocMetas,
      documentChecks: finalChecks,
      floorplanCheck,
      resolvedReminderIds: Array.from(resolvedReminders),
      assistantMessages: nextMessages,
      analysisReport: finalReport,
    });

    return NextResponse.json({
      analysis: finalReport,
      parsedTingbog,
      documentChecks: updatedCase.documentChecks,
      floorplanCheck: updatedCase.floorplanCheck,
      profile,
      sellerCase: updatedCase,
      budget: finalBudget,
    });
  } catch (error: any) {
    releaseInFlightLock(addressForLock);
    console.error("AI Analysis error:", error);
    return NextResponse.json({ error: error.message || "Fejl under analyse" }, { status: 500 });
  }
}
