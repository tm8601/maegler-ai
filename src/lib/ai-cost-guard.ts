import fs from "fs";
import path from "path";
import crypto from "crypto";

export function resolvePersistentDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    if (fs.existsSync("/data")) {
      return "/data/maegler-ai-data";
    }
  } catch {
    // Ignore
  }
  return "/tmp/maegler-ai-data";
}

const DATA_DIR = resolvePersistentDataDir();
const LEDGER_FILE = path.join(DATA_DIR, "ai-budget-ledger.json");
const DOC_CACHE_FILE = path.join(DATA_DIR, "ai-doc-cache.json");

// Hård daglig grænse på 30,00 kr. og sagsloft på 5,00 kr. (Zero-Limbo)
export const MAX_DAILY_AI_BUDGET_DKK = Number(process.env.MAX_DAILY_AI_BUDGET_DKK || 30.0);
export const MAX_CASE_AI_BUDGET_DKK = Number(process.env.MAX_CASE_AI_BUDGET_DKK || 5.0);
export const ALLOW_PRO_MODELS = process.env.ALLOW_PRO_MODELS === "true";
export const LOCKED_FLASH_MODEL = "gemini-2.5-flash";
export const USD_TO_DKK_RATE = 7.0;

// Konservative priser pr. 1M tokens i USD (svarende til Servitut AI case_budget_tracker.py)
const FLASH_INPUT_USD_PER_1M = 0.75;
const FLASH_CACHED_USD_PER_1M = 0.075;
const FLASH_OUTPUT_USD_PER_1M = 3.75;

// Konservative pre-flight estimater i DKK
export const COST_PER_DOC_ANALYSIS_DKK = 0.08;
export const COST_PER_ASSISTANT_TURN_DKK = 0.03;

// In-memory concurrency guard for at forhindre enhver form for "limbo" eller parallelle loops
const activeCaseCalls = new Map<string, number>();
const MAX_ASSISTANT_CALLS_PER_CASE_SESSION = 35;

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
  inputTokensToday: number;
  outputTokensToday: number;
  caseSpendByKey: Record<string, number>;
  caseCallsByKey: Record<string, number>;
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
    existing.inputTokensToday = Number(existing.inputTokensToday || 0);
    existing.outputTokensToday = Number(existing.outputTokensToday || 0);
    existing.caseCallsByKey = existing.caseCallsByKey || {};
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
    inputTokensToday: 0,
    outputTokensToday: 0,
    caseSpendByKey: {},
    caseCallsByKey: {},
    lastModelUsed: existing?.lastModelUsed || LOCKED_FLASH_MODEL,
    lastCallAt: existing?.lastCallAt || null,
    lastError: null,
  };

  ledgers[tenantId] = fresh;
  saveAllLedgers(ledgers);
  return fresh;
}

export function calculateTokenCostDkk(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}): { costDkk: number; inputTokens: number; outputTokens: number } {
  if (!usage) {
    return { costDkk: 0.02, inputTokens: 0, outputTokens: 0 };
  }
  const promptTokens = Math.max(0, Number(usage.promptTokenCount || 0));
  const cachedTokens = Math.max(0, Math.min(promptTokens, Number(usage.cachedContentTokenCount || 0)));
  const uncachedInput = Math.max(0, promptTokens - cachedTokens);
  const outputTokens =
    Math.max(0, Number(usage.candidatesTokenCount || 0)) +
    Math.max(0, Number(usage.thoughtsTokenCount || 0));

  const costUsd =
    (uncachedInput / 1_000_000) * FLASH_INPUT_USD_PER_1M +
    (cachedTokens / 1_000_000) * FLASH_CACHED_USD_PER_1M +
    (outputTokens / 1_000_000) * FLASH_OUTPUT_USD_PER_1M;

  const costDkk = Math.max(0.005, Number((costUsd * USD_TO_DKK_RATE).toFixed(4)));
  return { costDkk, inputTokens: promptTokens, outputTokens };
}

export function checkAndReserveAiBudget(options: {
  tenantId?: string;
  caseKey?: string;
  estimatedCostDkk: number;
}): {
  allowed: boolean;
  reason?: string;
  reservedDkk: number;
  state: TenantBudgetState;
} {
  const tenantId = options.tenantId || "vejle-maegleren";
  const caseKey = (options.caseKey || "default").toLowerCase().trim();
  const cost = Number(options.estimatedCostDkk || COST_PER_DOC_ANALYSIS_DKK);

  const ledgers = loadAllLedgers();
  const state = getTenantBudgetState(tenantId);

  // 0. Anti-Limbo in-flight check (maks 1 aktivt AI-kald pr. sag ad gangen)
  const inflightTimestamp = activeCaseCalls.get(caseKey);
  if (inflightTimestamp && Date.now() - inflightTimestamp < 8_000) {
    return {
      allowed: false,
      reason: "Et tjek kører allerede på sagen. Vent et øjeblik.",
      reservedDkk: 0,
      state,
    };
  }

  // 1. Tjek max antal kald på samme sag i dag (Anti-Limbo loop sikring)
  const callsOnCase = Number(state.caseCallsByKey[caseKey] || 0);
  if (callsOnCase >= MAX_ASSISTANT_CALLS_PER_CASE_SESSION) {
    state.blockedCallsToday += 1;
    ledgers[tenantId] = state;
    saveAllLedgers(ledgers);
    return {
      allowed: false,
      reason: `Sagen har nået loftet på ${MAX_ASSISTANT_CALLS_PER_CASE_SESSION} AI-opdateringer i dag (Zero-Limbo beskyttelse).`,
      reservedDkk: 0,
      state,
    };
  }

  // 2. Tjek hård daglig grænse på 30,00 kr.
  if (state.spentDkk + cost > MAX_DAILY_AI_BUDGET_DKK) {
    state.blockedCallsToday += 1;
    ledgers[tenantId] = state;
    saveAllLedgers(ledgers);
    return {
      allowed: false,
      reason: `Daglig grænse på ${MAX_DAILY_AI_BUDGET_DKK.toFixed(2).replace(".", ",")} kr. er nået.`,
      reservedDkk: 0,
      state,
    };
  }

  // 3. Tjek sagsloft (3,00 kr. pr. adresse/sag i dag)
  const currentCaseSpend = Number(state.caseSpendByKey[caseKey] || 0);
  if (currentCaseSpend + cost > MAX_CASE_AI_BUDGET_DKK) {
    state.blockedCallsToday += 1;
    ledgers[tenantId] = state;
    saveAllLedgers(ledgers);
    return {
      allowed: false,
      reason: `Sagsloftet på ${MAX_CASE_AI_BUDGET_DKK.toFixed(2).replace(".", ",")} kr. for denne sag er nået i dag.`,
      reservedDkk: 0,
      state,
    };
  }

  // Sæt in-flight lås og reservér beløbet med det samme
  activeCaseCalls.set(caseKey, Date.now());
  state.spentDkk = Number((state.spentDkk + cost).toFixed(4));
  state.totalHistoricalSpentDkk = Number((state.totalHistoricalSpentDkk + cost).toFixed(4));
  state.callsToday += 1;
  state.caseSpendByKey[caseKey] = Number((currentCaseSpend + cost).toFixed(4));
  state.caseCallsByKey[caseKey] = callsOnCase + 1;
  state.lastCallAt = new Date().toISOString();
  state.lastModelUsed = LOCKED_FLASH_MODEL;

  ledgers[tenantId] = state;
  saveAllLedgers(ledgers);

  return { allowed: true, reservedDkk: cost, state };
}

export function finalizeAiCallUsage(options: {
  tenantId?: string;
  caseKey?: string;
  reservedDkk: number;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}): TenantBudgetState {
  const tenantId = options.tenantId || "vejle-maegleren";
  const caseKey = (options.caseKey || "default").toLowerCase().trim();
  activeCaseCalls.delete(caseKey);

  const ledgers = loadAllLedgers();
  const state = getTenantBudgetState(tenantId);

  if (options.usageMetadata) {
    const { costDkk, inputTokens, outputTokens } = calculateTokenCostDkk(options.usageMetadata);
    const delta = Number((costDkk - options.reservedDkk).toFixed(4));
    state.spentDkk = Math.max(0, Number((state.spentDkk + delta).toFixed(4)));
    state.totalHistoricalSpentDkk = Math.max(0, Number((state.totalHistoricalSpentDkk + delta).toFixed(4)));
    state.caseSpendByKey[caseKey] = Math.max(
      0,
      Number(((state.caseSpendByKey[caseKey] || 0) + delta).toFixed(4))
    );
    state.inputTokensToday = (state.inputTokensToday || 0) + inputTokens;
    state.outputTokensToday = (state.outputTokensToday || 0) + outputTokens;
  }

  ledgers[tenantId] = state;
  saveAllLedgers(ledgers);
  return state;
}

export function releaseInFlightLock(caseKey?: string) {
  if (caseKey) {
    activeCaseCalls.delete(caseKey.toLowerCase().trim());
  }
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
