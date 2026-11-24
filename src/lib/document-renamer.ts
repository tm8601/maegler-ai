import fs from "fs";
import path from "path";
import zlib from "zlib";
import { resolvePersistentDataDir } from "@/lib/ai-cost-guard";

const DATA_DIR = resolvePersistentDataDir();
const LEARNING_MEMORY_FILE = path.join(DATA_DIR, "doc-renamer-memory.json");

/**
 * De faste standard-filnavne (ALDRIG dato i filnavnet — kun årstal på Ejendomsvurdering [ÅRSTAL]).
 */
export const BUILT_IN_STANDARD_DOCUMENT_NAMES: string[] = [
  "BBR-Meddelelse",
  "Boligskattelån",
  "Boligskattelån, kvittering",
  "Brændeovn oplysninger",
  "Byggesag 1",
  "Byggesag 2",
  "Byggesag 3",
  "Byggesag 4",
  "Byggesag 5",
  "Deklaration ejendomsvurdering",
  "Ejendomsbidragsbillet",
  "Ejendomsdatarapport",
  "Ejendomsdatarapport – resumé",
  "Ejendomskort",
  "Ejendomsskattebillet",
  "Ejendomsskatter – indefrosne, kvittering",
  "Ejendomsvurdering [ÅRSTAL]",
  "Ejerskifteforsikring, tilbud",
  "Ejerskifteforsikring, alternativt tilbud",
  "Elinstallationsrapport",
  "Energimærke",
  "Fbb bevaringsværdighed",
  "Foreløbig vurdering",
  "Jordforureningsattest",
  "Kommuneplan",
  "Kort over vejforsyning",
  "Police husforsikring",
  "Restgældskvittering",
  "Råstofplanskort",
  "Servitut 1",
  "Servitut 2",
  "Servitut 3",
  "Servitut 4",
  "Servitut 5",
  "Sælgeransvarsforsikring, tilbud",
  "Sælgers oplysninger om tidligere opvarmning",
  "Sælgers tilbud om betaling af halv ejerskifteforsikring",
  "Tilstandsrapport, gældende",
  "Tingbogsattest",
  "Varmeopgørelse",
];

export type RenameRecognitionMethod =
  | "auto_rule"
  | "preserved_user_number"
  | "ejerskifte_cheapest_5yr"
  | "ejerskifte_expensive_5yr"
  | "learned_memory"
  | "manual_override";

export interface LearnedDocumentRule {
  id: string;
  targetBaseName: string;
  filenameTokens: string[];
  headerPhrases: string[];
  signatureKeywords: string[];
  sampleOriginalName: string;
  createdAt: string;
  hitCount: number;
}

export interface DocumentRenamerMemory {
  customStandardNames: string[];
  learnedRules: LearnedDocumentRule[];
}

export interface DocumentRenameInputItem {
  id: string;
  originalName: string;
  extractedText: string;
  manualTargetName?: string | null;
  isManualOverride?: boolean;
  ejerskifteSwapRank?: number | null;
}

export interface DocumentRenameOutputItem {
  id: string;
  originalName: string;
  targetFileName: string;
  targetBaseName: string;
  extension: string;
  documentFamily: string;
  recognitionMethod: RenameRecognitionMethod;
  statusBadge: string;
  confidencePercent: number;
  fiveYearPremiumDkk?: number | null;
  assessmentYear?: string | null;
  preservedNumber?: number | null;
  assignedSequenceNumber?: number | null;
  learnedRuleId?: string | null;
}

const DANISH_STOPWORDS = new Set([
  "og",
  "i",
  "at",
  "det",
  "er",
  "en",
  "et",
  "til",
  "på",
  "med",
  "for",
  "af",
  "som",
  "den",
  "de",
  "der",
  "har",
  "ikke",
  "om",
  "fra",
  "ved",
  "kan",
  "skal",
  "eller",
  "bliver",
  "være",
  "mv",
  "side",
  "dato",
  "nr",
  "kr",
  "dkk",
  "vejle",
  "ejendom",
  "ejendommen",
  "matr",
  "pdf",
  "dok",
  "dokument",
]);

export function loadRenamerMemory(): DocumentRenamerMemory {
  try {
    if (fs.existsSync(LEARNING_MEMORY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEARNING_MEMORY_FILE, "utf8"));
      return {
        customStandardNames: Array.isArray(raw.customStandardNames) ? raw.customStandardNames : [],
        learnedRules: Array.isArray(raw.learnedRules) ? raw.learnedRules : [],
      };
    }
  } catch {
    // Fallback til tom hukommelse
  }
  return {
    customStandardNames: [],
    learnedRules: [],
  };
}

export function saveRenamerMemory(memory: DocumentRenamerMemory): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEARNING_MEMORY_FILE, JSON.stringify(memory, null, 2), "utf8");
  } catch (err) {
    console.error("Kunne ikke gemme doc-renamer-memory.json:", err);
  }
}

export function getAllStandardDocumentNames(): string[] {
  const mem = loadRenamerMemory();
  const merged = new Set<string>(BUILT_IN_STANDARD_DOCUMENT_NAMES);
  for (const c of mem.customStandardNames) {
    if (c && c.trim()) {
      merged.add(c.trim());
    }
  }
  return Array.from(merged);
}

/**
 * Sikrer at et filnavn ALDRIG indeholder datoer (f.eks. 13.01.1975, 2026-10-05) medmindre brugeren
 * eksplicit har en forud-nummereret Servitut/Byggesag (Særregel 1) eller vælger manuelt.
 */
export function stripExtension(fileName: string): { base: string; ext: string } {
  const match = fileName.trim().match(/^(.*?)(\.[a-zA-Z0-9]{2,5})$/);
  if (match) {
    return { base: match[1].trim(), ext: match[2].toLowerCase() };
  }
  return { base: fileName.trim(), ext: ".pdf" };
}

export function sanitizeStandardBaseName(rawBaseName: string, allowAssessmentYear = true): string {
  let clean = rawBaseName.replace(/\.[a-zA-Z0-9]{2,5}$/i, "").trim();
  // Fjern fulde datoer som 28.10.2026, 2026-10-05, 13/01/1975
  clean = clean
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, "")
    .replace(/\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[-–,\s]+$/, "")
    .trim();

  if (!allowAssessmentYear) {
    clean = clean.replace(/\b(19\d{2}|20\d{2})\b/g, "").replace(/\s{2,}/g, " ").trim();
  }
  return clean || "Sagsdokument";
}

/**
 * Udtrækker tekst fra PDF-buffer 100 % lokalt (0 kr.) inkl.:
 * - FlateDecode streams (med CRLF-trim før endstream)
 * - Literal strings (...) inkl. oktale tegn (\346 -> æ, \370 -> ø, \345 -> å)
 * - Dansk Scanning A/S / Tinglysningsretten OCR split-token sammensmeltning
 * - UTF-16BE og Latin-1 hex-strenge <0045006a...> i moderne PDF'er
 */
export function extractLocalPdfText(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return "";
  const isPdf = buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
  if (!isPdf) {
    if (
      (buffer[0] === 0x89 && buffer[1] === 0x50) ||
      (buffer[0] === 0xff && buffer[1] === 0xd8) ||
      (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF")
    ) {
      return "";
    }
    return buffer.toString("utf8").slice(0, 45000);
  }

  const chunks: string[] = [];
  const rawLatin1 = buffer.toString("latin1");

  const decodeHexTokens = (streamText: string): string => {
    const hexMatches = streamText.match(/<([0-9A-Fa-f]{8,400})>/g) || [];
    const out: string[] = [];
    for (const hm of hexMatches.slice(0, 120)) {
      const hex = hm.slice(1, -1);
      if (hex.length % 4 === 0 && /^(?:00[2-7A-Fa-f][0-9A-Fa-f]){2,}/.test(hex)) {
        // UTF-16BE hex
        let word = "";
        for (let i = 0; i < hex.length; i += 4) {
          const code = parseInt(hex.slice(i, i + 4), 16);
          if (code >= 32 && code <= 255) {
            word += String.fromCharCode(code);
          } else if (code === 0x2013 || code === 0x2014) {
            word += "–";
          }
        }
        if (/[a-zA-ZæøåÆØÅ]{2,}/.test(word)) out.push(word);
      }
    }
    return out.join(" ");
  };

  let searchPos = 0;
  let textStreamCount = 0;
  while (searchPos < rawLatin1.length && textStreamCount < 160) {
    const startIdx = rawLatin1.indexOf("stream", searchPos);
    if (startIdx === -1) break;
    let dataStart = startIdx + 6;
    if (rawLatin1[dataStart] === "\r" && rawLatin1[dataStart + 1] === "\n") dataStart += 2;
    else if (rawLatin1[dataStart] === "\n" || rawLatin1[dataStart] === "\r") dataStart += 1;

    const endIdx = rawLatin1.indexOf("endstream", dataStart);
    if (endIdx === -1) break;
    searchPos = endIdx + 9;

    const dictHeader = rawLatin1.slice(Math.max(0, startIdx - 260), startIdx);
    if (dictHeader.includes("/Subtype/Image") || dictHeader.includes("/Subtype /Image")) {
      continue;
    }

    const streamLen = endIdx - dataStart;
    if (streamLen < 8 || streamLen > 400_000) continue;

    try {
      let subBuf = buffer.subarray(dataStart, endIdx);
      while (
        subBuf.length > 0 &&
        (subBuf[subBuf.length - 1] === 10 || subBuf[subBuf.length - 1] === 13)
      ) {
        subBuf = subBuf.subarray(0, subBuf.length - 1);
      }

      let inflated: Buffer | null = null;
      try {
        inflated = zlib.unzipSync(subBuf);
      } catch {
        try {
          inflated = zlib.inflateRawSync(subBuf);
        } catch {
          inflated = null;
        }
      }
      if (inflated && inflated.length > 0) {
        textStreamCount++;
        const text = inflated.toString("latin1");
        const parenTokens = text.match(/\(([^()]{1,220})\)/g) || [];
        if (parenTokens.length > 0) {
          const decodedTokens = parenTokens.map((t) =>
            t
              .slice(1, -1)
              .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
              .replace(/\\[nrt]/g, " ")
              .replace(/\\([()\\])/g, "$1")
          );
          const mergedTokens: string[] = [];
          for (let i = 0; i < decodedTokens.length; i++) {
            const cur = decodedTokens[i];
            const nxt = decodedTokens[i + 1];
            if (
              nxt !== undefined &&
              nxt.trim().length === 1 &&
              /[a-zA-Z0-9æøåÆØÅ]$/.test(cur) &&
              /^[a-zA-Z0-9æøåÆØÅ.,:;/-]$/.test(nxt.trim())
            ) {
              mergedTokens.push(cur + nxt.trim());
              i++;
            } else {
              mergedTokens.push(cur);
            }
          }
          const joined = mergedTokens.join(" ").replace(/\s+/g, " ").trim();
          if (/[a-zA-ZæøåÆØÅ]{3,}/.test(joined)) {
            chunks.push(joined);
          }
        }
        const hexDecoded = decodeHexTokens(text);
        if (hexDecoded.length > 10) {
          chunks.push(hexDecoded);
        }
      }
    } catch {
      // Ignorer ikke-tekst stream
    }
  }

  if (chunks.length === 0 && buffer.length < 2_000_000) {
    const directMatches = rawLatin1.match(/\(([^()\\]{3,220})\)/g) || [];
    for (const m of directMatches.slice(0, 350)) {
      const clean = m
        .slice(1, -1)
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
        .replace(/\\[nrt]/g, " ")
        .trim();
      if (/[a-zA-ZæøåÆØÅ]{3,}/.test(clean) && !/[^\x20-\x7E\xA0-\xFF]/.test(clean)) {
        chunks.push(clean);
      }
    }
    const hexDirect = decodeHexTokens(rawLatin1);
    if (hexDirect.length > 10) {
      chunks.push(hexDirect);
    }
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 45000);
}

/**
 * SÆRREGEL 1: Tjek om en fil allerede er bruger-navngivet og nummereret som "Servitut N..." eller "Byggesag N...".
 * Bemærk: Vi udelukker Tinglysning-UUID'er som f.eks. "Servitut 6b38453d-b5c2-4660-8bdf-87cc6221072d (3).pdf".
 */
export function detectPreservedUserNumbering(originalName: string): {
  kind: "servitut" | "byggesag";
  number: number;
} | null {
  const clean = originalName.trim();

  // Tjek at det ikke er en UUID efter "Servitut " eller "Byggesag "
  if (/^(?:servitut|byggesag)\s+[0-9a-f]{6,}-/i.test(clean)) {
    return null;
  }

  const servMatch = clean.match(
    /^servitut\s*(?:nr\.?\s*)?(\d{1,3})(?=\s*[-–._(),:]|\s+af\b|\s+[a-zA-ZæøåÆØÅ]{2,}|\.[a-zA-Z0-9]{2,4}$|$)/i
  );
  if (servMatch) {
    const num = parseInt(servMatch[1], 10);
    if (num >= 1 && num <= 200) {
      return { kind: "servitut", number: num };
    }
  }

  const bygMatch = clean.match(
    /^byggesag\s*(?:nr\.?\s*)?(\d{1,3})(?=\s*[-–._(),:]|\s+af\b|\s+[a-zA-ZæøåÆØÅ]{2,}|\.[a-zA-Z0-9]{2,4}$|$)/i
  );
  if (bygMatch) {
    const num = parseInt(bygMatch[1], 10);
    if (num >= 1 && num <= 200) {
      return { kind: "byggesag", number: num };
    }
  }

  return null;
}

/**
 * SÆRREGEL 2: Udtræk 5-årig præmie (i kr.) fra et tilbud på Ejerskifteforsikring.
 */
export function extract5YearEjerskiftePremiumDkk(text: string): number | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ");

  const parseDkkString = (rawAmount: string): number | null => {
    // Fjern tusindtals-punktummer og håndtér evt. komma-øre
    const cleaned = rawAmount
      .replace(/kr\.?|dkk|,-/gi, "")
      .trim()
      .replace(/\./g, "")
      .replace(/,\d{1,2}$/, "");
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val >= 2500 && val <= 150000) {
      return val;
    }
    return null;
  };

  // Mønster 1: Eksplicit "5-årig" / "5 år" / "5 års" efterfulgt af præmie/pris før "10-år" eller "selvrisiko"
  const fiveYearWindowRegex =
    /(?:5\s*[-–]?\s*år(?:ig|s)?|løbetid\s*:?\s*5\s*år|basis(?:dækning)?\s*5\s*år|standard(?:dækning)?\s*5\s*år)([^]{0,220})/gi;

  const candidates: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = fiveYearWindowRegex.exec(normalized)) !== null) {
    // Stop vinduet hvis "10 år" eller "10-årig" starter inde i vinduet
    let snippet = match[1];
    const tenYrIdx = snippet.search(/10\s*[-–]?\s*år/i);
    if (tenYrIdx !== -1) {
      snippet = snippet.slice(0, tenYrIdx);
    }
    // Fjern "selvrisiko X.XXX kr" fra vinduet så vi ikke tager selvrisikoen som præmie
    snippet = snippet.replace(/selvrisiko[^0-9]{0,25}\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/gi, " ");

    const amountMatches =
      snippet.match(/\b(\d{1,3}\.\d{3}(?:,\d{1,2})?|\d{4,6}(?:,\d{1,2})?)\s*(?:kr\.?|dkk|,-)?/gi) || [];
    for (const am of amountMatches) {
      const parsed = parseDkkString(am);
      if (parsed && parsed >= 3500 && parsed <= 120000) {
        candidates.push(parsed);
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Mønster 2: "Præmie: 18.450 kr. (5 år)" hvor beløbet står lige FØR "(5 år)"
  const reverseRegex =
    /(\d{1,3}\.\d{3}(?:,\d{1,2})?|\d{4,6})\s*(?:kr\.?|dkk|,-)?[^0-9]{0,50}(?:for\s+)?5\s*[-–]?\s*år(?:ig|s)?/gi;
  while ((match = reverseRegex.exec(normalized)) !== null) {
    const parsed = parseDkkString(match[1]);
    if (parsed && parsed >= 3500 && parsed <= 120000) {
      return parsed;
    }
  }

  // Mønster 3: Generel "Samlet præmie" / "Præmie inkl. afgift" i et ejerskifteforsikringstilbud
  const generalPremRegex =
    /(?:samlet\s+præmie|præmie\s+i\s+alt|præmie\s+inkl[^0-9]{0,20}|årlig\s+præmie|engangspræmie)[^0-9]{0,35}(\d{1,3}\.\d{3}(?:,\d{1,2})?|\d{4,6})/gi;
  while ((match = generalPremRegex.exec(normalized)) !== null) {
    const parsed = parseDkkString(match[1]);
    if (parsed && parsed >= 3500 && parsed <= 120000) {
      return parsed;
    }
  }

  return null;
}

/**
 * Udtrækker 4-cifret vurderings-årstal til "Ejendomsvurdering [ÅRSTAL]" (ALDRIG dato, kun 4 cifre).
 */
export function extractEjendomsvurderingYear(text: string, originalName = ""): string {
  const combined = `${text} ${originalName}`;

  const patterns = [
    /ejendomsvurdering(?:en)?\s*(?:for|pr\.?)?\s*(20\d{2}|19\d{2})/i,
    /vurderingsår\s*:?\s*(20\d{2}|19\d{2})/i,
    /offentlig\s+vurdering\s*(?:for|pr\.?)?\s*(20\d{2}|19\d{2})/i,
    /vurderingsdato\s*:?\s*(?:\d{1,2}[./-]\d{1,2}[./-])?(20\d{2}|19\d{2})/i,
    /pr\.?\s*1\.?\s*(?:januar|oktober)\s*(20\d{2}|19\d{2})/i,
    /vurdering\s+(20[0-2]\d)\b/i,
  ];

  for (const re of patterns) {
    const m = combined.match(re);
    if (m && m[1]) {
      return m[1];
    }
  }

  // Fallback: Find et 4-cifret årstal (2000-2029) i teksten eller filnavnet
  const allYears = combined.match(/\b(20[0-2]\d)\b/g) || [];
  if (allYears.length > 0 && allYears[0]) {
    return allYears[0];
  }
  return "2022";
}

/**
 * Opbygger tekst-signatur (unikke nøgleord, overskriftsfraser og filnavns-tokens) til den selvlærende motor.
 */
export function buildDocumentSignature(originalName: string, text: string): {
  filenameTokens: string[];
  headerPhrases: string[];
  signatureKeywords: string[];
} {
  const { base } = stripExtension(originalName);
  const filenameTokens = base
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, " ")
    .replace(/[^a-zæøå]+/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !DANISH_STOPWORDS.has(w))
    .slice(0, 8);

  const first1500 = text.slice(0, 1500).toLowerCase();
  const words = first1500
    .replace(/[^a-zæøå0-9]+/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !DANISH_STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const signatureKeywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([w]) => w);

  const headerPhrases: string[] = [];
  for (let i = 0; i < Math.min(words.length - 1, 14); i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (!headerPhrases.includes(phrase)) {
      headerPhrases.push(phrase);
    }
  }

  return {
    filenameTokens,
    headerPhrases: headerPhrases.slice(0, 10),
    signatureKeywords,
  };
}

/**
 * Gemmer en bruger-rettelse i den selvlærende hukommelse (Særregel 3).
 */
export function learnDocumentRenameRule(input: {
  originalName: string;
  extractedText: string;
  targetBaseName: string;
  addToStandardList?: boolean;
}): { rule: LearnedDocumentRule; memory: DocumentRenamerMemory } {
  const memory = loadRenamerMemory();
  const isAssessmentWithYear = /^ejendomsvurdering\s+\d{4}$/i.test(input.targetBaseName.trim());
  const cleanTarget = sanitizeStandardBaseName(input.targetBaseName, isAssessmentWithYear);

  if (
    input.addToStandardList !== false &&
    !BUILT_IN_STANDARD_DOCUMENT_NAMES.includes(cleanTarget) &&
    !memory.customStandardNames.includes(cleanTarget)
  ) {
    memory.customStandardNames.push(cleanTarget);
  }

  const sig = buildDocumentSignature(input.originalName, input.extractedText);
  const existingIdx = memory.learnedRules.findIndex(
    (r) =>
      r.targetBaseName.toLowerCase() === cleanTarget.toLowerCase() &&
      r.sampleOriginalName.toLowerCase() === input.originalName.toLowerCase()
  );

  const newRule: LearnedDocumentRule = {
    id: existingIdx >= 0 ? memory.learnedRules[existingIdx].id : `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetBaseName: cleanTarget,
    filenameTokens: sig.filenameTokens,
    headerPhrases: sig.headerPhrases,
    signatureKeywords: sig.signatureKeywords,
    sampleOriginalName: input.originalName,
    createdAt: new Date().toISOString(),
    hitCount: existingIdx >= 0 ? memory.learnedRules[existingIdx].hitCount + 1 : 1,
  };

  if (existingIdx >= 0) {
    memory.learnedRules[existingIdx] = newRule;
  } else {
    memory.learnedRules.unshift(newRule);
  }

  saveRenamerMemory(memory);
  return { rule: newRule, memory };
}

function matchLearnedMemoryRule(
  originalName: string,
  extractedText: string,
  memory: DocumentRenamerMemory
): { rule: LearnedDocumentRule; score: number } | null {
  if (!memory.learnedRules || memory.learnedRules.length === 0) return null;

  const sig = buildDocumentSignature(originalName, extractedText);
  const lowerText = extractedText.toLowerCase();
  let bestRule: LearnedDocumentRule | null = null;
  let bestScore = 0;

  for (const rule of memory.learnedRules) {
    let score = 0;

    // 1. Filnavns-token overlap
    if (rule.filenameTokens.length > 0 && sig.filenameTokens.length > 0) {
      const fnMatches = rule.filenameTokens.filter((t) => sig.filenameTokens.includes(t)).length;
      score += (fnMatches / rule.filenameTokens.length) * 45;
    }

    // 2. Header-frase overlap
    if (rule.headerPhrases.length > 0) {
      const phraseMatches = rule.headerPhrases.filter((p) => lowerText.includes(p)).length;
      score += (phraseMatches / rule.headerPhrases.length) * 45;
    }

    // 3. Signatur-keyword overlap
    if (rule.signatureKeywords.length > 0 && sig.signatureKeywords.length > 0) {
      const kwSet = new Set(sig.signatureKeywords);
      const kwMatches = rule.signatureKeywords.filter((k) => kwSet.has(k) || lowerText.includes(k)).length;
      score += (kwMatches / rule.signatureKeywords.length) * 40;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (bestRule && bestScore >= 52) {
    return { rule: bestRule, score: Math.min(99, Math.round(bestScore)) };
  }
  return null;
}

interface RawClassificationCandidate {
  family:
    | "BBR-Meddelelse"
    | "Boligskattelån"
    | "Boligskattelån, kvittering"
    | "Brændeovn oplysninger"
    | "Byggesag"
    | "Deklaration ejendomsvurdering"
    | "Ejendomsbidragsbillet"
    | "Ejendomsdatarapport"
    | "Ejendomsdatarapport – resumé"
    | "Ejendomskort"
    | "Ejendomsskattebillet"
    | "Ejendomsskatter – indefrosne, kvittering"
    | "Ejendomsvurdering [ÅRSTAL]"
    | "Ejerskifteforsikring"
    | "Elinstallationsrapport"
    | "Energimærke"
    | "Fbb bevaringsværdighed"
    | "Foreløbig vurdering"
    | "Jordforureningsattest"
    | "Kommuneplan"
    | "Kort over vejforsyning"
    | "Police husforsikring"
    | "Restgældskvittering"
    | "Råstofplanskort"
    | "Servitut"
    | "Sælgeransvarsforsikring, tilbud"
    | "Sælgers oplysninger om tidligere opvarmning"
    | "Sælgers tilbud om betaling af halv ejerskifteforsikring"
    | "Tilstandsrapport, gældende"
    | "Tingbogsattest"
    | "Varmeopgørelse";
  score: number;
}

/**
 * 100 % gratis, regel-, regex- og pointbaseret dokumentklassificering (0 kr. i AI-kald).
 */
export function classifyDocumentLocally(originalName: string, extractedText: string): {
  family: RawClassificationCandidate["family"];
  confidencePercent: number;
  fiveYearPremiumDkk?: number | null;
  assessmentYear?: string | null;
} {
  const fn = originalName.toLowerCase();
  const txt = extractedText.toLowerCase();
  const combined = `${fn} \n ${txt}`;

  const scores = new Map<RawClassificationCandidate["family"], number>();
  const addScore = (fam: RawClassificationCandidate["family"], pts: number) => {
    scores.set(fam, (scores.get(fam) || 0) + pts);
  };

  // 1. BBR-Meddelelse
  if (/bbr-meddelelse|bbr\s+meddelelse|udskrift\s+fra\s+bbr|bygnings-\s*og\s*boligregistret/.test(combined)) addScore("BBR-Meddelelse", 90);
  if (/\bbbr\b/.test(fn)) addScore("BBR-Meddelelse", 65);
  if (/anvendelseskode|bebygget\s+areal|tagdækningsmateriale|varmeinstallation/.test(txt)) addScore("BBR-Meddelelse", 35);

  // 2 & 3. Boligskattelån & Boligskattelån, kvittering
  if (/boligskattelån|boligskattelaan|lån\s+til\s+betaling\s+af\s+ejendomsskat/.test(combined)) {
    if (/kvittering|indbetalt|indfrielse|betalingskvittering|betalt/.test(combined)) {
      addScore("Boligskattelån, kvittering", 110);
    } else {
      addScore("Boligskattelån", 95);
    }
  }

  // 4. Brændeovn oplysninger
  if (/brændeovn|braendeovn|pejseindsats|prøvningsattest|skorstensfejer|brændeovnsbekendtgørelsen/.test(combined)) {
    addScore("Brændeovn oplysninger", 100);
  }

  // 5. Byggesag (Byggesag 1, Byggesag 2, ...)
  if (
    /byggetilladelse|ibrugtagningstilladelse|byggesag|byggesagsarkiv|weblager|filarkiv|færdigmelding|anmeldelse\s+af\s+byggearbejde|bygningsmyndighed|plantegning|snittegning|facadetegning|nedrivningstilladelse/.test(
      combined
    )
  ) {
    addScore("Byggesag", 85);
  }
  if (/byggesag|byggetilladelse|ibrugtagning|weblager/.test(fn)) {
    addScore("Byggesag", 50);
  }

  // 6. Deklaration ejendomsvurdering
  if (/deklaration\s+ejendomsvurdering|deklarationsmeddelelse|deklaration\s+til\s+ejendomsvurdering|vurderingsstyrelsen[\s\S]{0,120}deklaration/.test(combined)) {
    addScore("Deklaration ejendomsvurdering", 115);
  }

  // 7. Ejendomsbidragsbillet
  if (/ejendomsbidragsbillet|ejendomsbidrag|rotter\s+og\s+renovation|skorstensfejerbidrag/.test(combined)) {
    addScore("Ejendomsbidragsbillet", 105);
  }

  // 8 & 9. Ejendomsdatarapport & Ejendomsdatarapport – resumé
  if (/ejendomsdatarapport|rapport\s+om\s+ejendomsdata/.test(combined)) {
    if (/resum[eé]|sammendrag|kort\s+overblik/.test(combined) || /resum[eé]/.test(fn)) {
      addScore("Ejendomsdatarapport – resumé", 115);
    } else {
      addScore("Ejendomsdatarapport", 100);
    }
  }

  // 10. Ejendomskort
  if (/ejendomskort|matrikelkort|oversigtskort\s+matrikel/.test(combined)) {
    addScore("Ejendomskort", 95);
  }

  // 11 & 12. Ejendomsskattebillet & Ejendomsskatter – indefrosne, kvittering
  if (/indefrosne|indefrosset|indefrysning/.test(combined) && /ejendomsskat|grundskyld|kvittering/.test(combined)) {
    addScore("Ejendomsskatter – indefrosne, kvittering", 115);
  } else if (/ejendomsskattebillet|skattebillet|opkrævning\s+af\s+grundskyld|kommunal\s+ejendomsskat/.test(combined)) {
    addScore("Ejendomsskattebillet", 100);
  }

  // 13 & 19. Foreløbig vurdering vs. Ejendomsvurdering [ÅRSTAL]
  if (/foreløbig\s+vurdering|foreløbig\s+ejendomsvurdering|foreloebig\s+vurdering/.test(combined)) {
    addScore("Foreløbig vurdering", 115);
  } else if (
    /ejendomsvurdering|vurderingsmeddelelse|vurderingsstyrelsen|offentlig\s+ejendomsvurdering/.test(combined) &&
    !/deklaration/.test(combined) &&
    !/tingbogsattest/.test(combined)
  ) {
    addScore("Ejendomsvurdering [ÅRSTAL]", 95);
  }

  // 14, 15 & 29. Ejerskifteforsikring vs. Sælgers tilbud om betaling af halv ejerskifteforsikring
  if (
    /halv\s+ejerskifteforsikring|1\/2\s+ejerskifteforsikring|halvdelen\s+af\s+præmien|tilbud\s+om\s+betaling\s+af\s+halv/.test(
      combined
    )
  ) {
    addScore("Sælgers tilbud om betaling af halv ejerskifteforsikring", 125);
  } else if (
    /ejerskifteforsikring|dansk\s+boligforsikring|frida\s+forsikring|gjensidige\s+ejerskifte|tilbud\s+på\s+ejerskifte/.test(
      combined
    ) &&
    !/sælgeransvarsforsikring/.test(combined)
  ) {
    addScore("Ejerskifteforsikring", 105);
  }

  // 16. Elinstallationsrapport
  if (/elinstallationsrapport|el-installationsrapport|sikkerhedsstyrelsen|elinstallationernes\s+funktionsdygtighed/.test(combined)) {
    addScore("Elinstallationsrapport", 110);
  }

  // 17. Energimærke
  if (/energimærkning|energimærke|energimaerke|energimærkningsrapport|energistyrelsen/.test(combined)) {
    addScore("Energimærke", 110);
  }

  // 18. Fbb bevaringsværdighed
  if (/\bfbb\b|bevaringsværdighed|bevaringsvaerdighed|fredede\s+og\s+bevaringsværdige|save-værdi/.test(combined)) {
    addScore("Fbb bevaringsværdighed", 110);
  }

  // 20. Jordforureningsattest
  if (/jordforureningsattest|vidensniveau\s*1|vidensniveau\s*2|områdeklassificering|kortlægning\s+på\s+vidensniveau/.test(combined)) {
    addScore("Jordforureningsattest", 105);
  }

  // 21. Kommuneplan
  if (/kommuneplan|kommuneplanramme|rammeområde/.test(combined)) {
    addScore("Kommuneplan", 95);
  }

  // 22. Kort over vejforsyning
  if (/kort\s+over\s+vejforsyning|vejforsyning|vejstatus|privat\s+fællesvej\s+kort/.test(combined)) {
    addScore("Kort over vejforsyning", 110);
  }

  // 23. Police husforsikring
  if (/police\s+husforsikring|husforsikring|bygningsforsikring|forsikringspolice|villaforsikring/.test(combined) && !/ejerskifte/.test(combined)) {
    addScore("Police husforsikring", 100);
  }

  // 24. Restgældskvittering
  if (/restgældskvittering|restgaeldskvittering|opgørelse\s+af\s+restgæld|indfrielseskvittering/.test(combined)) {
    addScore("Restgældskvittering", 105);
  }

  // 25. Råstofplanskort
  if (/råstofplanskort|raastofplanskort|råstofplan|graveområde|råstofindvinding/.test(combined)) {
    addScore("Råstofplanskort", 110);
  }

  // 26 & 31. Tingbogsattest vs. Servitut (Servitut 1, Servitut 2, ...)
  const isTingbogOverview =
    /tingbogsattest|ejendomsummarisk/.test(fn) ||
    (/tingbogsattest/.test(txt) && /adkomster/.test(txt) && /hæftelser/.test(txt));

  if (isTingbogOverview) {
    addScore("Tingbogsattest", 120);
  }

  const isServitutDoc =
    /servitut|indskannetakt|indskannet\s*akt|\batd_|aktuelt\s+tinglyst\s+dokument|deklaration\s+om|byplanvedtægt|tinglysningsafdelingen|skifteretsattest|påtegning\s+på\s+skøde|mtr\.\s*nr\.,\s*ejerlav/.test(
      combined
    ) && !isTingbogOverview;

  if (isServitutDoc) {
    addScore("Servitut", 105);
  }

  // 27. Sælgeransvarsforsikring, tilbud
  if (/sælgeransvarsforsikring|saelgeransvarsforsikring|sælgeransvar/.test(combined)) {
    addScore("Sælgeransvarsforsikring, tilbud", 115);
  }

  // 28. Sælgers oplysninger om tidligere opvarmning
  if (
    /sælgers\s+oplysninger\s+om\s+tidligere\s+opvarmning|tidligere\s+opvarmning|oplysninger\s+om\s+opvarmning|tidligere\s+varmekilde|sløjfet\s+olietank/.test(
      combined
    )
  ) {
    addScore("Sælgers oplysninger om tidligere opvarmning", 110);
  }

  // 30. Tilstandsrapport, gældende
  if (/tilstandsrapport|huseftersynsordningen|bygningssagkyndig/.test(combined)) {
    addScore("Tilstandsrapport, gældende", 110);
  }

  // 32. Varmeopgørelse
  if (/varmeopgørelse|varmeopgoerelse|årsopgørelse\s+varme|fjernvarmeopgørelse|forbrugsopgørelse\s+varme/.test(combined)) {
    addScore("Varmeopgørelse", 105);
  }

  // Find bedste kandidat
  let bestFamily: RawClassificationCandidate["family"] = "Byggesag";
  let bestScore = 0;
  for (const [fam, sc] of scores.entries()) {
    if (sc > bestScore) {
      bestScore = sc;
      bestFamily = fam;
    }
  }

  if (bestScore === 0) {
    bestFamily = "Byggesag";
    bestScore = 50;
  }

  const fiveYearPremiumDkk =
    bestFamily === "Ejerskifteforsikring" ? extract5YearEjerskiftePremiumDkk(extractedText) : null;
  const assessmentYear =
    bestFamily === "Ejendomsvurdering [ÅRSTAL]"
      ? extractEjendomsvurderingYear(extractedText, originalName)
      : null;

  return {
    family: bestFamily,
    confidencePercent: Math.min(99, Math.max(60, bestScore)),
    fiveYearPremiumDkk,
    assessmentYear,
  };
}

/**
 * Hovedfunktion: Planlægger og navngiver en hel sags dokumentrum efter de 32 faste filnavne
 * og de 3 ufravigelige særregler (100 % uden betalt AI - 0,00 kr.).
 */
export function computeRenamedDocumentsPlan(
  items: DocumentRenameInputItem[]
): DocumentRenameOutputItem[] {
  const memory = loadRenamerMemory();

  // SÆRREGEL 1: Find alle allerede bruger-nummererede Servitutter og Byggesager først
  const usedServitutNumbers = new Set<number>();
  const usedByggesagNumbers = new Set<number>();
  const preNumberedMap = new Map<string, { kind: "servitut" | "byggesag"; number: number }>();

  for (const item of items) {
    if (item.isManualOverride && item.manualTargetName) {
      const manualNum = detectPreservedUserNumbering(item.manualTargetName);
      if (manualNum) {
        if (manualNum.kind === "servitut") usedServitutNumbers.add(manualNum.number);
        if (manualNum.kind === "byggesag") usedByggesagNumbers.add(manualNum.number);
      }
      continue;
    }

    const preserved = detectPreservedUserNumbering(item.originalName);
    if (preserved) {
      preNumberedMap.set(item.id, preserved);
      if (preserved.kind === "servitut") {
        usedServitutNumbers.add(preserved.number);
      } else {
        usedByggesagNumbers.add(preserved.number);
      }
    }
  }

  const nextAvailableNumber = (used: Set<number>): number => {
    let n = 1;
    while (used.has(n)) {
      n++;
    }
    used.add(n);
    return n;
  };

  // Første gennemløb: Klassificér alle dokumenter (eller brug manualOverride / preNumbered / learnedMemory)
  interface IntermediateItem {
    input: DocumentRenameInputItem;
    ext: string;
    family: string;
    baseName: string;
    method: RenameRecognitionMethod;
    statusBadge: string;
    confidence: number;
    fiveYearPremiumDkk?: number | null;
    assessmentYear?: string | null;
    preservedNumber?: number | null;
    assignedSequenceNumber?: number | null;
    learnedRuleId?: string | null;
  }

  const intermediate: IntermediateItem[] = items.map((item) => {
    const { base: origBase, ext } = stripExtension(item.originalName);

    // A. Manuelt omdøbt af brugeren i UI
    if (item.isManualOverride && item.manualTargetName) {
      const { base: manualBase } = stripExtension(item.manualTargetName);
      return {
        input: item,
        ext,
        family: manualBase,
        baseName: manualBase,
        method: "manual_override",
        statusBadge: "Manuelt navngivet (Gemt & tillært)",
        confidence: 100,
      };
    }

    // B. SÆRREGEL 1: Allerede nummereret Servitut eller Byggesag (må IKKE overskrives!)
    const preserved = preNumberedMap.get(item.id);
    if (preserved) {
      return {
        input: item,
        ext,
        family: preserved.kind === "servitut" ? "Servitut" : "Byggesag",
        baseName: origBase,
        method: "preserved_user_number",
        statusBadge: `Beholdte brugerens nummerering (${preserved.kind === "servitut" ? "Servitut" : "Byggesag"} #${preserved.number})`,
        confidence: 100,
        preservedNumber: preserved.number,
      };
    }

    // C. SÆRREGEL 3: Tjek selvlærende hukommelse (learnedRules)
    const learnedMatch = matchLearnedMemoryRule(item.originalName, item.extractedText, memory);
    if (learnedMatch) {
      return {
        input: item,
        ext,
        family: learnedMatch.rule.targetBaseName,
        baseName: learnedMatch.rule.targetBaseName,
        method: "learned_memory",
        statusBadge: `Tillært regel (${learnedMatch.score}% match)`,
        confidence: learnedMatch.score,
        learnedRuleId: learnedMatch.rule.id,
      };
    }

    // D. Regel-, regex- og pointbaseret lokal klassificering (0 kr.)
    const local = classifyDocumentLocally(item.originalName, item.extractedText);

    if (local.family === "Servitut") {
      const seq = nextAvailableNumber(usedServitutNumbers);
      return {
        input: item,
        ext,
        family: "Servitut",
        baseName: `Servitut ${seq}`,
        method: "auto_rule",
        statusBadge: `Genkendt automatisk (Servitut #${seq})`,
        confidence: local.confidencePercent,
        assignedSequenceNumber: seq,
      };
    }

    if (local.family === "Byggesag") {
      const seq = nextAvailableNumber(usedByggesagNumbers);
      return {
        input: item,
        ext,
        family: "Byggesag",
        baseName: `Byggesag ${seq}`,
        method: "auto_rule",
        statusBadge: `Genkendt automatisk (Byggesag #${seq})`,
        confidence: local.confidencePercent,
        assignedSequenceNumber: seq,
      };
    }

    if (local.family === "Ejendomsvurdering [ÅRSTAL]") {
      const yr = local.assessmentYear || "2022";
      return {
        input: item,
        ext,
        family: "Ejendomsvurdering [ÅRSTAL]",
        baseName: `Ejendomsvurdering ${yr}`,
        method: "auto_rule",
        statusBadge: `Genkendt automatisk (Vurderingsår: ${yr})`,
        confidence: local.confidencePercent,
        assessmentYear: yr,
      };
    }

    if (local.family === "Ejerskifteforsikring") {
      return {
        input: item,
        ext,
        family: "Ejerskifteforsikring",
        baseName: "Ejerskifteforsikring, tilbud",
        method: "auto_rule",
        statusBadge: local.fiveYearPremiumDkk
          ? `Genkendt automatisk (5-årig præmie: ${local.fiveYearPremiumDkk.toLocaleString("da-DK")} kr.)`
          : "Genkendt automatisk (Ejerskifteforsikring)",
        confidence: local.confidencePercent,
        fiveYearPremiumDkk: local.fiveYearPremiumDkk,
      };
    }

    return {
      input: item,
      ext,
      family: local.family,
      baseName: local.family,
      method: "auto_rule",
      statusBadge: "Genkendt automatisk",
      confidence: local.confidencePercent,
    };
  });

  // SÆRREGEL 2: Hvis der er flere tilbud på Ejerskifteforsikring, sammenlign 5-årig præmie!
  const ejerskifteItems = intermediate.filter((it) => it.family === "Ejerskifteforsikring");
  if (ejerskifteItems.length >= 2) {
    const sorted = [...ejerskifteItems].sort((a, b) => {
      // Hvis brugeren har klikket "Byt rundt" (ejerskifteSwapRank), brug det først
      if (
        typeof a.input.ejerskifteSwapRank === "number" &&
        typeof b.input.ejerskifteSwapRank === "number" &&
        a.input.ejerskifteSwapRank !== b.input.ejerskifteSwapRank
      ) {
        return a.input.ejerskifteSwapRank - b.input.ejerskifteSwapRank;
      }
      const pa = a.fiveYearPremiumDkk ?? Number.MAX_SAFE_INTEGER;
      const pb = b.fiveYearPremiumDkk ?? Number.MAX_SAFE_INTEGER;
      return pa - pb;
    });

    sorted.forEach((ejItem, idx) => {
      const premText = ejItem.fiveYearPremiumDkk
        ? `${ejItem.fiveYearPremiumDkk.toLocaleString("da-DK")} kr.`
        : "Præmie ikke angivet";
      if (idx === 0) {
        ejItem.baseName = "Ejerskifteforsikring, tilbud";
        ejItem.method = "ejerskifte_cheapest_5yr";
        ejItem.statusBadge = ejItem.fiveYearPremiumDkk
          ? `Billigste 5-årige præmie: ${premText} → Hovedtilbud`
          : `Hovedtilbud (Ejerskifteforsikring)`;
      } else {
        ejItem.baseName = "Ejerskifteforsikring, alternativt tilbud";
        ejItem.method = "ejerskifte_expensive_5yr";
        ejItem.statusBadge = ejItem.fiveYearPremiumDkk
          ? `Dyreste 5-årige præmie: ${premText} → Alternativt tilbud`
          : `Alternativt tilbud (Ejerskifteforsikring)`;
      }
    });
  }

  return intermediate.map((it) => ({
    id: it.input.id,
    originalName: it.input.originalName,
    targetBaseName: it.baseName,
    targetFileName: `${it.baseName}${it.ext}`,
    extension: it.ext,
    documentFamily: it.family,
    recognitionMethod: it.method,
    statusBadge: it.statusBadge,
    confidencePercent: it.confidence,
    fiveYearPremiumDkk: it.fiveYearPremiumDkk ?? null,
    assessmentYear: it.assessmentYear ?? null,
    preservedNumber: it.preservedNumber ?? null,
    assignedSequenceNumber: it.assignedSequenceNumber ?? null,
    learnedRuleId: it.learnedRuleId ?? null,
  }));
}

/**
 * CRC-32 tabel til standard PKZIP-arkivgenerering i ren Node.js (0 eksterne C++ afhængigheder).
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Bygger en gyldig .zip-buffer med UTF-8 filnavne (flag 0x0800 for æ, ø, å, –)
 * med alle de omdøbte ejendomsdokumenter.
 */
export function buildRenamedDocumentsZipBuffer(
  entries: Array<{ fileName: string; data: Buffer }>
): Buffer {
  const localFileParts: Buffer[] = [];
  const centralDirParts: Buffer[] = [];
  let offset = 0;

  // Sørg for unikke filnavne inde i ZIP-filen (hvis to filer har samme målnavn)
  const usedNames = new Map<string, number>();

  for (const entry of entries) {
    const { base, ext } = stripExtension(entry.fileName);
    const key = `${base}${ext}`.toLowerCase();
    const count = usedNames.get(key) || 0;
    usedNames.set(key, count + 1);
    const uniqueName = count === 0 ? `${base}${ext}` : `${base} (${count + 1})${ext}`;

    const nameBuf = Buffer.from(uniqueName, "utf8");
    const uncompressedSize = entry.data.length;
    const fileCrc = crc32(entry.data);
    const compressedData = zlib.deflateRawSync(entry.data, { level: 6 });
    const compressedSize = compressedData.length;

    // Local File Header (30 bytes + nameBuf)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // Bit 11 = UTF-8 filnavn (æ, ø, å, –)
    localHeader.writeUInt16LE(8, 8); // Compression method: 8 = Deflate
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0, 12); // Mod date
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field len

    localFileParts.push(localHeader, nameBuf, compressedData);

    // Central Directory File Header (46 bytes + nameBuf)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0x0800, 8); // Bit 11 = UTF-8
    centralHeader.writeUInt16LE(8, 10); // Compression method: 8 = Deflate
    centralHeader.writeUInt16LE(0, 12); // Mod time
    centralHeader.writeUInt16LE(0, 14); // Mod date
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra len
    centralHeader.writeUInt16LE(0, 32); // Comment len
    centralHeader.writeUInt16LE(0, 34); // Disk number
    centralHeader.writeUInt16LE(0, 36); // Internal attrs
    centralHeader.writeUInt32LE(0, 38); // External attrs
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDirParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressedData.length;
  }

  const centralDirBuf = Buffer.concat(centralDirParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Start disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16); // Offset of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localFileParts, centralDirBuf, eocd]);
}
