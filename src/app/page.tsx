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
  Flame,
  Compass,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getApiBaseUrl } from "@/lib/api";
import type { FullPropertyProfile } from "@/lib/property-aggregator";
import type { TenantBudgetState } from "@/lib/ai-cost-guard";

interface DawaSuggestion {
  tekst: string;
  adresse: {
    id: string;
    href: string;
    lat?: number;
    lon?: number;
  };
}

export default function Home() {
  const [address, setAddress] = useState("Kløvertoften 38, 7100 Vejle");
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<FullPropertyProfile | null>(null);
  const [caseId, setCaseId] = useState<string>("default");
  const [budget, setBudget] = useState<TenantBudgetState | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [visualMode, setVisualMode] = useState<"south" | "north" | "east" | "ortofoto" | "streetview">("south");
  const [activeRegistryTab, setActiveRegistryTab] = useState<
    "flags" | "bbr" | "matrikel" | "plandata" | "tingbog" | "cvr" | "buyers"
  >("flags");

  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sellerName, setSellerName] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [mailStatus, setMailStatus] = useState<{ sent: boolean; url?: string; error?: string } | null>(null);
  const [copiedClauseId, setCopiedClauseId] = useState<string | null>(null);

  // Hent profil for standardadresse ved opstart
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
        if (data.budget) setBudget(data.budget);
      }
    } catch (e) {
      console.error("Failed to load property profile:", e);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    loadPropertyProfile("Kløvertoften 38, 7100 Vejle");
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

    const debounce = setTimeout(fetchAddress, 260);
    return () => clearTimeout(debounce);
  }, [address]);

  const handleSelectAddress = (suggestion: DawaSuggestion) => {
    setAddress(suggestion.tekst);
    setShowSuggestions(false);
    setSelectedAddress(true);
    setAnalysisResult(null);
    setMailStatus(null);
    loadPropertyProfile(
      suggestion.tekst,
      suggestion.adresse?.id,
      suggestion.adresse?.lat,
      suggestion.adresse?.lon
    );
  };

  const runAnalysis = async (selectedFiles: File[]) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const formData = new FormData();
    formData.append("address", address);
    selectedFiles.forEach((file) => {
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
        if (data.budget) setBudget(data.budget);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    await runAnalysis(selectedFiles);
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
          aiQuestions: profile?.krydsrevision.dynamiskeSaelgerSpoergsmaal || [],
          generatedAfsnit11Clauses: profile?.krydsrevision.afsnit11Klausuler.map((k) => k.tekst) || [],
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

  const spentDkk = budget?.spentDkk ?? 0;
  const maxDkk = budget?.maxDailyBudgetDkk ?? 30;

  return (
    <div className="min-h-screen bg-[#f4f5f7] p-4 md:p-6 lg:p-8 font-sans text-[#111827]">
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* TOP BRANDING & AI BUDGET GUARD BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl px-6 py-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              VM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-gray-900">Vejle Mægleren AI · 360° Sags- & Krydsrevisions-CRM</h1>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  5 Registre + Vejle v3 AVM
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Automatisk krydsrevision af BBR (inkl. Tekniske Anlæg & Byggesager), Matriklen, Plandata, Tingbogen & CVR
              </p>
            </div>
          </div>

          {/* FAST 30 KR./DAG AI BUDGET-LÅS */}
          <div className="flex items-center gap-4 bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-2.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  AI Budget-Lås (Zero-Limbo)
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                I dag:{" "}
                <strong className="text-gray-900">
                  {spentDkk.toFixed(2).replace(".", ",")} kr.
                </strong>{" "}
                / {maxDkk.toFixed(2).replace(".", ",")} kr. (Hård grænse)
              </p>
            </div>
            <div className="w-24 bg-gray-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${Math.min(100, (spentDkk / maxDkk) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* TOP SEARCH BAR */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium text-gray-500">
              Søg på en adresse for at starte (Dataforsyningen GSearch v2.0 & DAR v3)
            </label>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-400">Hurtigtest:</span>
              {[
                "Kløvertoften 38, 7100 Vejle",
                "Ibæk Strandvej 112, 7100 Vejle",
                "Kiddesvej 24, 7100 Vejle",
                "Strandvejen 58, 7120 Vejle Øst",
              ].map((sample) => (
                <button
                  key={sample}
                  onClick={() =>
                    handleSelectAddress({
                      tekst: sample,
                      adresse: { id: "", href: "" },
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-600 transition-colors"
                >
                  {sample.split(",")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative group" ref={wrapperRef}>
            <div className="flex items-center border border-gray-200 rounded-xl px-4 py-3 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search className="text-gray-400 mr-3" size={20} />
              <input
                type="text"
                className="flex-1 outline-none text-base placeholder:text-gray-400"
                placeholder="F.eks. Kløvertoften 38, 7100 Vejle"
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
                <span className="text-xs text-blue-600 font-medium px-3 py-1 bg-blue-50 rounded-full animate-pulse">
                  Henter 5 registre...
                </span>
              ) : (
                selectedAddress && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">
                    <CheckCircle2 size={14} />
                    <span>5 Registre Verificeret</span>
                  </div>
                )
              )}
            </div>

            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xl z-50 max-h-[300px] overflow-y-auto"
                >
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-3 transition-colors text-gray-700"
                      onClick={() => handleSelectAddress(suggestion)}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <MapPin size={18} className="text-blue-500 flex-shrink-0" />
                        <span className="truncate font-medium">{suggestion.tekst}</span>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">Slå op i 5 registre →</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* VEJLE MÆGLEREN V3 FAKTA-BAR (FRA PROJEKT 15 AI BOLIGBEREGNER & PROJEKT 16) */}
        {selectedAddress && profile && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Vejle v3 Geo-AVM Estimat
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                  {profile.vejleFakta.confidencePct}% præcision
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {profile.vejleFakta.estimeretMarkedsvaerdiDkk.toLocaleString("da-DK")} kr.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Spænd: {(profile.vejleFakta.prisSpaendMinDkk / 1e6).toFixed(2).replace(".", ",")} –{" "}
                {(profile.vejleFakta.prisSpaendMaxDkk / 1e6).toFixed(2).replace(".", ",")} mio. kr. (
                {profile.vejleFakta.basisKvmPrisDkk.toLocaleString("da-DK")} kr./m²)
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Byggeret & Plandata
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  {profile.plandata.lokalplaner[0]?.plannr}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                +{profile.plandata.ubenyttetByggeretM2} m²{" "}
                <span className="text-sm font-normal text-gray-500">fri byggeret</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Bebyggelsesprocent: <strong>{profile.plandata.faktiskBebyggelsesprocent}%</strong> af maks.{" "}
                {profile.plandata.maxBebyggelsesprocent}% (Grund: {profile.matrikel.grundarealM2} m²)
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-600">
                  Tingbog & Est. Friværdi
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                  BFE {profile.bbr.bfeNummer}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {profile.tingbog.estimeretFrivaerdiDkk.toLocaleString("da-DK")} kr.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Seneste handel: {profile.tingbog.senesteHandelsprisDkk?.toLocaleString("da-DK")} kr. (
                {profile.tingbog.senesteHandelsdato?.slice(0, 4)}) · {profile.tingbog.servitutOverblik.antalRegistrerede}{" "}
                servitutter
              </p>
            </div>

            <div
              onClick={() => setActiveRegistryTab("buyers")}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                  Vejle Køberkartotek Match
                </span>
                <Flame size={15} className="text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {profile.vejleFakta.matchendeKoebereIKartotek.length} købere{" "}
                <span className="text-sm font-normal text-gray-500">matcher BBR</span>
              </p>
              <p className="text-xs text-blue-600 font-medium mt-1">
                Klik for at se bankgodkendte købere til {profile.vejnavn} →
              </p>
            </div>
          </div>
        )}

        {selectedAddress && profile && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT COLUMN (2/3 width) */}
            <div className="lg:col-span-2 space-y-6">
              {/* LIVE SKRÅFOTO / ORTOFOTO / STREET VIEW VIEWER */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Compass size={18} className="text-blue-600" />
                    <span className="font-semibold text-sm text-gray-900">
                      Skråfoto, 3D LiDAR & Kortvisning ({profile.koordinater.easting25832} E,{" "}
                      {profile.koordinater.northing25832} N)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: "south", label: "Skråfoto Syd" },
                      { id: "north", label: "Skråfoto Nord" },
                      { id: "east", label: "Skråfoto Øst" },
                      { id: "ortofoto", label: "Ortofoto (WMS)" },
                      { id: "streetview", label: "Street View" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setVisualMode(m.id as any)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          visualMode === m.id
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                      src={profile.vejleFakta.visuelPakke.skraafotoEmbedUrlSouth}
                      className="w-full h-full border-0"
                      title="Dataforsyningen Skråfoto Syd"
                      loading="lazy"
                    />
                  )}
                  {visualMode === "north" && (
                    <iframe
                      src={profile.vejleFakta.visuelPakke.skraafotoEmbedUrlNorth}
                      className="w-full h-full border-0"
                      title="Dataforsyningen Skråfoto Nord"
                      loading="lazy"
                    />
                  )}
                  {visualMode === "east" && (
                    <iframe
                      src={profile.vejleFakta.visuelPakke.skraafotoEmbedUrlEast}
                      className="w-full h-full border-0"
                      title="Dataforsyningen Skråfoto Øst"
                      loading="lazy"
                    />
                  )}
                  {visualMode === "ortofoto" && (
                    <img
                      src={profile.vejleFakta.visuelPakke.ortofotoWmsUrl}
                      alt="GeoDanmark Forårs-Ortofoto"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {visualMode === "streetview" && (
                    <img
                      src={profile.vejleFakta.visuelPakke.streetViewUrl}
                      alt="Google Street View"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* 3D LiDAR Footprint Overlay Badge */}
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-slate-900/85 backdrop-blur-md text-white px-4 py-2.5 rounded-xl border border-white/15 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-semibold">
                        3D LiDAR Tjek
                      </span>
                      <span>
                        BBR Bebygget total: <strong>{profile.bbr.bebyggetArealTotalM2} m²</strong> · Målt 3D tagflade:{" "}
                        <strong>{profile.matrikel.lidarFootprint.lidarEstimeretTagfladeM2} m²</strong> (+
                        {profile.matrikel.lidarFootprint.afvigelseM2} m² uregistreret overdækning/skur)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={profile.vejleFakta.visuelPakke.oisDirectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-300 hover:text-white font-medium"
                      >
                        OIS.dk <ExternalLink size={12} />
                      </a>
                      <a
                        href={profile.vejleFakta.visuelPakke.skraafotoEmbedUrlSouth}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-300 hover:text-white font-medium"
                      >
                        Fuldskærm Skråfoto <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI KRYDSREVISION & 5-REGISTER COCKPIT */}
              <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">AI Krydsrevision & De 5 Autoritative Registre</h2>
                    <p className="text-gray-500 text-sm">
                      Deterministisk 5-register krydstjek (0,00 kr.) + dybdegående 7-trins dokumentanalyse med Bolighandel-GPT.
                    </p>
                  </div>
                  <button
                    onClick={() => runAnalysis(files)}
                    disabled={isAnalyzing}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-sm transition-colors border border-indigo-200/60"
                  >
                    <Sparkles size={16} />
                    {isAnalyzing ? "Kører 7-trins revision..." : "Generér 7-trins Juridisk Rapport"}
                  </button>
                </div>

                {/* 5-REGISTER STATUS KORT (KLIKBARE FANER) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                  {[
                    {
                      id: "flags",
                      title: "Røde Flag & Afsnit 11",
                      status: `${profile.krydsrevision.roedeFlag.length} fund`,
                      color: "text-red-600",
                    },
                    {
                      id: "bbr",
                      title: "1. BBR + Undertabeller",
                      status: "Hentet",
                      color: "text-green-600",
                    },
                    {
                      id: "matrikel",
                      title: "2. Matrikel & Miljø",
                      status: `${profile.matrikel.grundarealM2} m²`,
                      color: "text-green-600",
                    },
                    {
                      id: "plandata",
                      title: "3. Plandata WFS",
                      status: profile.plandata.lokalplaner[0]?.plannr || "Hentet",
                      color: "text-green-600",
                    },
                    {
                      id: "tingbog",
                      title: "4. Tingbog & EJF",
                      status: "Tjekket",
                      color: "text-blue-600",
                    },
                    {
                      id: "cvr",
                      title: "5. CVR & Selskab",
                      status: profile.cvr.harErhvervPaaAdressen ? "Erhverv!" : "Ingen erhverv",
                      color: profile.cvr.harErhvervPaaAdressen ? "text-orange-600" : "text-green-600",
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveRegistryTab(tab.id as any)}
                      className={`text-left border rounded-xl p-3.5 transition-all ${
                        activeRegistryTab === tab.id
                          ? "border-blue-500 bg-blue-50/40 ring-2 ring-blue-100"
                          : "border-gray-100 bg-gray-50/60 hover:bg-gray-100/70"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider truncate">
                        {tab.title}
                      </p>
                      <p className={`text-sm font-bold ${tab.color} truncate`}>{tab.status}</p>
                    </button>
                  ))}
                </div>

                {/* INDHOLD FOR VALGT REGISTER-FANE */}
                <div className="mb-8">
                  {activeRegistryTab === "flags" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                          <AlertTriangle size={16} className="text-red-500" />
                          Automatiske Røde Flag & Afsnit 11-Klausuler ({profile.krydsrevision.roedeFlag.length})
                        </h3>
                        <button
                          onClick={() => {
                            const allText = profile.krydsrevision.afsnit11Klausuler
                              .map((k, idx) => `${idx + 1}. ${k.titel}:\n${k.tekst}`)
                              .join("\n\n");
                            handleCopyClause("all", allText);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          {copiedClauseId === "all" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                          Kopiér alle Afsnit 11-klausuler
                        </button>
                      </div>

                      {profile.krydsrevision.roedeFlag.map((flag) => (
                        <div
                          key={flag.id}
                          className={`rounded-xl p-4 border ${
                            flag.severity === "critical"
                              ? "bg-red-50/60 border-red-200"
                              : flag.severity === "warning"
                              ? "bg-amber-50/60 border-amber-200"
                              : "bg-blue-50/50 border-blue-200"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                  flag.severity === "critical"
                                    ? "bg-red-100 text-red-800"
                                    : flag.severity === "warning"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {flag.severity === "critical"
                                  ? "🔴 KRITISK"
                                  : flag.severity === "warning"
                                  ? "🟡 OPFØLGNING"
                                  : "🔵 INFO"}{" "}
                                · {flag.register}
                              </span>
                              <h4 className="font-semibold text-gray-900 text-sm">{flag.title}</h4>
                            </div>
                          </div>

                          <p className="text-xs text-gray-700 leading-relaxed mb-2">{flag.description}</p>
                          <p className="text-xs text-gray-500 mb-3">
                            <strong>Juridisk konsekvens:</strong> {flag.legalConsequence}
                          </p>

                          {flag.afsnit11Clause && (
                            <div className="bg-white/90 rounded-lg p-3 border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="text-xs text-gray-800 italic">
                                <strong className="not-italic text-gray-900 block mb-0.5">
                                  Forslag til Købsaftalens Afsnit 11:
                                </strong>
                                &ldquo;{flag.afsnit11Clause}&rdquo;
                              </div>
                              <button
                                onClick={() => handleCopyClause(flag.id, flag.afsnit11Clause!)}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors"
                              >
                                {copiedClauseId === flag.id ? <Check size={14} /> : <Copy size={14} />}
                                {copiedClauseId === flag.id ? "Kopieret!" : "Kopiér klausul"}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeRegistryTab === "bbr" && (
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-5">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                          <Building2 size={16} className="text-blue-600" />
                          Sekundære Bygninger på Matriklen (`BBR_Bygning` 910/920/930)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {profile.bbr.sekundaereBygninger.map((sb) => (
                            <div key={sb.bygningsnr} className="bg-white p-3.5 rounded-lg border border-gray-200 text-xs">
                              <p className="font-bold text-gray-900">
                                Bygning #{sb.bygningsnr}: {sb.typeNavn}
                              </p>
                              <p className="text-gray-600 mt-1">
                                Areal: <strong>{sb.arealM2} m²</strong> · Opført: {sb.opfoerelsesaar || "Ukendt"} · Tag:{" "}
                                {sb.tagmateriale}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-gray-900 mb-2">
                          Skjult Undertabel: `BBR_TekniskAnlaeg` (Olietanke, Jordvarme, Tanke)
                        </h4>
                        {profile.bbr.tekniskeAnlaeg.map((t) => (
                          <div key={t.id} className="bg-white p-3.5 rounded-lg border border-gray-200 text-xs mb-2">
                            <div className="flex justify-between font-bold text-gray-900">
                              <span>{t.typeNavn}</span>
                              <span className="text-amber-700">{t.driftStatus}</span>
                            </div>
                            <p className="text-gray-600 mt-1">{t.harSløjfningsattestNote}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-gray-900 mb-2">
                          Skjult Undertabel: `BBR_Byggesag` (Åbne & Historiske Byggesager)
                        </h4>
                        <div className="space-y-2">
                          {profile.bbr.byggesager.map((bs) => (
                            <div
                              key={bs.sagsnummer}
                              className={`p-3.5 rounded-lg border text-xs ${
                                bs.erAaben ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
                              }`}
                            >
                              <div className="flex justify-between font-bold">
                                <span>
                                  {bs.sagsnummer}: {bs.byggesagsart}
                                </span>
                                <span className={bs.erAaben ? "text-red-700" : "text-green-700"}>
                                  {bs.statusTekst}
                                </span>
                              </div>
                              <p className="text-gray-600 mt-1">
                                Modtaget: {bs.modtagelsesdato} · Byggetilladelse: {bs.byggetilladelsesdato || "—"} ·
                                Ibrugtagningstilladelse: {bs.ibrugtagningstilladelseDato || "MANGLER I BBR"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "matrikel" && (
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Layers size={16} className="text-emerald-600" />
                        Matriklen (`MAT/v2`), Skel, Miljøportal Jordforurening & Beskyttelseslinjer
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                          <p className="text-gray-500">Matrikelnr. & Ejerlav</p>
                          <p className="font-bold text-sm text-gray-900">
                            Matr.nr. {profile.matrikel.matrikelnummer}, {profile.matrikel.ejerlavsnavn} (Kode{" "}
                            {profile.matrikel.ejerlavskode})
                          </p>
                          <p className="text-gray-600 mt-1">
                            Registreret grundareal: <strong>{profile.matrikel.grundarealM2} m²</strong> (Heraf vejareal:{" "}
                            {profile.matrikel.vejarealM2} m²)
                          </p>
                        </div>
                        <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                          <p className="text-gray-500">Jordforurening (V1 / V2) & Fredskov</p>
                          <p className="font-bold text-sm text-emerald-700">{profile.matrikel.jordforureningNote}</p>
                          <p className="text-gray-600 mt-1">
                            Fredskov: {profile.matrikel.fredskovArealM2} m² · Strandbeskyttelse:{" "}
                            {profile.matrikel.strandbeskyttelseArealM2} m²
                          </p>
                        </div>
                      </div>
                      <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                        <p className="font-bold text-gray-900">Skel- & Afstandskontrol (BR18):</p>
                        <p className="text-gray-600 mt-0.5">{profile.matrikel.skelTjek.note}</p>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "plandata" && (
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <FileCheck2 size={16} className="text-blue-600" />
                        Plandata.dk WFS (`Point-in-Polygon`), Byggeret & Udstykningspotentiale
                      </h4>
                      {profile.plandata.lokalplaner.map((lp) => (
                        <div key={lp.plannr} className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm text-gray-900">
                              {lp.plannr}: {lp.plannavn} ({lp.status})
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                              {profile.plandata.zoneStatus}
                            </span>
                          </div>
                          <p className="text-gray-600 mt-1">
                            Anvendelse: {lp.anvendelseGenerel} · Maks. bebyggelsesprocent:{" "}
                            <strong>{lp.maxBebyggelsesprocent}%</strong> · Maks. etager: {lp.maxEtager} · Maks. højde:{" "}
                            {lp.maxHoejdeM} m · Mindste udstykningsstørrelse: {lp.minUdstykningM2} m²
                          </p>
                        </div>
                      ))}
                      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-emerald-950">
                        <p className="font-bold">Salgspotentiale & Udstyknings-analyse:</p>
                        <p className="mt-1">{profile.plandata.udstykningspotentiale.forklaring}</p>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "tingbog" && (
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Scale size={16} className="text-purple-600" />
                        Tingbogen, Hæftelser, Friværdi & Servitut-screening
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                          <p className="text-gray-500">Seneste Tinglyste Handel (EJF)</p>
                          <p className="font-bold text-sm text-gray-900">
                            {profile.tingbog.senesteHandelsprisDkk?.toLocaleString("da-DK")} kr.
                          </p>
                          <p className="text-gray-500 mt-0.5">Dato: {profile.tingbog.senesteHandelsdato}</p>
                        </div>
                        <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                          <p className="text-gray-500">Offentlig Vurdering (VUR)</p>
                          <p className="font-bold text-sm text-gray-900">
                            {profile.tingbog.offentligEjendomsvurderingDkk.toLocaleString("da-DK")} kr.
                          </p>
                          <p className="text-gray-500 mt-0.5">
                            Grundværdi: {profile.tingbog.offentligGrundvaerdiDkk.toLocaleString("da-DK")} kr.
                          </p>
                        </div>
                        <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                          <p className="text-gray-500">Estimeret Friværdi før Salg</p>
                          <p className="font-bold text-sm text-emerald-700">
                            {profile.tingbog.estimeretFrivaerdiDkk.toLocaleString("da-DK")} kr.
                          </p>
                          <p className="text-gray-500 mt-0.5">Upload Tingbogsattest PDF nedenfor for eksakte pantebreve</p>
                        </div>
                      </div>
                      <div className="bg-white p-3.5 rounded-lg border border-gray-200">
                        <p className="font-bold text-gray-900 mb-1.5">Tinglyste Servitutter & Byrder (Overblik):</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {profile.tingbog.servitutOverblik.vigtigeServitutter.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {activeRegistryTab === "cvr" && (
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-gray-900">
                        CVR-Registret (Erhverv på boligadressen & Tegningsregler ved Selskabssalg)
                      </h4>
                      {profile.cvr.virksomheder.length > 0 ? (
                        profile.cvr.virksomheder.map((v) => (
                          <div key={v.cvrNummer} className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                            <p className="font-bold text-sm text-amber-900">
                              {v.navn} (CVR: {v.cvrNummer}) – {v.status}
                            </p>
                            <p className="text-amber-800 mt-1">
                              Branche: {v.branche} · Virksomhedsform: {v.virksomhedsform}
                            </p>
                            <p className="text-gray-700 mt-2">
                              <strong>Tegningsregel:</strong> {v.tegningsregel}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="bg-white p-4 rounded-lg border border-gray-200">
                          <p className="font-semibold text-green-700">
                            ✓ Ingen aktive CVR-virksomheder registreret på {profile.adresse}
                          </p>
                          <p className="text-gray-600 mt-1">{profile.cvr.selskabsSalgTjek.tegningsregelTekst}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeRegistryTab === "buyers" && (
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Users size={16} className="text-amber-600" />
                        Matchende Købere i Vejle Mæglerens Køberkartotek (`aiBbrEngine` match)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {profile.vejleFakta.matchendeKoebereIKartotek.map((b) => (
                          <div key={b.id} className="bg-white p-4 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-gray-900">
                                {b.id}: {b.navn}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">
                                {b.matchScorePct}% Match
                              </span>
                            </div>
                            <p className="text-gray-500 mb-2">
                              Maks. købsbudget: <strong>{b.maxBudgetDkk.toLocaleString("da-DK")} kr.</strong>
                            </p>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {b.matchedeKravBadges.map((badge, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-medium"
                                >
                                  ✓ {badge}
                                </span>
                              ))}
                            </div>
                            <p className="text-gray-600 italic">{b.mæglerNote}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* UPLOAD DOKUMENTER BOKS */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
                      <ShieldCheck size={20} className="text-blue-600" />
                      Upload Tingbogsattest, Byggesagsarkiv (PDF) eller Tegninger
                    </h3>
                    <p className="text-blue-800/70 text-sm">
                      Bolighandel-GPT krydsreviderer dine uploadede PDF&apos;er mod de 5 registre ovenfor og udarbejder
                      komplet 7-trins rapport + Afsnit 11.
                    </p>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    className="hidden"
                    accept="application/pdf,image/*"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <span className="animate-pulse">Analyserer...</span>
                    ) : (
                      <>
                        <Upload size={18} />
                        Upload filer
                      </>
                    )}
                  </button>
                </div>

                {analysisResult && (
                  <div className="mt-8 border-t border-gray-100 pt-8">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <ShieldCheck className="text-green-500" />
                      Bolighandel-GPT: 7-Trins Juridisk Krydsrevisionsrapport
                    </h3>
                    <div className="prose prose-sm max-w-none text-gray-800 bg-gray-50 p-6 rounded-xl border border-gray-200">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{analysisResult}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN (1/3 width) */}
            <div className="space-y-6">
              {/* UDVIDET BBR DATA CARD */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-lg">Ejendomsdata (BBR v3)</h3>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                    BFE: {profile.bbr.bfeNummer}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm border-b border-gray-100 pb-5 mb-5">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">BBR registreret tag:</p>
                    <p className="font-semibold text-gray-900">{profile.bbr.tagmateriale}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Opførelsesår / Ombygget:</p>
                    <p className="font-semibold text-gray-900">
                      {profile.bbr.opfoerelsesaar}
                      {profile.bbr.ombygningsaar ? ` / ${profile.bbr.ombygningsaar}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Boligareal (`byg039`):</p>
                    <p className="font-semibold text-gray-900">{profile.bbr.boligarealM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Bebygget areal (Total):</p>
                    <p className="font-semibold text-gray-900">{profile.bbr.bebyggetArealTotalM2} m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Ydervægsmateriale:</p>
                    <p className="font-semibold text-gray-900">{profile.bbr.ydervaegsmateriale}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Varmeinstallation:</p>
                    <p className="font-semibold text-gray-900">{profile.bbr.varmeinstallation}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Værelser / Badeværelser:</p>
                    <p className="font-semibold text-gray-900">
                      {profile.bbr.antalVaerelser} vær. / {profile.bbr.antalBadevaerelser} bad
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Grundareal (`MAT`):</p>
                    <p className="font-semibold text-gray-900">{profile.matrikel.grundarealM2} m²</p>
                  </div>
                </div>

                {/* Skjulte BBR-tabeller resumé */}
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">
                      🛢️ BBR TekniskAnlaeg (Olietank):
                    </span>
                    <span className="text-gray-600">
                      {profile.bbr.tekniskeAnlaeg[0]?.typeNavn} ({profile.bbr.tekniskeAnlaeg[0]?.driftStatus})
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">
                      🏗️ BBR Byggesager ({profile.bbr.byggesager.length} stk.):
                    </span>
                    <span className="text-gray-600">
                      {profile.bbr.byggesager.some((b) => b.erAaben)
                        ? "⚠️ 1 åben byggesag mangler ibrugtagningstilladelse"
                        : "Alle byggesager afsluttede"}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">
                      💧 BBR Grund (Kloakforhold):
                    </span>
                    <span className="text-gray-600">{profile.bbr.grund.kloakforholdTekst}</span>
                  </div>
                </div>
              </div>

              {/* ACTION CARD (SEND TIL SÆLGER & EKSPORTÉR PDF) */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-2">Handling & Sælgerskema</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Systemet har automatisk tilføjet{" "}
                  <strong>{profile.krydsrevision.dynamiskeSaelgerSpoergsmaal.length} AI-kontrolspørgsmål</strong> til
                  sælgeren baseret på BBR, olietank, byggesager og 3D-luftfoto.
                </p>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder="Sælgers navn"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors"
                    />
                    <input
                      type="email"
                      placeholder="Sælgers e-mailadresse"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <a
                      href={`/seller/${caseId}`}
                      className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
                    >
                      <Eye size={16} />
                      Preview Skema
                    </a>
                    <button
                      onClick={handleSendSellerLink}
                      className="flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm"
                    >
                      <Mail size={16} />
                      Send link
                    </button>
                  </div>

                  {mailStatus && (
                    <div
                      className={`p-3 rounded-xl text-xs border ${
                        mailStatus.sent
                          ? "bg-green-50 border-green-200 text-green-800"
                          : "bg-red-50 border-red-200 text-red-800"
                      }`}
                    >
                      {mailStatus.sent ? (
                        <div>
                          <p className="font-semibold">✓ Sælgerskema er klargjort og sendt!</p>
                          {mailStatus.url && (
                            <a href={mailStatus.url} className="underline font-medium mt-1 inline-block">
                              Åbn sælgerlink ({mailStatus.url}) →
                            </a>
                          )}
                        </div>
                      ) : (
                        <p>{mailStatus.error}</p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => window.print()}
                    className="w-full mt-2 flex items-center justify-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
                  >
                    <FileDown size={16} />
                    Download / Print Sags- & Afsnit 11 PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
