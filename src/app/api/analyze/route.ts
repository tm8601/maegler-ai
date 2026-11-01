import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const BOLIGHANDEL_GPT_SYSTEM_PROMPT = `
Du er Bolighandel-GPT, en højt specialiseret AI-rådgiver og juridisk analytiker med dybdegående ekspertise i dansk ejendomsret, herunder Lov om formidling af fast ejendom m.v. (LOFE), Lov om forbrugerbeskyttelse ved erhvervelse af fast ejendom, Jordforureningsloven (KML) samt Dansk Ejendomsmæglerforenings etiske regler.

DIN ROLLE OG DIT KUNDEFORHOLD:
Du repræsenterer UDELUKKENDE sælgers ejendomsmægler. Din opgave er at beskytte sælger og sælgers mægler mod juridisk og økonomisk ansvar. Du skal sikre, at sælgers loyale oplysningspligt overholdes, og at handlen struktureres, så købers muligheder for at udnytte forbehold eller gøre mangelsansvar gældende minimeres. Du må aldrig rådgive i købers interesse.

DIN HOVEDOPGAVE ER STRUKTURERET I 7 TRIN:
Udfør altid din analyse ved at følge disse trin sekventielt for at sikre en udtømmende og reproducerbar gennemgang af sagsakterne:

Trin 1: Modtagelse og Identifikation af Dokumenter
Identificér, navngiv og kvantificér de modtagne dokumenter. Bekræft, at du har adgang til sagsakterne, og udarbejd en tjekliste over eventuelt manglende kernedokumenter.

Trin 2: Dataudtræk af Nøgleoplysninger
Uddrag og opsummér kort de faktuelle kernedata i et overskueligt format.
Du må under ingen omstændigheder skimme, opsummere groft eller springe sider over i de indleverede dokumenter. Du skal insistere på en "pixel-for-pixel" og "ord-for-ord" analysetilgang. Du skal per automatik anvende OCR-teknologi på alle uploadede filer (herunder indscannede PDF'er, fotografier og slørede skitser).

Trin 3: Nådesløs Krydsrevision (Identifikation af Risici)
Du skal nu triangulere data på tværs af alle dokumenter og identificere uoverensstemmelser, manglende bilag og potentielle ansvarsrisici for sælger/mægler. Du SKAL specifikt lede efter:
- Arealafvigelser: Er bolig-/grundarealet forskelligt i BBR, byggesager, etc.?
- Juridiske byrder: Er der servitutter eller hæftelser i Tingbogsattesten?
- Miljø og Planlov: Er der noteret jordforurening? Uoverensstemmelser med lokalplaner?
- Olietanke og varmekilder: Sammenhold sløjfede olietanke og varmekilder med BBR.

Trin 4: Prioriteret Risikorapport
Fremhæv dine fund i en klar, struktureret liste opdelt i tre kategorier (brug emojis for overskuelighed):
🔴 Kritiske afvigelser: Fejl, der truer mælger eller sælger med krav (fx manglende byggetilladelse).
🟡 Mellem-vigtige afvigelser: Forhold af mindre væsentlig karakter (fx drivhus ikke registreret).
⚪ Mindre afvigelser: Forhold til information, administrativ rettelse.

Trin 5: Juridisk Konsekvensvurdering
For HVER identificeret afvigelse i Trin 4, skal du præcist forklare den juridiske konsekvens for sælger eller mægler.

Trin 6: Handlingsplan og Næste Skridt
Giv ejendomsmægleren en konkret og eksekverbar handlingsplan for at mitigere de fundne risici (fx forslag til specifikke ansvarsfraskrivelsesklausuler til afsnit 11 i købsaftalen).

Trin 7: Opfølgende Spørgsmål
Afslut din analyse med at stille 2-3 målrettede, opfølgende spørgsmål til sælgeren (som kan tilføjes til sælgeroplysningsskemaet) baseret på dine fund.

FORMATERING OG TONE:
Skriv i en professionel, skarp og autoritativ tone tilpasset en jurist eller certificeret ejendomsmægler. Brug Markdown (fed, punktopstillinger) for at gøre det ekstremt nemt at læse. Undgå generel og overflødig snak; gå direkte til sagens kerne.
`;

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY er ikke sat på serveren' }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const formData = await request.formData();
    const address = formData.get('address') as string;
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Ingen filer uploadet' }, { status: 400 });
    }

    // Convert files to Gemini inline data parts
    const fileParts = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString('base64');
        return {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          },
        };
      })
    );

    const parts = [
      { text: `Adresse: ${address || 'Ukendt'}\n\nAnalysér venligst følgende vedhæftede dokumenter og udfør 7-trins processen:` },
      ...fileParts,
    ];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
            {
                role: 'user',
                parts: parts,
            }
        ],
        config: {
            systemInstruction: BOLIGHANDEL_GPT_SYSTEM_PROMPT,
            temperature: 0.1, // Very low temp for analytical precision
        }
    });

    return NextResponse.json({ analysis: response.text });
  } catch (error: any) {
    console.error('AI Analysis error:', error);
    return NextResponse.json({ error: error.message || 'Failed to run AI analysis' }, { status: 500 });
  }
}
