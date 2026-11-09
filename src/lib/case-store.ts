import fs from "fs";
import path from "path";
import { Question, standardSellerQuestions } from "@/data/seller-questions";

const DATA_DIR = process.env.DATA_DIR || "/tmp/maegler-ai-data";
const CASES_FILE = path.join(DATA_DIR, "maegler-cases.json");

export interface SellerCaseRecord {
  id: string;
  address: string;
  sellerName: string;
  sellerEmail: string;
  createdAt: string;
  updatedAt: string;
  status: "udkast" | "sendt" | "besvaret";
  dynamicQuestions: Question[];
  answers: Record<string, boolean | string | string[]>;
  followUpNotes: Record<string, string>;
  generatedAfsnit11Clauses: string[];
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore
  }
}

function loadCases(): Record<string, SellerCaseRecord> {
  ensureDataDir();
  try {
    if (fs.existsSync(CASES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CASES_FILE, "utf8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch {
    // Ignore
  }
  return {};
}

function saveCases(cases: Record<string, SellerCaseRecord>) {
  ensureDataDir();
  try {
    fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2), "utf8");
  } catch {
    // Ignore
  }
}

export function upsertSellerCase(input: {
  id?: string;
  address: string;
  sellerName?: string;
  sellerEmail?: string;
  status?: SellerCaseRecord["status"];
  aiQuestions?: Question[];
  generatedAfsnit11Clauses?: string[];
}): SellerCaseRecord {
  const cases = loadCases();
  const slugId =
    input.id ||
    Buffer.from(input.address.toLowerCase().trim())
      .toString("hex")
      .slice(0, 16);

  const existing = cases[slugId];
  const mergedQuestions: Question[] = [...(input.aiQuestions || existing?.dynamicQuestions?.filter((q) => q.aiGenerated) || [])];
  const seenIds = new Set(mergedQuestions.map((q) => q.id));
  for (const sq of standardSellerQuestions) {
    if (!seenIds.has(sq.id)) {
      seenIds.add(sq.id);
      mergedQuestions.push(sq);
    }
  }

  const record: SellerCaseRecord = {
    id: slugId,
    address: input.address || existing?.address || "Kløvertoften 38, 7100 Vejle",
    sellerName: input.sellerName ?? existing?.sellerName ?? "",
    sellerEmail: input.sellerEmail ?? existing?.sellerEmail ?? "",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: input.status || existing?.status || "udkast",
    dynamicQuestions: mergedQuestions,
    answers: existing?.answers || {},
    followUpNotes: existing?.followUpNotes || {},
    generatedAfsnit11Clauses: input.generatedAfsnit11Clauses || existing?.generatedAfsnit11Clauses || [],
  };

  cases[slugId] = record;
  saveCases(cases);
  return record;
}

export function getSellerCase(id: string): SellerCaseRecord {
  const cases = loadCases();
  if (cases[id]) return cases[id];

  return {
    id,
    address: "Kløvertoften 38, 7100 Vejle",
    sellerName: "Sælger",
    sellerEmail: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "udkast",
    dynamicQuestions: [
      {
        id: "q_ai_bbr_sekundaer",
        category: "BBR & Sekundære Bygninger (AI Krydstjek)",
        text: 'BBR angiver "Integreret Garage / Carport (BBR 910)" på 32 m² (opført 2003). Stemmer disse mål og anvendelsen overens med de faktiske forhold på grunden i dag?',
        type: "boolean",
        followUpIfTrue: "Hvis der er ændret anvendelse, beskriv det her:",
        aiGenerated: true,
      },
      ...standardSellerQuestions,
    ],
    answers: {},
    followUpNotes: {},
    generatedAfsnit11Clauses: [],
  };
}

export function saveSellerCaseAnswers(
  id: string,
  answers: Record<string, boolean | string | string[]>,
  followUpNotes: Record<string, string>
): SellerCaseRecord {
  const cases = loadCases();
  const current = getSellerCase(id);
  current.answers = { ...current.answers, ...answers };
  current.followUpNotes = { ...current.followUpNotes, ...followUpNotes };
  current.status = "besvaret";
  current.updatedAt = new Date().toISOString();

  // Generér ekstra Afsnit 11-klausuler baseret på sælgers svar
  const extraClauses = [...(current.generatedAfsnit11Clauses || [])];
  if (current.answers["q_bldg_1"] === true) {
    const note = current.followUpNotes["q_bldg_1"] ? ` (${current.followUpNotes["q_bldg_1"]})` : "";
    extraClauses.push(
      `Sælger har i sælgeroplysningsskemaet oplyst om bygninger/indretninger på grunden opført uden byggetilladelse${note}. Køber overtager disse uden ansvar for sælger eller medvirkende ejendomsmægler.`
    );
  }
  if (current.answers["q_grnd_2"] === true) {
    const note = current.followUpNotes["q_grnd_2"] ? ` (${current.followUpNotes["q_grnd_2"]})` : "";
    extraClauses.push(
      `Sælger har oplyst om afblændet/ubenyttet olietank på grunden${note}. Sælger erklærer, at tanken ikke har været i drift i sælgers ejertid.`
    );
  }
  current.generatedAfsnit11Clauses = Array.from(new Set(extraClauses));

  cases[id] = current;
  saveCases(cases);
  return current;
}
