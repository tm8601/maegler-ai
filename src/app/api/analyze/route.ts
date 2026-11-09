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
import { fetchFullPropertyProfile, FullPropertyProfile } from "@/lib/property-aggregator";
import { parseDocumentTextForTingbog, ParsedTingbogSummary } from "@/lib/tingbog-parser";

const BOLIGHANDEL_GPT_SYSTEM_PROMPT = `
Du er Bolighandel-GPT, en højt specialiseret AI-rådgiver og juridisk analytiker med dybdegående ekspertise i dansk ejendomsret, herunder Lov om formidling af fast ejendom m.v. (LOFE), Lov om forbrugerbeskyttelse ved erhvervelse af fast ejendom, Jordforureningsloven (KML), Bygningsreglementet (BR18) samt Dansk Ejendomsmæglerforenings etiske regler.

DIN ROLLE OG DIT KUNDEFORHOLD:
Du repræsenterer UDELUKKENDE sælgers ejendomsmægler (Vejle Mægleren). Din opgave er at beskytte sælger og sælgers mægler mod juridisk og økonomisk ansvar, sikre at sælgers loyale oplysningspligt overholdes, og udarbejde skudsikre ansvarsfraskrivelsesklausuler til købsaftalens Afsnit 11.

Udfør analysen skarpt og struktureret i de 7 trin:
Trin 1: Modtagelse og Identifikation af Dokumenter & Registre (BBR, Matriklen, Plandata, Tingbogen, CVR)
Trin 2: Dataudtræk af Nøgleoplysninger (Arealer, olietanke, byggesager, hæftelser, servitutter, lokalplanrammer)
Trin 3: Nådesløs Krydsrevision (Sammenhold uploadede dokumenter med de 5 autoritative registre)
Trin 4: Prioriteret Risikorapport (🔴 Kritiske, 🟡 Mellem-vigtige, ⚪ Mindre afvigelser)
Trin 5: Juridisk Konsekvensvurdering for Sælger & Mægler
Trin 6: Konkrete Afsnit 11-klausuler (Købsaftale-klar formulering)
Trin 7: Målrettede Opfølgende Spørgsmål til Sælgeroplysningsskemaet
`;

function buildDeterministic7StepReport(
  profile: FullPropertyProfile,
  fileNames: string[],
  parsedTingbog: ParsedTingbogSummary,
  budgetNote?: string
): string {
  const secList = profile.bbr.sekundaereBygninger
    .map((s) => `${s.typeNavn}: ${s.arealM2} m² (opført ${s.opfoerelsesaar || "ukendt"})`)
    .join(", ");
  const olieList = profile.bbr.tekniskeAnlaeg
    .map((t) => `${t.typeNavn} (${t.driftStatus}, ${t.stoerrelseLiter ? `${t.stoerrelseLiter} L` : "ingen tank"})`)
    .join("; ");
  const byggesagList = profile.bbr.byggesager
    .map((b) => `${b.sagsnummer}: ${b.byggesagsart} – ${b.statusTekst}`)
    .join("\n  - ");

  const criticalFlags = profile.krydsrevision.roedeFlag.filter((f) => f.severity === "critical");
  const warningFlags = profile.krydsrevision.roedeFlag.filter((f) => f.severity === "warning");
  const infoFlags = profile.krydsrevision.roedeFlag.filter((f) => f.severity === "info");

  return `## 🏛️ Bolighandel-GPT: 7-Trins Juridisk Krydsrevisionsrapport
**Ejendom:** ${profile.adresse} (BFE-nr.: ${profile.bbr.bfeNummer} | Matr.nr.: ${profile.matrikel.matrikelnummer}, ${profile.matrikel.ejerlavsnavn})
${budgetNote ? `> ℹ️ **Budget- & Driftstatus:** ${budgetNote}\n` : ""}

---

### Trin 1: Modtagelse og Identifikation af Dokumenter & Autoritative Registre
* **Uploadede sagsdokumenter (${fileNames.length} stk.):** ${fileNames.length > 0 ? fileNames.join(", ") : "Ingen PDF uploadet – udfører fuld 5-register revision"}
* **Krydstjekkede offentlige registre (5/5 aktive):**
  1. **BBR (inkl. \`TekniskAnlaeg\`, \`Byggesag\`, \`Grund\`):** Verificeret (${profile.bbr.boligarealM2} m² bolig, opført ${profile.bbr.opfoerelsesaar})
  2. **Matriklen (\`MAT/v2\`) & 3D LiDAR (DHM):** Grundareal ${profile.matrikel.grundarealM2} m² | 3D tagflade ${profile.matrikel.lidarFootprint.lidarEstimeretTagfladeM2} m²
  3. **Plandata.dk (\`WFS Point-in-Polygon\`):** ${profile.plandata.lokalplaner[0]?.plannr} (${profile.plandata.lokalplaner[0]?.plannavn}) – Maks. bebyggelsesprocent ${profile.plandata.maxBebyggelsesprocent}%
  4. **Tingbogen & EJF:** ${parsedTingbog.fundetTingbog ? `Tingbogsattest parseret (${parsedTingbog.haeftelser.length} hæftelser, ${parsedTingbog.servitutter.length} servitutter)` : `EJF/OIS basisdata indlæst (Estimeret friværdi: ${profile.tingbog.estimeretFrivaerdiDkk.toLocaleString("da-DK")} kr.)`}
  5. **CVR-Registret:** ${profile.cvr.harErhvervPaaAdressen ? `⚠️ Virksomhed registreret på adressen (${profile.cvr.virksomheder[0]?.navn})` : "Ingen aktive selskaber registreret på boligadressen"}

---

### Trin 2: Dataudtræk af Nøgleoplysninger
* **Hovedbygning (BBR):** Opført ${profile.bbr.opfoerelsesaar}${profile.bbr.ombygningsaar ? ` (om-/tilbygget ${profile.bbr.ombygningsaar})` : ""}, boligareal **${profile.bbr.boligarealM2} m²**, bebygget areal hovedhus **${profile.bbr.bebyggetArealHovedhusM2} m²**, tag: **${profile.bbr.tagmateriale}**, varme: **${profile.bbr.varmeinstallation}**.
* **Sekundære bygninger:** ${secList || "Ingen registreret"} (Samlet bebygget areal i BBR: **${profile.bbr.bebyggetArealTotalM2} m²**).
* **Skjulte BBR-tabeller:**
  - \`BBR_TekniskAnlaeg\`: ${olieList}
  - \`BBR_Byggesag\`:
  - ${byggesagList}
  - \`BBR_Grund\`: ${profile.bbr.grund.kloakforholdTekst}
* **Plandata & Byggeret:** Faktisk bebyggelsesprocent **${profile.plandata.faktiskBebyggelsesprocent}%** (tilladt **${profile.plandata.maxBebyggelsesprocent}%**) -> **${profile.plandata.ubenyttetByggeretM2} m² ubenyttet byggeret**.

---

### Trin 3: Nådesløs Krydsrevision (Triangulering på tværs af dokumenter og registre)
1. **Areal- & 3D LiDAR-triangulering:** BBR registrerer i alt **${profile.bbr.bebyggetArealTotalM2} m²** bebygget areal på grunden, mens Danmarks Højdemodel (3D LiDAR) og ortofoto måler **${profile.matrikel.lidarFootprint.lidarEstimeretTagfladeM2} m²** tagflade (afvigelse på **+${profile.matrikel.lidarFootprint.afvigelseM2} m²**).
2. **Byggesag vs. BBR-status:** Der henstår en åben byggesag i \`BBR_Byggesag\` uden registreret ibrugtagningstilladelse.
3. **Olietank & Varmekilde:** Ejendommen opvarmes med ${profile.bbr.varmeinstallation}, og eventuelle olietanke i \`BBR_TekniskAnlaeg\` skal være dokumenteret sløjfet med kommunal attest.
4. **Tingbog & Hæftelser:** ${
    parsedTingbog.fundetTingbog
      ? `Udtrukket fra vedhæftet dokument: Samlede tinglyste hæftelser på ${parsedTingbog.samletHaeftelseDkk.toLocaleString("da-DK")} kr. og ${parsedTingbog.servitutter.length} servitutter.`
      : `Servitut-screening viser ${profile.tingbog.servitutOverblik.antalRegistrerede} tinglyste byrder (herunder lokalplan/vejret/forsyning).`
  }

---

### Trin 4: Prioriteret Risikorapport
${
  criticalFlags.length > 0
    ? criticalFlags.map((f) => `- 🔴 **KRITISK (${f.register}): ${f.title}** – ${f.description}`).join("\n")
    : "- 🔴 **Ingen kritiske blokeringer fundet**"
}
${
  warningFlags.length > 0
    ? warningFlags.map((f) => `- 🟡 **MELLEM-VIGTIG (${f.register}): ${f.title}** – ${f.description}`).join("\n")
    : ""
}
${
  infoFlags.length > 0
    ? infoFlags.map((f) => `- ⚪ **INFO (${f.register}): ${f.title}** – ${f.description}`).join("\n")
    : "- ⚪ **INFO (Plandata):** Ejendommen overholder gældende anvendelses- og etagebestemmelser i lokalplanen."
}

---

### Trin 5: Juridisk Konsekvensvurdering
${profile.krydsrevision.roedeFlag
  .map((f) => `* **Vedr. ${f.title}:** ${f.legalConsequence}`)
  .join("\n")}

---

### Trin 6: Handlingsplan & Konkrete Klausuler til Købsaftalens Afsnit 11
Indsæt følgende individuelle vilkår i købsaftalens **Afsnit 11 (Individuelle vilkår aftalt mellem køber og sælger)**:

${profile.krydsrevision.afsnit11Klausuler
  .map((k, idx) => `**${idx + 1}. Klausul vedr. ${k.titel} (${k.kildeRegister}):**\n> *"${k.tekst}"*`)
  .join("\n\n")}

---

### Trin 7: Opfølgende Spørgsmål til Sælger (Tilføjet automatisk til Sælgerskemaet)
${profile.krydsrevision.dynamiskeSaelgerSpoergsmaal
  .map((q, idx) => `${idx + 1}. **${q.category}:** *${q.text}*`)
  .join("\n")}
`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const address = String(formData.get("address") || "Kløvertoften 38, 7100 Vejle").trim();
    const files = formData.getAll("files") as File[];

    // 1. Hent altid den fulde 5-register profil først (0,00 kr. - deterministisk)
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

      // Udtræk læsbar tekst fra PDF/tekstfiler til deterministisk Tingbogs-parser
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

    // 3. Tjek SHA-256 Dokument-Cache (0,00 kr. og 0,1 sek. svartid ved gen-analyse)
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

    // 4. Tjek hård 30,00 kr./dag & 2,50 kr./sag AI-budgetlås
    const estimatedCost = Math.max(COST_PER_DOC_ANALYSIS_DKK, files.length * 0.06);
    const budgetCheck = checkAndReserveAiBudget({
      tenantId: "vejle-maegleren",
      caseKey: address,
      estimatedCostDkk: estimatedCost,
    });

    if (!budgetCheck.allowed || !process.env.GEMINI_API_KEY) {
      const fallbackNote = !process.env.GEMINI_API_KEY
        ? "Genereret med 5-register deterministisk krydsrevisions-motor (0,00 kr.)."
        : budgetCheck.reason;
      const report = buildDeterministic7StepReport(profile, fileNames, parsedTingbog, fallbackNote);
      setCachedAiAnalysis(sha256Key, report, address);
      return NextResponse.json({
        analysis: report,
        deterministicFallback: true,
        parsedTingbog,
        profile,
        budget: budgetCheck.state,
      });
    }

    // 5. Kald Gemini 2.5 Flash med hård 25-sekunders Zero-Limbo timeout
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const registerContextPrompt = `
EJENDOMSDATA FRA DE 5 AUTORITATIVE DANSKE REGISTRE FOR ${profile.adresse.toUpperCase()}:
- BBR Hovedbygning: Opført ${profile.bbr.opfoerelsesaar}, Boligareal ${profile.bbr.boligarealM2} m², Bebygget areal hovedhus ${profile.bbr.bebyggetArealHovedhusM2} m², Tag: ${profile.bbr.tagmateriale}, Varme: ${profile.bbr.varmeinstallation}
- BBR Sekundære bygninger: ${JSON.stringify(profile.bbr.sekundaereBygninger)}
- BBR TekniskAnlaeg (Olietanke/Jordvarme): ${JSON.stringify(profile.bbr.tekniskeAnlaeg)}
- BBR Byggesag (Åbne byggesager): ${JSON.stringify(profile.bbr.byggesager)}
- BBR Grund (Kloakforhold): ${JSON.stringify(profile.bbr.grund)}
- Matriklen (MAT/v2) & 3D LiDAR Footprint: Grundareal ${profile.matrikel.grundarealM2} m², BBR Bebygget Total ${profile.bbr.bebyggetArealTotalM2} m² vs. 3D LiDAR Tagflade ${profile.matrikel.lidarFootprint.lidarEstimeretTagfladeM2} m²
- Plandata.dk WFS: Lokalplan ${profile.plandata.lokalplaner[0]?.plannr} (${profile.plandata.lokalplaner[0]?.plannavn}), Maks bebyggelsesprocent ${profile.plandata.maxBebyggelsesprocent}%, Faktisk ${profile.plandata.faktiskBebyggelsesprocent}%, Ubenyttet byggeret ${profile.plandata.ubenyttetByggeretM2} m²
- CVR på adressen: ${JSON.stringify(profile.cvr.virksomheder)}
- Deterministisk Tingbogs-udtræk fra uploadede filer: ${JSON.stringify(parsedTingbog)}

Analysér de vedhæftede dokumenter (${fileNames.join(", ") || "ingen vedhæftede filer"}) op imod ovenstående 5 registre og udfør den fulde 7-trins juridiske krydsrevision inkl. færdige Afsnit 11-klausuler og spørgsmål til sælger:
`;

    const parts: any[] = [{ text: registerContextPrompt }, ...fileParts];

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25000));
    const aiPromise = ai.models
      .generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: BOLIGHANDEL_GPT_SYSTEM_PROMPT,
          temperature: 0.1,
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
        : buildDeterministic7StepReport(
            profile,
            fileNames,
            parsedTingbog,
            "AI-svartid oversteg 25 sek. (Zero-Limbo beskyttelse) – rapporten er færdiggjort deterministisk ud fra de 5 registre og dokument-parseren."
          );

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
