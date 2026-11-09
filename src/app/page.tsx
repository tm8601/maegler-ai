"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  MapPin,
  CheckCircle2,
  Upload,
  Mail,
  FileDown,
  Eye,
  AlertTriangle,
  Copy,
  Check,
  Users,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  FileText,
  Download,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
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

type SkraafotoOrientation = "south" | "west" | "north" | "east";

const ORIENTATION_ORDER: SkraafotoOrientation[] = ["south", "west", "north", "east"];
const ORIENTATION_LABELS: Record<SkraafotoOrientation, string> = {
  south: "Syd",
  west: "Vest",
  north: "Nord",
  east: "Øst",
};

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

  // Kun de 3 renoveringsniveauer i Vurderingsberegneren (Projekt 15 motor)
  const [renovationLevel, setRenovationLevel] = useState<RenovationLevelKey>("mellemrenoveret");

  // Skråfoto & Luftfoto state (starter længere ude fra og forbliver zoomet ud fra alle 4 sider)
  const [visualMode, setVisualMode] = useState<"skraafoto" | "ortofoto" | "streetview">("skraafoto");
  const [skraafotoOrientation, setSkraafotoOrientation] = useState<SkraafotoOrientation>("south");
  const [skraafotoLightbox, setSkraafotoLightbox] = useState(false);

  // Dokumentrum & Upload state
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docRoomDialogRef = useRef<HTMLDialogElement>(null);
  const buyerDialogRef = useRef<HTMLDialogElement>(null);
  const [previewAutoDoc, setPreviewAutoDoc] = useState<AutoDocumentItem | null>(null);

  // Sælgerskema & klausul state
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

    const debounce = setTimeout(fetchAddress, 220);
    return () => clearTimeout(debounce);
  }, [address]);

  const handleSelectAddress = (suggestion: DawaSuggestion) => {
    setAddress(suggestion.tekst);
    setShowSuggestions(false);
    setSelectedAddress(true);
    setAnalysisResult(null);
    setMailStatus(null);
    setUploadedDocs([]);
    setVisualMode("skraafoto");
    setSkraafotoOrientation("south");
    loadPropertyProfile(
      suggestion.tekst,
      suggestion.adresse?.id,
      suggestion.adresse?.lat,
      suggestion.adresse?.lon
    );
  };

  const getSkraafotoUrlForOrientation = (dir: SkraafotoOrientation): string => {
    if (!profile) return "";
    if (dir === "north") return profile.visuelPakke.skraafotoNordUrl;
    if (dir === "east") return profile.visuelPakke.skraafotoOestUrl;
    if (dir === "west") return profile.visuelPakke.skraafotoVestUrl;
    return profile.visuelPakke.skraafotoSydUrl;
  };

  const handlePrevOrientation = () => {
    setVisualMode("skraafoto");
    setSkraafotoOrientation((prev) => {
      const idx = ORIENTATION_ORDER.indexOf(prev);
      return ORIENTATION_ORDER[(idx - 1 + ORIENTATION_ORDER.length) % ORIENTATION_ORDER.length];
    });
  };

  const handleNextOrientation = () => {
    setVisualMode("skraafoto");
    setSkraafotoOrientation((prev) => {
      const idx = ORIENTATION_ORDER.indexOf(prev);
      return ORIENTATION_ORDER[(idx + 1) % ORIENTATION_ORDER.length];
    });
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

  const openBuyerModal = () => {
    buyerDialogRef.current?.showModal();
  };

  const closeBuyerModal = () => {
    buyerDialogRef.current?.close();
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
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 24px; }
    .badge { display: inline-block; background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    h1 { margin: 6px 0 4px; font-size: 24px; }
    h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 26px; }
    .val-box { background: #f8fafc; border: 2px solid #0f172a; border-radius: 14px; padding: 20px; margin: 18px 0; display: flex; justify-content: space-between; align-items: center; }
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
    .clause { background: #f8fafc; border-left: 4px solid #0f172a; padding: 10px 14px; margin-bottom: 10px; font-size: 12.5px; }
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

  <h2>1. De 3 Renoveringsniveauer (Projekt 15 Beregner)</h2>
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
          return `<tr style="${isSelected ? "background:#f1f5f9;font-weight:700;" : ""}">
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

  const exactMatchingBuyers = (profile?.koeberkartotek.matchendeKoebere || []).filter((buyer) => {
    if (!activeValuation?.estimatDkk) return true;
    return activeValuation.estimatDkk <= buyer.maksBudgetDkk;
  });

  const missingRemindersCount = (profile?.paamindelseDokumenter || []).filter(
    (r) => !isReminderDocUploaded(r.id)
  ).length;

  return (
    <div className="min-h-screen bg-[#f8fafc] py-6 px-4 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* MINIMALISTISK 2026 TOPBAR */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl px-5 py-3.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight">
              VM
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900 leading-tight">Vejle Mægleren</h1>
              <p className="text-xs text-slate-500">Verificerede BBR-, Matrikel- & Plandata · Vurderingsberegner</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Køberkartotek gemt væk bag en knap */}
            <button
              type="button"
              onClick={openBuyerModal}
              disabled={!profile}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <Users size={15} className="text-slate-600" />
              <span>Køberkartotek</span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-bold">
                {exactMatchingBuyers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={openDocumentRoom}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <FolderOpen size={15} className="text-blue-600" />
              <span>Hent dokumenter</span>
              <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold">
                {totalDocumentsInRoom}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadValuationDocument}
              disabled={!profile}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <FileDown size={15} />
              <span>Download Vurderingsdokument</span>
            </button>
          </div>
        </header>

        {/* ADRESSEOPSLAG (PRÆCIS SOM PROJEKT 10 TAGBEREGNER) */}
        <section className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ejendomsadresse
            </label>
            {isLoadingProfile || isSearching ? (
              <span className="text-xs text-blue-600 font-medium animate-pulse">
                Henter BBR, Matrikel & Skråfoto...
              </span>
            ) : (
              selectedAddress &&
              profile && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 size={14} />
                  BFE {profile.bbr.bfeNummer} · Matr. {profile.matrikel.matrikelnummer}
                </span>
              )
            )}
          </div>

          <div className="relative" ref={wrapperRef}>
            <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50/50 focus-within:bg-white focus-within:border-slate-900 transition-all">
              <Search className="text-slate-400 mr-3 flex-shrink-0" size={18} />
              <input
                type="text"
                className="flex-1 bg-transparent outline-none text-sm sm:text-base font-medium text-slate-900 placeholder:text-slate-400"
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
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl z-50 max-h-64 overflow-y-auto">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors text-slate-800 text-sm cursor-pointer"
                    onClick={() => handleSelectAddress(suggestion)}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <MapPin size={16} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate font-medium">{suggestion.tekst}</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">Vælg →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* TOP- SEKTION SOM I PROJEKT 10 TAGBEREGNER: LUFTFOTO/SKRÅFOTO HØJERE OPPE (2/3) + EJENDOMSDATA BBR (1/3) */}
        {selectedAddress && profile && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* VENSTRE (2/3): SKRÅFOTO & LUFTFOTO VIEWER (STARTER LÆNGERE UDE FRA OG FORBLIVER LÆNGERE UDE FRA ALLE 4 SIDER) */}
            <div className="md:col-span-2">
              <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs h-[390px] relative group">
                {/* Top-bar overlay med vinkler (Syd, Vest, Nord, Øst, Ortofoto, Street View) */}
                <div
                  className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-md border border-slate-200/80 pointer-events-auto">
                    {ORIENTATION_ORDER.map((dir) => {
                      const active = visualMode === "skraafoto" && skraafotoOrientation === dir;
                      return (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => {
                            setVisualMode("skraafoto");
                            setSkraafotoOrientation(dir);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            active
                              ? "bg-slate-900 text-white"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {ORIENTATION_LABELS[dir]}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setVisualMode("ortofoto")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        visualMode === "ortofoto"
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Luftfoto
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualMode("streetview")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        visualMode === "streetview"
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Gadefoto
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSkraafotoLightbox(true)}
                    className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 shadow-md border border-slate-200/80 pointer-events-auto cursor-pointer"
                  >
                    <Maximize2 size={13} />
                    <span>Forstør</span>
                  </button>
                </div>

                {/* Selve billed-/skråfoto-visningen */}
                <div className="relative w-full h-full bg-slate-900 overflow-hidden">
                  {visualMode === "skraafoto" && (
                    <>
                      {/* 360% * 0.2778 = 100% -> Huset ligger præcis i midten, men kameraet starter 3.6x længere ude fra på ALLE 4 vinkler */}
                      <iframe
                        key={`${profile.adresse}-${skraafotoOrientation}`}
                        src={getSkraafotoUrlForOrientation(skraafotoOrientation)}
                        className="absolute top-0 left-0 origin-top-left"
                        style={{
                          width: "360%",
                          height: "360%",
                          border: 0,
                          transform: "scale(0.2778)",
                        }}
                        allowFullScreen
                        loading="lazy"
                        title={`Skråfoto ${ORIENTATION_LABELS[skraafotoOrientation]}`}
                      />

                      {/* Venstre / Højre pile til hurtigt vinkelskift rundt om huset (som i Projekt 10) */}
                      <div className="absolute inset-y-0 left-3 flex items-center z-20 pointer-events-none">
                        <button
                          type="button"
                          onClick={handlePrevOrientation}
                          title="Forrige vinkel"
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/90 hover:bg-white backdrop-blur-sm shadow-lg border border-slate-200 text-slate-800 hover:scale-105 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                        >
                          <ChevronLeft size={20} />
                        </button>
                      </div>
                      <div className="absolute inset-y-0 right-3 flex items-center z-20 pointer-events-none">
                        <button
                          type="button"
                          onClick={handleNextOrientation}
                          title="Næste vinkel"
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/90 hover:bg-white backdrop-blur-sm shadow-lg border border-slate-200 text-slate-800 hover:scale-105 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </>
                  )}

                  {visualMode === "ortofoto" && (
                    <img
                      src={profile.visuelPakke.ortofotoWmsUrl}
                      alt="GeoDanmark Luftfoto"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {visualMode === "streetview" && (
                    <img
                      src={profile.visuelPakke.streetViewUrl}
                      alt="Gadefoto"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* HØJRE (1/3): EJENDOMSDATA (BBR & MATRIKEL) – PRÆCIS SOM I PROJEKT 10 TAGBEREGNER */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs h-[390px] flex flex-col">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h2 className="text-base font-bold text-slate-900">Ejendomsdata (BBR)</h2>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    BFE {profile.bbr.bfeNummer}
                  </span>
                </div>

                <div className="flex flex-col gap-3.5 text-sm overflow-y-auto pr-1">
                  <div
                    className={
                      profile.bbr.asbestMistanke
                        ? "bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl"
                        : ""
                    }
                  >
                    <span
                      className={`block text-xs ${
                        profile.bbr.asbestMistanke ? "text-amber-800" : "text-slate-500"
                      }`}
                    >
                      BBR registreret tag:
                    </span>
                    <span
                      className={`font-semibold ${
                        profile.bbr.asbestMistanke ? "text-amber-950" : "text-slate-900"
                      }`}
                    >
                      {profile.bbr.tagmaterialeTekst}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-500 block text-xs">Boligareal (BBR):</span>
                      <span className="font-semibold text-slate-900">{profile.bbr.boligarealM2} m²</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-xs">Bebygget (Hus / Total):</span>
                      <span className="font-semibold text-slate-900">
                        {profile.bbr.bebyggetArealHovedbygningM2} / {profile.bbr.samletBebyggetArealM2} m²
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-500 block text-xs">Grundareal (Matr. {profile.matrikel.matrikelnummer}):</span>
                      <span className="font-semibold text-slate-900">{profile.matrikel.registreretArealM2} m²</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-xs">Opførelsesår / Ombygget:</span>
                      <span className="font-semibold text-slate-900">
                        {profile.bbr.opfoerelsesaar ?? "—"}
                        {profile.bbr.ombygningsaar ? ` / ${profile.bbr.ombygningsaar}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-500 block text-xs">Værelser / Bad:</span>
                      <span className="font-semibold text-slate-900">
                        {profile.bbr.antalVaerelser ?? "—"} vær. · {profile.bbr.antalBadevaerelser ?? "—"} bad
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-xs">Bebyggelsesprocent:</span>
                      <span className="font-semibold text-slate-900">
                        {profile.plandata.faktiskBebyggelsesprocent}% (maks. {profile.plandata.tilladtBebyggelsesprocent}%)
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">Ydervæg & Varme (BBR):</span>
                    <span className="font-semibold text-slate-900">
                      {profile.bbr.ydervaegTekst} · {profile.bbr.varmeinstallationTekst}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">Off. vurdering / Seneste handel:</span>
                    <span className="font-semibold text-slate-900">
                      {profile.tingbog.offentligEjendomsvaerdiDkk
                        ? `${profile.tingbog.offentligEjendomsvaerdiDkk.toLocaleString("da-DK")} kr.`
                        : "—"}
                      {profile.tingbog.senesteHandelsprisDkk
                        ? ` / ${profile.tingbog.senesteHandelsprisDkk.toLocaleString("da-DK")} kr.`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* VURDERINGSBEREGNER (PROJEKT 15) – KUN 3 RENOVERINGSNIVEAUER + UPLOAD BILLEDER + DOWNLOAD */}
        {selectedAddress && profile && (
          <section className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Vurderingsberegner</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vælg ejendommens stand ({profile.bbr.boligarealM2} m² bolig · {profile.matrikel.registreretArealM2} m² grund ·{" "}
                  {profile.vurdering.omraadeNavn})
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={(e) => e.target.files && addFilesToCase(e.target.files, "photo")}
                  multiple
                  className="hidden"
                  accept="image/*"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ImagePlus size={15} />
                  <span>Upload billeder ({uploadedPhotos.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadValuationDocument}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FileDown size={15} />
                  <span>Download Vurderingsdokument</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["gennemrenoveret", "mellemrenoveret", "ikke_renoveret"] as RenovationLevelKey[]).map((lvlKey) => {
                const lvl = profile.vurdering.niveauer[lvlKey];
                const isSelected = renovationLevel === lvlKey;
                return (
                  <button
                    key={lvlKey}
                    type="button"
                    onClick={() => setRenovationLevel(lvlKey)}
                    className={`text-left rounded-2xl p-5 border transition-all cursor-pointer ${
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 text-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm">{lvl.label}</span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isSelected ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-700"
                        }`}
                      >
                        {lvl.m2PrisDkk.toLocaleString("da-DK")} kr./m²
                      </span>
                    </div>

                    <p className="text-2xl font-extrabold tracking-tight">
                      {lvl.estimatDkk.toLocaleString("da-DK")} kr.
                    </p>

                    <p className={`text-xs mt-1 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                      Spænd: {(lvl.intervalMinDkk / 1e6).toFixed(2).replace(".", ",")} –{" "}
                      {(lvl.intervalMaxDkk / 1e6).toFixed(2).replace(".", ",")} mio. kr.
                    </p>
                  </button>
                );
              })}
            </div>

            {uploadedPhotos.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {uploadedPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-20"
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

        {/* DOKUMENT-UPLOAD, PÅMINDELSER & DOKUMENTRUM (SIMPELT 2026 KORT) */}
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
            className={`bg-white rounded-2xl p-6 border transition-all shadow-xs ${
              isDraggingOver ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200/80"
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Dokumenter & Påmindelser ({missingRemindersCount > 0 ? `${missingRemindersCount} mangler upload` : "Komplet"})
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.paamindelseDokumenter.map((rem) => {
                    const done = isReminderDocUploaded(rem.id);
                    return (
                      <span
                        key={rem.id}
                        title={rem.beskrivelse}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                          done
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-amber-50/70 border-amber-200 text-amber-900"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 size={13} className="text-emerald-600" />
                        ) : (
                          <AlertTriangle size={13} className="text-amber-600" />
                        )}
                        {rem.titel}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <input
                  type="file"
                  ref={docInputRef}
                  onChange={(e) => e.target.files && addFilesToCase(e.target.files, "document")}
                  multiple
                  className="hidden"
                  accept="application/pdf,.pdf,.doc,.docx,.txt,image/*"
                />
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Upload size={15} />
                  <span>{isAnalyzing ? "Analyserer..." : "Upload dokumenter"}</span>
                </button>

                <button
                  type="button"
                  onClick={openDocumentRoom}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FolderOpen size={15} />
                  <span>Hent dokumenter ({totalDocumentsInRoom})</span>
                </button>
              </div>
            </div>

            {/* Kompakt visning af Afsnit 11 & Digitalt Sælgerskema uden rod */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-100">
              <details className="group rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                <summary className="flex items-center justify-between cursor-pointer select-none font-semibold text-xs text-slate-800">
                  <span>Afsnit 11-klausuler & Register-observanda ({profile.afsnit11Klausuler.length} stk.)</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 space-y-2.5 text-xs">
                  {profile.afsnit11Klausuler.map((k) => (
                    <div key={k.id} className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-slate-900">{k.titel}</strong>
                        <button
                          type="button"
                          onClick={() => handleCopyClause(k.id, k.tekst)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium cursor-pointer"
                        >
                          {copiedClauseId === k.id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedClauseId === k.id ? "Kopieret" : "Kopiér"}
                        </button>
                      </div>
                      <p className="text-slate-600 italic">&ldquo;{k.tekst}&rdquo;</p>
                    </div>
                  ))}
                  {analysisResult && (
                    <pre className="whitespace-pre-wrap font-sans text-xs bg-white p-3 rounded-lg border border-slate-200 text-slate-700">
                      {analysisResult}
                    </pre>
                  )}
                </div>
              </details>

              <details className="group rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                <summary className="flex items-center justify-between cursor-pointer select-none font-semibold text-xs text-slate-800">
                  <span>Digitalt Sælgerskema ({profile.saelgerSpoergsmaal.length} faktaspørgsmål)</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Sælgers navn"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-slate-900"
                    />
                    <input
                      type="email"
                      placeholder="Sælgers e-mail"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/seller/${caseId}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 hover:bg-slate-100 font-medium"
                    >
                      <Eye size={13} />
                      Preview skema
                    </a>
                    <button
                      type="button"
                      onClick={handleSendSellerLink}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-medium cursor-pointer"
                    >
                      <Mail size={13} />
                      Send til sælger
                    </button>
                  </div>
                  {mailStatus && (
                    <p className={mailStatus.sent ? "text-emerald-700 font-medium" : "text-red-600"}>
                      {mailStatus.sent ? "✓ Sælgerskema sendt" : mailStatus.error}
                    </p>
                  )}
                </div>
              </details>
            </div>
          </section>
        )}
      </div>

      {/* FULDSKÆRMS LIGHTBOX TIL SKRÅFOTO (INKL. VINKELSKIFT LÆNGERE UDE FRA ALLE 4 SIDER) */}
      {skraafotoLightbox && profile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          onClick={() => setSkraafotoLightbox(false)}
        >
          <div
            className="relative w-[92vw] max-w-6xl h-[82vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-lg pointer-events-auto">
                {ORIENTATION_ORDER.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setSkraafotoOrientation(dir)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      skraafotoOrientation === dir
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Skråfoto {ORIENTATION_LABELS[dir]}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSkraafotoLightbox(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-slate-900 shadow-lg hover:bg-slate-100 pointer-events-auto cursor-pointer"
                aria-label="Luk fuldskærm"
              >
                <X size={18} />
              </button>
            </div>

            <iframe
              key={`lightbox-${profile.adresse}-${skraafotoOrientation}`}
              src={getSkraafotoUrlForOrientation(skraafotoOrientation)}
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: "225%",
                height: "225%",
                border: 0,
                transform: "scale(0.4444)",
              }}
              allowFullScreen
              loading="lazy"
              title="Skråfoto Forstørret"
            />

            <div className="absolute inset-y-0 left-4 flex items-center z-20 pointer-events-none">
              <button
                type="button"
                onClick={handlePrevOrientation}
                className="w-11 h-11 rounded-full flex items-center justify-center bg-white/90 hover:bg-white shadow-lg text-slate-900 pointer-events-auto cursor-pointer"
              >
                <ChevronLeft size={22} />
              </button>
            </div>
            <div className="absolute inset-y-0 right-4 flex items-center z-20 pointer-events-none">
              <button
                type="button"
                onClick={handleNextOrientation}
                className="w-11 h-11 rounded-full flex items-center justify-center bg-white/90 hover:bg-white shadow-lg text-slate-900 pointer-events-auto cursor-pointer"
              >
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KØBERKARTOTEK MODAL (GEMT VÆK BAG KNAP SOM ØNSKET – KUN 100% EKSAKTE MATCH) */}
      <dialog
        ref={buyerDialogRef}
        onClick={(e) => {
          if (e.target === buyerDialogRef.current) closeBuyerModal();
        }}
        className="w-full max-w-2xl rounded-2xl p-0 bg-white text-slate-900 shadow-2xl border border-slate-200 m-auto"
      >
        {profile && (
          <div className="flex flex-col max-h-[82vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users size={18} className="text-slate-800" />
                <div>
                  <h2 className="font-bold text-base text-slate-900">
                    Køberkartotek ({exactMatchingBuyers.length} eksakte match)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Kun købere hvor samtlige bolig-, grund- og budgetkrav matcher 100% eksakt
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeBuyerModal}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
                aria-label="Luk køberkartotek"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 text-xs">
              {exactMatchingBuyers.length > 0 ? (
                exactMatchingBuyers.map((b) => (
                  <div key={b.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 text-sm">
                        {b.koeberId}: {b.navn}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                        100% Eksakt Match
                      </span>
                    </div>
                    <p className="text-slate-600 mb-2">
                      Søgeområde: <strong>{b.omraade}</strong> · Maks. budget:{" "}
                      <strong>{b.maksBudgetDkk.toLocaleString("da-DK")} kr.</strong> ({b.finansieringsstatus})
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {b.eksakteMatchPunkter.map((krav, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[11px] font-medium"
                        >
                          ✓ {krav}
                        </span>
                      ))}
                    </div>
                    <p className="text-slate-500">{b.maeglerNoter}</p>
                  </div>
                ))
              ) : (
                <div className="p-6 rounded-xl border border-slate-200 text-center text-slate-500">
                  Ingen købere i kartoteket har et 100% eksakt match ved det valgte prisniveau.
                </div>
              )}
            </div>
          </div>
        )}
      </dialog>

      {/* SAMLET DOKUMENTRUM MODAL */}
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
                  Automatisk hentede dokumenter ({profile.automatiskeDokumenter.length} stk.) og uploadede dokumenter/billeder ({uploadedDocs.length} stk.)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAllDocuments}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download size={14} />
                  Hent alle dokumenter
                </button>
                <button
                  type="button"
                  onClick={closeDocumentRoom}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                  aria-label="Luk dokumentrum"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  1. Automatisk Hentede Dokumenter ({profile.automatiskeDokumenter.length} stk.)
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
                          type="button"
                          onClick={() => handleDownloadAutoDoc(doc)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Download size={13} />
                          {doc.id === "auto-doc-vurdering" ? "Åbn / Download PDF" : "Hent dokument"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewAutoDoc(previewAutoDoc?.id === doc.id ? null : doc)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium cursor-pointer"
                        >
                          <Eye size={13} />
                          {previewAutoDoc?.id === doc.id ? "Skjul" : "Vis"}
                        </button>

                        {doc.externalUrl && (
                          <a
                            href={doc.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-blue-700 border border-slate-200 text-xs font-medium"
                          >
                            Kilde <ExternalLink size={12} />
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
                        type="button"
                        onClick={() => setPreviewAutoDoc(null)}
                        className="text-slate-400 hover:text-white font-sans cursor-pointer"
                      >
                        Luk ✕
                      </button>
                    </div>
                    {previewAutoDoc.indholdTekst || previewAutoDoc.beskrivelse}
                  </div>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    2. Uploadede Dokumenter & Billeder ({uploadedDocs.length} stk.)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Upload size={13} />
                      Upload dokument
                    </button>
                    <button
                      type="button"
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
                              {item.type === "photo" ? "Billede" : "Dokument"} · {item.sizeKb} KB · kl. {item.uploadedAt}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={item.objectUrl}
                            download={item.name}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold"
                          >
                            <Download size={13} />
                            Hent
                          </a>
                          <button
                            type="button"
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
                    className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-xl p-6 text-center cursor-pointer bg-slate-50/50 transition-colors"
                  >
                    <Upload size={22} className="mx-auto text-slate-400 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-800">
                      Træk og slip dokumenter eller billeder her, eller klik for at uploade
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
