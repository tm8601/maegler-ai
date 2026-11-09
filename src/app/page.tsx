"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  MapPin,
  CheckCircle2,
  Upload,
  ShieldCheck,
  Mail,
  FileDown,
  Eye,
  AlertTriangle,
  Copy,
  Check,
  Building2,
  Layers,
  Scale,
  FileCheck2,
  Users,
  ExternalLink,
  Sparkles,
  Compass,
  FolderOpen,
  ImagePlus,
  FileText,
  Download,
  X,
  Calculator,
  Trash2,
  BellRing,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import type {
  PropertyFullProfile,
  RenovationLevelKey,
  AutoDocumentItem,
} from "@/lib/property-aggregator";

interface DawaSuggestion {
  tekst: string;
  adresse: {
    id: string;
    href: string;
    lat?: number;
    lon?: number;
  };
}

interface UploadedDocItem {
  id: string;
  file: File;
  name: string;
  sizeKb: number;
  type: "document" | "photo";
  uploadedAt: string;
  objectUrl: string;
}

export default function Home() {
  const [address, setAddress] = useState("H C Hansens Vej 29, 7100 Vejle");
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<PropertyFullProfile | null>(null);
  const [caseId, setCaseId] = useState<string>("default");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Kun 3 renoveringsniveauer i Vurderingsberegneren (Projekt 15 motor)
  const [renovationLevel, setRenovationLevel] = useState<RenovationLevelKey>("mellemrenoveret");

  // Visning af luftfoto / kort
  const [visualMode, setVisualMode] = useState<"south" | "north" | "east" | "ortofoto" | "streetview">("south");

  // Aktive faner i 5-register faktaboksen
  const [activeRegistryTab, setActiveRegistryTab] = useState<
    "flags" | "bbr" | "matrikel" | "plandata" | "tingbog" | "cvr" | "buyers"
  >("flags");

  // Dokumentrum & Upload state
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docRoomDialogRef = useRef<HTMLDialogElement>(null);
  const [previewAutoDoc, setPreviewAutoDoc] = useState<AutoDocumentItem | null>(null);

  // Sælgerskema state
  const [sellerName, setSellerName] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [mailStatus, setMailStatus] = useState<{ sent: boolean; url?: string; error?: string } | null>(null);
  const [copiedClauseId, setCopiedClauseId] = useState<string | null>(null);

  const loadPropertyProfile = async (addrText: string, id?: string, lat?: number, lon?: number) => {
    setIsLoadingProfile(true);
    try {
      const params = new URLSearchParams({ q: addrText });
      if (id) params.set("id", id);
      if (lat) params.set("lat", String(lat));
      if (lon) params.set("lon", String(lon));
      const res = await fetch(`${getApiBaseUrl()}/api/property?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.profile) setProfile(data.profile);
        if (data.caseId) setCaseId(data.caseId);
      }
    } catch (e) {
      console.error("Failed to load property profile:", e);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    loadPropertyProfile("H C Hansens Vej 29, 7100 Vejle");
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!address || address.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchAddress = async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/dawa?q=${encodeURIComponent(address)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuggestions(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(fetchAddress, 240);
    return () => clearTimeout(debounce);
  }, [address]);

  const handleSelectAddress = (suggestion: DawaSuggestion) => {
    setAddress(suggestion.tekst);
    setShowSuggestions(false);
    setSelectedAddress(true);
    setAnalysisResult(null);
    setMailStatus(null);
    setUploadedDocs([]);
    loadPropertyProfile(
      suggestion.tekst,
      suggestion.adresse?.id,
      suggestion.adresse?.lat,
      suggestion.adresse?.lon
    );
  };

  const runAnalysis = async (docsToAnalyze: File[]) => {
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("address", address);
    docsToAnalyze.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysisResult(data.analysis);
        if (data.profile) setProfile(data.profile);
      } else {
        alert(data.error || "Fejl under analyse");
      }
    } catch (err) {
      console.error(err);
      alert("Der opstod en fejl under analysen");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addFilesToCase = async (incomingFiles: FileList | File[], forceType?: "document" | "photo") => {
    const fileArray = Array.from(incomingFiles);
    if (fileArray.length === 0) return;

    const nowStr = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const newItems: UploadedDocItem[] = fileArray.map((file) => {
      const isImage = forceType === "photo" || file.type.startsWith("image/");
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        type: isImage ? "photo" : "document",
        uploadedAt: nowStr,
        objectUrl: URL.createObjectURL(file),
      };
    });

    const updated = [...uploadedDocs, ...newItems];
    setUploadedDocs(updated);

    const docFiles = updated.filter((d) => d.type === "document").map((d) => d.file);
    if (newItems.some((i) => i.type === "document")) {
      await runAnalysis(docFiles);
    }
  };

  const handleRemoveUploadedItem = (id: string) => {
    setUploadedDocs((prev) => prev.filter((item) => item.id !== id));
  };

  const openDocumentRoom = () => {
    docRoomDialogRef.current?.showModal();
  };

  const closeDocumentRoom = () => {
    setPreviewAutoDoc(null);
    docRoomDialogRef.current?.close();
  };

  const handleDownloadAutoDoc = (doc: AutoDocumentItem) => {
    if (doc.id === "auto-doc-vurdering") {
      handleDownloadValuationDocument();
      return;
    }
    const content = doc.indholdTekst || `${doc.titel}\nKilde: ${doc.kilde}\n\n${doc.beskrivelse}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeAddr = (profile?.adresse || address).replace(/[^a-zA-Z0-9æøåÆØÅ_-]+/g, "_");
    a.download = `${doc.titel.replace(/[^a-zA-Z0-9æøåÆØÅ_-]+/g, "_")}_${safeAddr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllDocuments = () => {
    if (!profile) return;
    const combinedContent = profile.automatiskeDokumenter
      .map(
        (d) =>
          `====================================================\n${d.titel.toUpperCase()} (${d.kilde})\n====================================================\n${
            d.indholdTekst || d.beskrivelse
          }`
      )
      .join("\n\n\n");

    const blob = new Blob([combinedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeAddr = profile.adresse.replace(/[^a-zA-Z0-9æøåÆØÅ_-]+/g, "_");
    a.download = `Samlet_Dokumentpakke_${safeAddr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    uploadedDocs.forEach((u) => {
      const link = document.createElement("a");
      link.href = u.objectUrl;
      link.download = u.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  // Generér og åbn/download det komplette Vurderingsdokument (PDF / Print-klar rapport inkl. Projekt 15 beregning & billeder)
  const handleDownloadValuationDocument = () => {
    if (!profile) return;
    const activeVal = profile.vurdering.niveauer[renovationLevel];
    const photos = uploadedDocs.filter((d) => d.type === "photo");
    const docs = uploadedDocs.filter((d) => d.type === "document");

    const htmlContent = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <title>Vurderingsdokument - ${profile.adresse}</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; padding: 36px; color: #0f172a; background: #ffffff; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d4ed8; padding-bottom: 18px; margin-bottom: 24px; }
    .badge { display: inline-block; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    h1 { margin: 6px 0 4px; font-size: 24px; }
    h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.04em; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 26px; }
    .val-box { background: #f8fafc; border: 2px solid #1d4ed8; border-radius: 14px; padding: 20px; margin: 18px 0; display: flex; justify-content: space-between; align-items: center; }
    .val-price { font-size: 30px; font-weight: 800; color: #0f172a; margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #ffffff; }
    .card-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .card-val { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 12px; }
    .photos img { width: 100%; height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid #cbd5e1; }
    .clause { background: #f8fafc; border-left: 4px solid #1d4ed8; padding: 10px 14px; margin-bottom: 10px; font-size: 12.5px; }
    .print-bar { background: #0f172a; color: white; padding: 12px 20px; border-radius: 10px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .btn { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    @media print { .print-bar { display: none; } body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="print-bar">
    <span><strong>Vurderingsdokument klar:</strong> Gem som PDF via "Udskriv / Gem som PDF"</span>
    <button class="btn" onclick="window.print()">Udskriv / Gem som PDF</button>
  </div>

  <div class="header">
    <div>
      <span class="badge">Vejle Mægleren · Faktabaseret Vurderingsdokument</span>
      <h1>${profile.adresse}</h1>
      <p style="margin:0;color:#475569;font-size:13px;">
        BFE-nr.: ${profile.bbr.bfeNummer || "—"} · Matr.nr.: ${profile.matrikel.matrikelnummer || "—"}, ${profile.matrikel.ejerlavsnavn || "—"} · Dato: ${new Date().toLocaleDateString("da-DK")}
      </p>
    </div>
    <div style="text-align:right;font-size:12px;color:#475569;">
      <strong>Datagrundlag:</strong><br/>
      DAR/v3 · BBR/v3 · MAT/v2<br/>
      Plandata.dk · Vurderingsportalen
    </div>
  </div>

  <div class="val-box">
    <div>
      <span class="badge">Valgt stand: ${activeVal.label}</span>
      <div class="val-price">${activeVal.estimatDkk.toLocaleString("da-DK")} kr.</div>
      <div style="font-size:13px;color:#475569;">
        Beregnet prisspænd: <strong>${activeVal.intervalMinDkk.toLocaleString("da-DK")} – ${activeVal.intervalMaxDkk.toLocaleString("da-DK")} kr.</strong>
        (${activeVal.m2PrisDkk.toLocaleString("da-DK")} kr./m²)
      </div>
    </div>
    <div style="text-align:right;font-size:13px;color:#334155;">
      <div><strong>Områdepris (${profile.vurdering.omraadeNavn}):</strong> ${profile.vurdering.basisM2PrisDkk.toLocaleString("da-DK")} kr./m²</div>
      <div><strong>Metode:</strong> ${profile.vurdering.ensembleMetodeTekst}</div>
      <div><strong>Valgt stand:</strong> ${activeVal.label}</div>
    </div>
  </div>

  <h2>1. Sammenligning af de 3 Renoveringsniveauer (Projekt 15 Beregner)</h2>
  <table>
    <thead>
      <tr>
        <th>Renoveringsniveau</th>
        <th>Beskrivelse</th>
        <th>Effektiv m²-pris</th>
        <th>Vurderingspris</th>
        <th>Prisspænd</th>
      </tr>
    </thead>
    <tbody>
      ${(["gennemrenoveret", "mellemrenoveret", "ikke_renoveret"] as RenovationLevelKey[])
        .map((lvlKey) => {
          const lvl = profile.vurdering.niveauer[lvlKey];
          const isSelected = lvlKey === renovationLevel;
          return `<tr style="${isSelected ? "background:#eff6ff;font-weight:700;" : ""}">
            <td>${lvl.label} ${isSelected ? "✓ (Valgt)" : ""}</td>
            <td>${lvl.subtitle}</td>
            <td>${lvl.m2PrisDkk.toLocaleString("da-DK")} kr./m²</td>
            <td>${lvl.estimatDkk.toLocaleString("da-DK")} kr.</td>
            <td>${lvl.intervalMinDkk.toLocaleString("da-DK")} – ${lvl.intervalMaxDkk.toLocaleString("da-DK")} kr.</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>

  <h2>2. Verificerede Hårde Fakta (BBR, Matrikel, Plandata & Vurderingsportalen)</h2>
  <div class="grid">
    <div class="card">
      <div class="card-label">Boligareal (BBR)</div>
      <div class="card-val">${profile.bbr.boligarealM2} m²</div>
    </div>
    <div class="card">
      <div class="card-label">Bebygget areal (Hovedhus / Total)</div>
      <div class="card-val">${profile.bbr.bebyggetArealHovedbygningM2} m² / ${profile.bbr.samletBebyggetArealM2} m²</div>
    </div>
    <div class="card">
      <div class="card-label">Grundareal (MAT/v2)</div>
      <div class="card-val">${profile.matrikel.registreretArealM2} m²</div>
    </div>
    <div class="card">
      <div class="card-label">Opførelsesår / Ombygget</div>
      <div class="card-val">${profile.bbr.opfoerelsesaar ?? "—"}${profile.bbr.ombygningsaar ? ` / ${profile.bbr.ombygningsaar}` : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">Tag & Ydervægge (BBR)</div>
      <div class="card-val">${profile.bbr.tagmaterialeTekst} / ${profile.bbr.ydervaegTekst}</div>
    </div>
    <div class="card">
      <div class="card-label">Varmeinstallation (BBR)</div>
      <div class="card-val">${profile.bbr.varmeinstallationTekst}</div>
    </div>
    <div class="card">
      <div class="card-label">Værelser / Badeværelser / Etager</div>
      <div class="card-val">${profile.bbr.antalVaerelser ?? "—"} vær. / ${profile.bbr.antalBadevaerelser ?? "—"} bad / ${profile.bbr.antalEtager} plan</div>
    </div>
    <div class="card">
      <div class="card-label">Gældende Lokalplan (Plandata.dk)</div>
      <div class="card-val">${profile.plandata.lokalplanId ? `Nr. ${profile.plandata.lokalplanId} (${profile.plandata.lokalplanNavn})` : "Ingen særskilt lokalplan"}</div>
    </div>
    <div class="card">
      <div class="card-label">Off. Ejendomsværdi / Seneste Handel</div>
      <div class="card-val">
        ${profile.tingbog.offentligEjendomsvaerdiDkk ? `${profile.tingbog.offentligEjendomsvaerdiDkk.toLocaleString("da-DK")} kr.` : "—"}
        ${profile.tingbog.senesteHandelsprisDkk ? ` / ${profile.tingbog.senesteHandelsprisDkk.toLocaleString("da-DK")} kr.` : ""}
      </div>
    </div>
  </div>

  ${
    photos.length > 0
      ? `<h2>3. Uploadede Billeder af Ejendommen (${photos.length} stk.)</h2>
      <div class="photos">
        ${photos.map((p) => `<div><img src="${p.objectUrl}" alt="${p.name}" /><div style="font-size:11px;color:#64748b;margin-top:4px;">${p.name}</div></div>`).join("")}
      </div>`
      : ""
  }

  <h2>${photos.length > 0 ? "4." : "3."} Sekundære Bygninger & BBR-Undertabeller</h2>
  <p style="font-size:13px;margin:6px 0;">
    <strong>Sekundære bygninger i BBR:</strong> ${
      profile.bbr.sekundaereBygninger.length > 0
        ? profile.bbr.sekundaereBygninger.map((s) => `${s.typeTekst} (${s.arealM2} m², opført ${s.opfoerelsesaar || "ukendt"})`).join(", ")
        : "Ingen sekundære bygninger registreret i BBR"
    }<br/>
    <strong>BBR Tekniske Anlæg:</strong> ${
      profile.bbr.tekniskeAnlaeg.length > 0
        ? profile.bbr.tekniskeAnlaeg.map((t) => `${t.typeTekst} (${t.driftstatusTekst})`).join(", ")
        : "Ingen tanke registreret i BBR_TekniskAnlaeg"
    }<br/>
    <strong>Uploadede sagsdokumenter i Dokumentrum:</strong> ${docs.length > 0 ? docs.map((d) => d.name).join(", ") : "Ingen dokumenter uploadet endnu"}
  </p>

  <h2>${photos.length > 0 ? "5." : "4."} Klausuler til Købsaftalens Afsnit 11</h2>
  ${profile.afsnit11Klausuler
    .map((k) => `<div class="clause"><strong>${k.titel} (${k.kildeRegister}):</strong><br/>"${k.tekst}"</div>`)
    .join("")}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
    }
  };

  const handleSendSellerLink = async () => {
    if (!sellerEmail) {
      alert("Indtast venligst sælgers e-mailadresse");
      return;
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sellerEmail,
          sellerName: sellerName || "Sælger",
          address,
          caseId,
          aiQuestions: profile?.saelgerSpoergsmaal || [],
          generatedAfsnit11Clauses: profile?.afsnit11Klausuler.map((k) => k.tekst) || [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.caseId) setCaseId(data.caseId);
        setMailStatus({ sent: true, url: data.sellerPortalUrl });
      } else {
        setMailStatus({ sent: false, error: data.error || "Fejl ved afsendelse" });
      }
    } catch {
      setMailStatus({ sent: false, error: "Netværksfejl ved afsendelse" });
    }
  };

  const handleCopyClause = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedClauseId(id);
    setTimeout(() => setCopiedClauseId(null), 2000);
  };

  const isReminderDocUploaded = (docId: string): boolean => {
    const names = uploadedDocs.map((d) => d.name.toLowerCase()).join(" ");
    if (docId === "rem-tingbogsattest") {
      return names.includes("tingbog") || names.includes("attest") || names.includes("servitut") || names.includes("pant");
    }
    if (docId === "rem-byggesag") {
      return names.includes("byggesag") || names.includes("tegning") || names.includes("plantegning") || names.includes("tilladelse") || names.includes("arkiv");
    }
    if (docId === "rem-tilstand-el-energi") {
      return names.includes("tilstand") || names.includes("elinstall") || names.includes("elrapport") || names.includes("energi");
    }
    return false;
  };

  const activeValuation = profile?.vurdering.niveauer[renovationLevel] || null;
  const uploadedPhotos = uploadedDocs.filter((d) => d.type === "photo");
  const uploadedPdfDocs = uploadedDocs.filter((d) => d.type === "document");
  const totalDocumentsInRoom = (profile?.automatiskeDokumenter.length || 0) + uploadedDocs.length;

  // Filtrér eksakte købermatches så også valgt renoveringsniveau-pris overholder købers maks-budget 100%
  const exactMatchingBuyers = (profile?.koeberkartotek.matchendeKoebere || []).filter((buyer) => {
    if (!activeValuation?.estimatDkk) return true;
    return activeValuation.estimatDkk <= buyer.maksBudgetDkk;
  });

  const missingRemindersCount = (profile?.paamindelseDokumenter || []).filter(
    (r) => !isReminderDocUploaded(r.id)
  ).length;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 lg:p-8 font-sans text-slate-900">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* TOP HEADER (REN, FOKUSERET PÅ MÆGLERENS ARBEJDSGANG - INGEN AI BUDGET-LÅS STØJ) */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl px-6 py-4 shadow-sm border border-slate-200/80">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
              VM
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900">Vejle Mægleren · Ejendomsfakta, Vurdering & Dokumentrum</h1>
              <p className="text-xs text-slate-500">
                Kun verificerede offentlige registerfakta (BBR, Matrikel, Plandata, Tingbog/Vurdering & CVR)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={openDocumentRoom}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
            >
              <FolderOpen size={16} />
              <span>Hent dokumenter (Dokumentrum)</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-bold">
                {totalDocumentsInRoom}
              </span>
            </button>

            <button
              onClick={handleDownloadValuationDocument}
              disabled={!profile}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
            >
              <FileDown size={16} />
              <span>Download Vurderingsdokument</span>
            </button>
          </div>
        </header>

        {/* ADRESSESØGNING */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-700">
              Slå ejendom op (henter eksakte fakta fra BBR, Matriklen, Plandata & Vurderingsportalen)
            </label>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400">Hurtigvalg:</span>
              {[
                "H C Hansens Vej 29, 7100 Vejle",
                "Kløvertoften 38, 7100 Vejle",
                "Ibæk Strandvej 112, 7100 Vejle",
                "Kiddesvej 24, 7100 Vejle",
              ].map((sample) => (
                <button
                  key={sample}
                  onClick={() =>
                    handleSelectAddress({
                      tekst: sample,
                      adresse: { id: "", href: "" },
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition-colors cursor-pointer"
                >
                  {sample.split(",")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative" ref={wrapperRef}>
            <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search className="text-slate-400 mr-3" size={20} />
              <input
                type="text"
                className="flex-1 outline-none text-base placeholder:text-slate-400"
                placeholder="Indtast adresse, f.eks. H C Hansens Vej 29, 7100 Vejle..."
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && address.trim()) {
                    setShowSuggestions(false);
                    setSelectedAddress(true);
                    loadPropertyProfile(address.trim());
                  }
                }}
              />
              {isLoadingProfile || isSearching ? (
                <span className="text-xs text-blue-700 font-medium px-3 py-1 bg-blue-50 rounded-full animate-pulse">
                  Henter verificerede registerdata...
                </span>
              ) : (
                selectedAddress &&
                profile && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                    <CheckCircle2 size={14} />
                    <span>BBR & Matrikel Verificeret</span>
                  </div>
                )
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl z-50 max-h-[300px] overflow-y-auto">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors text-slate-800 cursor-pointer"
                    onClick={() => handleSelectAddress(suggestion)}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <MapPin size={18} className="text-blue-600 flex-shrink-0" />
                      <span className="truncate font-medium">{suggestion.tekst}</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">Hent fakta →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PÅMINDELSE OM UPLOAD AF DOKUMENTER + NEM DRAG & DROP UPLOAD BAR */}
        {selectedAddress && profile && (
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                addFilesToCase(e.dataTransfer.files);
              }
            }}
            className={`rounded-2xl p-5 border transition-all ${
              isDraggingOver
                ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200"
                : missingRemindersCount > 0
                ? "bg-amber-50/70 border-amber-200"
                : "bg-emerald-50/60 border-emerald-200"
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BellRing size={18} className={missingRemindersCount > 0 ? "text-amber-600" : "text-emerald-600"} />
                  <h2 className="font-bold text-sm text-slate-900">
                    {missingRemindersCount > 0
                      ? `Påmindelse: ${missingRemindersCount} sagsdokumenter bør uploades for fuld dokumentation`
                      : "Alle anbefalede sagsdokumenter er uploadet i Dokumentrummet"}
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  {profile.paamindelseDokumenter.map((rem) => {
                    const done = isReminderDocUploaded(rem.id);
                    return (
                      <div
                        key={rem.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          done
                            ? "bg-emerald-100/80 border-emerald-300 text-emerald-900"
                            : "bg-white border-amber-300/80 text-slate-800"
                        }`}
                        title={rem.beskrivelse}
                      >
                        {done ? (
                          <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                        )}
                        <span>{rem.titel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
                <input
                  type="file"
                  ref={docInputRef}
                  onChange={(e) => e.target.files && addFilesToCase(e.target.files, "document")}
                  multiple
                  className="hidden"
                  accept="application/pdf,.pdf,.doc,.docx,.txt,image/*"
                />
                <button
                  onClick={() => docInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <Upload size={16} />
                  <span>{isAnalyzing ? "Analyserer dokument..." : "Upload dokumenter (PDF / Arkiv)"}</span>
                </button>

                <button
                  onClick={openDocumentRoom}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-sm font-semibold transition-colors cursor-pointer"
                >
                  <FolderOpen size={16} className="text-blue-700" />
                  <span>Hent dokumenter ({totalDocumentsInRoom})</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* INTEGRERET PROJEKT 15 VURDERINGSBEREGNER (3 RENOVERINGSNIVEAUER + BILLEDUPLOAD + DOWNLOAD VURDERINGSDOKUMENT) */}
        {selectedAddress && profile && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Calculator size={18} className="text-blue-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Integreret Vurderingsberegner (Projekt 15 Motor)
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  Vælg renoveringsniveau og upload billeder til Vurderingsdokumentet
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Beregnet ud fra verificeret BBR-boligareal ({profile.bbr.boligarealM2} m²), grundareal (
                  {profile.matrikel.registreretArealM2} m²) og områdepris for {profile.vurdering.omraadeNavn} (
                  {profile.vurdering.basisM2PrisDkk.toLocaleString("da-DK")} kr./m² · {profile.vurdering.ensembleMetodeTekst}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={(e) => e.target.files && addFilesToCase(e.target.files, "photo")}
                  multiple
                  className="hidden"
                  accept="image/*"
                />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors cursor-pointer"
                >
                  <ImagePlus size={16} className="text-blue-700" />
                  <span>Upload billeder ({uploadedPhotos.length})</span>
                </button>

                <button
                  onClick={handleDownloadValuationDocument}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <FileDown size={16} />
                  <span>Download Vurderingsdokument</span>
                </button>
              </div>
            </div>

            {/* DE 3 ENESTE VALGMULIGHEDER: GENNEMRENOVERET, MELLEMRENOVERET, IKKE RENOVERET */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              {(["gennemrenoveret", "mellemrenoveret", "ikke_renoveret"] as RenovationLevelKey[]).map((lvlKey) => {
                const lvl = profile.vurdering.niveauer[lvlKey];
                const isSelected = renovationLevel === lvlKey;
                return (
                  <button
                    key={lvlKey}
                    type="button"
                    onClick={() => setRenovationLevel(lvlKey)}
                    className={`text-left rounded-2xl p-5 border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-700 bg-blue-50/40 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-base text-slate-900">{lvl.label}</span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          isSelected ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isSelected ? "Valgt" : `${lvl.m2PrisDkk.toLocaleString("da-DK")} kr./m²`}
                      </span>
                    </div>

                    <p className="text-2xl font-extrabold text-slate-900">
                      {lvl.estimatDkk.toLocaleString("da-DK")} kr.
                    </p>

                    <p className="text-xs text-slate-600 mt-1">
                      Spænd: {(lvl.intervalMinDkk / 1e6).toFixed(2).replace(".", ",")} –{" "}
                      {(lvl.intervalMaxDkk / 1e6).toFixed(2).replace(".", ",")} mio. kr. ·{" "}
                      {lvl.m2PrisDkk.toLocaleString("da-DK")} kr./m²
                    </p>
                    <p className="text-xs text-slate-500 mt-2">{lvl.subtitle}</p>
                  </button>
                );
              })}
            </div>

            {/* BILLEDE-GALLERI HVIS MÆGLEREN HAR UPLOADET BILLEDER */}
            {uploadedPhotos.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                  Uploadede ejendomsbilleder ({uploadedPhotos.length} stk. – inkluderes i Vurderingsdokumentet & Dokumentrummet)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {uploadedPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-24"
                    >
                      <img src={photo.objectUrl} alt={photo.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveUploadedItem(photo.id)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Fjern billede"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* HÅRDE FAKTA NØGLETAL (4 KORT UDEN GÆTTERI) */}
        {selectedAddress && profile && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  BBR Bolig & Opførelsesår
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  BFE {profile.bbr.bfeNummer || "—"}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{profile.bbr.boligarealM2} m²</p>
              <p className="text-xs text-slate-500 mt-1">
                Opført: <strong>{profile.bbr.opfoerelsesaar ?? "—"}</strong>
                {profile.bbr.ombygningsaar ? ` (ombygget ${profile.bbr.ombygningsaar})` : ""} · Bebygget total:{" "}
                {profile.bbr.samletBebyggetArealM2} m²
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Matrikel & Plandata
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  Matr. {profile.matrikel.matrikelnummer || "—"}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{profile.matrikel.registreretArealM2} m² grund</p>
              <p className="text-xs text-slate-500 mt-1">
                Faktisk bebyggelsesprocent: <strong>{profile.plandata.faktiskBebyggelsesprocent}%</strong> (maks.{" "}
                {profile.plandata.tilladtBebyggelsesprocent}%) ·{" "}
                {profile.plandata.lokalplanId ? `Lokalplan ${profile.plandata.lokalplanId}` : profile.plandata.zonestatus}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">
                  Off. Vurdering & Handel
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                  {profile.tingbog.vurderingsAar ? `Vurdering ${profile.tingbog.vurderingsAar}` : "SKAT / EJF"}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {profile.tingbog.offentligEjendomsvaerdiDkk
                  ? `${profile.tingbog.offentligEjendomsvaerdiDkk.toLocaleString("da-DK")} kr.`
                  : "Se Vurderingsportalen"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {profile.tingbog.senesteHandelsprisDkk
                  ? `Seneste handel: ${profile.tingbog.senesteHandelsprisDkk.toLocaleString("da-DK")} kr. (${profile.tingbog.senesteHandelsdato})`
                  : `Grundværdi: ${
                      profile.tingbog.offentligGrundvaerdiDkk
                        ? `${profile.tingbog.offentligGrundvaerdiDkk.toLocaleString("da-DK")} kr.`
                        : "Ikke registreret"
                    }`}
              </p>
            </div>

            <div
              onClick={() => setActiveRegistryTab("buyers")}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 cursor-pointer hover:border-blue-400 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Køberkartotek (100% Eksakt)
                </span>
                <Users size={15} className="text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{exactMatchingBuyers.length} eksakte match</p>
              <p className="text-xs text-blue-700 font-medium mt-1">
                Kun købere hvor alle krav er 100% opfyldt →
              </p>
            </div>
          </div>
        )}

        {selectedAddress && profile && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* VENSTRE KOLONNE (2/3 bredde) */}
            <div className="lg:col-span-2 space-y-6">
              {/* SKRÅFOTO, ORTOFOTO & STREET VIEW (UDEN 3D LIDAR STØJ) */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200/80">
                <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Compass size={18} className="text-blue-700" />
                    <span className="font-semibold text-sm text-slate-900">
                      Luftfoto, Skråfoto & Street View ({profile.adresse})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: "south", label: "Skråfoto Syd" },
                      { id: "north", label: "Skråfoto Nord" },
                      { id: "east", label: "Skråfoto Øst" },
                      { id: "ortofoto", label: "Ortofoto" },
                      { id: "streetview", label: "Street View" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setVisualMode(m.id as any)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          visualMode === m.id
                            ? "bg-blue-700 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[340px] relative bg-slate-900">
                  {visualMode === "south" && (
                    <iframe
                      src={profile.visuelPakke.skraafotoSydUrl}
                      className="w-full h-full border-0"
                      title="Dataforsyningen Skråfoto Syd"
                      loading="lazy"
                    />
                  )}
                  {visualMode === "north" && (
                    <iframe
                      src={profile.visuelPakke.skraafotoNordUrl}
                      className="w-full h-full border-0"
                      title="Dataforsyningen Skråfoto Nord"
                      loading="lazy"
                    />
                  )}
                  {visualMode === "east" && (
                    <iframe
                      src={profile.visuelPakke.skraafotoOestUrl}
                      className="w-full h-full border-0"
                      title="Dataforsyningen Skråfoto Øst"
                      loading="lazy"
                    />
                  )}
                  {visualMode === "ortofoto" && (
                    <img
                      src={profile.visuelPakke.ortofotoWmsUrl}
                      alt="GeoDanmark Forårs-Ortofoto"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {visualMode === "streetview" && (
                    <img
                      src={profile.visuelPakke.streetViewUrl}
                      alt="Google Street View"
                      className="w-full h-full object-cover"
                    />
                  )}

                  <div className="absolute bottom-3 right-3 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md text-white px-3.5 py-2 rounded-xl border border-white/15 text-xs">
                    <a
                      href={profile.visuelPakke.oisDirectUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-300 hover:text-white font-medium"
                    >
                      OIS.dk <ExternalLink size={12} />
                    </a>
                    <a
                      href={profile.visuelPakke.skraafotoSydUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-300 hover:text-white font-medium"
                    >
                      Fuldskærm Skråfoto <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>

              {/* DE 5 AUTORITATIVE REGISTRE & FAKTABASERET KRYDSREVISION */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Verificerede Registerfakta, Køberkartotek & Afsnit 11
                    </h2>
                    <p className="text-slate-500 text-xs">
                      Ingen gætteri – alle oplysninger stammer direkte fra BBR, Matriklen, Plandata.dk, Vurderingsportalen og CVR.
                    </p>
                  </div>
                  <button
                    onClick={() => runAnalysis(uploadedPdfDocs.map((d) => d.file))}
                    disabled={isAnalyzing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold text-xs transition-colors border border-blue-200 cursor-pointer"
                  >
                    <Sparkles size={15} />
                    {isAnalyzing ? "Opdaterer rapport..." : "Generér komplet sagsrapport"}
                  </button>
                </div>

                {/* FANER */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6">
                  {[
                    {
                      id: "flags",
                      title: "Fakta & Afsnit 11",
                      status: `${profile.afsnit11Klausuler.length} klausuler`,
                      color: "text-blue-700",
                    },
                    {
                      id: "bbr",
                      title: "1. BBR",
                      status: `${profile.bbr.boligarealM2} m²`,
                      color: "text-emerald-700",
                    },
                    {
                      id: "matrikel",
                      title: "2. Matrikel",
                      status: `${profile.matrikel.registreretArealM2} m²`,
                      color: "text-emerald-700",
                    },
                    {
                      id: "plandata",
                      title: "3. Plandata",
                      status: profile.plandata.lokalplanId || profile.plandata.zonestatus,
                      color: "text-emerald-700",
                    },
                    {
                      id: "tingbog",
                      title: "4. Vurdering/Salg",
                      status: profile.tingbog.offentligEjendomsvaerdiDkk ? "Verificeret" : "Se status",
                      color: "text-purple-700",
                    },
                    {
                      id: "cvr",
                      title: "5. CVR",
                      status: profile.cvr.harAktivtErhvervPaaAdressen ? "Erhverv" : "0 selskaber",
                      color: profile.cvr.harAktivtErhvervPaaAdressen ? "text-amber-700" : "text-emerald-700",
                    },
                    {
                      id: "buyers",
                      title: "Køberkartotek",
                      status: `${exactMatchingBuyers.length} eksakte`,
                      color: "text-amber-700",
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveRegistryTab(tab.id as any)}
                      className={`text-left border rounded-xl p-3 transition-all cursor-pointer ${
                        activeRegistryTab === tab.id
                          ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-100"
                          : "border-slate-200/80 bg-slate-50/60 hover:bg-slate-100"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-slate-500 mb-0.5 truncate">{tab.title}</p>
                      <p className={`text-xs font-bold ${tab.color} truncate`}>{tab.status}</p>
                    </button>
                  ))}
                </div>

                {/* FANE-INDHOLD */}
                <div>
                  {activeRegistryTab === "flags" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Verificerede Register-Observanda & Klausuler til Afsnit 11
                        </h3>
                        {profile.afsnit11Klausuler.length > 0 && (
                          <button
                            onClick={() => {
                              const allText = profile.afsnit11Klausuler
                                .map((k, idx) => `${idx + 1}. ${k.titel}:\n${k.tekst}`)
                                .join("\n\n");
                              handleCopyClause("all", allText);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                          >
                            {copiedClauseId === "all" ? (
                              <Check size={14} className="text-emerald-600" />
                            ) : (
                              <Copy size={14} />
                            )}
                            Kopiér alle Afsnit 11-klausuler
                          </button>
                        )}
                      </div>

                      {profile.roedeFlag.length > 0 ? (
                        profile.roedeFlag.map((flag) => (
                          <div
                            key={flag.id}
                            className={`rounded-xl p-4 border ${
                              flag.severity === "kritisk"
                                ? "bg-red-50/60 border-red-200"
                                : flag.severity === "advarsel"
                                ? "bg-amber-50/60 border-amber-200"
                                : "bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <span
                                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                  flag.severity === "kritisk"
                                    ? "bg-red-100 text-red-800"
                                    : flag.severity === "advarsel"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {flag.register}
                              </span>
                              <h4 className="font-semibold text-slate-900 text-sm">{flag.title}</h4>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed mb-2">{flag.description}</p>

                            {flag.afsnit11Clause && (
                              <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                                <div className="text-xs text-slate-800 italic">
                                  <strong className="not-italic text-slate-900 block mb-0.5">
                                    Klausul til Købsaftalens Afsnit 11:
                                  </strong>
                                  &ldquo;{flag.afsnit11Clause}&rdquo;
                                </div>
                                <button
                                  onClick={() => handleCopyClause(flag.id, flag.afsnit11Clause!)}
                                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors cursor-pointer"
                                >
                                  {copiedClauseId === flag.id ? <Check size={14} /> : <Copy size={14} />}
                                  {copiedClauseId === flag.id ? "Kopieret" : "Kopiér"}
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950">
                          <strong>✓ Ingen kritiske register-afvigelser registreret i de offentlige tabeller</strong>
                          <p className="mt-1 text-emerald-800">
                            BBR, Matrikel, Plandata og CVR viser ingen automatiske konflikter på {profile.adresse}. Upload
                            Tingbogsattest og Byggesagsarkiv ovenfor for fuld dokumentkontrol.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeRegistryTab === "bbr" && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4 text-xs">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                          <Building2 size={16} className="text-blue-700" />
                          Sekundære Bygninger i BBR ({profile.bbr.sekundaereBygninger.length} stk.)
                        </h4>
                        {profile.bbr.sekundaereBygninger.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {profile.bbr.sekundaereBygninger.map((sb, i) => (
                              <div key={i} className="bg-white p-3.5 rounded-lg border border-slate-200">
                                <p className="font-bold text-slate-900">
                                  Bygning #{sb.bygningsnr}: {sb.typeTekst}
                                </p>
                                <p className="text-slate-600 mt-1">
                                  Areal: <strong>{sb.arealM2} m²</strong> · Opført: {sb.opfoerelsesaar || "Ikke oplyst"} · Tag:{" "}
                                  {sb.tagmateriale}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-600 bg-white p-3.5 rounded-lg border border-slate-200">
                            Ingen sekundære bygninger (garage/carport/udhus) registreret i BBR på denne adresse.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                          <h5 className="font-bold text-slate-900 mb-1">BBR Tekniske Anlæg (Tanke / Jordvarme)</h5>
                          {profile.bbr.tekniskeAnlaeg.length > 0 ? (
                            profile.bbr.tekniskeAnlaeg.map((t) => (
                              <div key={t.id} className="mt-1">
                                <p className="font-semibold text-amber-800">
                                  {t.typeTekst} – {t.driftstatusTekst}
                                </p>
                                <p className="text-slate-600">
                                  {t.volumenLiter ? `${t.volumenLiter} liter · ` : ""}
                                  {t.etableringsaar ? `Etableret ${t.etableringsaar}` : ""}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-600">Ingen tekniske anlæg/olietanke registreret i BBR.</p>
                          )}
                        </div>

                        <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                          <h5 className="font-bold text-slate-900 mb-1">BBR Byggesager</h5>
                          {profile.bbr.byggesager.length > 0 ? (
                            profile.bbr.byggesager.map((bs) => (
                              <div key={bs.sagsnummer} className="mt-1">
                                <p className="font-semibold text-slate-900">
                                  {bs.sagsnummer}: {bs.sagsartTekst} ({bs.statusTekst})
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-600">Ingen åbne byggesager registreret i BBR.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "matrikel" && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layers size={16} className="text-emerald-700" />
                        Matrikel- & Jordstykkedata (Datafordeleren MAT/v2)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <p className="text-slate-500">Matrikelnummer & Ejerlav</p>
                          <p className="font-bold text-sm text-slate-900 mt-0.5">
                            Matr.nr. {profile.matrikel.matrikelnummer || "—"}, {profile.matrikel.ejerlavsnavn || "—"} (
                            {profile.matrikel.ejerlavskode || "—"})
                          </p>
                          <p className="text-slate-600 mt-1">
                            Registreret grundareal: <strong>{profile.matrikel.registreretArealM2} m²</strong> (Vejareal:{" "}
                            {profile.matrikel.vejarealM2} m²)
                          </p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <p className="text-slate-500">Fredskov & Strandbeskyttelse på jordstykket</p>
                          <p className="font-bold text-sm text-slate-900 mt-0.5">
                            Fredskov: {profile.matrikel.fredskovArealM2} m² · Strandbeskyttelse:{" "}
                            {profile.matrikel.strandbeskyttelseArealM2} m²
                          </p>
                          <p className="text-slate-600 mt-1">BFE-nummer: {profile.bbr.bfeNummer || "—"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "plandata" && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FileCheck2 size={16} className="text-blue-700" />
                        Gældende Lokalplan, Kommuneplanramme & Byggeret (Plandata.dk WFS)
                      </h4>
                      <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="font-bold text-sm text-slate-900">
                            {profile.plandata.lokalplanId
                              ? `Lokalplan ${profile.plandata.lokalplanId}: ${profile.plandata.lokalplanNavn}`
                              : `Kommuneplanramme: ${profile.plandata.kommuneplanNavn}`}
                          </span>
                          <p className="text-slate-600 mt-1">
                            Zonestatus: <strong>{profile.plandata.zonestatus}</strong> · Tilladt bebyggelsesprocent:{" "}
                            <strong>{profile.plandata.tilladtBebyggelsesprocent}%</strong> · Faktisk BR18:{" "}
                            <strong>{profile.plandata.faktiskBebyggelsesprocent}%</strong> · Ubenyttet byggeret:{" "}
                            <strong>{profile.plandata.ubenyttetByggeretM2} m²</strong>
                          </p>
                        </div>
                        {profile.plandata.lokalplanPdfUrl && (
                          <a
                            href={profile.plandata.lokalplanPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 transition-colors flex-shrink-0"
                          >
                            Åbn Lokalplan PDF <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "tingbog" && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Scale size={16} className="text-purple-700" />
                          Offentlig Vurdering & Tinglyste Handler (Vurderingsportalen & EJF)
                        </h4>
                        {profile.tingbog.vurderingsportalUrl && (
                          <a
                            href={profile.tingbog.vurderingsportalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-700 font-semibold hover:underline"
                          >
                            Åbn på Vurderingsportalen.dk <ExternalLink size={12} />
                          </a>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <p className="text-slate-500">Offentlig Ejendomsværdi</p>
                          <p className="font-bold text-sm text-slate-900 mt-0.5">
                            {profile.tingbog.offentligEjendomsvaerdiDkk
                              ? `${profile.tingbog.offentligEjendomsvaerdiDkk.toLocaleString("da-DK")} kr.`
                              : "Ikke offentliggjort i API"}
                          </p>
                          {profile.tingbog.vurderingsStatusTekst && (
                            <p className="text-slate-500 mt-0.5">{profile.tingbog.vurderingsStatusTekst}</p>
                          )}
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <p className="text-slate-500">Offentlig Grundværdi</p>
                          <p className="font-bold text-sm text-slate-900 mt-0.5">
                            {profile.tingbog.offentligGrundvaerdiDkk
                              ? `${profile.tingbog.offentligGrundvaerdiDkk.toLocaleString("da-DK")} kr.`
                              : "Ikke offentliggjort i API"}
                          </p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <p className="text-slate-500">Seneste Tinglyste Handel</p>
                          <p className="font-bold text-sm text-slate-900 mt-0.5">
                            {profile.tingbog.senesteHandelsprisDkk
                              ? `${profile.tingbog.senesteHandelsprisDkk.toLocaleString("da-DK")} kr.`
                              : "Ingen handel i åbent register"}
                          </p>
                          {profile.tingbog.senesteHandelsdato && (
                            <p className="text-slate-500 mt-0.5">
                              Dato: {profile.tingbog.senesteHandelsdato} ({profile.tingbog.senesteHandelType})
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "cvr" && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-slate-900">
                        CVR-Registret (Virksomheder registreret på adressen)
                      </h4>
                      {profile.cvr.registreredeVirksomheder.length > 0 ? (
                        profile.cvr.registreredeVirksomheder.map((v) => (
                          <div key={v.cvrNummer} className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                            <p className="font-bold text-sm text-amber-900">
                              {v.navn} (CVR: {v.cvrNummer}) – {v.status}
                            </p>
                            <p className="text-amber-800 mt-1">
                              Branche: {v.branche} · Virksomhedsform: {v.virksomhedsform}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-emerald-800 font-medium">
                          ✓ Ingen aktive virksomheder registreret på {profile.adresse}.
                        </div>
                      )}
                    </div>
                  )}

                  {activeRegistryTab === "buyers" && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Users size={16} className="text-amber-600" />
                          Køberkartotek – Kun 100% Eksakte Match ({exactMatchingBuyers.length} eksakte match)
                        </h4>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                          Ingen gæt · Alle køberkrav 100% opfyldt
                        </span>
                      </div>

                      {exactMatchingBuyers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {exactMatchingBuyers.map((b) => (
                            <div key={b.id} className="bg-white p-4 rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-slate-900 text-sm">
                                  {b.koeberId}: {b.navn}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                  100% Eksakt Match
                                </span>
                              </div>
                              <p className="text-slate-600 mb-2">
                                Søgeområde: <strong>{b.omraade}</strong> ({b.afstandKm} km) · Maks. budget:{" "}
                                <strong>{b.maksBudgetDkk.toLocaleString("da-DK")} kr.</strong> ({b.finansieringsstatus})
                              </p>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {b.eksakteMatchPunkter.map((krav, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-medium"
                                  >
                                    ✓ {krav}
                                  </span>
                                ))}
                              </div>
                              <p className="text-slate-600 italic">{b.maeglerNoter}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white p-5 rounded-xl border border-slate-200 text-slate-600">
                          Ingen købere i kartoteket har et 100% eksakt match på samtlige hårde BBR-, grund- og budgetkrav for denne ejendom ved det valgte prisniveau.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {analysisResult && (
                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-slate-900">
                      <ShieldCheck className="text-emerald-600" size={18} />
                      Komplet 7-Trins Faktarapport
                    </h3>
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                        {analysisResult}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* HØJRE KOLONNE (1/3 bredde): VERIFICEREDE BBR-FAKTA, DOKUMENTRUM-GENVEJ & SÆLGERSKEMA */}
            <div className="space-y-6">
              {/* VERIFICEREDE BBR & MATRIKEL FAKTA */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-base text-slate-900">Verificerede BBR- & Matrikelfakta</h3>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                    BFE {profile.bbr.bfeNummer || "—"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-sm border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <p className="text-xs text-slate-500">Boligareal:</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.boligarealM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Opførelsesår / Ombygget:</p>
                    <p className="font-semibold text-slate-900">
                      {profile.bbr.opfoerelsesaar ?? "—"}
                      {profile.bbr.ombygningsaar ? ` / ${profile.bbr.ombygningsaar}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Bebygget areal (Hovedhus):</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.bebyggetArealHovedbygningM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Bebygget areal (Total):</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.samletBebyggetArealM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Kælderareal:</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.kaelderArealM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Grundareal (MAT/v2):</p>
                    <p className="font-semibold text-slate-900">{profile.matrikel.registreretArealM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Tagmateriale:</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.tagmaterialeTekst}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Ydervægsmateriale:</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.ydervaegTekst}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Varmeinstallation:</p>
                    <p className="font-semibold text-slate-900">{profile.bbr.varmeinstallationTekst}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Værelser / Badeværelser:</p>
                    <p className="font-semibold text-slate-900">
                      {profile.bbr.antalVaerelser ?? "—"} vær. / {profile.bbr.antalBadevaerelser ?? "—"} bad
                    </p>
                  </div>
                </div>

                {/* Sekundære specifikationer foldet sammen via <details> for ren UI */}
                <details className="text-xs text-slate-600 group">
                  <summary className="font-semibold text-slate-800 cursor-pointer select-none py-1">
                    Se BBR-undertabeller (Tekniske anlæg, Byggesager & Kloak)
                  </summary>
                  <div className="space-y-2 mt-2.5 pt-2 border-t border-slate-100">
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <strong className="text-slate-800 block">BBR TekniskAnlaeg:</strong>
                      {profile.bbr.tekniskeAnlaeg.length > 0
                        ? profile.bbr.tekniskeAnlaeg.map((t) => `${t.typeTekst} (${t.driftstatusTekst})`).join(", ")
                        : "Ingen olietanke eller tekniske anlæg registreret i BBR"}
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <strong className="text-slate-800 block">BBR Byggesag:</strong>
                      {profile.bbr.byggesager.length > 0
                        ? profile.bbr.byggesager.map((b) => `${b.sagsnummer} (${b.statusTekst})`).join(", ")
                        : "Ingen åbne byggesager registreret i BBR"}
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <strong className="text-slate-800 block">BBR Grund (Afløbsforhold):</strong>
                      {profile.bbr.aflobsforholdTekst}
                    </div>
                  </div>
                </details>
              </div>

              {/* HURTIG ADGANG TIL DOKUMENTRUM I HØJRE KOLONNE */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                    <FolderOpen size={18} className="text-blue-700" />
                    Samlet Dokumentrum
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {totalDocumentsInRoom} dokumenter
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Alle automatisk hentede registerudtræk ({profile.automatiskeDokumenter.length} stk.) og dine uploadede
                  dokumenter/billeder ({uploadedDocs.length} stk.) er samlet i Dokumentrummet.
                </p>

                <div className="space-y-2 mb-4">
                  {profile.automatiskeDokumenter.slice(0, 4).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileText size={14} className="text-blue-700 flex-shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{doc.titel}</span>
                      </div>
                      <button
                        onClick={() => handleDownloadAutoDoc(doc)}
                        className="text-blue-700 hover:underline font-semibold flex-shrink-0 cursor-pointer"
                      >
                        Hent
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={openDocumentRoom}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <FolderOpen size={16} />
                    Åbn Dokumentrum / Hent dokumenter
                  </button>
                  <button
                    onClick={() => docInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Upload size={16} />
                    Upload dokument til sagen
                  </button>
                </div>
              </div>

              {/* DIGITALT SÆLGERSKEMA */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
                <h3 className="font-bold text-base mb-1.5 text-slate-900">Digitalt Sælgerskema</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Send sælgeroplysningsskemaet med{" "}
                  <strong>{profile.saelgerSpoergsmaal.length} faktabaserede spørgsmål</strong> direkte til sælger.
                </p>

                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Sælgers navn"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-600 outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Sælgers e-mailadresse"
                    value={sellerEmail}
                    onChange={(e) => setSellerEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-600 outline-none"
                  />

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <a
                      href={`/seller/${caseId}`}
                      className="flex items-center justify-center gap-1.5 bg-slate-100 text-slate-800 hover:bg-slate-200 px-3 py-2.5 rounded-xl font-medium text-xs transition-colors"
                    >
                      <Eye size={15} />
                      Preview Skema
                    </a>
                    <button
                      onClick={handleSendSellerLink}
                      className="flex items-center justify-center gap-1.5 bg-blue-700 text-white hover:bg-blue-800 px-3 py-2.5 rounded-xl font-medium text-xs transition-colors cursor-pointer"
                    >
                      <Mail size={15} />
                      Send til sælger
                    </button>
                  </div>

                  {mailStatus && (
                    <div
                      className={`p-3 rounded-xl text-xs border ${
                        mailStatus.sent
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-red-50 border-red-200 text-red-800"
                      }`}
                    >
                      {mailStatus.sent ? (
                        <div>
                          <p className="font-semibold">✓ Sælgerskema er klargjort og sendt!</p>
                          {mailStatus.url && (
                            <a href={mailStatus.url} className="underline font-medium mt-1 inline-block">
                              Åbn sælgerlink →
                            </a>
                          )}
                        </div>
                      ) : (
                        <p>{mailStatus.error}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SAMLET DOKUMENTRUM MODAL (<dialog> med native top-layer & backdrop) */}
      <dialog
        ref={docRoomDialogRef}
        onClick={(e) => {
          if (e.target === docRoomDialogRef.current) closeDocumentRoom();
        }}
        className="w-full max-w-4xl rounded-2xl p-0 bg-white text-slate-900 shadow-2xl border border-slate-200 m-auto"
      >
        {profile && (
          <div className="flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen size={18} className="text-blue-400" />
                  <h2 className="font-bold text-base">Samlet Dokumentrum · {profile.adresse}</h2>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Indeholder alle automatisk hentede registerdokumenter ({profile.automatiskeDokumenter.length} stk.) og
                  dine uploadede dokumenter/billeder ({uploadedDocs.length} stk.)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadAllDocuments}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download size={14} />
                  Hent alle dokumenter
                </button>
                <button
                  onClick={closeDocumentRoom}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                  aria-label="Luk dokumentrum"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* 1. AUTOMATISK HENTEDE DOKUMENTER */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  1. Automatisk Hentede Dokumenter & Registerudtræk ({profile.automatiskeDokumenter.length} stk.)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {profile.automatiskeDokumenter.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                            {doc.kilde}
                          </span>
                          <span className="text-[11px] text-emerald-700 font-semibold">✓ {doc.status}</span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 mt-1.5">{doc.titel}</h4>
                        <p className="text-xs text-slate-600 mt-0.5">{doc.beskrivelse}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70">
                        <button
                          onClick={() => handleDownloadAutoDoc(doc)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Download size={13} />
                          {doc.id === "auto-doc-vurdering" ? "Åbn / Download PDF" : "Hent dokument"}
                        </button>

                        <button
                          onClick={() => setPreviewAutoDoc(previewAutoDoc?.id === doc.id ? null : doc)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium cursor-pointer"
                        >
                          <Eye size={13} />
                          {previewAutoDoc?.id === doc.id ? "Skjul indhold" : "Vis indhold"}
                        </button>

                        {doc.externalUrl && (
                          <a
                            href={doc.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-blue-700 border border-slate-200 text-xs font-medium"
                          >
                            Officiel kilde <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {previewAutoDoc && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap border border-slate-700">
                    <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-700">
                      <strong className="font-sans text-sm text-white">{previewAutoDoc.titel}</strong>
                      <button
                        onClick={() => setPreviewAutoDoc(null)}
                        className="text-slate-400 hover:text-white font-sans cursor-pointer"
                      >
                        Luk visning ✕
                      </button>
                    </div>
                    {previewAutoDoc.indholdTekst || previewAutoDoc.beskrivelse}
                  </div>
                )}
              </div>

              {/* 2. UPLOADEDE DOKUMENTER & BILLEDER I DOKUMENTRUMMET */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    2. Uploadede Sagsdokumenter & Ejendomsbilleder ({uploadedDocs.length} stk.)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => docInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Upload size={13} />
                      Upload dokument
                    </button>
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      <ImagePlus size={13} />
                      Upload billeder
                    </button>
                  </div>
                </div>

                {uploadedDocs.length > 0 ? (
                  <div className="space-y-2">
                    {uploadedDocs.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-3 truncate">
                          {item.type === "photo" ? (
                            <img
                              src={item.objectUrl}
                              alt={item.name}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                              <FileText size={18} />
                            </div>
                          )}
                          <div className="truncate">
                            <p className="font-bold text-slate-900 truncate">{item.name}</p>
                            <p className="text-slate-500">
                              {item.type === "photo" ? "Ejendomsbillede" : "Sagsdokument"} · {item.sizeKb} KB · Uploadet kl.{" "}
                              {item.uploadedAt}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={item.objectUrl}
                            download={item.name}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold"
                          >
                            <Download size={13} />
                            Hent
                          </a>
                          <button
                            onClick={() => handleRemoveUploadedItem(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Slet"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    onClick={() => docInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer bg-slate-50/50 transition-colors"
                  >
                    <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-800">
                      Træk og slip dokumenter eller billeder her, eller klik for at vælge filer
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Alle uploadede dokumenter (Tingbogsattest, Byggesagsarkiv, Tilstandsrapport, Billeder) gemmes her i
                      Dokumentrummet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
