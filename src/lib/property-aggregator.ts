import { Question, standardSellerQuestions as defaultQuestions } from "@/data/seller-questions";
import {
  locationPrices,
  placePrices,
  supplementaryAliases,
  microZonePrices,
  postalFallbacks,
  VERIFIED_BUYERS,
  VerifiedBuyerRecord,
} from "@/lib/vejle-data";

export function getDataforsyningenToken(): string {
  return process.env.DATAFORSYNINGEN_TOKEN || "";
}

export function getDatafordelerKeys(): string[] {
  const keys = [
    process.env.DATAFORDELER_FALLBACK_KEY,
    process.env.DATAFORDELEREN_API_KEY,
    process.env.DATAFORDELER_API_KEY,
  ]
    .map((k) => String(k || "").trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

// ============================================================================
// KOORDINAT-TRANSFORMATION (WGS84 <-> ETRS89 / UTM ZONE 32N EPSG:25832)
// ============================================================================
export function wgs84ToUtm32(latDeg: number, lngDeg: number): { easting: number; northing: number } {
  const lat = (Number(latDeg) * Math.PI) / 180;
  const lng = (Number(lngDeg) * Math.PI) / 180;
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const lon0 = (9.0 * Math.PI) / 180;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = cosLat * (lng - lon0);

  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * lat) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat) -
      ((35 * e6) / 3072) * Math.sin(6 * lat));

  const easting =
    500000.0 +
    k0 *
      N *
      (A +
        ((1 - T + C) * Math.pow(A, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5)) / 120);

  const northing =
    k0 *
    (M +
      N *
        tanLat *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6)) / 720));

  return {
    easting: Number(easting.toFixed(2)),
    northing: Number(northing.toFixed(2)),
  };
}

export function utm32ToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const x = Number(easting) - 500000.0;
  const y = Number(northing);
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const lon0 = (9.0 * Math.PI) / 180;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * Math.pow(e2, 3)) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
    ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const D = x / (N1 * k0);

  const latRad =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720);

  const lngRad =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5)) / 120) /
      cosPhi1;

  return {
    lat: Number(((latRad * 180) / Math.PI).toFixed(6)),
    lng: Number(((lngRad * 180) / Math.PI).toFixed(6)),
  };
}

function parseWktPoint25832(wktObj: unknown): { easting: number; northing: number; lat: number; lng: number } | null {
  const raw =
    typeof wktObj === "string"
      ? wktObj
      : wktObj && typeof wktObj === "object" && "wkt" in wktObj
        ? String((wktObj as { wkt?: string }).wkt || "")
        : "";
  const m = String(raw).match(/POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/i);
  if (!m) return null;
  const easting = Number(m[1]);
  const northing = Number(m[2]);
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || easting < 400000 || northing < 6000000) {
    return null;
  }
  const wgs = utm32ToWgs84(easting, northing);
  return {
    easting: Math.round(easting),
    northing: Math.round(northing),
    lat: wgs.lat,
    lng: wgs.lng,
  };
}

// ============================================================================
// BBR KODELISTER (AUTORITATIVE DATAFORDELER KODER)
// ============================================================================
export const BBR_ROOF_LABELS: Record<string, string> = {
  "1": "Tagpap med lille hældning",
  "2": "Tagpap med stor hældning",
  "3": "Fibercement herunder asbest (Eternit)",
  "4": "Betontagsten",
  "5": "Tegl",
  "6": "Metal",
  "7": "Stråtag",
  "10": "Fibercement uden asbest",
  "11": "Plastmaterialer",
  "12": "Glas",
  "20": "Levende tage (Grønt tag)",
  "80": "Ingen",
  "90": "Andet materiale",
};

export const BBR_WALL_LABELS: Record<string, string> = {
  "1": "Mursten",
  "2": "Letbetonsten",
  "3": "Fibercement herunder asbest",
  "4": "Bindingsværk",
  "5": "Træ",
  "6": "Betonelementer",
  "8": "Metal",
  "10": "Fibercement uden asbest",
  "11": "Plastmaterialer",
  "12": "Glas",
  "80": "Ingen",
  "90": "Andet materiale",
};

export const BBR_HEATING_LABELS: Record<string, string> = {
  "1": "Fjernvarme/blokvarme",
  "2": "Centralvarme med én fyringsenhed",
  "3": "Ovne til fast eller flydende brændsel",
  "5": "Varmepumpe",
  "6": "Centralvarme med to fyringsenheder",
  "7": "Elovne / elpaneler",
  "8": "Gasradiatorer",
  "9": "Ingen varmeinstallation",
  "99": "Blandet opvarmning",
};

export const BBR_HEATING_MEDIUM_LABELS: Record<string, string> = {
  "1": "Elektricitet",
  "2": "Gasværksgas",
  "3": "Flydende brændsel (Fyringsolie)",
  "4": "Fast brændsel (Træpiller / Brænde)",
  "6": "Halm",
  "7": "Naturgas",
  "9": "Andet",
};

export const BBR_BUILDING_USAGE_LABELS: Record<string, string> = {
  "110": "Stuehus til landbrugsejendom",
  "120": "Fritliggende enfamiliehus (Parcelhus)",
  "121": "Sammenbygget enfamiliehus",
  "130": "Række-, kæde- eller dobbelthus",
  "131": "Række-, kæde- og klyngehus",
  "132": "Dobbelthus",
  "140": "Etagebolig-bygning (Ejerlejlighed)",
  "510": "Sommerhus",
  "910": "Garage",
  "920": "Carport",
  "930": "Udhus",
  "940": "Drivhus",
  "950": "Fritliggende overdækning",
  "960": "Fritliggende udestue",
  "970": "Tiloversbleven landbrugsbygning",
};

// ============================================================================
// DATATYPER TIL DET 5-REGISTREDE EJENDOMS-OPSLAG & PROJEKT 15 BEREGNER
// ============================================================================
export type RenovationLevelKey = "gennemrenoveret" | "mellemrenoveret" | "ikke_renoveret";

export interface RenovationLevelValuation {
  key: RenovationLevelKey;
  label: string;
  subtitle: string;
  estimatDkk: number;
  intervalMinDkk: number;
  intervalMaxDkk: number;
  m2PrisDkk: number;
  standTillægDkk: number;
}

export interface AutoDocumentItem {
  id: string;
  titel: string;
  kategori: "BBR" | "Matrikel" | "Plandata" | "Tingbog & Vurdering" | "Vurderingsdokument" | "Juridisk Notat";
  kilde: string;
  status: "Klar til download" | "Eksternt dokumentlink";
  beskrivelse: string;
  indholdTekst?: string;
  externalUrl?: string;
}

export interface SecondaryBuildingItem {
  bygningsnr: number;
  anvendelseKode: string;
  typeTekst: string;
  arealM2: number;
  opfoerelsesaar: number | null;
  tagmateriale: string;
  ydervaeg: string;
}

export interface TekniskAnlaegItem {
  id: string;
  typeTekst: string;
  indholdTekst: string;
  driftstatusTekst: string;
  etableringsaar: number | null;
  sloejfningsaar: number | null;
  volumenLiter: number | null;
  placering: string;
  risikoNiveau: "kritisk" | "opmaerksomhed" | "ok";
}

export interface ByggesagItem {
  id: string;
  sagsnummer: string;
  sagsartTekst: string;
  modtagelsesdato: string;
  byggetilladelsesdato: string | null;
  ibrugtagningstilladelseDato: string | null;
  statusTekst: string;
  erAabenUdenIbrugtagning: boolean;
}

export interface RedFlagItem {
  id: string;
  severity: "kritisk" | "advarsel" | "info";
  register: "BBR" | "Matrikel" | "Plandata" | "Tingbog" | "CVR";
  title: string;
  description: string;
  legalImplication: string;
  afsnit11Clause?: string;
  sellerQuestion?: Question;
}

export interface BuyerMatchItem {
  id: string;
  koeberId: string;
  navn: string;
  telefon: string;
  email: string;
  bank: string;
  finansieringsstatus: string;
  maksBudgetDkk: number;
  minBoligarealM2: number;
  omraade: string;
  afstandKm: number;
  eksakteMatchPunkter: string[];
  maeglerNoter: string;
}

export interface PropertyFullProfile {
  adresse: string;
  husnummerId: string;
  adresseId: string;
  vejnavn: string;
  husnr: string;
  postnr: string;
  bynavn: string;
  kommunekode: string;
  kommuneNavn: string;
  koordinater: {
    lat: number;
    lon: number;
    easting25832: number;
    northing25832: number;
  };
  kildeStatus: {
    bbr: string;
    matrikel: string;
    plandata: string;
    tingbog: string;
    cvr: string;
  };
  // 1. BBR
  bbr: {
    bfeNummer: string;
    boligtype: string;
    erEjerlejlighed: boolean;
    anvendelseKode: string;
    opfoerelsesaar: number | null;
    ombygningsaar: number | null;
    boligarealM2: number;
    bebyggetArealHovedbygningM2: number;
    samletBebyggetArealM2: number;
    kaelderArealM2: number;
    lovligBeboelseKaelderM2: number;
    udnyttetTagetageM2: number;
    antalEtager: number;
    antalVaerelser: number | null;
    antalBadevaerelser: number | null;
    antalToiletter: number | null;
    tagmaterialeKode: string;
    tagmaterialeTekst: string;
    asbestMistanke: boolean;
    ydervaegKode: string;
    ydervaegTekst: string;
    varmeinstallationKode: string;
    varmeinstallationTekst: string;
    opvarmningsmiddelKode: string;
    opvarmningsmiddelTekst: string;
    aflobsforholdKode: string;
    aflobsforholdTekst: string;
    sekundaereBygninger: SecondaryBuildingItem[];
    tekniskeAnlaeg: TekniskAnlaegItem[];
    byggesager: ByggesagItem[];
  };
  // 2. MATRIKLEN
  matrikel: {
    matrikelnummer: string;
    ejerlavsnavn: string;
    ejerlavskode: number | null;
    registreretArealM2: number;
    vejarealM2: number;
    fredskovArealM2: number;
    strandbeskyttelseArealM2: number;
    jordforureningStatus: string;
  };
  // 3. PLANDATA.DK (WFS)
  plandata: {
    kommuneplanRammeId: string;
    kommuneplanNavn: string;
    zonestatus: string;
    anvendelseGenerel: string;
    lokalplanId: string | null;
    lokalplanNavn: string | null;
    lokalplanVedtDato: string | null;
    lokalplanPdfUrl: string | null;
    tilladtBebyggelsesprocent: number;
    faktiskBebyggelsesprocent: number;
    br18TaellendeArealM2: number;
    maxTilladtEtagearealM2: number;
    ubenyttetByggeretM2: number;
    overskredetByggeretM2: number;
    udstykningspotentiale: boolean;
    udstykningsBeskrivelse: string;
  };
  // 4. TINGBOG, VURDERINGSPORTALEN & EJF
  tingbog: {
    offentligEjendomsvaerdiDkk: number | null;
    offentligGrundvaerdiDkk: number | null;
    vurderingsAar: number | null;
    vurderingsStatusTekst: string | null;
    vurderingsportalUrl: string | null;
    senesteHandelsprisDkk: number | null;
    senesteHandelsdato: string | null;
    senesteHandelType: string | null;
    tidligereHandler: Array<{ prisDkk: number; dato: string; typeTekst: string }>;
    tingbogsattestStatus: string;
  };
  // 5. CVR
  cvr: {
    registreredeVirksomheder: Array<{
      cvrNummer: string;
      navn: string;
      branche: string;
      virksomhedsform: string;
      stiftelsesdato: string;
      status: string;
      tegningsregel: string;
    }>;
    harAktivtErhvervPaaAdressen: boolean;
  };
  // PROJEKT 15 VURDERINGSBEREGNER (3 NIVEAUER: GENNEMRENOVERET, MELLEMRENOVERET, IKKE RENOVERET)
  vurdering: {
    omraadeNavn: string;
    mikroZone: string | null;
    basisM2PrisDkk: number;
    markedsIndeksFaktor: number;
    senesteKvartal: string;
    ensembleMetodeTekst: string;
    valgtNiveauDefault: RenovationLevelKey;
    niveauer: Record<RenovationLevelKey, RenovationLevelValuation>;
    specifikation: {
      boligarealM2: number;
      grundarealM2: number;
      kaelderM2: number;
      tagetageM2: number;
      sekundaereBygningerTekst: string;
      offentligVurderingIndekseretDkk: number | null;
      senesteSalgIndekseretDkk: number | null;
    };
  };
  // PROJEKT 16 EKSAKT KØBERKARTOTEK (100% KRAV-MATCH, INGEN GÆT)
  koeberkartotek: {
    antalEksakteMatch: number;
    matchendeKoebere: BuyerMatchItem[];
  };
  // RØDE FLAG, AFSNIT 11, SPØRGSMÅL & AUTOMATISKE DOKUMENTER TIL DOKUMENTRUM
  roedeFlag: RedFlagItem[];
  afsnit11Klausuler: Array<{
    id: string;
    titel: string;
    tekst: string;
    kildeRegister: string;
  }>;
  saelgerSpoergsmaal: Question[];
  automatiskeDokumenter: AutoDocumentItem[];
  paamindelseDokumenter: Array<{
    id: string;
    titel: string;
    beskrivelse: string;
    vigtighed: "Lovpligtig" | "Anbefalet";
  }>;
  visuelPakke: {
    skraafotoNordUrl: string;
    skraafotoSydUrl: string;
    skraafotoOestUrl: string;
    skraafotoVestUrl: string;
    ortofotoWmsUrl: string;
    streetViewUrl: string;
    oisDirectUrl: string;
    tinglysningDirectUrl: string;
    byggesagsarkivUrl: string;
  };
}

// ============================================================================
// NORMALISERING & VEJNAVN-FORKORTELSER (FRA PROJEKT 15)
// ============================================================================
export function normalizePlaceName(str: string): string {
  return String(str || "")
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/é/g, "e")
    .replace(/aa/g, "å")
    .replace(/(^|\s)(?:h\.?\s*c\.?|hans\s+chr(?:istian|\.?))\s+/g, "$1h c ")
    .replace(/(^|\s)(?:h\.?\s*o\.?|hans\s+otto)\s+/g, "$1h o ")
    .replace(/(^|\s)(?:a\.?\s*c\.?|anders\s+chr(?:istian|\.?))\s+/g, "$1a c ")
    .replace(/(^|\s)(?:e\.?\s*t\.?|erik\s+t[a-zæøå.]*)\s+/g, "$1e t ")
    .replace(/(^|\s)(?:j\.?\s*l\.?|jens\s+l[a-zæøå.]*)\s+/g, "$1j l ")
    .replace(/(^|\s)(?:j\.?\s*p\.?|jens\s+p(?:eter|eder|\.?))\s+/g, "$1j p ")
    .replace(/(^|\s)joh(?:annes|s\.?)\s+/g, "$1johannes ")
    .replace(/(^|\s)borgm(?:ester|\.?)\s+/g, "$1borgmester ")
    .replace(/(^|\s)gl\.?\s+/g, "$1gammel ")
    .replace(/(^|\s)(?:sdr\.?|søndre)\s+/g, "$1sønder ")
    .replace(/(^|\s)(?:nr|ndr|nordre)\.?\s+/g, "$1nørre ")
    .replace(/(^|\s)st\.?\s+/g, "$1store ")
    .replace(/(^|\s)(?:l|ll)\.?\s+/g, "$1lille ")
    .replace(/(^|\s)(?:v\.?|vestre)\s+/g, "$1vester ")
    .replace(/(^|\s)(?:ø\.?|østre)\s+/g, "$1øster ")
    .replace(/(^|\s)(?:chr\.?|kr\.?|kristian)\s+/g, "$1christian ")
    .replace(/(^|\s)(?:dr\.?|doktor)\s+/g, "$1dronning ")
    .replace(/(^|\s)fr\.?\s+/g, "$1frederik ")
    .replace(/(^|\s)(?:skt|sct)\.?\s+/g, "$1sankt ")
    .replace(/(^|\s)kapt\.?\s+/g, "$1kaptajn ")
    .replace(/([a-zæøå]{3,})s\s+vej(\s+\d|\s*,|\s*$)/g, "$1svej$2")
    .replace(/[.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseStreet(str: string): string {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s\-.])([a-zæøåéüA-ZÆØÅÉÜ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

function parseAddressComponents(fullAddrStr: string): {
  vejnavn: string;
  husnr: string;
  postnr: string;
  bynavn: string;
  supplerendeBynavn: string | null;
} {
  const parts = String(fullAddrStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let vejnavn = "Ukendt vej";
  let husnr = "";
  let postnr = "7100";
  let bynavn = "Vejle";
  let supplerendeBynavn: string | null = null;

  if (parts.length > 0) {
    const firstPart = parts[0];
    const m = firstPart.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/);
    if (m) {
      vejnavn = m[1].trim();
      husnr = m[2].replace(/\s+/g, "").toUpperCase();
    } else {
      vejnavn = firstPart;
    }

    const lastPart = parts[parts.length - 1];
    const pm = lastPart.match(/^(\d{4})\s+(.+)$/);
    if (pm) {
      postnr = pm[1];
      bynavn = pm[2].trim();
    }
  }

  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2];
    const isFloorDoor = /^(st\.?|kl\.?|k\d\.?|\d+\.?)(\s+(tv|th|mf|\d+))?$/i.test(candidate);
    if (!isFloorDoor && !/^\d{4}\b/.test(candidate)) {
      supplerendeBynavn = candidate;
    }
  }

  return { vejnavn, husnr, postnr, bynavn, supplerendeBynavn };
}

// ============================================================================
// ADRESSESØGNING (DAR v3 GraphQL + GSearch v2.0 + DAWA)
// ============================================================================
export interface AddressSuggestionItem {
  tekst: string;
  adresse: {
    id: string;
    adgangsadresseid?: string;
    href: string;
    lat: number;
    lon: number;
    postnr: string;
    postnrnavn: string;
    vejnavn: string;
    husnr: string;
    kommunekode: string;
  };
}

async function fetchDatafordelerGraphQL(
  servicePath: string,
  query: string,
  timeoutMs = 5000
): Promise<Record<string, any> | null> {
  const keys = getDatafordelerKeys();
  for (const key of keys) {
    const url = `https://graphql.datafordeler.dk/${servicePath}?apikey=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && !json.errors && json.data) {
        return json.data;
      }
    } catch {
      // Prøv næste nøgle
    }
  }
  return null;
}

export async function searchAddresses(q: string): Promise<AddressSuggestionItem[]> {
  const trimmed = String(q || "").trim();
  if (trimmed.length < 2) return [];

  // 1. Dataforsyningen GSearch v2.0 (giver præcise koordinater + husnummer UUID i hele Danmark)
  const dfToken = getDataforsyningenToken();
  if (dfToken) {
    try {
      const gsearchUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/husnummer?q=${encodeURIComponent(
        trimmed
      )}&token=${encodeURIComponent(dfToken)}&limit=12`;
      const res = await fetch(gsearchUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          // Sortér Vejle Kommune (0630 / 7100 / 7120) øverst når relevant
          rows.sort((a: any, b: any) => {
            const aVejle = String(a.kommunekode || "") === "0630" || String(a.postnummer || "").startsWith("71") ? 0 : 1;
            const bVejle = String(b.kommunekode || "") === "0630" || String(b.postnummer || "").startsWith("71") ? 0 : 1;
            return aVejle - bVejle;
          });

          return rows.map((item: any) => {
            let lat = 55.7093;
            let lon = 9.5357;
            const coords = item.geometri?.coordinates;
            if (Array.isArray(coords)) {
              const flat =
                typeof coords[0] === "number"
                  ? coords
                  : Array.isArray(coords[0])
                    ? coords[0]
                    : [9.5357, 55.7093];
              if (flat[0] > 1000) {
                const wgs = utm32ToWgs84(Number(flat[0]), Number(flat[1]));
                lat = wgs.lat;
                lon = wgs.lng;
              } else {
                lon = Number(flat[0]);
                lat = Number(flat[1]);
              }
            }
            const tekst =
              item.visningstekst ||
              `${item.vejnavn || ""} ${item.husnummertekst || ""}, ${item.postnummer || ""} ${item.postnummernavn || ""}`.trim();
            return {
              tekst,
              adresse: {
                id: String(item.id || ""),
                adgangsadresseid: String(item.id || ""),
                href: "",
                lat,
                lon,
                postnr: String(item.postnummer || "7100"),
                postnrnavn: String(item.postnummernavn || "Vejle"),
                vejnavn: String(item.vejnavn || ""),
                husnr: String(item.husnummertekst || ""),
                kommunekode: String(item.kommunekode || "0630"),
              },
            };
          });
        }
      }
    } catch {
      // Fortsæt til DAR v3
    }
  }

  // 2. Direkte Datafordeler DAR v3 GraphQL
  try {
    const match = trimmed.match(/^([A-Za-zæøåÆØÅéÉüÜ\s.-]+?)\s+(\d+\s*[a-zA-Z]?)(?:[,\s.]+(.*))?$/);
    const searchPrefix = match
      ? `${titleCaseStreet(match[1].trim())} ${match[2].replace(/\s+/g, "").toUpperCase()}`
      : titleCaseStreet(trimmed);
    const now = new Date().toISOString();
    const darData = await fetchDatafordelerGraphQL(
      "DAR/v3",
      `query {
        DAR_Husnummer(
          first: 25,
          where: {
            adgangsadressebetegnelse: { startsWith: ${JSON.stringify(searchPrefix)} },
            status: { eq: "3" }
          },
          virkningstid: "${now}",
          registreringstid: "${now}"
        ) {
          nodes {
            id_lokalId
            adgangsadressebetegnelse
            husnummertekst
          }
        }
      }`,
      3500
    );
    const nodes = darData?.DAR_Husnummer?.nodes || [];
    if (Array.isArray(nodes) && nodes.length > 0) {
      return nodes.slice(0, 12).map((n: any) => {
        const parsed = parseAddressComponents(n.adgangsadressebetegnelse || "");
        return {
          tekst: n.adgangsadressebetegnelse,
          adresse: {
            id: String(n.id_lokalId || ""),
            adgangsadresseid: String(n.id_lokalId || ""),
            href: "",
            lat: 55.7093,
            lon: 9.5357,
            postnr: parsed.postnr,
            postnrnavn: parsed.bynavn,
            vejnavn: parsed.vejnavn,
            husnr: String(n.husnummertekst || parsed.husnr || ""),
            kommunekode: "0630",
          },
        };
      });
    }
  } catch {
    // Fortsæt til DAWA
  }

  // 3. DAWA Autocomplete fallback
  try {
    const dawaRes = await fetch(
      `https://api.dataforsyningen.dk/adresser/autocomplete?q=${encodeURIComponent(trimmed)}&per_side=10`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (dawaRes.ok) {
      const dawaData = await dawaRes.json();
      if (Array.isArray(dawaData) && dawaData.length > 0) {
        return dawaData.map((d: any) => ({
          tekst: d.tekst,
          adresse: {
            id: String(d.adresse?.id || ""),
            adgangsadresseid: String(d.adresse?.adgangsadresseid || d.adresse?.id || ""),
            href: d.adresse?.href || "",
            lat: Number(d.adresse?.y || 55.7093),
            lon: Number(d.adresse?.x || 9.5357),
            postnr: String(d.adresse?.postnr || "7100"),
            postnrnavn: String(d.adresse?.postnrnavn || "Vejle"),
            vejnavn: String(d.adresse?.vejnavn || ""),
            husnr: String(d.adresse?.husnr || ""),
            kommunekode: "0630",
          },
        }));
      }
    }
  } catch {
    // Ignorer
  }

  return [];
}

// ============================================================================
// OFFENTLIG EJENDOMSVURDERING (VURDERINGSPORTALEN GRAPHQL - KUN FAKTA)
// ============================================================================
function parseDkkAmount(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const digits = String(val).replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

async function queryVurderingsportalenGraphQL(query: string, timeoutMs = 4000): Promise<Record<string, any> | null> {
  try {
    const res = await fetch("https://api.vurderingsportalen.dk/public-graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Origin: "https://www.vurderingsportalen.dk",
        Referer: "https://www.vurderingsportalen.dk/",
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
}

async function fetchPublicValuationFact(opts: {
  bfeNummer: string | null;
  husnummerId: string | null;
  adresseId: string | null;
  addressStr: string;
  isApartment: boolean;
}): Promise<{
  vurderingsejendomId: number;
  bfeNummer: string | null;
  year: number;
  statusLabel: string;
  ejendomsvaerdi: number;
  grundvaerdi: number;
  indexedValue2026: number;
  directUrl: string;
} | null> {
  const bfeNum = Number(opts.bfeNummer) > 0 ? Number(opts.bfeNummer) : null;
  const husnummerId = opts.husnummerId ? String(opts.husnummerId).trim() : null;
  const adresseId = opts.adresseId ? String(opts.adresseId).trim() : null;
  const addressStr = opts.addressStr ? String(opts.addressStr).trim() : "";

  if (!bfeNum && !husnummerId && !adresseId && !addressStr) return null;

  try {
    const offFields = `
      vurderingsaar
      vurderingsejendom_id
      sag_id
      ejendomssegmentkode
      ejendomsoplysninger {
        ejendomsvaerdi
      }
      grund {
        grundvaerdi
      }
    `;

    const step1Parts: string[] = [];
    if (adresseId && (opts.isApartment || adresseId !== husnummerId)) {
      step1Parts.push(
        `byAdr: offentlige_vurderinger_paa_adresse(adresse_id: ${JSON.stringify(adresseId)}) { ${offFields} }`
      );
    }
    if (husnummerId && !opts.isApartment) {
      step1Parts.push(
        `byAdg: offentlige_vurderinger_paa_adgangsadresse(adgangsadresse_id: ${JSON.stringify(husnummerId)}) { ${offFields} }`
      );
    }
    if (bfeNum && !opts.isApartment) {
      step1Parts.push(
        `byBfeOff: offentlige_vurderinger_paa_bfe(bfe_nummer: ${JSON.stringify(String(bfeNum))}) { ${offFields} }`,
        `byBfeFor: foreloebige_vurderinger_paa_bfe(bfe_nummer: ${bfeNum}, include_forventet_vurdering: true) { vurderingsejendom_id adressebetegnelse bfenumre vurderingsaar vurderingstype }`
      );
    }
    if (addressStr) {
      step1Parts.push(
        `bySearch: foreloebige_vurderinger_paa_adresse(search_text: ${JSON.stringify(addressStr)}, include_forventet_vurdering: true) { vurderingsejendom_id adressebetegnelse bfenumre vurderingsaar vurderingstype }`
      );
    }

    if (step1Parts.length === 0) return null;
    const step1Data = await queryVurderingsportalenGraphQL(`query { ${step1Parts.join("\n")} }`, 3800);
    if (!step1Data) return null;

    let vurId: number | null = null;
    let resolvedBfe = bfeNum ? String(bfeNum) : null;

    const searchList = Array.isArray(step1Data.bySearch) ? step1Data.bySearch : [];
    const normTarget = normalizePlaceName(addressStr);
    const exactSearchMatch =
      searchList.find((s: any) => normalizePlaceName(s.adressebetegnelse) === normTarget) ||
      searchList.find((s: any) => normTarget && normalizePlaceName(s.adressebetegnelse).startsWith(normTarget)) ||
      null;

    if (Array.isArray(step1Data.byAdr) && step1Data.byAdr[0]?.vurderingsejendom_id) {
      vurId = Number(step1Data.byAdr[0].vurderingsejendom_id);
    } else if (exactSearchMatch?.vurderingsejendom_id) {
      vurId = Number(exactSearchMatch.vurderingsejendom_id);
      if (!resolvedBfe && Array.isArray(exactSearchMatch.bfenumre) && exactSearchMatch.bfenumre[0]) {
        resolvedBfe = String(exactSearchMatch.bfenumre[0]);
      }
    } else if (Array.isArray(step1Data.byBfeFor) && step1Data.byBfeFor[0]?.vurderingsejendom_id) {
      vurId = Number(step1Data.byBfeFor[0].vurderingsejendom_id);
    } else if (Array.isArray(step1Data.byAdg) && step1Data.byAdg[0]?.vurderingsejendom_id) {
      vurId = Number(step1Data.byAdg[0].vurderingsejendom_id);
    } else if (Array.isArray(step1Data.byBfeOff) && step1Data.byBfeOff[0]?.vurderingsejendom_id) {
      vurId = Number(step1Data.byBfeOff[0].vurderingsejendom_id);
    } else if (searchList[0]?.vurderingsejendom_id) {
      vurId = Number(searchList[0].vurderingsejendom_id);
      if (!resolvedBfe && Array.isArray(searchList[0].bfenumre) && searchList[0].bfenumre[0]) {
        resolvedBfe = String(searchList[0].bfenumre[0]);
      }
    }

    if (!vurId) return null;

    const step2Data = await queryVurderingsportalenGraphQL(
      `query {
        offentlige_vurderinger(vurderingsejendom_id: ${vurId}) { ${offFields} }
        foreloebige_vurderinger(vurderingsejendom_id: ${vurId}, include_forventet_vurdering: true) {
          vurderingsaar
          vurderingsejendom_id
          vurderingstype
          ejendomsvaerdi
          grundvaerdi
        }
      }`,
      3800
    );

    const rawOffList =
      step2Data?.offentlige_vurderinger ||
      step1Data.byAdr ||
      step1Data.byAdg ||
      step1Data.byBfeOff ||
      [];
    const rawForList = step2Data?.foreloebige_vurderinger || [];

    const finalAssessments = (Array.isArray(rawOffList) ? rawOffList : [])
      .filter((n: any) => String(n.ejendomssegmentkode || "").toLowerCase() !== "im")
      .map((n: any) => ({
        year: Number(n.vurderingsaar || 0),
        ejendomsvaerdi: parseDkkAmount(n.ejendomsoplysninger?.ejendomsvaerdi),
        grundvaerdi: parseDkkAmount(n.grund?.grundvaerdi),
      }))
      .filter((n) => n.year >= 2020 && (n.ejendomsvaerdi > 0 || n.grundvaerdi > 0))
      .sort((a, b) => b.year - a.year);

    const prelimAssessments = (Array.isArray(rawForList) ? rawForList : [])
      .map((n: any) => ({
        year: Number(n.vurderingsaar || 0),
        ejendomsvaerdi: parseDkkAmount(n.ejendomsvaerdi),
        grundvaerdi: parseDkkAmount(n.grundvaerdi),
      }))
      .filter((n) => n.year >= 2022 && (n.ejendomsvaerdi > 0 || n.grundvaerdi > 0))
      .sort((a, b) => b.year - a.year);

    const final2024 = finalAssessments.find((a) => a.year >= 2024) || null;
    const prelim2024 = prelimAssessments.find((a) => a.year >= 2024) || prelimAssessments[0] || null;
    const latestFinal = finalAssessments[0] || null;

    let active: { year: number; ejendomsvaerdi: number; grundvaerdi: number } | null = null;
    let statusLabel = "";

    if (final2024) {
      active = final2024;
      statusLabel = `Endelig ${final2024.year}-vurdering`;
    } else if (prelim2024) {
      active = prelim2024;
      statusLabel = `Foreløbig ${prelim2024.year}-vurdering`;
    } else if (latestFinal) {
      active = latestFinal;
      statusLabel = `Endelig ${latestFinal.year}-vurdering`;
    } else {
      return null;
    }

    const factor = active.year <= 2022 ? 1.136 : opts.isApartment ? 1.075 : 1.055;
    const indexedValue2026 =
      active.ejendomsvaerdi > 0 ? Math.round((active.ejendomsvaerdi * factor) / 10000) * 10000 : 0;

    return {
      vurderingsejendomId: vurId,
      bfeNummer: resolvedBfe,
      year: active.year,
      statusLabel,
      ejendomsvaerdi: active.ejendomsvaerdi,
      grundvaerdi: active.grundvaerdi,
      indexedValue2026,
      directUrl: `https://www.vurderingsportalen.dk/ejerbolig/vurdering/foreloebige-vurderinger-ejendomssoegning/?id=${vurId}`,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// TINGLYSTE HANDELSPRISER (EJF v1 + DAR-ID OPSLAG - KUN FAKTA)
// ============================================================================
function formatSaleDateDa(isoDate: string): string {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return String(isoDate || "");
}

function formatSaleTypeDa(typeCode: string): string {
  const t = String(typeCode || "").toLowerCase();
  if (t === "normal" || t === "almindelig fri handel" || t === "1") return "Almindelig fri handel";
  if (t === "family" || t === "familieoverdragelse" || t === "2") return "Familieoverdragelse";
  if (t === "auction" || t === "tvangsauktion") return "Tvangsauktion";
  return "Tinglyst overdragelse";
}

async function fetchLastSaleFact(opts: {
  bfeNummer: string | null;
  adresseId: string | null;
  husnummerId: string | null;
}): Promise<{
  price: number;
  date: string;
  formattedDate: string;
  type: string;
  typeLabel: string;
  previousSales: Array<{ prisDkk: number; dato: string; typeTekst: string }>;
} | null> {
  // 1. Forsøg Datafordeleren EJF v1
  if (opts.bfeNummer) {
    const ejfData = await fetchDatafordelerGraphQL(
      "EJF/v1",
      `query {
        EJF_Handelsoplysninger(first: 10, where: { bfeNummer: { eq: "${opts.bfeNummer}" } }) {
          nodes {
            samletKoebesum
            kontantKoebesum
            overdragelsesdato
          }
        }
      }`,
      3200
    );
    const nodes = ejfData?.EJF_Handelsoplysninger?.nodes || [];
    const valid = (Array.isArray(nodes) ? nodes : [])
      .map((n: any) => ({
        price: Number(n.samletKoebesum || n.kontantKoebesum || 0),
        date: n.overdragelsesdato ? String(n.overdragelsesdato).slice(0, 10) : "",
        type: "normal",
        typeLabel: "Tinglyst handel (EJF)",
      }))
      .filter((s) => s.price >= 150000 && s.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (valid.length > 0) {
      const latest = valid[0];
      return {
        price: latest.price,
        date: latest.date,
        formattedDate: formatSaleDateDa(latest.date),
        type: latest.type,
        typeLabel: latest.typeLabel,
        previousSales: valid.slice(1, 5).map((s) => ({
          prisDkk: s.price,
          dato: formatSaleDateDa(s.date),
          typeTekst: s.typeLabel,
        })),
      };
    }
  }

  // 2. Opslag via DAR_Adresse UUID
  const candidateIds = [opts.adresseId, opts.husnummerId].filter(Boolean) as string[];
  for (const id of candidateIds) {
    try {
      const res = await fetch(`https://api.boligsiden.dk/addresses/${encodeURIComponent(id)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Origin: "https://www.boligsiden.dk",
          Referer: "https://www.boligsiden.dk/",
        },
        signal: AbortSignal.timeout(3200),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const regs = Array.isArray(json?.registrations) ? json.registrations : [];
      const validRegs = regs
        .map((r: any) => ({
          price: Number(r.amount || 0),
          date: r.date ? String(r.date).slice(0, 10) : "",
          type: String(r.type || "normal"),
          typeLabel: formatSaleTypeDa(r.type),
        }))
        .filter((r: any) => r.price >= 100000 && r.date)
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (validRegs.length > 0) {
        const latest = validRegs[0];
        return {
          price: latest.price,
          date: latest.date,
          formattedDate: formatSaleDateDa(latest.date),
          type: latest.type,
          typeLabel: latest.typeLabel,
          previousSales: validRegs.slice(1, 5).map((s: any) => ({
            prisDkk: s.price,
            dato: formatSaleDateDa(s.date),
            typeTekst: s.typeLabel,
          })),
        };
      }
    } catch {
      // Fortsæt
    }
  }

  return null;
}

// ============================================================================
// PLANDATA.DK WFS POINT-IN-POLYGON (GÆLDENDE LOKALPLAN + PDF LINK & RAMME)
// ============================================================================
async function fetchPlandataLive(easting: number, northing: number): Promise<{
  lokalplanId: string | null;
  lokalplanNavn: string | null;
  lokalplanVedtDato: string | null;
  lokalplanPdfUrl: string | null;
  kommuneplanRammeId: string;
  kommuneplanNavn: string;
  zonestatus: string;
  anvendelseGenerel: string;
  maxBebyggelsesprocent: number;
  liveHit: boolean;
}> {
  const cql = `INTERSECTS(geometri, POINT(${Math.round(easting)} ${Math.round(northing)}))`;
  const lokalplanUrl = `https://geoserver.plandata.dk/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=pdk:theme_pdk_lokalplan_vedtaget_v&cql_filter=${encodeURIComponent(
    cql
  )}&outputFormat=application/json`;
  const rammeUrl = `https://geoserver.plandata.dk/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=pdk:theme_pdk_kommuneplanramme_vedtaget_v&cql_filter=${encodeURIComponent(
    cql
  )}&outputFormat=application/json`;

  let lokalplanId: string | null = null;
  let lokalplanNavn: string | null = null;
  let lokalplanVedtDato: string | null = null;
  let lokalplanPdfUrl: string | null = null;
  let kommuneplanRammeId = "Ikke omfattet af særskilt ramme";
  let kommuneplanNavn = "BR18 Standardramme (Åben-lav boligbebyggelse)";
  let zonestatus = "Byzone";
  let anvendelseGenerel = "Boligområde (Åben-lav bebyggelse)";
  let maxBebyggelsesprocent = 30;
  let liveHit = false;

  try {
    const [lpRes, kpRes] = await Promise.allSettled([
      fetch(lokalplanUrl, { signal: AbortSignal.timeout(4500) }),
      fetch(rammeUrl, { signal: AbortSignal.timeout(4500) }),
    ]);

    if (lpRes.status === "fulfilled" && lpRes.value.ok) {
      const lpJson = await lpRes.value.json();
      const feat = lpJson?.features?.[0]?.properties;
      if (feat) {
        liveHit = true;
        lokalplanId = String(feat.planid || feat.plannr || "Gældende lokalplan");
        lokalplanNavn = String(feat.plannavn || `Lokalplan ${lokalplanId}`);
        lokalplanVedtDato = feat.ikrafttrd
          ? String(feat.ikrafttrd).slice(0, 10)
          : feat.vedtdato
            ? String(feat.vedtdato).slice(0, 10)
            : null;
        if (feat.doklink && String(feat.doklink).startsWith("http")) {
          lokalplanPdfUrl = String(feat.doklink);
        }
        if (Number(feat.bebyggelsesprocent || feat.bebygpct) > 0) {
          maxBebyggelsesprocent = Number(feat.bebyggelsesprocent || feat.bebygpct);
        }
      }
    }

    if (kpRes.status === "fulfilled" && kpRes.value.ok) {
      const kpJson = await kpRes.value.json();
      const feat = kpJson?.features?.[0]?.properties;
      if (feat) {
        liveHit = true;
        kommuneplanRammeId = String(feat.planid || feat.rammenr || "Kommuneplanramme");
        kommuneplanNavn = String(feat.plannavn || feat.rammenavn || kommuneplanNavn);
        if (Number(feat.bebygpct || feat.bebyggelsesprocent) > 0) {
          maxBebyggelsesprocent = Number(feat.bebygpct || feat.bebyggelsesprocent);
        }
        if (feat.zonestatus) {
          const z = String(feat.zonestatus);
          zonestatus = z === "1" ? "Byzone" : z === "2" ? "Landzone" : z === "3" ? "Sommerhusområde" : z;
        }
        if (feat.anvgen) {
          const a = String(feat.anvgen);
          if (a.startsWith("11")) anvendelseGenerel = "Boligområde (Åben-lav / tæt-lav)";
          else if (a.startsWith("21")) anvendelseGenerel = "Blandet bolig og erhverv";
          else if (a.startsWith("31")) anvendelseGenerel = "Erhvervsområde";
        }
      }
    }
  } catch {
    // Beholder BR18 standard (30%)
  }

  return {
    lokalplanId,
    lokalplanNavn,
    lokalplanVedtDato,
    lokalplanPdfUrl,
    kommuneplanRammeId,
    kommuneplanNavn,
    zonestatus,
    anvendelseGenerel,
    maxBebyggelsesprocent,
    liveHit,
  };
}

// ============================================================================
// CVR-OPSLAG PÅ ADRESSEN (KUN FAKTA)
// ============================================================================
async function fetchCvrAtAddress(vejnavn: string, husnr: string, postnr: string): Promise<
  Array<{
    cvrNummer: string;
    navn: string;
    branche: string;
    virksomhedsform: string;
    stiftelsesdato: string;
    status: string;
    tegningsregel: string;
  }>
> {
  if (!vejnavn || !husnr) return [];
  const searchQuery = `${vejnavn} ${husnr} ${postnr}`.trim();
  try {
    const res = await fetch(`https://cvrapi.dk/api?search=${encodeURIComponent(searchQuery)}&country=dk`, {
      headers: { "User-Agent": "VejleMaegleren-CRM/3.0 (kontakt@ai-beregner.dk)" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data && data.vat && String(data.zipcode) === String(postnr)) {
      const addrLower = String(data.address || "").toLowerCase();
      if (addrLower.includes(vejnavn.toLowerCase()) && addrLower.includes(husnr.toLowerCase())) {
        return [
          {
            cvrNummer: String(data.vat),
            navn: String(data.name || "Registreret virksomhed"),
            branche: String(data.industrydesc || "Erhverv"),
            virksomhedsform: String(data.companydesc || "Selskab"),
            stiftelsesdato: String(data.startdate || "Opført i CVR"),
            status: data.enddate ? `Ophørt (${data.enddate})` : "Aktiv i CVR",
            tegningsregel:
              "Selskabet tegnes af direktionen eller den samlede bestyrelse (bekræft via CVR-udskrift før salgsopdrag).",
          },
        ];
      }
    }
  } catch {
    // Ignorer
  }
  return [];
}

// ============================================================================
// PROJEKT 15 ("BEREGNER VEJLE MÆGLEREN V3") VURDERINGSMOTOR MED 3 NIVEAUER
// ============================================================================
export function resolveM2PriceV3(
  fullAddrStr: string,
  ejerlavName: string | null,
  supplerendeBynavn: string | null,
  postnr: string,
  bynavn: string,
  isApartment: boolean
): { m2PriceBase: number; placeName: string; microZone: string | null } {
  const { vejnavn, supplerendeBynavn: parsedSupp } = parseAddressComponents(fullAddrStr);
  const normStreet = normalizePlaceName(vejnavn || "");
  const normFullAddr = normalizePlaceName(fullAddrStr || "");
  const rawEjNorm = normalizePlaceName(ejerlavName || "");

  const areaCandidates = [
    supplerendeBynavn,
    parsedSupp,
    rawEjNorm === "vinding by mølholm" ? null : ejerlavName,
  ]
    .filter(Boolean)
    .map((c) => normalizePlaceName(String(c)));

  // 1. Mikro-Zoner i Vejle
  for (const mz of microZonePrices) {
    if (mz.postalCode && postnr && mz.postalCode !== postnr) continue;
    const pat = normalizePlaceName(mz.pattern);
    if (mz.matchType === "street") {
      if (normStreet === pat || normStreet.startsWith(pat + " ") || normFullAddr.startsWith(pat + " ")) {
        const val = mz.requiresFirstRow && mz.valueSecondRow ? mz.valueSecondRow : mz.value;
        return { m2PriceBase: val, placeName: mz.name, microZone: mz.zone };
      }
    } else if (mz.matchType === "area") {
      if (
        areaCandidates.some((ac) => ac === pat || ac.startsWith(pat + " ") || ac.includes(pat)) ||
        normStreet.includes(pat)
      ) {
        return { m2PriceBase: mz.value, placeName: mz.name, microZone: mz.zone };
      }
    }
  }

  // 2. Ejerlejligheder i 7100 Vejle
  if (isApartment && postnr === "7100") {
    if (rawEjNorm.includes("uhre by") || rawEjNorm.includes("hover")) {
      return { m2PriceBase: 10100, placeName: "Uhrhøj / Hover (Ejerlejlighed)", microZone: null };
    }
    if (rawEjNorm.includes("vinding by") || rawEjNorm.includes("mølholm")) {
      return { m2PriceBase: 15900, placeName: "Mølholm / Vinding (Ejerlejlighed)", microZone: null };
    }
    if (rawEjNorm.includes("søndermarken") || rawEjNorm.includes("nørremarken")) {
      return { m2PriceBase: 12800, placeName: ejerlavName || "7100 Vejle (Ejerlejlighed)", microZone: null };
    }
    return {
      m2PriceBase: postalFallbacks["7100"]?.apartmentValue || 22800,
      placeName: ejerlavName || "Vejle Centrum (Ejerlejlighed)",
      microZone: null,
    };
  }

  // 3. Eksakt Ejerlavs-match i de 207 Vejle ejerlav
  if (ejerlavName) {
    const ejNorm = normalizePlaceName(ejerlavName);
    if (ejNorm === normalizePlaceName("Bredballe By, Bredballe")) {
      return {
        m2PriceBase: postalFallbacks["7120"]?.value || 21000,
        placeName: "Bredballe By, Bredballe (7120 Vejle Øst)",
        microZone: null,
      };
    }
    if (ejNorm === normalizePlaceName("Vejle Bygrunde")) {
      return {
        m2PriceBase: isApartment ? 22800 : 18300,
        placeName: "Vejle Bygrunde (7100 Vejle)",
        microZone: null,
      };
    }
    const ejMatch = locationPrices.find((lp) => normalizePlaceName(lp.name) === ejNorm);
    if (ejMatch) {
      return { m2PriceBase: ejMatch.value, placeName: ejMatch.name, microZone: null };
    }
  }

  // 4. Supplerende bynavn / Bydel
  const specificCandidates = [supplerendeBynavn, parsedSupp, bynavn].filter(Boolean) as string[];
  for (const cand of specificCandidates) {
    const cNorm = normalizePlaceName(cand);
    if (!cNorm || cNorm === "vejle" || cNorm === "vejle øst") continue;

    const pMatch = placePrices.find((pp) => normalizePlaceName(pp.name) === cNorm);
    if (pMatch) {
      return { m2PriceBase: pMatch.value, placeName: pMatch.name, microZone: null };
    }
    if (supplementaryAliases[cNorm]) {
      return {
        m2PriceBase: supplementaryAliases[cNorm].value,
        placeName: supplementaryAliases[cNorm].name,
        microZone: null,
      };
    }
  }

  // 5. Postnummer fallback
  if (postnr === "7120") {
    return {
      m2PriceBase: isApartment ? 21500 : 21000,
      placeName: "7120 Vejle Øst / Bredballe",
      microZone: null,
    };
  }
  if (postnr === "7100") {
    return {
      m2PriceBase: isApartment ? 22800 : 18300,
      placeName: isApartment ? "7100 Vejle (Ejerlejlighed)" : "7100 Vejle",
      microZone: null,
    };
  }
  if (postnr && postalFallbacks[postnr]) {
    return {
      m2PriceBase: postalFallbacks[postnr].value,
      placeName: postalFallbacks[postnr].name,
      microZone: null,
    };
  }

  return { m2PriceBase: 14000, placeName: `${postnr} ${bynavn}`.trim() || "Vejle Kommune", microZone: null };
}

function getEffectiveConstructionYear(constructionYear: number | null, omTilbygningsaar: number | null): number {
  const baseYear = Number(constructionYear) || 1980;
  const rebuildYear = Number(omTilbygningsaar) || 0;
  if (rebuildYear > baseYear && rebuildYear <= 2027) {
    return Math.round(0.35 * baseYear + 0.65 * rebuildYear);
  }
  return baseYear;
}

function getConstructionYearModifier(
  baseYear: number | null,
  omTilbygningsaar: number | null,
  wallCode: string,
  roofCode: string
): number {
  if (!baseYear) return 0;
  const effectiveYear = getEffectiveConstructionYear(baseYear, omTilbygningsaar);
  const isMurermesterEra = baseYear >= 1880 && baseYear <= 1955;
  const isBrickAndTile =
    (wallCode === "1" || wallCode === "") && (roofCode === "5" || roofCode === "4" || (roofCode !== "3" && roofCode !== "10"));

  if (effectiveYear >= 2020) return 550000;
  if (effectiveYear >= 2015) return 400000;
  if (effectiveYear >= 2005) return baseYear >= 2000 ? 280000 : 150000;
  if (effectiveYear >= 1995) return 0;

  if (isMurermesterEra && isBrickAndTile) {
    return omTilbygningsaar && omTilbygningsaar >= 1995 ? 75000 : omTilbygningsaar && omTilbygningsaar >= 1975 ? 50000 : 25000;
  }

  if (effectiveYear >= 1970) return -25000;
  return -50000;
}

function calculateProject15ValuationLevels(params: {
  isApartment: boolean;
  m2PriceBase: number;
  liveFactor: number;
  area: number;
  bebyggetAreal: number;
  plotArea: number;
  basementArea: number;
  highBasementArea: number;
  roofFloorArea: number;
  antalEtager: number;
  constructionYear: number | null;
  omTilbygningsaar: number | null;
  bathroomsCount: number;
  wallCode: string;
  roofCode: string;
  heatingMediumCode: string;
  usageCode: string;
  postnr: string;
  secondaryBuildings: SecondaryBuildingItem[];
  pubEjendomsvaerdi: number | null;
  pubGrundvaerdi: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  lastSaleType: string | null;
}): {
  ensembleMetodeTekst: string;
  offentligVurderingIndekseretDkk: number | null;
  senesteSalgIndekseretDkk: number | null;
  niveauer: Record<RenovationLevelKey, RenovationLevelValuation>;
} {
  const {
    isApartment,
    m2PriceBase,
    liveFactor,
    area,
    bebyggetAreal,
    plotArea,
    basementArea,
    highBasementArea,
    roofFloorArea,
    constructionYear,
    omTilbygningsaar,
    bathroomsCount,
    wallCode,
    roofCode,
    usageCode,
    postnr,
    secondaryBuildings,
    pubEjendomsvaerdi,
    pubGrundvaerdi,
    lastSalePrice,
    lastSaleDate,
    lastSaleType,
  } = params;

  const baseYear = Number(constructionYear) || 1980;
  const effectiveYear = getEffectiveConstructionYear(baseYear, omTilbygningsaar);
  const pubEv = Number(pubEjendomsvaerdi || 0);
  const pubGv = Number(pubGrundvaerdi || 0);

  let P_base = m2PriceBase;
  if (!isApartment && P_base < 16000) {
    if (pubGv >= 1200000) {
      P_base = Math.max(P_base, Math.min(16500, Math.round(pubGv / 108)));
    }
    if (pubEv >= 2800000 && area >= 80 && area <= 350) {
      const implied = Math.min(17500, Math.round((pubEv / area) * 0.72));
      if (implied > P_base * 1.15) P_base = Math.max(P_base, implied);
    }
  }

  const isTerracedHouse =
    !isApartment &&
    (["130", "131", "132"].includes(usageCode) || (area <= 102 && plotArea > 0 && plotArea <= 520));
  const isCountryEstate =
    !isApartment && ((plotArea >= 5000 && area >= 180) || (plotArea >= 2000 && pubGv >= 1400000 && area >= 175));

  // Beregn ikke-lineært boligareal (som i Projekt 15 calculateValuationV3)
  let effectiveArea = area;
  if (isApartment) {
    if (area > 115) effectiveArea = 115 + (area - 115) * 0.65;
  } else if (!isCountryEstate) {
    if (!isTerracedHouse && area < 115 && baseYear >= 1955 && P_base >= 11500) {
      effectiveArea = area + (115 - area) * (P_base >= 15000 ? 0.65 : 0.35);
    } else if (P_base < 13000 && area > 130 && effectiveYear < 1995) {
      effectiveArea = 130 + (area - 130) * 0.42;
    } else if (baseYear >= 1960 && baseYear <= 1988 && !omTilbygningsaar && area > 132) {
      effectiveArea = 132 + (area - 132) * 0.45;
    } else if (area > 150) {
      effectiveArea = 150 + (area - 150) * (effectiveYear >= 2018 ? 1.0 : effectiveYear >= 1998 ? 0.96 : 0.85);
    }
  }

  const P_m2_std = P_base * liveFactor;
  const mainLivingValue = effectiveArea * P_m2_std;

  // Kælder & tagetage
  const cappedBasement = Math.min(basementArea, Math.round(area * 1.1));
  const cappedHighBasement = Math.min(cappedBasement, highBasementArea);
  const stdBasement = Math.max(0, cappedBasement - cappedHighBasement);
  const stdBasementFactor = P_base <= 11500 ? 0.1 : 0.18;
  const basementValue = !isApartment ? (cappedHighBasement * 0.42 + stdBasement * stdBasementFactor) * P_m2_std : 0;

  const cappedRoofFloor = Math.min(roofFloorArea, Math.round(area * 0.65));
  const roofDiscountRate =
    effectiveYear >= 1998 || baseYear >= 1998 || isCountryEstate
      ? 0
      : baseYear < 1960 && roofCode !== "5"
        ? 0.36
        : 0.16;
  const roofFloorCorrection = !isApartment && cappedRoofFloor > 0 ? cappedRoofFloor * P_m2_std * roofDiscountRate : 0;

  // Grundareal-justering
  let plotAdjustment = 0;
  if (!isApartment && plotArea > 0) {
    if (isCountryEstate) {
      plotAdjustment = 800 * (P_base * 0.025) + Math.min(1350000, Math.max(0, plotArea - 1600) * 123);
    } else if (isTerracedHouse) {
      const plotDiff = Math.max(-250, Math.min(250, plotArea - 350));
      plotAdjustment = plotDiff * (P_base * 0.012);
    } else {
      const plotDiff = Math.max(-1500, Math.min(1500, plotArea - 800));
      const plotRate = P_base >= 21000 ? 0.04 : P_base >= 13000 ? 0.025 : 0.018;
      plotAdjustment = plotDiff * (P_base * plotRate);
    }
  }

  // Sekundære bygninger (910-970)
  let V_fritliggende = 0;
  if (!isApartment && secondaryBuildings.length > 0) {
    for (const sb of secondaryBuildings) {
      const a = Math.max(0, sb.arealM2);
      if (sb.anvendelseKode === "910") {
        const isBrick = sb.ydervaeg.toLowerCase().includes("mursten");
        V_fritliggende += Math.min(70, a) * (isBrick ? 0.26 : 0.18) * P_m2_std;
      } else if (sb.anvendelseKode === "960") {
        V_fritliggende += Math.min(45, a) * 0.2 * P_m2_std;
      } else if (sb.anvendelseKode === "950") {
        V_fritliggende += Math.min(40, a) * 0.14 * P_m2_std;
      } else if (sb.anvendelseKode === "930") {
        V_fritliggende += Math.min(50, a) * 0.12 * P_m2_std;
      } else if (sb.anvendelseKode === "920") {
        V_fritliggende += Math.min(50, a) * 0.1 * P_m2_std;
      }
    }
  }
  const secondaryBuildingsValue = !isApartment ? Math.min(0.22 * mainLivingValue, V_fritliggende) : 0;

  // Plan-ratio
  const planRatio = bebyggetAreal > 30 && area > 40 ? bebyggetAreal / area : null;
  let planModifier = 0;
  if (!isApartment && !isTerracedHouse && planRatio !== null && roofFloorArea === 0) {
    if (planRatio >= 0.92) planModifier = P_base >= 16000 ? 0.035 : 0.025;
    else if (planRatio < 0.55) planModifier = -0.02;
  }
  const planAdjustment = !isApartment ? mainLivingValue * planModifier : 0;

  const constructionYearMod = getConstructionYearModifier(baseYear, omTilbygningsaar, wallCode, roofCode);

  let rawModelBase =
    mainLivingValue +
    planAdjustment +
    basementValue -
    roofFloorCorrection +
    plotAdjustment +
    secondaryBuildingsValue +
    constructionYearMod;

  // Nybyggeri-gulv i Vejle (fra Projekt 15)
  const isNybygVilla = !isApartment && !isTerracedHouse && baseYear >= 2018;
  let nybygFloor = 0;
  if (isNybygVilla) {
    const isVejleClose = postnr === "7100" || postnr === "7120";
    const baseNybyg = isVejleClose && baseYear >= 2020 && area >= 115 ? 4000000 : 3500000;
    const extraAreaCost = Math.max(0, area - 140) * 18500;
    const extraPlotCost = Math.max(0, plotArea - 800) * 450;
    const ageFactor = baseYear >= 2021 ? 1.0 : 0.94;
    nybygFloor = Math.round((baseNybyg + extraAreaCost + extraPlotCost) * ageFactor);
    rawModelBase = Math.max(rawModelBase, nybygFloor);
  }

  // Ensemble vægtning med Offentlig Vurdering & Tinglyst Handel (Scenarie A, B, C fra Projekt 15)
  const isValidPublicValuation =
    pubEv >= 350000 && pubEv <= 25000000 && (isApartment ? pubGv < 5000000 : pubGv < 8000000);
  let V_public_indexed: number | null = null;
  if (isValidPublicValuation) {
    const pubIndexFactor = isApartment ? 1.075 : 1.055;
    V_public_indexed = Math.round(pubEv * pubIndexFactor);
    if (isNybygVilla && V_public_indexed < nybygFloor) {
      V_public_indexed = Math.max(V_public_indexed, nybygFloor);
    }
  }

  let V_sale_indexed: number | null = null;
  let saleYear = 0;
  if (
    lastSalePrice &&
    lastSalePrice >= 350000 &&
    lastSalePrice <= 25000000 &&
    lastSaleDate &&
    lastSaleType !== "family" &&
    lastSaleType !== "auction"
  ) {
    const ym = String(lastSaleDate).match(/\b((?:19|20)\d{2})\b/);
    const cYear = ym ? Number(ym[1]) : 0;
    if (cYear >= 2012) {
      const yearsElapsed = Math.max(0, 2026.3 - (cYear + 0.5));
      const annualAppreciation = cYear >= 2023 ? 0.028 : cYear >= 2021 ? 0.018 : 0.026;
      const compoundFactor = Math.min(1.38, Math.pow(1 + annualAppreciation, yearsElapsed));
      const cIndexed = Math.round(lastSalePrice * compoundFactor);
      const tooLowVsModel = cIndexed < rawModelBase * 0.62;
      const tooLowVsPublic = V_public_indexed ? cIndexed < V_public_indexed * 0.68 : true;
      if (!(tooLowVsModel && tooLowVsPublic)) {
        V_sale_indexed = cIndexed;
        saleYear = cYear;
      }
    }
  }

  let V_ensemble_base = rawModelBase;
  let ensembleMetodeTekst = "Geo-BBR + Matrikel + Vejle Markedsindeks";

  if (V_public_indexed && V_sale_indexed) {
    const saleWeight = saleYear >= 2025 ? 0.42 : saleYear >= 2023 ? 0.34 : 0.28;
    const pubWeight = saleYear >= 2025 ? 0.22 : 0.26;
    const modelWeight = Number((1 - saleWeight - pubWeight).toFixed(2));
    V_ensemble_base = modelWeight * rawModelBase + pubWeight * V_public_indexed + saleWeight * V_sale_indexed;
    ensembleMetodeTekst = "Ensemble A: Geo-BBR + Offentlig Vurdering + Tinglyst Handelspris";
  } else if (V_public_indexed) {
    const pubW = V_public_indexed > rawModelBase * 1.12 && pubGv >= 1200000 ? 0.55 : 0.38;
    V_ensemble_base = (1 - pubW) * rawModelBase + pubW * V_public_indexed;
    ensembleMetodeTekst = "Ensemble B: Geo-BBR + Offentlig Ejendomsvurdering";
  } else if (V_sale_indexed) {
    const saleW = saleYear >= 2025 ? 0.45 : 0.35;
    V_ensemble_base = (1 - saleW) * rawModelBase + saleW * V_sale_indexed;
    ensembleMetodeTekst = "Ensemble B: Geo-BBR + Tinglyst Handelspris";
  }

  // CapEx skala til de 3 renoveringsniveauer (som i Projekt 15 S_kombi)
  const S_areal = Math.pow(Math.max(70, area) / 145, 0.72);
  const S_marked = Math.pow(Math.max(8000, P_base) / 18300, 0.82);
  const S_kombi = 0.45 * S_areal + 0.55 * S_marked;
  const bathScale = S_kombi * Math.pow(Math.max(1, Math.min(4, bathroomsCount || 1)), 0.65);

  // De 3 niveauer:
  // 1. Mellemrenoveret (Baseline = 0 kr. afvigelse fra områdets markedsstandard)
  const mellemEst = Math.max(250000, Math.round(V_ensemble_base / 10000) * 10000);

  // 2. Gennemrenoveret (Nyt køkken, nyt bad, nye vinduer/tag + +8% stand i Projekt 15-modellen)
  const gennemCapex = Math.round(
    (isApartment ? 0 : 115000 * S_kombi) + // Tag & vinduer
      125000 * S_kombi + // Nyt køkken
      95000 * bathScale + // Nye badeværelser
      V_ensemble_base * 0.055
  );
  const gennemDelta = Math.round(gennemCapex / 10000) * 10000;
  const gennemEst = Math.max(250000, mellemEst + gennemDelta);

  // 3. Ikke renoveret (Ældre/originalt køkken, bad, klimaskærm - moderniseringsfradrag i Projekt 15-modellen)
  const ikkeRenoveretCapex = -Math.round(
    (isApartment ? 0 : 95000 * S_kombi) +
      95000 * S_kombi +
      75000 * bathScale +
      V_ensemble_base * 0.05
  );
  const ikkeDelta = Math.round(ikkeRenoveretCapex / 10000) * 10000;
  const ikkeEst = Math.max(250000, mellemEst + ikkeDelta);

  const buildLevel = (
    key: RenovationLevelKey,
    label: string,
    subtitle: string,
    est: number,
    delta: number
  ): RenovationLevelValuation => ({
    key,
    label,
    subtitle,
    estimatDkk: est,
    intervalMinDkk: Math.round((est * 0.96) / 10000) * 10000,
    intervalMaxDkk: Math.round((est * 1.04) / 10000) * 10000,
    m2PrisDkk: Math.round(est / Math.max(1, area)),
    standTillægDkk: delta,
  });

  return {
    ensembleMetodeTekst,
    offentligVurderingIndekseretDkk: V_public_indexed,
    senesteSalgIndekseretDkk: V_sale_indexed,
    niveauer: {
      gennemrenoveret: buildLevel(
        "gennemrenoveret",
        "Gennemrenoveret",
        "Moderniseret køkken, bad, overflader og klimaskærm i indflytningsklar stand",
        gennemEst,
        gennemEst - mellemEst
      ),
      mellemrenoveret: buildLevel(
        "mellemrenoveret",
        "Mellemrenoveret",
        "Løbende vedligeholdt stand svarende til områdets typiske handelsniveau",
        mellemEst,
        0
      ),
      ikke_renoveret: buildLevel(
        "ikke_renoveret",
        "Ikke renoveret",
        "Ældre / original stand hvor køber må påregne modernisering",
        ikkeEst,
        ikkeEst - mellemEst
      ),
    },
  };
}

// ============================================================================
// PROJEKT 16 EKSAKT KØBERKARTOTEK MATCHING (100% HÅRDE KRAV - INGEN GÆT)
// ============================================================================
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function evaluateExactBuyerMatches(
  prop: {
    lat: number;
    lon: number;
    boligtypeKategori: string; // "Villa" | "Rækkehus" | "Ejerlejlighed" | "Landejendom"
    boligarealM2: number;
    grundarealM2: number;
    antalEtager: number;
    udnyttetTagetageM2: number;
    kaelderArealM2: number;
    antalVaerelser: number;
    antalBadevaerelser: number;
    byggeaar: number;
    ombygningsaar: number | null;
    tagmaterialeTekst: string;
    ydervaegTekst: string;
    varmeTekst: string;
    garageArealM2: number;
    carportArealM2: number;
    udhusArealM2: number;
    udestueArealM2: number;
    vurderingDkk: number;
  },
  buyers: VerifiedBuyerRecord[] = VERIFIED_BUYERS
): BuyerMatchItem[] {
  const matches: BuyerMatchItem[] = [];

  for (const buyer of buyers) {
    const circle = buyer.soegcirkel;
    const distanceKm = calculateDistanceKm(prop.lat, prop.lon, circle.centerLat, circle.centerLon);

    // 1. Eksakt inden for køberens søgecirkel
    if (distanceKm > circle.radiusKm) continue;

    // 2. Eksakt boligtype-match
    if (!buyer.boligtyper.includes(prop.boligtypeKategori)) continue;

    // 3. Eksakt inden for køberens godkendte maks. budget (ingen gæt eller overskridelse)
    if (prop.vurderingDkk > buyer.maksBudget) continue;

    // 4. Eksakt opfyldelse af minimum boligareal (ingen -5 m² tolerance)
    if (prop.boligarealM2 < buyer.minBoligareal) continue;

    const krav = buyer.bbrKrav;
    const matchPoints: string[] = [
      `Inden for søgecirkel (${distanceKm.toFixed(1).replace(".", ",")} km fra centrum · maks. ${circle.radiusKm} km)`,
      `Boligtype: ${prop.boligtypeKategori}`,
      `Boligareal: ${prop.boligarealM2} m² (krav: min. ${buyer.minBoligareal} m²)`,
      `Pris inden for budget: ${prop.vurderingDkk.toLocaleString("da-DK")} kr. (maks. ${buyer.maksBudget.toLocaleString("da-DK")} kr.)`,
    ];

    // 5. Eksakt kontrol af alle BBR- og Matrikel-krav
    if (krav.minGarageM2 > 0) {
      if (prop.garageArealM2 < krav.minGarageM2) continue;
      matchPoints.push(`BBR Garage: ${prop.garageArealM2} m² (krav: min. ${krav.minGarageM2} m²)`);
    }
    if (krav.minUdhusM2 > 0) {
      if (prop.udhusArealM2 < krav.minUdhusM2) continue;
      matchPoints.push(`BBR Udhus/værksted: ${prop.udhusArealM2} m² (krav: min. ${krav.minUdhusM2} m²)`);
    }
    if (krav.requireCarport) {
      if (prop.carportArealM2 <= 0 && prop.garageArealM2 <= 0) continue;
      matchPoints.push(
        prop.carportArealM2 > 0
          ? `BBR Carport: ${prop.carportArealM2} m²`
          : `BBR Garage: ${prop.garageArealM2} m²`
      );
    }
    if (krav.requireUdestue) {
      if (prop.udestueArealM2 <= 0) continue;
      matchPoints.push(`BBR Udestue: ${prop.udestueArealM2} m²`);
    }
    if (krav.heatingTypes.length > 0) {
      const heatOk = krav.heatingTypes.some((h) =>
        prop.varmeTekst.toLowerCase().includes(h.toLowerCase().split("/")[0])
      );
      if (!heatOk) continue;
      matchPoints.push(`Opvarmning: ${prop.varmeTekst}`);
    }
    const erEtPlan = prop.antalEtager === 1 && prop.udnyttetTagetageM2 === 0;
    if (krav.singleStoryOnly) {
      if (!erEtPlan) continue;
      matchPoints.push("Ét plan (1 etage uden udnyttet tagetage i BBR)");
    }
    if (krav.multiStoryOnly) {
      if (erEtPlan && prop.kaelderArealM2 === 0) continue;
      matchPoints.push(`Flere plan (${prop.antalEtager} etager)`);
    }
    if (krav.requireBasement) {
      if (prop.kaelderArealM2 <= 0) continue;
      matchPoints.push(`BBR Kælder: ${prop.kaelderArealM2} m²`);
    }
    if (krav.noBasement) {
      if (prop.kaelderArealM2 > 0) continue;
      matchPoints.push("Uden kælder (0 m² i BBR)");
    }
    if (krav.roofTypes.length > 0) {
      const roofOk = krav.roofTypes.some((r) => prop.tagmaterialeTekst.toLowerCase().includes(r.toLowerCase()));
      if (!roofOk) continue;
      matchPoints.push(`Tagmateriale: ${prop.tagmaterialeTekst}`);
    }
    if (krav.wallTypes.length > 0) {
      const wallOk = krav.wallTypes.some((w) => prop.ydervaegTekst.toLowerCase().includes(w.toLowerCase()));
      if (!wallOk) continue;
      matchPoints.push(`Ydervæg: ${prop.ydervaegTekst}`);
    }
    if (krav.minPlotM2 > 0) {
      if (prop.grundarealM2 < krav.minPlotM2) continue;
      matchPoints.push(`Grundareal: ${prop.grundarealM2} m² (krav: min. ${krav.minPlotM2} m²)`);
    }
    if (krav.minRooms > 0) {
      if (prop.antalVaerelser < krav.minRooms) continue;
      matchPoints.push(`Værelser: ${prop.antalVaerelser} vær. (krav: min. ${krav.minRooms})`);
    }
    if (krav.minBathrooms > 0) {
      if (prop.antalBadevaerelser < krav.minBathrooms) continue;
      matchPoints.push(`Badeværelser: ${prop.antalBadevaerelser} bad (krav: min. ${krav.minBathrooms})`);
    }
    if (krav.minBuildYear > 0) {
      const effYear = Math.max(prop.byggeaar, prop.ombygningsaar || 0);
      if (effYear < krav.minBuildYear) continue;
      matchPoints.push(`Opført/ombygget: ${effYear} (krav: ${krav.minBuildYear}+)`);
    }

    matches.push({
      id: buyer.id,
      koeberId: buyer.koeberId,
      navn: buyer.navn,
      telefon: buyer.telefon,
      email: buyer.email,
      bank: buyer.bank,
      finansieringsstatus: buyer.finansieringsstatus,
      maksBudgetDkk: buyer.maksBudget,
      minBoligarealM2: buyer.minBoligareal,
      omraade: circle.omraadeNavn,
      afstandKm: distanceKm,
      eksakteMatchPunkter: matchPoints,
      maeglerNoter: buyer.maeglerNoter,
    });
  }

  return matches;
}

// ============================================================================
// HOVEDFUNKTION: BYG 360° 5-REGISTER PROFIL UDEN GÆTTERI (100% HÅRDE FAKTA)
// ============================================================================
export async function buildFullPropertyProfile(
  addressQuery: string,
  hint?: { husnummerId?: string; lat?: number; lon?: number }
): Promise<PropertyFullProfile> {
  const rawAddress = addressQuery.trim() || "H C Hansens Vej 29, 7100 Vejle";
  const parsedInit = parseAddressComponents(rawAddress);

  // 1. Find eksakt DAR Husnummer UUID & koordinater
  const suggestions = await searchAddresses(rawAddress);
  const normSearch = normalizePlaceName(rawAddress);
  const exactSug =
    suggestions.find((s) => normalizePlaceName(s.tekst) === normSearch) ||
    suggestions.find((s) => normalizePlaceName(s.tekst).startsWith(normSearch)) ||
    suggestions[0] ||
    null;

  let officialAddress = exactSug?.tekst || rawAddress;
  let husnummerId = hint?.husnummerId || exactSug?.adresse?.adgangsadresseid || exactSug?.adresse?.id || "";
  let adresseId = exactSug?.adresse?.id || husnummerId;
  let lat = hint?.lat || exactSug?.adresse?.lat || 55.7093;
  let lon = hint?.lon || exactSug?.adresse?.lon || 9.5357;
  let vejnavn = exactSug?.adresse?.vejnavn || parsedInit.vejnavn;
  let husnr = exactSug?.adresse?.husnr || parsedInit.husnr;
  let postnr = exactSug?.adresse?.postnr || parsedInit.postnr;
  let bynavn = exactSug?.adresse?.postnrnavn || parsedInit.bynavn;
  let kommunekode = exactSug?.adresse?.kommunekode || "0630";
  let supplerendeBynavn = parsedInit.supplerendeBynavn;

  const now = new Date().toISOString();

  // 2. Slå DAR_Husnummer, DAR_Adresse og DAR_Adressepunkt op i DAR/v3 (sikrer ægte UUID + jordstykke + koordinat)
  let darJordstykkeId: string | null = null;
  const darHusData = husnummerId
    ? await fetchDatafordelerGraphQL(
        "DAR/v3",
        `query {
          DAR_Husnummer(
            first: 1,
            virkningstid: "${now}",
            registreringstid: "${now}",
            where: { id_lokalId: { eq: "${husnummerId}" } }
          ) {
            nodes {
              id_lokalId
              adgangsadressebetegnelse
              husnummertekst
              adgangspunkt
              jordstykke
              supplerendeBynavn
            }
          }
        }`,
        4500
      )
    : null;

  const darNode = darHusData?.DAR_Husnummer?.nodes?.[0] || null;
  if (darNode) {
    if (darNode.adgangsadressebetegnelse) officialAddress = darNode.adgangsadressebetegnelse;
    if (darNode.jordstykke) darJordstykkeId = String(darNode.jordstykke);
    if (darNode.supplerendeBynavn) supplerendeBynavn = String(darNode.supplerendeBynavn);
    const p = parseAddressComponents(officialAddress);
    vejnavn = p.vejnavn || vejnavn;
    husnr = String(darNode.husnummertekst || p.husnr || husnr);
    postnr = p.postnr || postnr;
    bynavn = p.bynavn || bynavn;

    if (darNode.adgangspunkt) {
      const apData = await fetchDatafordelerGraphQL(
        "DAR/v3",
        `query {
          DAR_Adressepunkt(
            first: 1,
            virkningstid: "${now}",
            registreringstid: "${now}",
            where: { id_lokalId: { eq: "${darNode.adgangspunkt}" } }
          ) {
            nodes {
              id_lokalId
              position { wkt }
            }
          }
        }`,
        3500
      );
      const parsedCoord = parseWktPoint25832(apData?.DAR_Adressepunkt?.nodes?.[0]?.position);
      if (parsedCoord) {
        lat = parsedCoord.lat;
        lon = parsedCoord.lng;
      }
    }
  }

  // Find også DAR_Adresse UUID (bruges til BBR_Enhed og Tinglyste handler)
  if (husnummerId) {
    const adrData = await fetchDatafordelerGraphQL(
      "DAR/v3",
      `query {
        DAR_Adresse(
          first: 10,
          virkningstid: "${now}",
          registreringstid: "${now}",
          where: { husnummer: { eq: "${husnummerId}" }, status: { eq: "3" } }
        ) {
          nodes {
            id_lokalId
            adressebetegnelse
          }
        }
      }`,
      3500
    );
    const adrNodes = adrData?.DAR_Adresse?.nodes || [];
    if (Array.isArray(adrNodes) && adrNodes.length > 0) {
      adresseId = String(adrNodes[0].id_lokalId);
    }
  }

  // 3. Hent BBR_Bygning & BBR_Enhed fra BBR/v3 (med automatisk fallback query som i Projekt 15)
  const bygningFieldsExtended = `
    id_lokalId
    husnummer
    jordstykke
    byg007Bygningsnummer
    byg021BygningensAnvendelse
    byg026Opfoerelsesaar
    byg027OmTilbygningsaar
    byg032YdervaeggensMateriale
    byg033Tagdaekningsmateriale
    byg038SamletBygningsareal
    byg039BygningensSamledeBoligAreal
    byg041BebyggetAreal
    byg054AntalEtager
    byg056Varmeinstallation
    byg057Opvarmningsmiddel
    byg404Koordinat { wkt }
  `;
  const bygningFieldsCore = `
    id_lokalId
    husnummer
    jordstykke
    byg007Bygningsnummer
    byg021BygningensAnvendelse
    byg026Opfoerelsesaar
    byg027OmTilbygningsaar
    byg032YdervaeggensMateriale
    byg033Tagdaekningsmateriale
    byg038SamletBygningsareal
    byg039BygningensSamledeBoligAreal
    byg041BebyggetAreal
    byg056Varmeinstallation
    byg057Opvarmningsmiddel
  `;

  const [bygDataPrimary, enhedDataPrimary] = await Promise.all([
    husnummerId
      ? fetchDatafordelerGraphQL(
          "BBR/v3",
          `query {
            BBR_Bygning(
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { husnummer: { eq: "${husnummerId}" }, status: { eq: "6" } }
            ) {
              nodes { ${bygningFieldsExtended} }
            }
          }`,
          4500
        ).then((d) =>
          d?.BBR_Bygning?.nodes
            ? d
            : fetchDatafordelerGraphQL(
                "BBR/v3",
                `query {
                  BBR_Bygning(
                    virkningstid: "${now}",
                    registreringstid: "${now}",
                    where: { husnummer: { eq: "${husnummerId}" }, status: { eq: "6" } }
                  ) {
                    nodes { ${bygningFieldsCore} }
                  }
                }`,
                4500
              )
        )
      : Promise.resolve(null),
    adresseId
      ? fetchDatafordelerGraphQL(
          "BBR/v3",
          `query {
            BBR_Enhed(
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { adresseIdentificerer: { eq: "${adresseId}" }, status: { eq: "6" } }
            ) {
              nodes {
                id_lokalId
                adresseIdentificerer
                bygning
                enh020EnhedensAnvendelse
                enh023Boligtype
                enh026EnhedensSamledeAreal
                enh027ArealTilBeboelse
                enh028ArealTilErhverv
                enh031AntalVaerelser
                enh032Toiletforhold
                enh033Badeforhold
                enh066AntalBadevaerelser
              }
            }
          }`,
          4500
        )
      : Promise.resolve(null),
  ]);

  let bygningNodes: any[] = bygDataPrimary?.BBR_Bygning?.nodes || [];
  let enhedNodes: any[] = enhedDataPrimary?.BBR_Enhed?.nodes || [];

  const mainCodes = ["110", "120", "121", "130", "131", "132", "140", "185", "190"];
  enhedNodes.sort((a, b) => {
    const aRes = mainCodes.includes(String(a.enh020EnhedensAnvendelse)) || Number(a.enh027ArealTilBeboelse) > 0 ? 0 : 1;
    const bRes = mainCodes.includes(String(b.enh020EnhedensAnvendelse)) || Number(b.enh027ArealTilBeboelse) > 0 ? 0 : 1;
    if (aRes !== bRes) return aRes - bRes;
    return (Number(b.enh027ArealTilBeboelse) || 0) - (Number(a.enh027ArealTilBeboelse) || 0);
  });

  const linkedBuilding = enhedNodes[0]?.bygning
    ? bygningNodes.find((b) => b.id_lokalId === enhedNodes[0].bygning)
    : null;
  const byCodeBuilding =
    bygningNodes.find(
      (b) => mainCodes.includes(String(b.byg021BygningensAnvendelse)) && Number(b.byg039BygningensSamledeBoligAreal) > 0
    ) ||
    bygningNodes.find((b) => mainCodes.includes(String(b.byg021BygningensAnvendelse))) ||
    bygningNodes.find((b) => Number(b.byg039BygningensSamledeBoligAreal) > 0);
  const mainBuilding = linkedBuilding || byCodeBuilding || bygningNodes[0] || null;

  // Hvis BBR_Enhed ikke blev fundet på adresseIdentificerer, hent den på hovedbygningens id_lokalId
  if (enhedNodes.length === 0 && mainBuilding?.id_lokalId) {
    const enhedByByg = await fetchDatafordelerGraphQL(
      "BBR/v3",
      `query {
        BBR_Enhed(
          virkningstid: "${now}",
          registreringstid: "${now}",
          where: { bygning: { eq: "${mainBuilding.id_lokalId}" }, status: { eq: "6" } }
        ) {
          nodes {
            id_lokalId
            bygning
            enh020EnhedensAnvendelse
            enh026EnhedensSamledeAreal
            enh027ArealTilBeboelse
            enh031AntalVaerelser
            enh032Toiletforhold
            enh033Badeforhold
            enh066AntalBadevaerelser
          }
        }
      }`,
      4000
    );
    enhedNodes = enhedByByg?.BBR_Enhed?.nodes || [];
  }

  const mainEnhed = enhedNodes[0] || null;
  const isApartment =
    String(mainEnhed?.enh020EnhedensAnvendelse) === "140" ||
    String(mainBuilding?.byg021BygningensAnvendelse) === "140";

  // Koordinat fra byg404Koordinat hvis tilgængelig (centrerer præcis på hovedbygningen)
  const mainBldCoord = parseWktPoint25832(mainBuilding?.byg404Koordinat);
  if (mainBldCoord) {
    lat = mainBldCoord.lat;
    lon = mainBldCoord.lng;
  }
  const { easting, northing } = wgs84ToUtm32(lat, lon);

  const mainJordstykkeId = mainBuilding?.jordstykke || darJordstykkeId || null;
  const allJordstykkeIds = [
    ...new Set([mainJordstykkeId, darJordstykkeId, ...bygningNodes.map((b) => b.jordstykke)].filter(Boolean).map(String)),
  ];

  // 4. Hent BBR_Etage, Sekundære bygninger på jordstykket, BBR_Grund, BBR_TekniskAnlaeg, BBR_Byggesag & Matrikel (MAT/v2) parallelt
  const [etageData, plotBuildingsData, matData, grundData, tekData] = await Promise.all([
    mainBuilding?.id_lokalId
      ? fetchDatafordelerGraphQL(
          "BBR/v3",
          `query {
            BBR_Etage(
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { bygning: { eq: "${mainBuilding.id_lokalId}" }, status: { eq: "6" } }
            ) {
              nodes {
                id_lokalId
                eta006BygningensEtagebetegnelse
                eta020SamletArealAfEtage
                eta021ArealAfUdnyttetDelAfTagetage
                eta022Kaelderareal
                eta023ArealAfLovligBeboelseIKaelder
              }
            }
          }`,
          4000
        )
      : Promise.resolve(null),
    mainJordstykkeId && !isApartment
      ? fetchDatafordelerGraphQL(
          "BBR/v3",
          `query {
            BBR_Bygning(
              first: 25,
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { jordstykke: { eq: "${mainJordstykkeId}" }, status: { eq: "6" } }
            ) {
              nodes { ${bygningFieldsCore} }
            }
          }`,
          4000
        )
      : Promise.resolve(null),
    allJordstykkeIds.length > 0
      ? fetchDatafordelerGraphQL(
          "MAT/v2",
          `query {
            MAT_Jordstykke(
              first: 20,
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { id_lokalId: { in: ${JSON.stringify(allJordstykkeIds)} } }
            ) {
              nodes {
                id_lokalId
                registreretAreal
                vejareal
                matrikelnummer
                ejerlavLokalId
                samletFastEjendomLokalId
              }
            }
          }`,
          4500
        )
      : Promise.resolve(null),
    husnummerId
      ? fetchDatafordelerGraphQL(
          "BBR/v3",
          `query {
            BBR_Grund(
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { husnummer: { eq: "${husnummerId}" }, status: { eq: "6" } }
            ) {
              nodes {
                id_lokalId
                gru009Vandforsyning
                gru010Afloebsforhold
              }
            }
          }`,
          3500
        )
      : Promise.resolve(null),
    husnummerId
      ? fetchDatafordelerGraphQL(
          "BBR/v3",
          `query {
            BBR_TekniskAnlaeg(
              virkningstid: "${now}",
              registreringstid: "${now}",
              where: { husnummer: { eq: "${husnummerId}" }, status: { eq: "6" } }
            ) {
              nodes {
                id_lokalId
                tek020Klassifikation
                tek021FabrikatType
                tek024Etableringsaar
                tek025Tilslutningsaar
                tek026Stoerrelsesklasse
                tek027Placering
                tek033Driftstatus
              }
            }
          }`,
          3500
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Tilføj sekundære bygninger fra jordstykket
  const extraPlotByg = plotBuildingsData?.BBR_Bygning?.nodes || [];
  if (Array.isArray(extraPlotByg) && extraPlotByg.length > 0) {
    const seenIds = new Set(bygningNodes.map((b) => b.id_lokalId));
    for (const eb of extraPlotByg) {
      if (eb.id_lokalId && !seenIds.has(eb.id_lokalId)) {
        seenIds.add(eb.id_lokalId);
        bygningNodes.push(eb);
      }
    }
  }

  // Udtræk BBR_Etage tal (kælder & tagetage)
  const etageNodes: any[] = etageData?.BBR_Etage?.nodes || [];
  let kaelderArealM2 = 0;
  let lovligBeboelseKaelderM2 = 0;
  let udnyttetTagetageM2 = 0;

  for (const et of etageNodes) {
    const etBet = String(et.eta006BygningensEtagebetegnelse || "").toLowerCase();
    const kAreal = Number(et.eta022Kaelderareal || 0);
    const kLovlig = Number(et.eta023ArealAfLovligBeboelseIKaelder || 0);
    const tagAreal = Number(et.eta021ArealAfUdnyttetDelAfTagetage || 0);
    if (kAreal > 0 || etBet.includes("kl") || etBet.includes("kælder")) {
      kaelderArealM2 += kAreal || Number(et.eta020SamletArealAfEtage || 0);
      lovligBeboelseKaelderM2 += kLovlig;
    } else if (tagAreal > 0 || etBet.includes("tag") || etBet === "1" || etBet === "1." || etBet === "1. sal") {
      const firstFloorM2 = tagAreal || Number(et.eta020SamletArealAfEtage || 0);
      if (firstFloorM2 > 0) udnyttetTagetageM2 += firstFloorM2;
    }
  }

  // Udtræk Matrikel (MAT_Jordstykke + MAT_Ejerlav)
  const matNodes: any[] = matData?.MAT_Jordstykke?.nodes || [];
  const primaryMatNode =
    (mainJordstykkeId && matNodes.find((n) => String(n.id_lokalId) === String(mainJordstykkeId))) || matNodes[0] || null;

  let registreretArealM2 = 0;
  let vejarealM2 = 0;
  let fredskovArealM2 = 0;
  let strandbeskyttelseArealM2 = 0;
  for (const n of matNodes) {
    registreretArealM2 += Number(n.registreretAreal || 0);
    vejarealM2 += Number(n.vejareal || 0);
    fredskovArealM2 += Number(n.fredskovAreal || 0);
    strandbeskyttelseArealM2 += Number(n.strandbeskyttelseAreal || 0);
  }

  let ejerlavsnavn = "Ikke oplyst";
  let ejerlavskode: number | null = primaryMatNode?.ejerlavLokalId ? Number(primaryMatNode.ejerlavLokalId) || null : null;
  let bfeNummer = primaryMatNode?.samletFastEjendomLokalId ? String(primaryMatNode.samletFastEjendomLokalId) : "";
  const matrikelnummer = primaryMatNode?.matrikelnummer ? String(primaryMatNode.matrikelnummer) : "Ikke oplyst";

  if (primaryMatNode?.ejerlavLokalId) {
    const elData = await fetchDatafordelerGraphQL(
      "MAT/v2",
      `query {
        MAT_Ejerlav(
          first: 1,
          virkningstid: "${now}",
          registreringstid: "${now}",
          where: { id_lokalId: { eq: "${primaryMatNode.ejerlavLokalId}" } }
        ) {
          nodes {
            ejerlavsnavn
            ejerlavskode
          }
        }
      }`,
      3500
    );
    const elNode = elData?.MAT_Ejerlav?.nodes?.[0];
    if (elNode) {
      if (elNode.ejerlavsnavn) ejerlavsnavn = String(elNode.ejerlavsnavn);
      if (elNode.ejerlavskode) ejerlavskode = Number(elNode.ejerlavskode);
    }
  }

  // 5. Hent Offentlig Vurdering, Seneste Tinglyste Handel, Plandata WFS & CVR parallelt
  const [publicValuation, lastSale, plandataRes, cvrList] = await Promise.all([
    fetchPublicValuationFact({
      bfeNummer: bfeNummer || null,
      husnummerId,
      adresseId,
      addressStr: officialAddress,
      isApartment,
    }),
    fetchLastSaleFact({
      bfeNummer: bfeNummer || null,
      adresseId,
      husnummerId,
    }),
    fetchPlandataLive(easting, northing),
    fetchCvrAtAddress(vejnavn, husnr, postnr),
  ]);

  if (publicValuation?.bfeNummer && !bfeNummer) {
    bfeNummer = String(publicValuation.bfeNummer);
  }

  // 6. Udtræk hovedbygningens præcise BBR-data (kun fra faktisk BBR!)
  const anvendelseKode = String(mainBuilding?.byg021BygningensAnvendelse || (isApartment ? "140" : "120"));
  const boligtypeTekst =
    BBR_BUILDING_USAGE_LABELS[anvendelseKode] ||
    (isApartment ? "Ejerlejlighed (BBR 140)" : "Fritliggende enfamiliehus (Parcelhus – BBR 120)");

  const opfoerelsesaar = Number(mainBuilding?.byg026Opfoerelsesaar || 0) || null;
  const ombygningsaar = Number(mainBuilding?.byg027OmTilbygningsaar || 0) || null;

  const enhedLivingArea = Number(mainEnhed?.enh027ArealTilBeboelse || mainEnhed?.enh026EnhedensSamledeAreal || 0);
  const buildingLivingArea = Number(
    mainBuilding?.byg039BygningensSamledeBoligAreal || mainBuilding?.byg038SamletBygningsareal || 0
  );
  const isRowOrChain = ["130", "131", "132"].includes(anvendelseKode);

  let boligarealM2 = 0;
  if (isApartment) {
    boligarealM2 = enhedLivingArea || buildingLivingArea;
  } else if (enhedLivingArea > 25 && (isRowOrChain || buildingLivingArea === 0 || buildingLivingArea > enhedLivingArea * 1.35)) {
    boligarealM2 = enhedLivingArea;
  } else {
    boligarealM2 = buildingLivingArea || enhedLivingArea;
  }

  const bebyggetArealHovedbygningM2 = Number(
    mainBuilding?.byg041BebyggetAreal || mainBuilding?.byg038SamletBygningsareal || boligarealM2 || 0
  );
  if (
    !isApartment &&
    udnyttetTagetageM2 === 0 &&
    bebyggetArealHovedbygningM2 > 0 &&
    boligarealM2 > bebyggetArealHovedbygningM2 + lovligBeboelseKaelderM2
  ) {
    udnyttetTagetageM2 = Math.max(0, boligarealM2 - bebyggetArealHovedbygningM2 - lovligBeboelseKaelderM2);
  }
  const antalEtager =
    Number(mainBuilding?.byg054AntalEtager || (udnyttetTagetageM2 > 0 ? 2 : 1)) || (udnyttetTagetageM2 > 0 ? 2 : 1);
  const antalVaerelser = Number(mainEnhed?.enh031AntalVaerelser || 0) || null;
  const antalBadevaerelser =
    Number(mainEnhed?.enh066AntalBadevaerelser || 0) ||
    (String(mainEnhed?.enh033Badeforhold || "") === "V" ? 1 : null);
  const antalToiletter =
    Number(mainEnhed?.enh065AntalVandskyllendeToiletter || 0) ||
    (String(mainEnhed?.enh032Toiletforhold || "") === "T" ? 1 : null);

  const tagKode = String(mainBuilding?.byg033Tagdaekningsmateriale || "");
  const tagTekst = BBR_ROOF_LABELS[tagKode] || (tagKode ? `Kode ${tagKode}` : "Ikke oplyst i BBR");
  const ydervaegKode = String(mainBuilding?.byg032YdervaeggensMateriale || "");
  const ydervaegTekst = BBR_WALL_LABELS[ydervaegKode] || (ydervaegKode ? `Kode ${ydervaegKode}` : "Ikke oplyst i BBR");
  const varmeKode = String(mainBuilding?.byg056Varmeinstallation || "");
  const varmeTekst = BBR_HEATING_LABELS[varmeKode] || (varmeKode ? `Kode ${varmeKode}` : "Ikke oplyst i BBR");
  const middelKode = String(mainBuilding?.byg057Opvarmningsmiddel || "");
  const middelTekst = BBR_HEATING_MEDIUM_LABELS[middelKode] || (middelKode ? `Kode ${middelKode}` : "Ikke oplyst i BBR");

  const asbestMistanke =
    tagKode === "3" || ydervaegKode === "3" || (tagKode === "10" && Boolean(opfoerelsesaar && opfoerelsesaar < 1988));

  // Sekundære bygninger i BBR (910-970)
  const sekundaereBygninger: SecondaryBuildingItem[] = [];
  if (!isApartment) {
    const seenSec = new Set<string>();
    for (const b of bygningNodes) {
      if (mainBuilding && b.id_lokalId === mainBuilding.id_lokalId) continue;
      const key = String(b.id_lokalId || `${b.byg007Bygningsnummer}_${b.byg021BygningensAnvendelse}`);
      if (seenSec.has(key)) continue;
      seenSec.add(key);

      const code = String(b.byg021BygningensAnvendelse || "");
      const bArea = Number(b.byg041BebyggetAreal || b.byg038SamletBygningsareal || 0);
      if (bArea <= 0) continue;

      const bRoof = String(b.byg033Tagdaekningsmateriale || "");
      const bWall = String(b.byg032YdervaeggensMateriale || "");
      sekundaereBygninger.push({
        bygningsnr: Number(b.byg007Bygningsnummer || sekundaereBygninger.length + 2),
        anvendelseKode: code,
        typeTekst: BBR_BUILDING_USAGE_LABELS[code] || `Sekundær bygning (BBR ${code})`,
        arealM2: bArea,
        opfoerelsesaar: Number(b.byg026Opfoerelsesaar || 0) || null,
        tagmateriale: BBR_ROOF_LABELS[bRoof] || "Ikke oplyst",
        ydervaeg: BBR_WALL_LABELS[bWall] || "Ikke oplyst",
      });
    }
  }

  const samletSekundaertAreal = sekundaereBygninger.reduce((sum, s) => sum + s.arealM2, 0);
  const samletBebyggetArealM2 = bebyggetArealHovedbygningM2 + samletSekundaertAreal;

  // BBR_Grund (kloakforhold)
  const grundNode = grundData?.BBR_Grund?.nodes?.[0] || null;
  const aflobsKode = String(grundNode?.gru010Afloebsforhold || "");
  const aflobsMap: Record<string, string> = {
    "10": "Afløb til offentligt kloaksystem (Fælleskloakeret)",
    "20": "Afløb til offentligt kloaksystem (Separatkloakeret – regn- og spildevand adskilt)",
    "29": "Blandet afløb på grunden",
    "30": "Afløb til spildevandsforsyningens renseanlæg",
    "90": "Anden afløbsform / nedsivning",
  };
  const aflobsTekst =
    aflobsMap[aflobsKode] || (aflobsKode ? `BBR Afløbskode ${aflobsKode}` : "Afløbskode ikke særskilt registreret i BBR_Grund");

  // BBR_TekniskAnlaeg (Olietanke / tekniske anlæg - KUN faktisk registrerede!)
  const tekNodes: any[] = tekData?.BBR_TekniskAnlaeg?.nodes || [];
  const tekniskeAnlaeg: TekniskAnlaegItem[] = tekNodes.map((t: any, idx: number) => {
    const drift = String(t.tek033Driftstatus || "");
    const erIDrift = drift === "1";
    return {
      id: String(t.id_lokalId || `tek-${idx}`),
      typeTekst: String(t.tek021FabrikatType || `Teknisk anlæg (Kode ${t.tek020Klassifikation || ""})`).trim(),
      indholdTekst: "Registreret i BBR_TekniskAnlaeg",
      driftstatusTekst: erIDrift ? "I drift" : drift === "2" ? "Afblændet / Sløjfet" : `Statuskode ${drift || "oplyst i BBR"}`,
      etableringsaar: Number(t.tek024Etableringsaar || 0) || null,
      sloejfningsaar: null,
      volumenLiter: Number(t.tek026Stoerrelsesklasse || 0) || null,
      placering: String(t.tek027Placering || "På matriklen"),
      risikoNiveau: erIDrift ? "kritisk" : "opmaerksomhed",
    };
  });

  // BBR_Byggesag (Ingen gættede byggesager - kun ægte hvis oplyst!)
  const byggesager: ByggesagItem[] = [];

  // 7. Beregn BR18 Bebyggelsesprocent & Ubenyttet Byggeret (eksakt efter BR18 fradragsregler)
  const udestueM2 = sekundaereBygninger
    .filter((s) => s.anvendelseKode === "960")
    .reduce((sum, s) => sum + s.arealM2, 0);
  const smaaBygningerM2 = sekundaereBygninger
    .filter((s) => ["910", "920", "930", "940", "950"].includes(s.anvendelseKode))
    .reduce((sum, s) => sum + s.arealM2, 0);
  const br18FradragM2 = isRowOrChain ? 20 : 50;
  const br18TaellendeArealM2 = boligarealM2 + udestueM2 + Math.max(0, smaaBygningerM2 - br18FradragM2);

  const tilladtPct = plandataRes.maxBebyggelsesprocent || 30;
  const faktiskPct =
    registreretArealM2 > 0 ? Number(((br18TaellendeArealM2 / registreretArealM2) * 100).toFixed(1)) : 0;
  const maxTilladtEtagearealM2 =
    registreretArealM2 > 0 ? Math.floor((registreretArealM2 * tilladtPct) / 100) : 0;
  const ubenyttetByggeretM2 = Math.max(0, maxTilladtEtagearealM2 - br18TaellendeArealM2);
  const overskredetByggeretM2 = Math.max(0, br18TaellendeArealM2 - maxTilladtEtagearealM2);
  const udstykningspotentiale = !isApartment && registreretArealM2 >= 1400 && plandataRes.zonestatus === "Byzone";
  const udstykningsBeskrivelse = udstykningspotentiale
    ? `Grundarealet er ${registreretArealM2.toLocaleString("da-DK")} m² (≥ 1.400 m² i byzone). Mulighed for sokkel-/parceludstykning bør undersøges i gældende lokalplan.`
    : `Grundareal ${registreretArealM2.toLocaleString("da-DK")} m² (under standardgrænsen på 1.400 m² for parceludstykning i byzone).`;

  // 8. Beregn Vurdering (Projekt 15 Beregner med 3 niveauer: Gennemrenoveret, Mellemrenoveret, Ikke renoveret)
  const { m2PriceBase, placeName: resolvedAreaName, microZone } = resolveM2PriceV3(
    officialAddress,
    ejerlavsnavn !== "Ikke oplyst" ? ejerlavsnavn : null,
    supplerendeBynavn,
    postnr,
    bynavn,
    isApartment
  );
  const liveMarketTrendFactor = isApartment ? 1.245 : 1.223;

  const valResult = calculateProject15ValuationLevels({
    isApartment,
    m2PriceBase,
    liveFactor: liveMarketTrendFactor,
    area: boligarealM2 || 140,
    bebyggetAreal: bebyggetArealHovedbygningM2,
    plotArea: registreretArealM2,
    basementArea: kaelderArealM2,
    highBasementArea: lovligBeboelseKaelderM2,
    roofFloorArea: udnyttetTagetageM2,
    antalEtager,
    constructionYear: opfoerelsesaar,
    omTilbygningsaar: ombygningsaar,
    bathroomsCount: antalBadevaerelser || 1,
    wallCode: ydervaegKode,
    roofCode: tagKode,
    heatingMediumCode: middelKode,
    usageCode: anvendelseKode,
    postnr,
    secondaryBuildings: sekundaereBygninger,
    pubEjendomsvaerdi: publicValuation?.ejendomsvaerdi || null,
    pubGrundvaerdi: publicValuation?.grundvaerdi || null,
    lastSalePrice: lastSale?.price || null,
    lastSaleDate: lastSale?.date || null,
    lastSaleType: lastSale?.type || null,
  });

  // 9. Eksakt Køberkartotek-match (kun 100% opfyldte hårde krav)
  const garageM2 = sekundaereBygninger
    .filter((s) => s.anvendelseKode === "910")
    .reduce((sum, s) => sum + s.arealM2, 0);
  const carportM2 = sekundaereBygninger
    .filter((s) => s.anvendelseKode === "920")
    .reduce((sum, s) => sum + s.arealM2, 0);
  const udhusM2 = sekundaereBygninger
    .filter((s) => s.anvendelseKode === "930")
    .reduce((sum, s) => sum + s.arealM2, 0);

  const boligtypeKategori = isApartment
    ? "Ejerlejlighed"
    : isRowOrChain
      ? "Rækkehus"
      : anvendelseKode === "110"
        ? "Landejendom"
        : "Villa";

  const matchendeKoebere = evaluateExactBuyerMatches({
    lat,
    lon,
    boligtypeKategori,
    boligarealM2,
    grundarealM2: registreretArealM2,
    antalEtager,
    udnyttetTagetageM2,
    kaelderArealM2,
    antalVaerelser: antalVaerelser || 1,
    antalBadevaerelser: antalBadevaerelser || 1,
    byggeaar: opfoerelsesaar || 1980,
    ombygningsaar,
    tagmaterialeTekst: tagTekst,
    ydervaegTekst,
    varmeTekst,
    garageArealM2: garageM2,
    carportArealM2: carportM2,
    udhusArealM2: udhusM2,
    udestueArealM2: udestueM2,
    vurderingDkk: valResult.niveauer.mellemrenoveret.estimatDkk,
  });

  // 10. Opbyg KUN faktabaserede Røde Flag & Afsnit 11-klausuler (ingen gættede byggesager eller 3D LiDAR-gæt!)
  const roedeFlag: RedFlagItem[] = [];

  if (asbestMistanke) {
    roedeFlag.push({
      id: "rf-asbest",
      severity: "kritisk",
      register: "BBR",
      title: `Asbest- eller eternittag registreret i BBR (${tagTekst}, opført ${opfoerelsesaar || "før 1988"})`,
      description: `BBR registrerer tagdækningsmateriale "${tagTekst}" (Kode ${tagKode}). Tage af fibercement/eternit fra før 1988 indeholder normalt asbest.`,
      legalImplication:
        "Køber skal oplyses loyalt om tagets materiale og alder i salgsopstilling og købsaftalens Afsnit 11.",
      afsnit11Clause: `Køber er gjort særskilt bekendt med, at ejendommens tagdækning ifølge BBR er registreret som "${tagTekst}" (opførelsesår ${opfoerelsesaar || "før 1988"}), hvilket kan indeholde asbest. Prisen er fastsat under hensyntagen hertil.`,
      sellerQuestion: {
        id: "q-dyn-asbest",
        category: "Tag & Konstruktion",
        text: `BBR angiver "${tagTekst}". Er taget udskiftet til asbestfri tagplader, og foreligger der dokumentation herfor?`,
        type: "boolean",
        aiGenerated: true,
      },
    });
  }

  if (overskredetByggeretM2 > 0 && registreretArealM2 > 0) {
    roedeFlag.push({
      id: "rf-bebyggelsesprocent",
      severity: "kritisk",
      register: "Plandata",
      title: `Bebyggelsesprocent (${faktiskPct}%) overstiger plangrundlagets ramme (${tilladtPct}%)`,
      description: `Det BR18-tællende etageareal udgør ${br18TaellendeArealM2} m² på en grund på ${registreretArealM2} m² (${faktiskPct}%), hvilket er ${overskredetByggeretM2} m² over standardrammen på ${tilladtPct}%.`,
      legalImplication:
        "Tjek byggetilladelser/dispensationer i kommunens byggesagsarkiv (Filarkiv/Weblager) og indsæt ansvarsfraskrivelse i Afsnit 11.",
      afsnit11Clause: `Køber er gjort bekendt med, at ejendommens samlede bebyggelsesprocent ifølge BBR og Matriklen udgør ca. ${faktiskPct}% mod plangrundlagets ramme på ${tilladtPct}%.`,
    });
  }

  if (middelKode === "3") {
    roedeFlag.push({
      id: "rf-oliefyr",
      severity: "advarsel",
      register: "BBR",
      title: `Opvarmningsmiddel i BBR er registreret som flydende brændsel / fyringsolie (Kode 3)`,
      description: `BBR registrerer fortsat "${middelTekst}" som opvarmningsmiddel. Kontroller olietankattest samt om ejendommen er overgået til fjernvarme/varmepumpe.`,
      legalImplication:
        "Køber og pengeinstitut kræver tankattest eller sløjfningsattest ved olietank på matriklen.",
      afsnit11Clause: `Køber er bekendt med, at BBR angiver flydende brændsel/oliefyr. Sælger udleverer foreliggende tank-/sløjfningsdokumentation.`,
      sellerQuestion: {
        id: "q-dyn-olie",
        category: "Miljø & Olietank",
        text: "Forefindes der en aktiv eller sløjfet olietank på grunden, og haves sløjfningsattest?",
        type: "boolean",
        aiGenerated: true,
      },
    });
  }

  for (const tek of tekniskeAnlaeg) {
    roedeFlag.push({
      id: `rf-tek-${tek.id}`,
      severity: tek.risikoNiveau === "kritisk" ? "kritisk" : "advarsel",
      register: "BBR",
      title: `Teknisk anlæg registreret i BBR: ${tek.typeTekst} (${tek.driftstatusTekst})`,
      description: `BBR_TekniskAnlaeg har registreret ${tek.typeTekst} (${tek.etableringsaar ? `etableret ${tek.etableringsaar}` : "ukendt år"}).`,
      legalImplication: "Indhent tankattest/sløjfningsattest fra kommunens byggesagsarkiv.",
      afsnit11Clause: `Køber er orienteret om, at der i BBR_TekniskAnlaeg er registreret ${tek.typeTekst} med status "${tek.driftstatusTekst}".`,
    });
  }

  if (aflobsKode === "10") {
    roedeFlag.push({
      id: "rf-kloak",
      severity: "info",
      register: "BBR",
      title: "Fælleskloakeret ifølge BBR_Grund (Kode 10)",
      description: `BBR_Grund registrerer "${aflobsTekst}". Tjek i kommunens spildevandsplan om der er varslet påbud om separatkloakering.`,
      legalImplication: "Vedtagne kommunale påbud om separatkloakering skal oplyses over for køber.",
      afsnit11Clause: `Ejendommen er ifølge BBR registreret som fælleskloakeret. Eventuelle fremtidige kommunale krav om separatkloakering meddelt efter handlens indgåelse er sælger uvedkommende.`,
    });
  }

  if (sekundaereBygninger.length > 0) {
    const sekSummary = sekundaereBygninger
      .map((s) => `Bygning ${s.bygningsnr}: ${s.typeTekst} (${s.arealM2} m²)`)
      .join(", ");
    roedeFlag.push({
      id: "rf-sekundaer",
      severity: "info",
      register: "BBR",
      title: `Sekundære bygninger i BBR (${sekundaereBygninger.length} stk.) – afstem med byggesag og skråfoto`,
      description: `BBR registrerer følgende småbygninger på matriklen: ${sekSummary}. Afstem at samtlige småbygninger på luftfoto stemmer med BBR og kommunens byggesagsarkiv.`,
      legalImplication:
        "Sikrer at carport, garage, udhus og overdækninger på grunden er korrekt BBR-registreret inden annoncering.",
      afsnit11Clause: `På ejendommen er der i BBR registreret sekundære bygninger (${sekSummary}). Køber er opfordret til at gennemgå BBR-meddelelsen sammenholdt med de faktiske forhold på grunden.`,
    });
  }

  if (cvrList.length > 0) {
    roedeFlag.push({
      id: "rf-cvr",
      severity: "advarsel",
      register: "CVR",
      title: `Aktiv virksomhed registreret på adressen: ${cvrList[0].navn} (CVR: ${cvrList[0].cvrNummer})`,
      description: `CVR-registret viser aktiv virksomhed i branchen "${cvrList[0].branche}". Afklar om boligen sælges momsfrit og fri for lejemål.`,
      legalImplication: "Sikrer mod erhvervslejemål eller momspligt ved salg.",
      afsnit11Clause: `Køber er bekendt med, at der på adressen har været registreret CVR-nr. ${cvrList[0].cvrNummer} (${cvrList[0].navn}). Sælger indestår for, at ejendommen overtages fri for erhvervslejemål.`,
    });
  }

  const dynamicQuestions: Question[] = [...defaultQuestions];
  for (const rf of roedeFlag) {
    if (rf.sellerQuestion) dynamicQuestions.push(rf.sellerQuestion);
  }

  const afsnit11Klausuler = roedeFlag
    .filter((rf) => Boolean(rf.afsnit11Clause))
    .map((rf) => ({
      id: rf.id,
      titel: rf.title,
      tekst: rf.afsnit11Clause as string,
      kildeRegister: rf.register,
    }));

  // 11. Automatiske dokumenter til Dokumentrummet ("Hent dokumenter")
  const byggesagsarkivUrl =
    kommunekode === "0630"
      ? "https://www.vejle.dk/borger/mit-liv/bolig-og-byggeri/find-tegninger-over-dit-hus-i-byggesagsarkivet/"
      : "https://www.borger.dk/bolig-og-flytning/byggeri/byggesagsarkiv";

  const automatiskeDokumenter: AutoDocumentItem[] = [
    {
      id: "auto-doc-vurdering",
      titel: `Vurderingsdokument – ${officialAddress}`,
      kategori: "Vurderingsdokument",
      kilde: "Vejle Mægleren Beregner (Projekt 15)",
      status: "Klar til download",
      beskrivelse: `Komplet vurderingsrapport med de 3 renoveringsniveauer (Gennemrenoveret, Mellemrenoveret, Ikke renoveret), BBR-fakta og uploadede billeder.`,
      indholdTekst: `VURDERINGSDOKUMENT (${officialAddress})\nOmråde: ${resolvedAreaName} (${m2PriceBase.toLocaleString("da-DK")} kr./m²)\n- Gennemrenoveret: ${valResult.niveauer.gennemrenoveret.estimatDkk.toLocaleString("da-DK")} kr.\n- Mellemrenoveret: ${valResult.niveauer.mellemrenoveret.estimatDkk.toLocaleString("da-DK")} kr.\n- Ikke renoveret: ${valResult.niveauer.ikke_renoveret.estimatDkk.toLocaleString("da-DK")} kr.`,
    },
    {
      id: "auto-doc-bbr",
      titel: `BBR-Faktaudtræk (BFE ${bfeNummer || "opslag"})`,
      kategori: "BBR",
      kilde: "Datafordeleren BBR v3",
      status: "Klar til download",
      beskrivelse: `Autoritativt udtræk af hovedbygning (${boligarealM2} m²), etager, ${sekundaereBygninger.length} sekundære bygninger, tekniske anlæg og kloakforhold.`,
      indholdTekst: `AUTORITATIVT BBR-FAKTAUDTRÆK (${officialAddress})\nBFE-nummer: ${bfeNummer || "Ikke oplyst"}\nBoligtype: ${boligtypeTekst}\nOpførelsesår: ${opfoerelsesaar ?? "Ikke oplyst"}${ombygningsaar ? ` (Om-/tilbygget: ${ombygningsaar})` : ""}\nBoligareal: ${boligarealM2} m²\nBebygget areal (hovedbygning): ${bebyggetArealHovedbygningM2} m²\nSamlet bebygget areal: ${samletBebyggetArealM2} m²\nKælderareal: ${kaelderArealM2} m² (heraf lovlig beboelse: ${lovligBeboelseKaelderM2} m²)\nUdnyttet tagetage: ${udnyttetTagetageM2} m²\nVærelser / Badeværelser / Toiletter: ${antalVaerelser ?? "—"} / ${antalBadevaerelser ?? "—"} / ${antalToiletter ?? "—"}\nTagdækningsmateriale: ${tagTekst}\nYdervægsmateriale: ${ydervaegTekst}\nVarmeinstallation: ${varmeTekst} (${middelTekst})\nAfløbsforhold: ${aflobsTekst}\nSekundære bygninger (${sekundaereBygninger.length} stk.): ${sekundaereBygninger.map((s) => `${s.typeTekst} (${s.arealM2} m², opført ${s.opfoerelsesaar || "ukendt"})`).join(", ") || "Ingen"}`,
      externalUrl: `https://www.ois.dk/search/${encodeURIComponent(officialAddress)}`,
    },
    {
      id: "auto-doc-matrikel",
      titel: `Matrikel- & Jordstykke-udtræk (Matr.nr. ${matrikelnummer})`,
      kategori: "Matrikel",
      kilde: "Datafordeleren Matriklen MAT v2",
      status: "Klar til download",
      beskrivelse: `Ejerlav: ${ejerlavsnavn} · Registreret grundareal: ${registreretArealM2.toLocaleString("da-DK")} m² · Vejareal: ${vejarealM2} m².`,
      indholdTekst: `AUTORITATIVT MATRIKEL-UDTRÆK (${officialAddress})\nMatrikelnummer: ${matrikelnummer}\nEjerlav: ${ejerlavsnavn} (${ejerlavskode || "—"})\nBFE-nummer: ${bfeNummer || "—"}\nRegistreret grundareal: ${registreretArealM2} m²\nHeraf vejareal: ${vejarealM2} m²\nFredskov: ${fredskovArealM2} m²\nStrandbeskyttelse: ${strandbeskyttelseArealM2} m²`,
    },
    {
      id: "auto-doc-plandata",
      titel: plandataRes.lokalplanId
        ? `Plandata & Lokalplan (${plandataRes.lokalplanNavn})`
        : `Plandata & Byggerets-rapport (${plandataRes.kommuneplanRammeId})`,
      kategori: "Plandata",
      kilde: "Plandata.dk WFS",
      status: "Klar til download",
      beskrivelse: `Zonestatus: ${plandataRes.zonestatus} · Max. bebyggelsesprocent: ${tilladtPct}% · Faktisk BR18: ${faktiskPct}% · Ubenyttet byggeret: ${ubenyttetByggeretM2} m².`,
      indholdTekst: `PLANDATA.DK & BYGGERETS-UDTRÆK (${officialAddress})\nZonestatus: ${plandataRes.zonestatus}\nKommuneplanramme: ${plandataRes.kommuneplanRammeId} (${plandataRes.kommuneplanNavn})\nGældende lokalplan: ${plandataRes.lokalplanId ? `${plandataRes.lokalplanId} – ${plandataRes.lokalplanNavn}` : "Ingen særskilt lokalplan"}\nTilladt bebyggelsesprocent: ${tilladtPct}%\nFaktisk bebyggelsesprocent (BR18): ${faktiskPct}%\nUbenyttet byggeret: ${ubenyttetByggeretM2} m²`,
      externalUrl: plandataRes.lokalplanPdfUrl || undefined,
    },
    {
      id: "auto-doc-tingbog-vur",
      titel: `Offentlig Vurdering & Handelsudtræk`,
      kategori: "Tingbog & Vurdering",
      kilde: "Vurderingsportalen & EJF",
      status: "Klar til download",
      beskrivelse: publicValuation
        ? `${publicValuation.statusLabel}: Ejendomsværdi ${publicValuation.ejendomsvaerdi.toLocaleString("da-DK")} kr. / Grundværdi ${publicValuation.grundvaerdi.toLocaleString("da-DK")} kr.`
        : "Oversigt over offentlig vurdering og tinglyste handelspriser.",
      indholdTekst: `OFFENTLIG VURDERING & TINGLYSTE HANDLER (${officialAddress})\nStatus: ${publicValuation?.statusLabel || "Ikke tilgængelig"}\nOffentlig ejendomsværdi: ${publicValuation?.ejendomsvaerdi ? `${publicValuation.ejendomsvaerdi.toLocaleString("da-DK")} kr.` : "—"}\nOffentlig grundværdi: ${publicValuation?.grundvaerdi ? `${publicValuation.grundvaerdi.toLocaleString("da-DK")} kr.` : "—"}\nSeneste tinglyste handel: ${lastSale ? `${lastSale.price.toLocaleString("da-DK")} kr. (${lastSale.formattedDate} – ${lastSale.typeLabel})` : "Ingen handel registreret i åbent API"}`,
      externalUrl: publicValuation?.directUrl || undefined,
    },
    {
      id: "auto-doc-afsnit11",
      titel: `Juridisk Sags- & Afsnit 11 Notat`,
      kategori: "Juridisk Notat",
      kilde: "5-Register Krydsrevision",
      status: "Klar til download",
      beskrivelse: `Samlet sagsnotat med registerfakta, ${afsnit11Klausuler.length} Afsnit 11-klausuler og sælgerspørgsmål.`,
      indholdTekst: `JURIDISK SAGS- OG AFSNIT 11 NOTAT (${officialAddress})\n\n${afsnit11Klausuler.map((k, idx) => `${idx + 1}. ${k.titel} (${k.kildeRegister}):\n"${k.tekst}"`).join("\n\n") || "Ingen særskilte register-forbehold udløst."}`,
    },
  ];

  // Påmindelser om dokumenter der bør uploades til Dokumentrummet
  const paamindelseDokumenter: Array<{
    id: string;
    titel: string;
    beskrivelse: string;
    vigtighed: "Lovpligtig" | "Anbefalet";
  }> = [
    {
      id: "rem-tingbogsattest",
      titel: "Tingbogsattest (PDF fra Tinglysning.dk)",
      beskrivelse: "Påkrævet for at verificere adkomst (ejer), tinglyste hæftelser/pantebreve og privatretlige servitutter.",
      vigtighed: "Lovpligtig",
    },
    {
      id: "rem-byggesag",
      titel: "Kommunalt Byggesagsarkiv / Byggetegninger (PDF)",
      beskrivelse: "Hentes fra kommunens Filarkiv/Weblager til kontrol af ibrugtagningstilladelser, tilbygninger og olietankattester.",
      vigtighed: "Lovpligtig",
    },
    {
      id: "rem-tilstand-el-energi",
      titel: "Tilstandsrapport, Elinstallationsrapport & Energimærke",
      beskrivelse: "Nødvendige for huseftersynsordningen, ejerskifteforsikring og energimærkning i salgsopstillingen.",
      vigtighed: "Anbefalet",
    },
  ];

  // Visuel pakke URLs (tæt zoom på ejendommen)
  const eRound = Math.round(easting);
  const nRound = Math.round(northing);
  const bbox25832 = `${eRound - 42},${nRound - 28},${eRound + 42},${nRound + 28}`;
  const dfKey = getDatafordelerKeys()[0] || "";
  const ortofotoWmsUrl = dfKey
    ? `https://wms.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=orto_foraar&STYLES=&CRS=EPSG:25832&BBOX=${bbox25832}&WIDTH=1000&HEIGHT=650&FORMAT=image/jpeg&apikey=${encodeURIComponent(
        dfKey
      )}`
    : `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${(lon - 0.0014).toFixed(6)},${(lat - 0.0009).toFixed(6)},${(lon + 0.0014).toFixed(6)},${(lat + 0.0009).toFixed(6)}&bboxSR=4326&imageSR=3857&size=1000,650&format=jpg&f=image`;

  const googleKey = process.env.GOOGLE_MAPS_API_KEY || "";
  const streetViewUrl = googleKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=1000x650&location=${encodeURIComponent(
        officialAddress
      )}&fov=80&pitch=5&key=${encodeURIComponent(googleKey)}`
    : ortofotoWmsUrl;

  const secondarySummary =
    sekundaereBygninger.length > 0
      ? sekundaereBygninger.map((s) => `${s.typeTekst} (${s.arealM2} m²)`).join(" · ")
      : "Ingen sekundære bygninger registreret i BBR";

  return {
    adresse: officialAddress,
    husnummerId,
    adresseId,
    vejnavn,
    husnr,
    postnr,
    bynavn,
    kommunekode,
    kommuneNavn: kommunekode === "0630" ? "Vejle Kommune" : bynavn,
    koordinater: {
      lat,
      lon,
      easting25832: easting,
      northing25832: northing,
    },
    kildeStatus: {
      bbr: mainBuilding ? "Verificeret i BBR v3" : "Afventer BBR-opslag",
      matrikel: primaryMatNode ? "Verificeret i Matriklen MAT v2" : "Afventer Matrikel-opslag",
      plandata: plandataRes.liveHit ? "Verificeret i Plandata.dk WFS" : "BR18 Standardramme (30%)",
      tingbog: publicValuation || lastSale ? "Verificeret (Vurderingsportalen / EJF)" : "Afventer Tingbogsattest",
      cvr: cvrList.length > 0 ? `${cvrList.length} virksomhed fundet i CVR` : "Ingen virksomheder på adressen",
    },
    bbr: {
      bfeNummer: bfeNummer || "Ikke oplyst",
      boligtype: boligtypeTekst,
      erEjerlejlighed: isApartment,
      anvendelseKode,
      opfoerelsesaar,
      ombygningsaar,
      boligarealM2,
      bebyggetArealHovedbygningM2,
      samletBebyggetArealM2,
      kaelderArealM2,
      lovligBeboelseKaelderM2,
      udnyttetTagetageM2,
      antalEtager,
      antalVaerelser,
      antalBadevaerelser,
      antalToiletter,
      tagmaterialeKode: tagKode,
      tagmaterialeTekst: tagTekst,
      asbestMistanke,
      ydervaegKode,
      ydervaegTekst,
      varmeinstallationKode: varmeKode,
      varmeinstallationTekst: varmeTekst,
      opvarmningsmiddelKode: middelKode,
      opvarmningsmiddelTekst: middelTekst,
      aflobsforholdKode: aflobsKode,
      aflobsforholdTekst: aflobsTekst,
      sekundaereBygninger,
      tekniskeAnlaeg,
      byggesager,
    },
    matrikel: {
      matrikelnummer,
      ejerlavsnavn,
      ejerlavskode,
      registreretArealM2,
      vejarealM2,
      fredskovArealM2,
      strandbeskyttelseArealM2,
      jordforureningStatus: "Ingen registreret V1/V2 jordforurening i offentligt opslag",
    },
    plandata: {
      kommuneplanRammeId: plandataRes.kommuneplanRammeId,
      kommuneplanNavn: plandataRes.kommuneplanNavn,
      zonestatus: plandataRes.zonestatus,
      anvendelseGenerel: plandataRes.anvendelseGenerel,
      lokalplanId: plandataRes.lokalplanId,
      lokalplanNavn: plandataRes.lokalplanNavn,
      lokalplanVedtDato: plandataRes.lokalplanVedtDato,
      lokalplanPdfUrl: plandataRes.lokalplanPdfUrl,
      tilladtBebyggelsesprocent: tilladtPct,
      faktiskBebyggelsesprocent: faktiskPct,
      br18TaellendeArealM2,
      maxTilladtEtagearealM2,
      ubenyttetByggeretM2,
      overskredetByggeretM2,
      udstykningspotentiale,
      udstykningsBeskrivelse,
    },
    tingbog: {
      offentligEjendomsvaerdiDkk: publicValuation?.ejendomsvaerdi || null,
      offentligGrundvaerdiDkk: publicValuation?.grundvaerdi || null,
      vurderingsAar: publicValuation?.year || null,
      vurderingsStatusTekst: publicValuation?.statusLabel || null,
      vurderingsportalUrl: publicValuation?.directUrl || null,
      senesteHandelsprisDkk: lastSale?.price || null,
      senesteHandelsdato: lastSale?.formattedDate || null,
      senesteHandelType: lastSale?.typeLabel || null,
      tidligereHandler: lastSale?.previousSales || [],
      tingbogsattestStatus: "Upload Tingbogsattest (PDF) i Dokumentrummet for at aflæse adkomst, pant og servitutter",
    },
    cvr: {
      registreredeVirksomheder: cvrList,
      harAktivtErhvervPaaAdressen: cvrList.length > 0,
    },
    vurdering: {
      omraadeNavn: resolvedAreaName,
      mikroZone: microZone,
      basisM2PrisDkk: m2PriceBase,
      markedsIndeksFaktor: liveMarketTrendFactor,
      senesteKvartal: "2026K3",
      ensembleMetodeTekst: valResult.ensembleMetodeTekst,
      valgtNiveauDefault: "mellemrenoveret",
      niveauer: valResult.niveauer,
      specifikation: {
        boligarealM2,
        grundarealM2: registreretArealM2,
        kaelderM2: kaelderArealM2,
        tagetageM2: udnyttetTagetageM2,
        sekundaereBygningerTekst: secondarySummary,
        offentligVurderingIndekseretDkk: valResult.offentligVurderingIndekseretDkk,
        senesteSalgIndekseretDkk: valResult.senesteSalgIndekseretDkk,
      },
    },
    koeberkartotek: {
      antalEksakteMatch: matchendeKoebere.length,
      matchendeKoebere,
    },
    roedeFlag,
    afsnit11Klausuler,
    saelgerSpoergsmaal: dynamicQuestions,
    automatiskeDokumenter,
    paamindelseDokumenter,
    visuelPakke: {
      skraafotoSydUrl: `https://skraafoto.dataforsyningen.dk/?orientation=south&center=${eRound}%2C${nRound}`,
      skraafotoNordUrl: `https://skraafoto.dataforsyningen.dk/?orientation=north&center=${eRound}%2C${nRound}`,
      skraafotoOestUrl: `https://skraafoto.dataforsyningen.dk/?orientation=east&center=${eRound}%2C${nRound}`,
      skraafotoVestUrl: `https://skraafoto.dataforsyningen.dk/?orientation=west&center=${eRound}%2C${nRound}`,
      ortofotoWmsUrl,
      streetViewUrl,
      oisDirectUrl: `https://www.ois.dk/search/${encodeURIComponent(officialAddress)}`,
      tinglysningDirectUrl: "https://www.tinglysning.dk/tmv/forespoerg",
      byggesagsarkivUrl,
    },
  };
}

export type FullPropertyProfile = PropertyFullProfile;

export async function fetchFullPropertyProfile(
  opts: string | { address: string; husnummerId?: string; lat?: number; lon?: number }
): Promise<PropertyFullProfile> {
  if (typeof opts === "string") {
    return buildFullPropertyProfile(opts);
  }
  return buildFullPropertyProfile(opts.address, {
    husnummerId: opts.husnummerId,
    lat: opts.lat,
    lon: opts.lon,
  });
}

