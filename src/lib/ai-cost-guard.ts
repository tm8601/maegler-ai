import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = process.env.DATA_DIR || "/tmp/maegler-ai-data";
const LEDGER_FILE = path.join(DATA_DIR, "ai-budget-ledger.json");
const DOC_CACHE_FILE = path.join(DATA_DIR, "ai-doc-cache.json");

// Hård daglig grænse på 30,00 kr. som ALDRIG må overstiges!
export const MAX_DAILY_AI_BUDGET_DKK = Number(process.env.MAX_DAILY_AI_BUDGET_DKK || 30.0);
export const MAX_CASE_AI_BUDGET_DKK = Number(process.env.MAX_CASE_AI_BUDGET_DKK || 2.5);
export const ALLOW_PRO_MODELS = process.env.ALLOW_PRO_MODELS === "true";

// Konservative priser i DKK inkl. sikkerhedsmargin for Gemini 2.5 Flash
export const COST_PER_DOC_ANALYSIS_DKK = 0.08;
export const COST_PER_TEXT_CHECK_DKK = 0.03;

export interface TenantBudgetState {
  tenantId: string;
  date: string;
  spentDkk: number;
  totalHistoricalSpentDkk: number;
  maxDailyBudgetDkk: number;
  maxCaseBudgetDkk: number;
  callsToday: number;
  cacheHitsToday: number;
  blockedCallsToday: number;
  caseSpendByKey: Record<string, number>;
  lastModelUsed: string | null;
  lastCallAt: string | null;
  lastError: string | null;
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore if read-only fs
  }
}

export function getCopenhagenDateKey(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Copenhagen",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function loadAllLedgers(): Record<string, TenantBudgetState> {
  ensureDataDir();
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function saveAllLedgers(ledgers: Record<string, TenantBudgetState>) {
  ensureDataDir();
  try {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledgers, null, 2), "utf8");
  } catch {
    // Ignore write errors
  }
}

export function getTenantBudgetState(tenantId = "vejle-maegleren"): TenantBudgetState {
  const today = getCopenhagenDateKey();
  const ledgers = loadAllLedgers();
  const existing = ledgers[tenantId];

  if (existing && existing.date === today) {
    existing.maxDailyBudgetDkk = MAX_DAILY_AI_BUDGET_DKK;
    existing.maxCaseBudgetDkk = MAX_CASE_AI_BUDGET_DKK;
    return existing;
  }

  const fresh: TenantBudgetState = {
    tenantId,
    date: today,
    spentDkk: 0,
    totalHistoricalSpentDkk: Number(existing?.totalHistoricalSpentDkk || 0),
    maxDailyBudgetDkk: MAX_DAILY_AI_BUDGET_DKK,
    maxCaseBudgetDkk: MAX_CASE_AI_BUDGET_DKK,
    callsToday: 0,
    cacheHitsToday: 0,
    blockedCallsToday: 0,
    caseSpendByKey: {},
    lastModelUsed: existing?.lastModelUsed || "gemini-2.5-flash",
    lastCallAt: existing?.lastCallAt || null,
    lastError: null,
  };

  ledgers[tenantId] = fresh;
  saveAllLedgers(ledgers);
  return fresh;
}

export function checkAndReserveAiBudget(options: {
  tenantId?: string;
  caseKey?: string;
  estimatedCostDkk: number;
}): {
  allowed: boolean;
  reason?: string;
  state: TenantBudgetState;
} {
  const tenantId = options.tenantId || "vejle-maegleren";
  const caseKey = (options.caseKey || "default").toLowerCase().trim();
  const cost = Number(options.estimatedCostDkk || COST_PER_DOC_ANALYSIS_DKK);

  const ledgers = loadAllLedgers();
  const state = getTenantBudgetState(tenantId);

  // 1. Tjek hård daglig grænse på 30,00 kr.
  if (state.spentDkk + cost > MAX_DAILY_AI_BUDGET_DKK) {
    state.blockedCallsToday += 1;
    ledgers[tenantId] = state;
    saveAllLedgers(ledgers);
    return {
      allowed: false,
      reason: `Daglig AI-beløbsgrænse på ${MAX_DAILY_AI_BUDGET_DKK.toFixed(2).replace(".", ",")} kr. er nået (${state.spentDkk.toFixed(2).replace(".", ",")} kr. brugt i dag). Systemet bruger deterministisk 5-register krydsrevision (0,00 kr.).`,
      state,
    };
  }

  // 2. Tjek sagsloft (2,50 kr. pr. adresse/sag i dag)
  const currentCaseSpend = Number(state.caseSpendByKey[caseKey] || 0);
  if (currentCaseSpend + cost > MAX_CASE_AI_BUDGET_DKK) {
    state.blockedCallsToday += 1;
    ledgers[tenantId] = state;
    saveAllLedgers(ledgers);
    return {
      allowed: false,
      reason: `Sagsloftet på ${MAX_CASE_AI_BUDGET_DKK.toFixed(2).replace(".", ",")} kr. for denne adresse er nået i dag. Bruger deterministisk 5-register krydsrevision (0,00 kr.).`,
      state,
    };
  }

  // Reservér beløbet med det samme (forhindrer race conditions / løbske kald)
  state.spentDkk = Number((state.spentDkk + cost).toFixed(4));
  state.totalHistoricalSpentDkk = Number((state.totalHistoricalSpentDkk + cost).toFixed(4));
  state.callsToday += 1;
  state.caseSpendByKey[caseKey] = Number((currentCaseSpend + cost).toFixed(4));
  state.lastCallAt = new Date().toISOString();
  state.lastModelUsed = "gemini-2.5-flash";

  ledgers[tenantId] = state;
  saveAllLedgers(ledgers);

  return { allowed: true, state };
}

export function computePayloadSha256(parts: (string | Buffer)[]): string {
  const hash = crypto.createHash("sha256");
  for (const p of parts) {
    hash.update(p);
  }
  return hash.digest("hex");
}

export function getCachedAiAnalysis(sha256Key: string, tenantId = "vejle-maegleren"): string | null {
  ensureDataDir();
  try {
    if (fs.existsSync(DOC_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(DOC_CACHE_FILE, "utf8"));
      const entry = cache?.[sha256Key];
      if (entry && typeof entry.analysis === "string") {
        // Registrér cache-hit (0,00 kr.)
        const ledgers = loadAllLedgers();
        const state = getTenantBudgetState(tenantId);
        state.cacheHitsToday += 1;
        ledgers[tenantId] = state;
        saveAllLedgers(ledgers);
        return entry.analysis;
      }
    }
  } catch {
    // Ignore cache read error
  }
  return null;
}

export function setCachedAiAnalysis(sha256Key: string, analysis: string, address: string) {
  ensureDataDir();
  try {
    let cache: Record<string, { analysis: string; address: string; createdAt: string }> = {};
    if (fs.existsSync(DOC_CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(DOC_CACHE_FILE, "utf8")) || {};
    }
    // Hold maks 200 seneste analyser i cachen
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      delete cache[keys[0]];
    }
    cache[sha256Key] = {
      analysis,
      address,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(DOC_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // Ignore cache write error
  }
}
