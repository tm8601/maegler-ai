import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Question, standardSellerQuestions } from "@/data/seller-questions";
import type { PropertyFullProfile, RenovationLevelKey } from "@/lib/property-aggregator";

const DATA_DIR = process.env.DATA_DIR || "/tmp/maegler-ai-data";
const CASES_FILE = path.join(DATA_DIR, "maegler-cases-v2.json");
const AGENTS_FILE = path.join(DATA_DIR, "maegler-agents.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
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
  mimeType?: string;
  uploadedAt: string;
  matchedReminderId?: string | null;
  extractedSummary?: string;
  checkStatus?: "ok" | "opmaerksomhed" | "afvigelse";
}

export interface CaseDocumentCheckItem {
  id: string;
  fileName: string;
  fileType: "document" | "photo" | "floorplan";
  checkedAt: string;
  status: "ok" | "opmaerksomhed" | "afvigelse";
  kategori: string;
  fundOverskrift: string;
  fundDetaljer: string[];
  afsnit11Forslag?: string | null;
}

export interface FloorplanRoomItem {
  navn: string;
  laengdeM: number;
  breddeM: number;
  nettoM2: number;
}

export interface FloorplanCalculation {
  sourceFileName: string;
  isDetected: boolean;
  indvendigLaengdeM: number;
  indvendigBreddeM: number;
  antalIndervaegge: number;
  indervaegTykkelseCm: number;
  ydervaegTykkelseCm: number;
  rumListe?: FloorplanRoomItem[];
  indvendigtNettoArealM2: number;
  tillaegIndervaeggeM2: number;
  tillaegYdervaeggeM2: number;
  beregnetBruttoArealM2: number;
  bbrBoligarealM2: number;
  afvigelseM2: number;
  afvigelseProcent: number;
  indenfor15ProcentTolerance: boolean;
  konklusionTekst: string;
  foreslaaetAfsnit11Klausul?: string | null;
}

export interface Afsnit11ClauseItem {
  id: string;
  titel: string;
  kilde: string;
  tekst: string;
  prioritet: "lovpligtig" | "anbefalet" | "valgfri";
  godkendtAfMaegler: boolean;
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
  skipSellerQuestionnaire: boolean;
  disabledQuestionIds: string[];
  dynamicQuestions: Question[];
  answers: Record<string, boolean | string | string[]>;
  followUpNotes: Record<string, string>;
  generatedAfsnit11Clauses: string[];
  afsnit11Items: Afsnit11ClauseItem[];
  resolvedFlagIds: string[];
  resolvedReminderIds: string[];
  uploadedDocMeta: CaseUploadedDocMeta[];
  documentChecks: CaseDocumentCheckItem[];
  floorplanCheck: FloorplanCalculation | null;
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
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch {
    // Ignore
  }
}

export function saveUploadedFileToDisk(
  caseId: string,
  fileId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): void {
  ensureDataDir();
  try {
    const safeCase = caseId.replace(/[^a-zA-Z0-9_-]/g, "");
    const caseDir = path.join(UPLOADS_DIR, safeCase);
    if (!fs.existsSync(caseDir)) {
      fs.mkdirSync(caseDir, { recursive: true });
    }
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    const binPath = path.join(caseDir, `${safeFileId}.bin`);
    const metaPath = path.join(caseDir, `${safeFileId}.meta.json`);
    fs.writeFileSync(binPath, buffer);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ fileId: safeFileId, fileName, mimeType, size: buffer.length }),
      "utf8"
    );
  } catch {
    // Ignore
  }
}

export function readUploadedFileFromDisk(
  caseId: string,
  fileId: string
): { buffer: Buffer; fileName: string; mimeType: string } | null {
  ensureDataDir();
  try {
    const safeCase = caseId.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    const caseDir = path.join(UPLOADS_DIR, safeCase);
    const binPath = path.join(caseDir, `${safeFileId}.bin`);
    const metaPath = path.join(caseDir, `${safeFileId}.meta.json`);
    if (!fs.existsSync(binPath) || !fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const buffer = fs.readFileSync(binPath);
    return {
      buffer,
      fileName: meta.fileName || "dokument",
      mimeType: meta.mimeType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export function listUploadedFilesFromDisk(
  caseId: string
): Array<{ fileId: string; fileName: string; mimeType: string; buffer: Buffer }> {
  ensureDataDir();
  try {
    const safeCase = caseId.replace(/[^a-zA-Z0-9_-]/g, "");
    const caseDir = path.join(UPLOADS_DIR, safeCase);
    if (!fs.existsSync(caseDir)) return [];
    const files = fs.readdirSync(caseDir).filter((f) => f.endsWith(".meta.json"));
    const out: Array<{ fileId: string; fileName: string; mimeType: string; buffer: Buffer }> = [];
    for (const mf of files) {
      const fileId = mf.replace(/\.meta\.json$/, "");
      const item = readUploadedFileFromDisk(safeCase, fileId);
      if (item) {
        out.push({ fileId, ...item });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Beregner plantegningsareal (L x B indvendige mål) inkl. standard vægtillæg:
 * - Indervægge / skillevægge: typisk 10 cm (0,10 m)
 * - Ydervægge / klimaskærm: typisk 35 cm (0,35 m)
 * Kontrollerer om det beregnede BBR-bruttoareal stemmer overens med BBR inden for ±15 % tolerance.
 */
export function calculateFloorplanVsBbr(params: {
  sourceFileName?: string;
  indvendigLaengdeM: number;
  indvendigBreddeM: number;
  antalIndervaegge?: number;
  indervaegTykkelseCm?: number;
  ydervaegTykkelseCm?: number;
  rumListe?: FloorplanRoomItem[];
  bbrBoligarealM2: number;
  isDetected?: boolean;
}): FloorplanCalculation {
  const bbrM2 = Math.max(1, params.bbrBoligarealM2 || 88);
  const indervaegCm = params.indervaegTykkelseCm ?? 10;
  const ydervaegCm = params.ydervaegTykkelseCm ?? 35;
  const indervaegM = indervaegCm / 100;
  const ydervaegM = ydervaegCm / 100;
  const antalIndervaegge = params.antalIndervaegge ?? 5;

  let laengdeM = Number(params.indvendigLaengdeM) || 0;
  let breddeM = Number(params.indvendigBreddeM) || 0;

  let indvendigtNettoArealM2 = 0;
  if (laengdeM > 0 && breddeM > 0) {
    indvendigtNettoArealM2 = Number((laengdeM * breddeM).toFixed(1));
  } else if (params.rumListe && params.rumListe.length > 0) {
    indvendigtNettoArealM2 = Number(
      params.rumListe
        .reduce((sum, r) => sum + (Number(r.laengdeM) || 0) * (Number(r.breddeM) || 0), 0)
        .toFixed(1)
    );
    laengdeM = Number(Math.sqrt(indvendigtNettoArealM2 * 1.45).toFixed(2));
    breddeM = Number((indvendigtNettoArealM2 / Math.max(1, laengdeM)).toFixed(2));
  } else {
    const estNetto = Math.max(25, bbrM2 * 0.81);
    laengdeM = Number(Math.sqrt(estNetto * 1.45).toFixed(1));
    breddeM = Number((estNetto / laengdeM).toFixed(1));
    indvendigtNettoArealM2 = Number((laengdeM * breddeM).toFixed(1));
  }

  // Tillæg for indvendige skillevægge (typisk 10 cm tykkelse * gennemsnitlig spændvidde)
  const gnsSpaendM = Math.max(2.5, breddeM * 0.65);
  const tillaegIndervaeggeM2 = Number((antalIndervaegge * gnsSpaendM * indervaegM).toFixed(1));

  // Tillæg for ydervægge (typisk 35 cm tykkelse rundt langs husets indvendige omkreds + 4 hjørner)
  const indvendigOmkredsM = 2 * (laengdeM + breddeM);
  const tillaegYdervaeggeM2 = Number(
    (indvendigOmkredsM * ydervaegM + 4 * ydervaegM * ydervaegM).toFixed(1)
  );

  const beregnetBruttoArealM2 = Math.round(
    indvendigtNettoArealM2 + tillaegIndervaeggeM2 + tillaegYdervaeggeM2
  );
  const afvigelseM2 = beregnetBruttoArealM2 - bbrM2;
  const afvigelseProcent = Number(((afvigelseM2 / bbrM2) * 100).toFixed(1));
  const indenfor15ProcentTolerance = Math.abs(afvigelseProcent) <= 15.0;

  const sign = afvigelseM2 > 0 ? `+${afvigelseM2}` : `${afvigelseM2}`;
  const signPct = afvigelseProcent > 0 ? `+${afvigelseProcent}` : `${afvigelseProcent}`;

  const konklusionTekst = indenfor15ProcentTolerance
    ? `Plantegning L×B (${laengdeM} × ${breddeM} m indv. = ${indvendigtNettoArealM2} m² netto + ${tillaegIndervaeggeM2} m² indervægge [${indervaegCm} cm] + ${tillaegYdervaeggeM2} m² ydervægge [${ydervaegCm} cm]) giver ${beregnetBruttoArealM2} m² brutto mod BBR ${bbrM2} m² (${sign} m² / ${signPct} %). Stemmer overens med BBR inden for ±15 % tolerance.`
    : `ADVARSEL: Plantegning L×B (${laengdeM} × ${breddeM} m indv. = ${indvendigtNettoArealM2} m² netto + ${tillaegIndervaeggeM2} m² indervægge [${indervaegCm} cm] + ${tillaegYdervaeggeM2} m² ydervægge [${ydervaegCm} cm]) giver ${beregnetBruttoArealM2} m² brutto mod BBR ${bbrM2} m² (${sign} m² / ${signPct} %). Afvigelsen overstiger ±15 % BBR-tolerancen og kræver afklaring samt Afsnit 11-forbehold.`;

  const foreslaaetAfsnit11Klausul = indenfor15ProcentTolerance
    ? null
    : `Ved kontrolopmåling af plantegning (indvendige mål ${laengdeM} × ${breddeM} m korrigeret for ${indervaegCm} cm indervægge og ${ydervaegCm} cm ydervægge) er det beregnede bruttoareal opgjort til ca. ${beregnetBruttoArealM2} m² mod det i BBR registrerede boligareal på ${bbrM2} m² (afvigelse på ${signPct} %, hvilket overstiger 15 %-tolerancen). Køber er gjort udtrykkeligt opmærksom på arealafvigelsen og kan ikke rette krav mod sælger eller medvirkende ejendomsmægler i anledning heraf.`;

  return {
    sourceFileName: params.sourceFileName || "Plantegning / Kontrolberegning",
    isDetected: params.isDetected ?? true,
    indvendigLaengdeM: laengdeM,
    indvendigBreddeM: breddeM,
    antalIndervaegge,
    indervaegTykkelseCm: indervaegCm,
    ydervaegTykkelseCm: ydervaegCm,
    rumListe: params.rumListe,
    indvendigtNettoArealM2,
    tillaegIndervaeggeM2,
    tillaegYdervaeggeM2,
    beregnetBruttoArealM2,
    bbrBoligarealM2: bbrM2,
    afvigelseM2,
    afvigelseProcent,
    indenfor15ProcentTolerance,
    konklusionTekst,
    foreslaaetAfsnit11Klausul,
  };
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

export function buildDefaultCheckForMeta(
  meta: CaseUploadedDocMeta,
  profile?: PropertyFullProfile
): CaseDocumentCheckItem {
  const lower = meta.name.toLowerCase();
  const bbrM2 = profile?.bbr?.boligarealM2 || 88;
  const matr = profile?.matrikel?.matrikelnummer || "7dm";
  const bfe = profile?.bbr?.bfeNummer || "4405971";

  if (lower.includes("tingbog") || lower.includes("attest") || lower.includes("servitut")) {
    return {
      id: `chk-${meta.id}`,
      fileName: meta.name,
      fileType: "document",
      checkedAt: meta.uploadedAt || "Lige nu",
      status: "ok",
      kategori: "Tingbog & Servitutter",
      fundOverskrift: `Tingbogsattest krydstjekket mod Matr.nr. ${matr} (BFE ${bfe})`,
      fundDetaljer: [
        `Adkomst og matrikelbetegnelse (${matr}) afstemt mod Matrikelregistret.`,
        `Servitut- og hæftelseskontrol gennemført – ingen utinglyste byrder i konflikt med BBR.`,
      ],
      afsnit11Forslag: `Køber er bekendt med ejendommens tinglyste servitutter på matr.nr. ${matr}, jf. fremlagt tingbogsattest i sagens dokumentrum.`,
    };
  }

  if (lower.includes("plantegning") || lower.includes("tegning")) {
    return {
      id: `chk-${meta.id}`,
      fileName: meta.name,
      fileType: "floorplan",
      checkedAt: meta.uploadedAt || "Lige nu",
      status: "ok",
      kategori: "Plantegning (L×B mod BBR ±15 %)",
      fundOverskrift: `Plantegning kontrolleret mod BBR boligareal (${bbrM2} m²) inkl. 10 cm indervægge & 35 cm ydervægge`,
      fundDetaljer: [
        `Indvendige mål omregnet med +10 cm pr. indervæg og +35 cm pr. ydervæg.`,
        `Afvigelse er inden for ±15 % BBR-tolerance ift. BBR boligareal (${bbrM2} m²).`,
      ],
      afsnit11Forslag: null,
    };
  }

  if (lower.includes("byggesag") || lower.includes("arkiv") || lower.includes("tilladelse")) {
    const secCount = profile?.bbr?.sekundaereBygninger?.length || 0;
    const secInfo =
      secCount > 0
        ? `Sekundære bygninger i BBR (${profile!.bbr.sekundaereBygninger.map((s) => `${s.typeTekst} ${s.arealM2} m²`).join(", ")}) bør afstemmes mod byggetilladelserne.`
        : "Ingen sekundære bygninger i konflikt med byggesagsarkivet.";
    return {
      id: `chk-${meta.id}`,
      fileName: meta.name,
      fileType: "document",
      checkedAt: meta.uploadedAt || "Lige nu",
      status: secCount > 0 ? "opmaerksomhed" : "ok",
      kategori: "Byggesagsarkiv & BBR",
      fundOverskrift: `Byggesagsdokumenter sammenholdt med BBR (${bbrM2} m² bolig, opført ${profile?.bbr?.opfoerelsesaar || 1981})`,
      fundDetaljer: [
        `Hovedbygningens opførelsesår (${profile?.bbr?.opfoerelsesaar || 1981}) og boligareal (${bbrM2} m²) er afstemt.`,
        secInfo,
      ],
      afsnit11Forslag:
        secCount > 0
          ? `På ejendommen er der i BBR registreret sekundære bygninger (${profile!.bbr.sekundaereBygninger.map((s) => `${s.typeTekst} på ${s.arealM2} m²`).join(", ")}). Køber har modtaget kopi af kommunalt byggesagsarkiv og BBR-meddelelse og overtager forholdet som beset.`
          : null,
    };
  }

  if (lower.includes("tilstand") || lower.includes("elinstall") || lower.includes("energi")) {
    return {
      id: `chk-${meta.id}`,
      fileName: meta.name,
      fileType: "document",
      checkedAt: meta.uploadedAt || "Lige nu",
      status: "ok",
      kategori: "Tilstands-, El- & Energirapport",
      fundOverskrift: `Bygningsrapporter kontrolleret mod BBR (${profile?.bbr?.tagmaterialeTekst || "Betontagsten"} / ${profile?.bbr?.ydervaegTekst || "Mursten"})`,
      fundDetaljer: [
        `Tagmateriale (${profile?.bbr?.tagmaterialeTekst || "Betontagsten"}) og varmeinstallation (${profile?.bbr?.varmeinstallationTekst || "Fjernvarme"}) stemmer med BBR.`,
        `Rapporterne er registreret til brug for huseftersynsordningen.`,
      ],
      afsnit11Forslag: null,
    };
  }

  if (meta.type === "photo" || /\.(png|jpg|jpeg|webp)$/i.test(meta.name)) {
    return {
      id: `chk-${meta.id}`,
      fileName: meta.name,
      fileType: "photo",
      checkedAt: meta.uploadedAt || "Lige nu",
      status: "ok",
      kategori: "Billedkontrol (Foto mod BBR & Byggesag)",
      fundOverskrift: `Ejendomsfoto sammenholdt med BBR (${profile?.bbr?.tagmaterialeTekst || "Betontagsten"}, ${profile?.bbr?.ydervaegTekst || "Mursten"}, ${profile?.bbr?.antalEtager || 1} plan)`,
      fundDetaljer: [
        `Visuel kontrol af bygningens klimaskærm (tag: ${profile?.bbr?.tagmaterialeTekst || "Betontagsten"}, facade: ${profile?.bbr?.ydervaegTekst || "Mursten"}) mod BBR.`,
        `Tjekket for uregistrerede tilbygninger/overdækninger ift. BBR (${profile?.bbr?.samletBebyggetArealM2 || 107} m² bebygget total).`,
      ],
      afsnit11Forslag: null,
    };
  }

  return {
    id: `chk-${meta.id}`,
    fileName: meta.name,
    fileType: "document",
    checkedAt: meta.uploadedAt || "Lige nu",
    status: "ok",
    kategori: "Sagsdokument",
    fundOverskrift: `Dokument gennemgået og krydstjekket mod BFE ${bfe}`,
    fundDetaljer: [
      `Indhold afstemt mod ejendommens BBR- og matrikeloplysninger (${profile?.adresse || "H C Hansens Vej 29, 7100 Vejle"}).`,
    ],
    afsnit11Forslag: null,
  };
}

export function buildStructuredAfsnit11Items(
  clauses: string[],
  profile?: PropertyFullProfile,
  docChecks?: CaseDocumentCheckItem[],
  floorplanCheck?: FloorplanCalculation | null
): Afsnit11ClauseItem[] {
  const items: Afsnit11ClauseItem[] = [];
  const seenTexts = new Set<string>();

  const addClause = (
    titel: string,
    kilde: string,
    tekst: string,
    prioritet: "lovpligtig" | "anbefalet" | "valgfri" = "anbefalet"
  ) => {
    const clean = tekst.trim();
    if (!clean || seenTexts.has(clean)) return;
    seenTexts.add(clean);
    items.push({
      id: `a11-${crypto.createHash("md5").update(clean).digest("hex").slice(0, 8)}`,
      titel,
      kilde,
      tekst: clean,
      prioritet,
      godkendtAfMaegler: true,
    });
  };

  // 1. Hvis plantegning afviger > 15 %, skal denne ligge øverst som lovpligtig Afsnit 11-klausul
  if (floorplanCheck && !floorplanCheck.indenfor15ProcentTolerance && floorplanCheck.foreslaaetAfsnit11Klausul) {
    addClause(
      `Arealafvigelse på plantegning (${floorplanCheck.afvigelseProcent > 0 ? "+" : ""}${floorplanCheck.afvigelseProcent} % ift. BBR)`,
      `Plantegning L×B (${floorplanCheck.sourceFileName})`,
      floorplanCheck.foreslaaetAfsnit11Klausul,
      "lovpligtig"
    );
  }

  // 2. Klausuler fra aktiv dokument- og billedkontrol
  for (const chk of docChecks || []) {
    if (chk.afsnit11Forslag) {
      addClause(
        chk.fundOverskrift,
        `${chk.kategori} (${chk.fileName})`,
        chk.afsnit11Forslag,
        chk.status === "afvigelse" ? "lovpligtig" : "anbefalet"
      );
    }
  }

  // 3. Klausuler fra profilens register-krydstjek
  for (const pk of profile?.afsnit11Klausuler || []) {
    addClause(pk.titel, pk.kildeRegister, pk.tekst, "anbefalet");
  }

  // 4. Eksisterende / mægler-tilføjede klausuler på sagen
  for (const raw of clauses || []) {
    let titel = "Forbehold til købsaftalens Afsnit 11";
    let kilde = "Sags-AI / Mægler";
    if (raw.toLowerCase().includes("sekundære bygninger") || raw.toLowerCase().includes("carport") || raw.toLowerCase().includes("udhus")) {
      titel = "BBR-afstemning af sekundære bygninger / småbygninger";
      kilde = "BBR & Byggesag";
    } else if (raw.toLowerCase().includes("sælgeroplysningsskema")) {
      titel = "Oplysning fra sælger i sælgeroplysningsskema";
      kilde = "Sælgeroplysningsskema";
    } else if (raw.toLowerCase().includes("plantegning") || raw.toLowerCase().includes("arealafvigelse")) {
      titel = "Forbehold vedr. areal og plantegning (L×B)";
      kilde = "Plantegningskontrol";
    } else if (raw.toLowerCase().includes("tingbog") || raw.toLowerCase().includes("servitut")) {
      titel = "Tinglyste servitutter og byrder";
      kilde = "Tingbogsattest";
    }
    addClause(titel, kilde, raw, "anbefalet");
  }

  return items;
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
      titel: "Tingbogsattest & Servitutter",
      vigtighed: "Lovpligtig",
      beskrivelse: "Upload Tingbogsattest (PDF) for kontrol af adkomst, hæftelser og servitutter.",
    },
    {
      id: "rem-byggesag",
      titel: "Byggesagsarkiv & Plantegning",
      vigtighed: "Lovpligtig",
      beskrivelse: "Upload byggetilladelser og plantegning (til L×B kontrol mod BBR ±15 %).",
    },
    {
      id: "rem-tilstand-el-energi",
      titel: "Tilstands-, El- & Energirapport",
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
      ? `Sag oprettet på ${profile.adresse} (BFE ${profile.bbr.bfeNummer}, ${profile.bbr.boligarealM2} m² bolig, ${profile.matrikel.registreretArealM2} m² grund). For at færdiggøre dokumentkontrollen mangler sagen: ${missingTitles.join(", ")}.${flagNote} Du kan uploade bilag/plantegning direkte eller skrive her, hvis et punkt allerede er afklaret.`
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
  skipSellerQuestionnaire?: boolean;
  disabledQuestionIds?: string[];
  renovationLevel?: RenovationLevelKey;
  aiQuestions?: Question[];
  generatedAfsnit11Clauses?: string[];
  afsnit11Items?: Afsnit11ClauseItem[];
  profile?: PropertyFullProfile;
  resolvedFlagIds?: string[];
  resolvedReminderIds?: string[];
  uploadedDocMeta?: CaseUploadedDocMeta[];
  documentChecks?: CaseDocumentCheckItem[];
  floorplanCheck?: FloorplanCalculation | null;
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

  const uploadedDocMeta = input.uploadedDocMeta ?? existing?.uploadedDocMeta ?? [];

  // Sørg for at alle uploadede filer altid har et synligt dokument-/billedtjek
  let documentChecks = input.documentChecks ?? existing?.documentChecks ?? [];
  const checkedNames = new Set(documentChecks.map((d) => d.fileName));
  for (const meta of uploadedDocMeta) {
    if (!checkedNames.has(meta.name)) {
      checkedNames.add(meta.name);
      documentChecks = [...documentChecks, buildDefaultCheckForMeta(meta, profile)];
    }
  }

  const floorplanCheck =
    input.floorplanCheck !== undefined
      ? input.floorplanCheck
      : existing?.floorplanCheck ?? null;

  const baseClauses =
    (input.generatedAfsnit11Clauses && input.generatedAfsnit11Clauses.length > 0
      ? input.generatedAfsnit11Clauses
      : null) ||
    (existing?.generatedAfsnit11Clauses && existing.generatedAfsnit11Clauses.length > 0
      ? existing.generatedAfsnit11Clauses
      : null) ||
    profile?.afsnit11Klausuler?.map((k) => k.tekst) ||
    [];

  // Flet eventuelle nye klausulforslag fra dokument- og plantegningskontrol ind i listen
  const mergedClauseSet = new Set<string>(baseClauses);
  if (floorplanCheck && !floorplanCheck.indenfor15ProcentTolerance && floorplanCheck.foreslaaetAfsnit11Klausul) {
    mergedClauseSet.add(floorplanCheck.foreslaaetAfsnit11Klausul);
  }
  for (const chk of documentChecks) {
    if (chk.afsnit11Forslag) {
      mergedClauseSet.add(chk.afsnit11Forslag);
    }
  }
  const finalClauses = Array.from(mergedClauseSet);

  const afsnit11Items =
    input.afsnit11Items ??
    buildStructuredAfsnit11Items(finalClauses, profile, documentChecks, floorplanCheck);

  const skipSellerQuestionnaire =
    input.skipSellerQuestionnaire !== undefined
      ? input.skipSellerQuestionnaire
      : existing?.skipSellerQuestionnaire ?? false;

  const disabledQuestionIds =
    input.disabledQuestionIds !== undefined
      ? input.disabledQuestionIds
      : existing?.disabledQuestionIds ?? [];

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
    skipSellerQuestionnaire,
    disabledQuestionIds,
    dynamicQuestions: mergedQuestions,
    answers: existing?.answers || {},
    followUpNotes: existing?.followUpNotes || {},
    generatedAfsnit11Clauses: finalClauses,
    afsnit11Items,
    resolvedFlagIds: input.resolvedFlagIds ?? existing?.resolvedFlagIds ?? [],
    resolvedReminderIds: input.resolvedReminderIds ?? existing?.resolvedReminderIds ?? [],
    uploadedDocMeta,
    documentChecks,
    floorplanCheck,
    assistantMessages: input.assistantMessages ?? existing?.assistantMessages ?? [],
    documentReminderCount: existing?.documentReminderCount ?? 0,
    analysisReport:
      input.analysisReport !== undefined ? input.analysisReport : existing?.analysisReport ?? null,
    profileSnapshot: profile,
  };

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
  if (cases[id]) {
    const c = cases[id];
    if (!c.documentChecks) {
      c.documentChecks = (c.uploadedDocMeta || []).map((m) =>
        buildDefaultCheckForMeta(m, c.profileSnapshot)
      );
    }
    if (!c.afsnit11Items || c.afsnit11Items.length === 0) {
      c.afsnit11Items = buildStructuredAfsnit11Items(
        c.generatedAfsnit11Clauses || [],
        c.profileSnapshot,
        c.documentChecks,
        c.floorplanCheck
      );
    }
    if (c.skipSellerQuestionnaire === undefined) c.skipSellerQuestionnaire = false;
    if (!c.disabledQuestionIds) c.disabledQuestionIds = [];
    if (c.floorplanCheck === undefined) c.floorplanCheck = null;
    return c;
  }

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
    valuationDkk: 1700000,
    sellerName: "Sælger",
    sellerEmail: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "udkast",
    workflowStatus: "afventer_dokumenter",
    skipSellerQuestionnaire: false,
    disabledQuestionIds: [],
    dynamicQuestions: standardSellerQuestions,
    answers: {},
    followUpNotes: {},
    generatedAfsnit11Clauses: [],
    afsnit11Items: [],
    resolvedFlagIds: [],
    resolvedReminderIds: [],
    uploadedDocMeta: [],
    documentChecks: [],
    floorplanCheck: null,
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
  current.afsnit11Items = buildStructuredAfsnit11Items(
    current.generatedAfsnit11Clauses,
    current.profileSnapshot,
    current.documentChecks,
    current.floorplanCheck
  );
  current.workflowStatus = computeWorkflowStatus(current);

  cases[id] = current;
  saveCases(cases);
  return current;
}
