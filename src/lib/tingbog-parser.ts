export interface TingbogAdkomst {
  ejerNavn: string;
  cvrNummer: string | null;
  erSelskab: boolean;
  koebsdato: string | null;
  koebspris: number | null;
  adkomstType: string;
}

export interface TingbogHaeftelse {
  type: string;
  kreditor: string;
  hovedstol: number;
  valuta: string;
  rentePct: number | null;
  renteType: string | null;
  dato: string | null;
  erUdlaegEllerArrest: boolean;
}

export interface TingbogServitut {
  datoLbnr: string;
  titel: string;
  paataleberettiget: string | null;
  erOffentligPlan: boolean;
  harUdstykningsforbud: boolean;
  harHjemfaldspligt: boolean;
  harVejret: boolean;
  kategori: "plan" | "forsyning" | "vej_skel" | "byggeret" | "andet";
}

export interface ParsedTingbogSummary {
  fundetTingbog: boolean;
  bfeNummer: string | null;
  matrikel: string | null;
  ejerlav: string | null;
  adkomster: TingbogAdkomst[];
  haeftelser: TingbogHaeftelse[];
  samletHaeftelseDkk: number;
  servitutter: TingbogServitut[];
  harUdlaeg: boolean;
  harUdstykningsforbud: boolean;
}

function parseDanishAmount(raw: string): number | null {
  const cleaned = raw.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function parseDocumentTextForTingbog(rawText: string): ParsedTingbogSummary {
  const text = String(rawText || "");
  const lower = text.toLowerCase();

  const fundetTingbog =
    lower.includes("tingbogsattest") ||
    lower.includes("adkomster") ||
    lower.includes("hæftelser") ||
    lower.includes("servitutter") ||
    lower.includes("tinglysningsretten");

  const bfeMatch = text.match(/BFE(?:-?nummer|-?nr\.?)?\s*:?\s*(\d{5,10})/i);
  const matMatch = text.match(/Matrikel(?:nummer|nr\.?)?\s*:?\s*([0-9]{1,4}[a-zæøå]{0,4})/i);
  const ejerlavMatch = text.match(/Landsejerlav\s*:?\s*([^\n\r]+)/i);

  const adkomster: TingbogAdkomst[] = [];
  const haeftelser: TingbogHaeftelse[] = [];
  const servitutter: TingbogServitut[] = [];

  // 1. Udtræk Adkomster (Ejer, CVR, Købspris, Dato)
  const cvrMatches = [...text.matchAll(/(?:CVR(?:-nr\.?)?\s*:?\s*)(\d{8})\b/gi)];
  const firstCvr = cvrMatches.length > 0 ? cvrMatches[0][1] : null;

  const skodeBlockRegex = /(?:Skøde|Endeligt skøde|Betinget skøde|Skifteretsattest)[\s\S]{0,450}/gi;
  for (const m of text.matchAll(skodeBlockRegex)) {
    const block = m[0];
    const dateM = block.match(/\b(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/);
    const priceM = block.match(/(?:Købesum|Kontant\s*købesum|Værdi)\s*:?\s*([\d.]+(?:,\d{2})?)\s*(?:DKK|kr\.?)?/i);
    const nameM = block.match(/(?:Navn|Adkomsthaver|Ejer)\s*:?\s*([^\n\r,;]+)/i);
    const cvrM = block.match(/(?:CVR(?:-nr\.?)?\s*:?\s*)(\d{8})\b/i);

    const ejerNavn = nameM ? nameM[1].trim() : cvrM ? `Selskab (CVR: ${cvrM[1]})` : "Registreret adkomsthaver";
    const cvr = cvrM ? cvrM[1] : firstCvr;
    const erSelskab = Boolean(cvr) || /\b(ApS|A\/S|I\/S|K\/S|Holding|Ejendomme)\b/i.test(ejerNavn);

    adkomster.push({
      ejerNavn,
      cvrNummer: cvr,
      erSelskab,
      koebsdato: dateM ? dateM[1] : null,
      koebspris: priceM ? parseDanishAmount(priceM[1]) : null,
      adkomstType: block.split(/\s+/)[0] || "Skøde",
    });
  }

  // 2. Udtræk Hæftelser (Realkreditpantebrev, Ejerpantebrev, Udlæg)
  const haeftelseRegex =
    /(Realkreditpantebrev|Ejerpantebrev|Pantebrev|Udlæg|Arrest|Afgiftspantebrev)[\s\S]{0,420}/gi;
  for (const m of text.matchAll(haeftelseRegex)) {
    const type = m[1];
    const block = m[0];
    const amountM =
      block.match(/(?:Hovedstol|Beløb)\s*:?\s*([\d.]+(?:,\d{2})?)\s*(DKK|EUR|kr\.?)?/i) ||
      block.match(/\b([\d]{1,3}(?:\.[\d]{3})+)\s*(DKK|kr\.?)/i);
    const rateM = block.match(/Rente(?:sats)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/i);
    const dateM = block.match(/\b(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/);
    const kreditorM = block.match(
      /(Totalkredit|Nykredit|Realkredit Danmark|Nordea Kredit|Jyske Realkredit|DLR Kredit|Danske Bank|Sydbank|Vejle Sparekasse|middelfart sparekasse|SKAT|Gældsstyrelsen)/i
    );

    const hovedstol = amountM ? parseDanishAmount(amountM[1]) || 0 : 0;
    const rentePct = rateM ? Number(rateM[1].replace(",", ".")) : null;
    const erUdlaeg = /udlæg|arrest/i.test(type);

    if (hovedstol > 0 || erUdlaeg) {
      haeftelser.push({
        type,
        kreditor: kreditorM ? kreditorM[1] : erUdlaeg ? "Udlægshaver" : "Panthaver",
        hovedstol,
        valuta: "DKK",
        rentePct,
        renteType: /fast/i.test(block) ? "Fast rente" : /variabel|kort|f1|f3|f5/i.test(block) ? "Variabel rente" : null,
        dato: dateM ? dateM[1] : null,
        erUdlaegEllerArrest: erUdlaeg,
      });
    }
  }

  // 3. Udtræk Servitutter (Dato/løbenummer + tekst)
  const servitutLineRegex =
    /\b(\d{2}\.\d{2}\.\d{4}-\d+[^\n\r]{0,20}|\d{4}\.\d{2}\.\d{2}-\d+[^\n\r]{0,20})[\s:-]*([^\n\r]{5,200})/g;
  for (const m of text.matchAll(servitutLineRegex)) {
    const datoLbnr = m[1].trim();
    const titel = m[2].trim();
    if (/realkreditpantebrev|ejerpantebrev|skøde/i.test(titel)) continue;

    const lowTitel = titel.toLowerCase();
    const erOffentligPlan = /lokalplan|byplanvedtægt|kommuneplan|byggelinje|retningsplan/i.test(lowTitel);
    const harUdstykningsforbud = /udstykningsforbud|forbud mod udstykning|må ikke udstykkes/i.test(lowTitel);
    const harHjemfaldspligt = /hjemfald|tilbagekøbsret/i.test(lowTitel);
    const harVejret = /vejret|færdselsret|privat fællesvej|adgangsret/i.test(lowTitel);

    let kategori: TingbogServitut["kategori"] = "andet";
    if (erOffentligPlan) kategori = "plan";
    else if (/ledning|kloak|fjernvarme|el-|vand|forsyning/i.test(lowTitel)) kategori = "forsyning";
    else if (harVejret || /hegn|skel/i.test(lowTitel)) kategori = "vej_skel";
    else if (harUdstykningsforbud || /bebyggelse|villaklausul|benyttelse/i.test(lowTitel)) kategori = "byggeret";

    servitutter.push({
      datoLbnr,
      titel,
      paataleberettiget: erOffentligPlan ? "Kommunen" : null,
      erOffentligPlan,
      harUdstykningsforbud,
      harHjemfaldspligt,
      harVejret,
      kategori,
    });
  }

  const samletHaeftelseDkk = haeftelser.reduce((sum, h) => sum + (h.hovedstol || 0), 0);

  return {
    fundetTingbog,
    bfeNummer: bfeMatch ? bfeMatch[1] : null,
    matrikel: matMatch ? matMatch[1] : null,
    ejerlav: ejerlavMatch ? ejerlavMatch[1].trim() : null,
    adkomster,
    haeftelser,
    samletHaeftelseDkk,
    servitutter,
    harUdlaeg: haeftelser.some((h) => h.erUdlaegEllerArrest),
    harUdstykningsforbud: servitutter.some((s) => s.harUdstykningsforbud),
  };
}
