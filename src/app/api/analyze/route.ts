import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  checkAndReserveAiBudget,
  computePayloadSha256,
  COST_PER_DOC_ANALYSIS_DKK,
  getCachedAiAnalysis,
  getTenantBudgetState,
  setCachedAiAnalysis,
} from "@/lib/ai-cost-guard";
import { fetchFullPropertyProfile, PropertyFullProfile } from "@/lib/property-aggregator";
import { parseDocumentTextForTingbog, ParsedTingbogSummary } from "@/lib/tingbog-parser";

const BOLIGHANDEL_GPT_SYSTEM_PROMPT = `
Du er Bolighandel-GPT, en højt specialiseret juridisk analytiker i dansk ejendomsret (LOFE, Lov om forbrugerbeskyttelse ved erhvervelse af fast ejendom, Jordforureningsloven, BR18 og DE's etiske regler).

UFRAVIGELIG REGEL OM HÅRDE FAKTA:
Du må ALDRIG gætte, antage eller opfinde årstal, arealer, byggesagsnumre, olietanke, handelspriser eller hæftelser. Du må UDELUKKENDE forholde dig til de verificerede hårde fakta fra de 5 offentlige registre samt indholdet i de faktisk uploadede dokumenter. Hvis et dokument (f.eks. Tingbogsattest eller Byggesagsarkiv) ikke er uploadet endnu, skal du eksplicit angive, at dokumentet afventer upload.

DIN ROLLE:
Du repræsenterer sælgers ejendomsmægler (Vejle Mægleren). Du skal udarbejde en faktabaseret gennemgang i 7 trin inkl. konkrete klausuler til købsaftalens Afsnit 11.
`;

function buildDeterministic7StepReport(
  profile: PropertyFullProfile,
  fileNames: string[],
  parsedTingbog: ParsedTingbogSummary
): string {
  const secList = profile.bbr.sekundaereBygninger
    .map((s) => `${s.typeTekst}: ${s.arealM2} m²${s.opfoerelsesaar ? ` (opført ${s.opfoerelsesaar})` : ""}`)
    .join(", ");
  const olieList =
    profile.bbr.tekniskeAnlaeg.length > 0
      ? profile.bbr.tekniskeAnlaeg
          .map((t) => `${t.typeTekst} (${t.driftstatusTekst}${t.volumenLiter ? `, ${t.volumenLiter} L` : ""})`)
          .join("; ")
      : "Ingen registrerede tanke i BBR_TekniskAnlaeg";
  const byggesagList =
    profile.bbr.byggesager.length > 0
      ? profile.bbr.byggesager.map((b) => `${b.sagsnummer}: ${b.sagsartTekst} – ${b.statusTekst}`).join("\n  - ")
      : "Ingen åbne byggesager registreret i BBR_Byggesag";

  const criticalFlags = profile.roedeFlag.filter((f) => f.severity === "kritisk");
  const warningFlags = profile.roedeFlag.filter((f) => f.severity === "advarsel");
  const infoFlags = profile.roedeFlag.filter((f) => f.severity === "info");

  return `## 🏛️ Juridisk Fakta- & Krydsrevisionsrapport (Kun Verificerede Registerdata)
**Ejendom:** ${profile.adresse} (BFE-nr.: ${profile.bbr.bfeNummer || "Ikke oplyst"} | Matr.nr.: ${profile.matrikel.matrikelnummer || "Ikke oplyst"}, ${profile.matrikel.ejerlavsnavn || "Ikke oplyst"})

---

### Trin 1: Identifikation af Dokumenter & Autoritative Registre
* **Uploadede sagsdokumenter (${fileNames.length} stk.):** ${fileNames.length > 0 ? fileNames.join(", ") : "Ingen dokumenter uploadet endnu – rapporten bygger udelukkende på verificerede offentlige registeropslag."}
* **Verificerede offentlige registre:**
  1. **BBR (\`DAR/v3\` & \`BBR/v3\`):** ${profile.kildeStatus.bbr} (${profile.bbr.boligarealM2 || "—"} m² bolig, opført ${profile.bbr.opfoerelsesaar ?? "—"})
  2. **Matriklen (\`MAT/v2\`):** ${profile.kildeStatus.matrikel} (${profile.matrikel.registreretArealM2 || "—"} m² grundareal)
  3. **Plandata.dk (\`WFS\`):** ${profile.plandata.lokalplanId ? `Lokalplan ${profile.plandata.lokalplanId} (${profile.plandata.lokalplanNavn})` : `Ingen særskilt lokalplan (${profile.plandata.kommuneplanNavn})`}
  4. **Vurderingsportalen & EJF/Handelshistorik:** ${
    profile.tingbog.offentligEjendomsvaerdiDkk
      ? `${profile.tingbog.vurderingsStatusTekst}: ${profile.tingbog.offentligEjendomsvaerdiDkk.toLocaleString("da-DK")} kr.`
      : "Offentlig vurdering ikke tilgængelig via offentligt API"
  }${profile.tingbog.senesteHandelsprisDkk ? ` | Seneste tinglyste handel: ${profile.tingbog.senesteHandelsprisDkk.toLocaleString("da-DK")} kr. (${profile.tingbog.senesteHandelsdato})` : ""}
  5. **CVR-Registret:** ${profile.cvr.harAktivtErhvervPaaAdressen ? `Virksomhed registreret på adressen (${profile.cvr.registreredeVirksomheder.map((v) => `${v.navn} CVR ${v.cvrNummer}`).join(", ")})` : "Ingen aktive CVR-virksomheder registreret på adressen"}

---

### Trin 2: Verificerede Nøgleoplysninger (Uden Gæt)
* **Hovedbygning (BBR):** Opført **${profile.bbr.opfoerelsesaar ?? "Ikke registreret"}**${profile.bbr.ombygningsaar ? ` (om-/tilbygget ${profile.bbr.ombygningsaar})` : ""}, boligareal **${profile.bbr.boligarealM2 || "—"} m²**, bebygget areal hovedhus **${profile.bbr.bebyggetArealHovedbygningM2 || "—"} m²**, kælder **${profile.bbr.kaelderArealM2 || 0} m²**, tag: **${profile.bbr.tagmaterialeTekst}**, varme: **${profile.bbr.varmeinstallationTekst} (${profile.bbr.opvarmningsmiddelTekst})**.
* **Sekundære bygninger i BBR:** ${secList || "Ingen sekundære bygninger registreret i BBR"} (Samlet bebygget areal i BBR: **${profile.bbr.samletBebyggetArealM2 || "—"} m²**).
* **BBR Tekniske Anlæg & Byggesager:**
  - \`BBR_TekniskAnlaeg\`: ${olieList}
  - \`BBR_Byggesag\`: ${byggesagList}
  - \`BBR_Grund\`: ${profile.bbr.aflobsforholdTekst}
* **Plandata & Bebyggelsesprocent:** Faktisk bebyggelsesprocent (BR18): **${profile.plandata.faktiskBebyggelsesprocent}%** | Tilladt ramme: **${profile.plandata.tilladtBebyggelsesprocent}%**.

---

### Trin 3: Krydsrevision mellem Uploadede Dokumenter og Registre
${
  parsedTingbog.fundetTingbog
    ? `* **Tingbogsattest (udtrukket fra uploadet dokument):** Samlede tinglyste hæftelser på **${parsedTingbog.samletHaeftelseDkk.toLocaleString("da-DK")} kr.** (${parsedTingbog.haeftelser.length} hæftelser) og **${parsedTingbog.servitutter.length} servitutter**.`
    : `* **Tingbogsattest:** Ikke uploadet endnu. Upload Tingbogsattest i Dokumentrummet for faktuel kontrol af hæftelser, adkomst og servitutter.`
}
* **BBR- og Byggesagskontrol:** Sammenhold BBR-arealerne (${profile.bbr.samletBebyggetArealM2 || "—"} m² samlet bebygget areal) med kommunens byggesagsarkiv ved upload af byggetegninger.

---

### Trin 4: Faktabaserede Observanda
${
  criticalFlags.length > 0
    ? criticalFlags.map((f) => `- 🔴 **KRITISK (${f.register}): ${f.title}** – ${f.description}`).join("\n")
    : "- 🟢 **Ingen kritiske registerkonflikter registreret i de offentlige tabeller**"
}
${warningFlags.map((f) => `- 🟡 **OBS (${f.register}): ${f.title}** – ${f.description}`).join("\n")}
${infoFlags.map((f) => `- ⚪ **FAKTA (${f.register}): ${f.title}** – ${f.description}`).join("\n")}

---

### Trin 5: Juridisk Konsekvensvurdering
${profile.roedeFlag.map((f) => `* **${f.title}:** ${f.legalImplication}`).join("\n") || "* Ingen kritiske anmærkninger i offentlige registre."}

---

### Trin 6: Klausuler til Købsaftalens Afsnit 11
${profile.afsnit11Klausuler
  .map((k, idx) => `**${idx + 1}. ${k.titel} (${k.kildeRegister}):**\n> *"${k.tekst}"*`)
  .join("\n\n")}

---

### Trin 7: Faktabaserede Spørgsmål til Sælger
${profile.saelgerSpoergsmaal
  .map((q, idx) => `${idx + 1}. **${q.category}:** *${q.text}*`)
  .join("\n")}
`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const address = String(formData.get("address") || "H C Hansens Vej 29, 7100 Vejle").trim();
    const files = formData.getAll("files") as File[];

    // 1. Hent altid den fulde 5-register profil (kun hårde fakta)
    const profile = await fetchFullPropertyProfile({ address });

    // 2. Læs fil-buffers og udtræk rå tekst til Tingbog/Byggesag parser + SHA-256 hash
    const fileNames: string[] = [];
    const shaParts: (string | Buffer)[] = [Buffer.from(address, "utf8")];
    let combinedRawText = "";
    const fileParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

    for (const file of files) {
      fileNames.push(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      shaParts.push(buffer);

      const utf8Extract = buffer.toString("utf8");
      const latin1Extract = buffer.toString("latin1");
      combinedRawText += `\n--- FIL: ${file.name} ---\n` + utf8Extract.slice(0, 40000) + "\n" + latin1Extract.slice(0, 20000);

      fileParts.push({
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: file.type || "application/pdf",
        },
      });
    }

    const parsedTingbog = parseDocumentTextForTingbog(combinedRawText);
    const sha256Key = computePayloadSha256(shaParts);

    // 3. Tjek SHA-256 Dokument-Cache
    const cachedAnalysis = getCachedAiAnalysis(sha256Key, "vejle-maegleren");
    if (cachedAnalysis) {
      const budgetState = getTenantBudgetState("vejle-maegleren");
      return NextResponse.json({
        analysis: cachedAnalysis,
        cached: true,
        parsedTingbog,
        profile,
        budget: budgetState,
      });
    }

    // 4. Tjek intern 30,00 kr./dag AI-budgetlås (backend)
    const estimatedCost = Math.max(COST_PER_DOC_ANALYSIS_DKK, files.length * 0.06);
    const budgetCheck = checkAndReserveAiBudget({
      tenantId: "vejle-maegleren",
      caseKey: address,
      estimatedCostDkk: estimatedCost,
    });

    if (!budgetCheck.allowed || !process.env.GEMINI_API_KEY || files.length === 0) {
      const report = buildDeterministic7StepReport(profile, fileNames, parsedTingbog);
      setCachedAiAnalysis(sha256Key, report, address);
      return NextResponse.json({
        analysis: report,
        deterministicFallback: true,
        parsedTingbog,
        profile,
        budget: budgetCheck.state,
      });
    }

    // 5. Kald Gemini 2.5 Flash med 25-sekunders timeout når der er uploadet dokumenter
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const registerContextPrompt = `
VERIFICEREDE REGISTERDATA FOR ${profile.adresse.toUpperCase()} (KUN HÅRDE FAKTA - GÆT ALDRIG):
- BBR Hovedbygning: Opført ${profile.bbr.opfoerelsesaar ?? "ukendt"}, Boligareal ${profile.bbr.boligarealM2 || "ukendt"} m², Bebygget areal hovedhus ${profile.bbr.bebyggetArealHovedbygningM2 || "ukendt"} m², Tag: ${profile.bbr.tagmaterialeTekst}, Varme: ${profile.bbr.varmeinstallationTekst}
- BBR Sekundære bygninger: ${JSON.stringify(profile.bbr.sekundaereBygninger)}
- BBR TekniskAnlaeg: ${JSON.stringify(profile.bbr.tekniskeAnlaeg)}
- BBR Byggesag: ${JSON.stringify(profile.bbr.byggesager)}
- BBR Afløb: ${profile.bbr.aflobsforholdTekst}
- Matriklen (MAT/v2): Grundareal ${profile.matrikel.registreretArealM2} m², Matrikelnr. ${profile.matrikel.matrikelnummer}
- Plandata.dk WFS: ${JSON.stringify(profile.plandata)}
- Offentlig Vurdering & Tinglyste Handler: ${JSON.stringify(profile.tingbog)}
- CVR på adressen: ${JSON.stringify(profile.cvr.registreredeVirksomheder)}
- Tingbogs-udtræk fra uploadede filer: ${JSON.stringify(parsedTingbog)}

Analysér de vedhæftede dokumenter (${fileNames.join(", ")}) op imod ovenstående verificerede registerdata uden nogen form for gætteri:
`;

    const parts: any[] = [{ text: registerContextPrompt }, ...fileParts];

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25000));
    const aiPromise = ai.models
      .generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: BOLIGHANDEL_GPT_SYSTEM_PROMPT,
          temperature: 0.0,
        },
      })
      .catch((err) => {
        console.warn("Gemini API fallback triggered:", err?.message);
        return null;
      });

    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
    const finalReport =
      aiResponse && aiResponse.text
        ? aiResponse.text
        : buildDeterministic7StepReport(profile, fileNames, parsedTingbog);

    setCachedAiAnalysis(sha256Key, finalReport, address);

    return NextResponse.json({
      analysis: finalReport,
      parsedTingbog,
      profile,
      budget: getTenantBudgetState("vejle-maegleren"),
    });
  } catch (error: any) {
    console.error("AI Analysis error:", error);
    return NextResponse.json({ error: error.message || "Fejl under analyse" }, { status: 500 });
  }
}
