import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Question, standardSellerQuestions } from "@/data/seller-questions";
import type { PropertyFullProfile, RenovationLevelKey } from "@/lib/property-aggregator";

const DATA_DIR = process.env.DATA_DIR || "/tmp/maegler-ai-data";
const CASES_FILE = path.join(DATA_DIR, "maegler-cases-v2.json");
const AGENTS_FILE = path.join(DATA_DIR, "maegler-agents.json");
const AUTH_SECRET = process.env.AUTH_SECRET || "vejle-maegleren-2026-secret-key";

export interface AgentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  initials: string;
  phone: string;
}

interface StoredAgentUser extends AgentUser {
  passwordHash: string;
}

export interface CaseUploadedDocMeta {
  id: string;
  name: string;
  sizeKb: number;
  type: "document" | "photo";
  uploadedAt: string;
  matchedReminderId?: string | null;
  extractedSummary?: string;
}

export interface CaseAssistantMessage {
  id: string;
  sender: "ai" | "agent";
  text: string;
  createdAt: string;
  actionsTaken?: string[];
}

export type CaseWorkflowStatus =
  | "opstart"
  | "afventer_dokumenter"
  | "under_gennemgang"
  | "klar_til_salg";

export interface SellerCaseRecord {
  id: string;
  agentEmail: string;
  agentName: string;
  address: string;
  bfeNummer: string;
  matrikelnummer: string;
  boligarealM2: number;
  grundarealM2: number;
  renovationLevel: RenovationLevelKey;
  valuationDkk: number;
  sellerName: string;
  sellerEmail: string;
  createdAt: string;
  updatedAt: string;
  status: "udkast" | "sendt" | "besvaret";
  workflowStatus: CaseWorkflowStatus;
  dynamicQuestions: Question[];
  answers: Record<string, boolean | string | string[]>;
  followUpNotes: Record<string, string>;
  generatedAfsnit11Clauses: string[];
  resolvedFlagIds: string[];
  resolvedReminderIds: string[];
  uploadedDocMeta: CaseUploadedDocMeta[];
  assistantMessages: CaseAssistantMessage[];
  documentReminderCount: number;
  analysisReport: string | null;
  profileSnapshot?: PropertyFullProfile;
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

function hashPassword(pw: string): string {
  return crypto.createHmac("sha256", AUTH_SECRET).update(pw.trim()).digest("hex");
}

const DEFAULT_AGENTS: StoredAgentUser[] = [
  {
    id: "agent-tobias",
    email: "tobias@vejlemaegleren.dk",
    name: "Tobias Meng",
    role: "Indehaver · Vejle Mægleren",
    initials: "TM",
    phone: "+45 75 82 00 00",
    passwordHash: hashPassword("vejle2026"),
  },
  {
    id: "agent-mads",
    email: "mads@vejlemaegleren.dk",
    name: "Mads Vestergaard",
    role: "Ejendomsmægler MDE",
    initials: "MV",
    phone: "+45 75 82 00 01",
    passwordHash: hashPassword("vejle2026"),
  },
  {
    id: "agent-louise",
    email: "louise@vejlemaegleren.dk",
    name: "Louise Kjær",
    role: "Sagsbehandler & MDE",
    initials: "LK",
    phone: "+45 75 82 00 02",
    passwordHash: hashPassword("vejle2026"),
  },
];

function loadAgents(): Record<string, StoredAgentUser> {
  ensureDataDir();
  const map: Record<string, StoredAgentUser> = {};
  for (const a of DEFAULT_AGENTS) {
    map[a.email.toLowerCase()] = a;
  }
  try {
    if (fs.existsSync(AGENTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf8"));
      if (raw && typeof raw === "object") {
        Object.assign(map, raw);
      }
    }
  } catch {
    // Ignore
  }
  return map;
}

function saveAgents(agents: Record<string, StoredAgentUser>) {
  ensureDataDir();
  try {
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), "utf8");
  } catch {
    // Ignore
  }
}

export function listPublicAgents(): AgentUser[] {
  const agents = loadAgents();
  return Object.values(agents).map(({ passwordHash: _, ...pub }) => pub);
}

export function authenticateOrRegisterAgent(options: {
  email: string;
  password?: string;
  name?: string;
}): { user: AgentUser; token: string } {
  const emailClean = options.email.trim().toLowerCase();
  const agents = loadAgents();
  let stored = agents[emailClean];

  if (!stored) {
    const displayName =
      options.name?.trim() ||
      emailClean
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    const parts = displayName.split(/\s+/);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : displayName.slice(0, 2).toUpperCase();

    stored = {
      id: `agent-${crypto.randomBytes(4).toString("hex")}`,
      email: emailClean,
      name: displayName,
      role: "Ejendomsmægler · Vejle Mægleren",
      initials,
      phone: "+45 75 82 00 00",
      passwordHash: hashPassword(options.password || "vejle2026"),
    };
    agents[emailClean] = stored;
    saveAgents(agents);
  } else if (options.password && options.password.trim()) {
    const providedHash = hashPassword(options.password.trim());
    const teamDefaultHash = hashPassword("vejle2026");
    if (providedHash !== stored.passwordHash && providedHash !== teamDefaultHash) {
      throw new Error("Forkert adgangskode til denne mæglerprofil");
    }
  }

  const { passwordHash: _, ...publicUser } = stored;
  const payloadB64 = Buffer.from(JSON.stringify(publicUser), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");
  return { user: publicUser, token: `${payloadB64}.${sig}` };
}

export function verifyAgentToken(token?: string | null): AgentUser | null {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as AgentUser;
  } catch {
    return null;
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

export function makeCaseId(agentEmail: string, address: string): string {
  const normAgent = (agentEmail || "tobias@vejlemaegleren.dk").toLowerCase().trim();
  const normAddr = address.toLowerCase().replace(/\s+/g, " ").trim();
  return crypto
    .createHash("sha256")
    .update(`${normAgent}::${normAddr}`)
    .digest("hex")
    .slice(0, 16);
}

export function detectReminderMatchFromFilename(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.includes("tingbog") || lower.includes("attest") || lower.includes("servitut") || lower.includes("pant")) {
    return "rem-tingbogsattest";
  }
  if (
    lower.includes("byggesag") ||
    lower.includes("tegning") ||
    lower.includes("plantegning") ||
    lower.includes("tilladelse") ||
    lower.includes("arkiv") ||
    lower.includes("weblager")
  ) {
    return "rem-byggesag";
  }
  if (
    lower.includes("tilstand") ||
    lower.includes("elinstall") ||
    lower.includes("elrapport") ||
    lower.includes("energi")
  ) {
    return "rem-tilstand-el-energi";
  }
  return null;
}

export function computeMissingRemindersForCase(record: SellerCaseRecord): Array<{
  id: string;
  titel: string;
  vigtighed: string;
  beskrivelse: string;
}> {
  const allReminders = record.profileSnapshot?.paamindelseDokumenter || [
    {
      id: "rem-tingbogsattest",
      titel: "Tingbogsattest & Servitutudskrifter (Tinglysning.dk)",
      vigtighed: "Lovpligtig",
      beskrivelse: "Upload Tingbogsattest (PDF) for kontrol af adkomst, hæftelser og servitutter.",
    },
    {
      id: "rem-byggesag",
      titel: "Byggesagsarkiv & Byggetegninger (Vejle Kommune)",
      vigtighed: "Lovpligtig",
      beskrivelse: "Upload byggetilladelser, ibrugtagningstilladelser og plantegninger.",
    },
    {
      id: "rem-tilstand-el-energi",
      titel: "Tilstandsrapport, Elinstallationsrapport & Energimærke",
      vigtighed: "Anbefalet",
      beskrivelse: "Upload rapporterne for automatisk krydstjek mod BBR og Afsnit 11.",
    },
  ];

  const resolvedSet = new Set(record.resolvedReminderIds || []);
  for (const doc of record.uploadedDocMeta || []) {
    if (doc.matchedReminderId) {
      resolvedSet.add(doc.matchedReminderId);
    }
    const inferred = detectReminderMatchFromFilename(doc.name);
    if (inferred) {
      resolvedSet.add(inferred);
    }
  }

  return allReminders.filter((r) => !resolvedSet.has(r.id));
}

export function computeWorkflowStatus(record: SellerCaseRecord): CaseWorkflowStatus {
  const missing = computeMissingRemindersForCase(record);
  const allRemindersCount = record.profileSnapshot?.paamindelseDokumenter?.length || 3;
  const unresolvedCriticalFlags = (record.profileSnapshot?.roedeFlag || []).filter(
    (f) => f.severity === "kritisk" && !(record.resolvedFlagIds || []).includes(f.id)
  );

  if (missing.length === 0 && unresolvedCriticalFlags.length === 0) {
    return "klar_til_salg";
  }
  if ((record.uploadedDocMeta?.length || 0) > 0 || (record.resolvedReminderIds?.length || 0) > 0) {
    return "under_gennemgang";
  }
  if (missing.length < allRemindersCount) {
    return "under_gennemgang";
  }
  return "afventer_dokumenter";
}

export function buildSmartProactiveWatchMessage(
  record: SellerCaseRecord,
  profile: PropertyFullProfile
): CaseAssistantMessage | null {
  // Hård anti-limbo grænse: Spørg kun proaktivt om manglende dokumenter op til 2 gange pr. sag!
  if ((record.documentReminderCount || 0) >= 2) {
    return null;
  }

  const missing = computeMissingRemindersForCase(record);
  const unresolvedFlags = profile.roedeFlag.filter(
    (f) => !(record.resolvedFlagIds || []).includes(f.id)
  );

  if (missing.length === 0 && unresolvedFlags.length === 0) {
    return {
      id: `msg-ready-${Date.now()}`,
      sender: "ai",
      text: `Sagen på ${profile.adresse} er fuldt oplyst. Alle 3 dokumentgrupper er registreret, og Afsnit 11-klausulerne er klar.`,
      createdAt: new Date().toISOString(),
    };
  }

  const missingTitles = missing.map((m) => m.titel.split("(")[0].trim());
  const flagNote =
    unresolvedFlags.length > 0
      ? ` Bemærk også ${unresolvedFlags.length} aktivt observandum (${unresolvedFlags[0].title}).`
      : "";

  const text =
    record.documentReminderCount === 0
      ? `Sag oprettet på ${profile.adresse} (BFE ${profile.bbr.bfeNummer}, ${profile.bbr.boligarealM2} m² bolig, ${profile.matrikel.registreretArealM2} m² grund). For at færdiggøre dokumentkontrollen mangler sagen: ${missingTitles.join(", ")}.${flagNote} Du kan uploade bilag direkte eller skrive her, hvis et punkt allerede er afklaret.`
      : `Opfølgning på ${profile.adresse}: Sagen afventer fortsat ${missingTitles.join(" samt ")}.${flagNote} Skriv her hvis du vil markere et punkt som afklaret eller tilpasse Afsnit 11.`;

  return {
    id: `msg-watch-${Date.now()}`,
    sender: "ai",
    text,
    createdAt: new Date().toISOString(),
  };
}

export function upsertSellerCase(input: {
  id?: string;
  agentEmail?: string;
  agentName?: string;
  address: string;
  sellerName?: string;
  sellerEmail?: string;
  status?: SellerCaseRecord["status"];
  renovationLevel?: RenovationLevelKey;
  aiQuestions?: Question[];
  generatedAfsnit11Clauses?: string[];
  profile?: PropertyFullProfile;
  resolvedFlagIds?: string[];
  resolvedReminderIds?: string[];
  uploadedDocMeta?: CaseUploadedDocMeta[];
  assistantMessages?: CaseAssistantMessage[];
  analysisReport?: string | null;
  triggerSmartWatch?: boolean;
}): SellerCaseRecord {
  const cases = loadCases();
  const agentEmail = (input.agentEmail || "tobias@vejlemaegleren.dk").toLowerCase().trim();
  const agentName = input.agentName || "Tobias Meng";
  const officialAddress = input.profile?.adresse || input.address || "H C Hansens Vej 29, 7100 Vejle";
  const slugId = input.id || makeCaseId(agentEmail, officialAddress);

  const existing = cases[slugId];
  const profile = input.profile || existing?.profileSnapshot;
  const renLevel: RenovationLevelKey =
    input.renovationLevel || existing?.renovationLevel || "mellemrenoveret";
  const valuationDkk =
    profile?.vurdering?.niveauer?.[renLevel]?.estimatDkk ||
    existing?.valuationDkk ||
    0;

  const mergedQuestions: Question[] = [
    ...(input.aiQuestions ||
      profile?.saelgerSpoergsmaal ||
      existing?.dynamicQuestions?.filter((q) => q.aiGenerated) ||
      []),
  ];
  const seenIds = new Set(mergedQuestions.map((q) => q.id));
  for (const sq of standardSellerQuestions) {
    if (!seenIds.has(sq.id)) {
      seenIds.add(sq.id);
      mergedQuestions.push(sq);
    }
  }

  const record: SellerCaseRecord = {
    id: slugId,
    agentEmail: existing?.agentEmail || agentEmail,
    agentName: existing?.agentName || agentName,
    address: officialAddress,
    bfeNummer: profile?.bbr?.bfeNummer || existing?.bfeNummer || "—",
    matrikelnummer: profile?.matrikel?.matrikelnummer || existing?.matrikelnummer || "—",
    boligarealM2: profile?.bbr?.boligarealM2 ?? existing?.boligarealM2 ?? 0,
    grundarealM2: profile?.matrikel?.registreretArealM2 ?? existing?.grundarealM2 ?? 0,
    renovationLevel: renLevel,
    valuationDkk,
    sellerName: input.sellerName ?? existing?.sellerName ?? "",
    sellerEmail: input.sellerEmail ?? existing?.sellerEmail ?? "",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: input.status || existing?.status || "udkast",
    workflowStatus: "afventer_dokumenter",
    dynamicQuestions: mergedQuestions,
    answers: existing?.answers || {},
    followUpNotes: existing?.followUpNotes || {},
    generatedAfsnit11Clauses:
      (input.generatedAfsnit11Clauses && input.generatedAfsnit11Clauses.length > 0
        ? input.generatedAfsnit11Clauses
        : null) ||
      (existing?.generatedAfsnit11Clauses && existing.generatedAfsnit11Clauses.length > 0
        ? existing.generatedAfsnit11Clauses
        : null) ||
      profile?.afsnit11Klausuler?.map((k) => k.tekst) ||
      [],
    resolvedFlagIds: input.resolvedFlagIds ?? existing?.resolvedFlagIds ?? [],
    resolvedReminderIds: input.resolvedReminderIds ?? existing?.resolvedReminderIds ?? [],
    uploadedDocMeta: input.uploadedDocMeta ?? existing?.uploadedDocMeta ?? [],
    assistantMessages: input.assistantMessages ?? existing?.assistantMessages ?? [],
    documentReminderCount: existing?.documentReminderCount ?? 0,
    analysisReport:
      input.analysisReport !== undefined ? input.analysisReport : existing?.analysisReport ?? null,
    profileSnapshot: profile,
  };

  // Hvis det er en ny sag (eller brugeren åbner den igen og den endnu ikke har spurgt 2 gange), tilføj smart dokument-overvågningsbesked
  if (profile && (record.assistantMessages.length === 0 || input.triggerSmartWatch)) {
    const watchMsg = buildSmartProactiveWatchMessage(record, profile);
    if (watchMsg) {
      record.assistantMessages = [...record.assistantMessages, watchMsg];
      record.documentReminderCount = (record.documentReminderCount || 0) + 1;
    }
  }

  record.workflowStatus = computeWorkflowStatus(record);
  cases[slugId] = record;
  saveCases(cases);
  return record;
}

export function listCasesForAgent(agentEmail?: string): SellerCaseRecord[] {
  const cases = loadCases();
  const norm = (agentEmail || "tobias@vejlemaegleren.dk").toLowerCase().trim();
  const list = Object.values(cases).filter(
    (c) => !agentEmail || c.agentEmail.toLowerCase() === norm
  );
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function deleteCaseById(id: string): boolean {
  const cases = loadCases();
  if (!cases[id]) return false;
  delete cases[id];
  saveCases(cases);
  return true;
}

export function hasSellerCase(id: string): boolean {
  const cases = loadCases();
  return Boolean(cases[id]);
}

export function getSellerCase(id: string): SellerCaseRecord {
  const cases = loadCases();
  if (cases[id]) return cases[id];

  return {
    id,
    agentEmail: "tobias@vejlemaegleren.dk",
    agentName: "Tobias Meng",
    address: "H C Hansens Vej 29, 7100 Vejle",
    bfeNummer: "4405971",
    matrikelnummer: "7dm",
    boligarealM2: 88,
    grundarealM2: 445,
    renovationLevel: "mellemrenoveret",
    valuationDkk: 1750000,
    sellerName: "Sælger",
    sellerEmail: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "udkast",
    workflowStatus: "afventer_dokumenter",
    dynamicQuestions: standardSellerQuestions,
    answers: {},
    followUpNotes: {},
    generatedAfsnit11Clauses: [],
    resolvedFlagIds: [],
    resolvedReminderIds: [],
    uploadedDocMeta: [],
    assistantMessages: [],
    documentReminderCount: 0,
    analysisReport: null,
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
      `Sælger oplyser om olietank på ejendommen${note}. Eventuelle forhold vedrørende sløjfet tank er sælger og ejendomsmægler uvedkommende.`
    );
  }
  current.generatedAfsnit11Clauses = Array.from(new Set(extraClauses));
  current.workflowStatus = computeWorkflowStatus(current);

  cases[id] = current;
  saveCases(cases);
  return current;
}
