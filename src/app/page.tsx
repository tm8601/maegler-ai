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
  EyeOff,
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
  Send,
  Paperclip,
  UserCheck,
  Briefcase,
  Sparkles,
  Radio,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Plus,
  RefreshCw,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import type {
  PropertyFullProfile,
  RenovationLevelKey,
  AutoDocumentItem,
} from "@/lib/property-aggregator";
import type {
  AgentUser,
  SellerCaseRecord,
  CaseWorkflowStatus,
  CaseDocumentCheckItem,
  FloorplanCalculation,
} from "@/lib/case-store";

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
  file?: File;
  name: string;
  sizeKb: number;
  type: "document" | "photo";
  uploadedAt: string;
  objectUrl?: string;
  matchedReminderId?: string | null;
}

type SkraafotoOrientation = "south" | "west" | "north" | "east";

const ORIENTATION_ORDER: SkraafotoOrientation[] = ["south", "west", "north", "east"];
const ORIENTATION_LABELS: Record<SkraafotoOrientation, string> = {
  south: "Syd",
  west: "Vest",
  north: "Nord",
  east: "Øst",
};

const WORKFLOW_STATUS_LABELS: Record<
  CaseWorkflowStatus,
  { label: string; badgeClass: string }
> = {
  opstart: {
    label: "Opstart",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  afventer_dokumenter: {
    label: "Afventer dokumenter",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  under_gennemgang: {
    label: "Under gennemgang",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
  },
  klar_til_salg: {
    label: "Klar til salg",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
};

export default function Home() {
  // Mægler Login & Sagsliste state
  const [currentAgent, setCurrentAgent] = useState<AgentUser>({
    id: "agent-tobias",
    email: "tobias@vejlemaegleren.dk",
    name: "Tobias Meng",
    role: "Indehaver · Vejle Mægleren",
    initials: "TM",
    phone: "+45 75 82 00 00",
  });
  const [availableAgents, setAvailableAgents] = useState<AgentUser[]>([]);
  const [agentCases, setAgentCases] = useState<SellerCaseRecord[]>([]);
  const [loginEmail, setLoginEmail] = useState("tobias@vejlemaegleren.dk");
  const [loginPassword, setLoginPassword] = useState("vejle2026");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Diskret Live Cost state
  const [liveCostDkk, setLiveCostDkk] = useState<number>(0);

  // Adresse & Ejendomsprofil state
  const [address, setAddress] = useState("H C Hansens Vej 29, 7100 Vejle");
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<PropertyFullProfile | null>(null);
  const [activeCase, setActiveCase] = useState<SellerCaseRecord | null>(null);
  const [caseId, setCaseId] = useState<string>("default");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Kun de 3 renoveringsniveauer i Vurderingsberegneren (Projekt 15 motor)
  const [renovationLevel, setRenovationLevel] = useState<RenovationLevelKey>("mellemrenoveret");

  // Skråfoto & Luftfoto state
  const [visualMode, setVisualMode] = useState<"skraafoto" | "ortofoto" | "streetview">("skraafoto");
  const [skraafotoOrientation, setSkraafotoOrientation] = useState<SkraafotoOrientation>("south");
  const [skraafotoLightbox, setSkraafotoLightbox] = useState(false);

  // Dokumentrum & Upload state
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // Plantegnings- & Arealberegner state (LxB med 10 cm indervæg & 35 cm ydervæg mod BBR ±15 %)
  const [fpLengthM, setFpLengthM] = useState<string>("10.4");
  const [fpWidthM, setFpWidthM] = useState<string>("6.7");
  const [fpInnerWalls, setFpInnerWalls] = useState<string>("5");
  const [isSavingFloorplan, setIsSavingFloorplan] = useState(false);

  // Ny Afsnit 11-klausul input
  const [newClauseInput, setNewClauseInput] = useState("");

  // Mægler-til-AI Sagsassistent state
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantFiles, setAssistantFiles] = useState<File[]>([]);
  const [isSendingToAi, setIsSendingToAi] = useState(false);
  const lastCompositionEndRef = useRef<number | null>(null);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const assistantFileInputRef = useRef<HTMLInputElement>(null);
  const docRoomDialogRef = useRef<HTMLDialogElement>(null);
  const buyerDialogRef = useRef<HTMLDialogElement>(null);
  const loginDialogRef = useRef<HTMLDialogElement>(null);
  const sessionFileCacheRef = useRef<Map<string, UploadedDocItem>>(new Map());
  const [previewAutoDoc, setPreviewAutoDoc] = useState<AutoDocumentItem | null>(null);

  // Sælgerskema & klausul state
  const [sellerName, setSellerName] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [mailStatus, setMailStatus] = useState<{ sent: boolean; url?: string; error?: string } | null>(null);
  const [copiedClauseId, setCopiedClauseId] = useState<string | null>(null);

  // Light-dismiss fallback til <dialog> på browsere uden native closedby="any"
  useEffect(() => {
    const dialogs = [docRoomDialogRef.current, buyerDialogRef.current, loginDialogRef.current].filter(
      Boolean
    ) as HTMLDialogElement[];
    if (typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
      const handler = (event: MouseEvent) => {
        const dialog = event.currentTarget as HTMLDialogElement;
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialogs.forEach((d) => d.addEventListener("click", handler));
      return () => dialogs.forEach((d) => d.removeEventListener("click", handler));
    }
  }, []);

  // Synkronisér aktiv sag til lokal UI-state
  const syncCaseToState = (record: SellerCaseRecord, prof?: PropertyFullProfile) => {
    setActiveCase(record);
    setCaseId(record.id);
    if (record.renovationLevel) {
      setRenovationLevel(record.renovationLevel);
    }
    setSellerName(record.sellerName || "");
    setSellerEmail(record.sellerEmail || "");
    if (record.analysisReport !== undefined) {
      setAnalysisResult(record.analysisReport);
    }
    const targetProf = prof || record.profileSnapshot;
    if (targetProf) {
      setProfile(targetProf);
    }

    // Opdatér plantegnings-felter fra sagen eller ud fra BBR-standardmål
    if (record.floorplanCheck) {
      setFpLengthM(String(record.floorplanCheck.indvendigLaengdeM));
      setFpWidthM(String(record.floorplanCheck.indvendigBreddeM));
      setFpInnerWalls(String(record.floorplanCheck.antalIndervaegge || 5));
    } else if (targetProf?.bbr?.boligarealM2) {
      const estNetto = Math.max(25, targetProf.bbr.boligarealM2 * 0.8);
      const l = Number(Math.sqrt(estNetto * 1.45).toFixed(1));
      const b = Number((estNetto / l).toFixed(1));
      setFpLengthM(String(l));
      setFpWidthM(String(b));
      setFpInnerWalls("5");
    }

    // Flet gemte dokument-metadata med lokalt uploadede filer + server-side fil-URL
    setUploadedDocs((prev) => {
      prev.forEach((p) => {
        if (p.objectUrl || p.file) {
          sessionFileCacheRef.current.set(`${record.id}:${p.name}`, p);
          sessionFileCacheRef.current.set(p.name, p);
        }
      });
      const byName = new Map(prev.map((p) => [p.name, p]));
      const merged: UploadedDocItem[] = [];
      for (const meta of record.uploadedDocMeta || []) {
        const serverUrl = `${getApiBaseUrl()}/sags-api/files?caseId=${encodeURIComponent(
          record.id
        )}&fileId=${encodeURIComponent(meta.id)}`;
        const existingLocal =
          byName.get(meta.name) ||
          sessionFileCacheRef.current.get(`${record.id}:${meta.name}`) ||
          sessionFileCacheRef.current.get(meta.name);
        if (existingLocal) {
          merged.push({
            ...existingLocal,
            id: meta.id,
            objectUrl: existingLocal.objectUrl || serverUrl,
            matchedReminderId: meta.matchedReminderId,
          });
        } else {
          merged.push({
            id: meta.id,
            name: meta.name,
            sizeKb: meta.sizeKb,
            type: meta.type,
            uploadedAt: meta.uploadedAt,
            objectUrl: serverUrl,
            matchedReminderId: meta.matchedReminderId,
          });
        }
      }
      return merged;
    });
  };

  const loadPropertyProfile = async (
    addrText: string,
    opts?: { id?: string; lat?: number; lon?: number; agent?: AgentUser }
  ) => {
    setIsLoadingProfile(true);
    const activeUser = opts?.agent || currentAgent;
    try {
      const params = new URLSearchParams({
        q: addrText,
        agentEmail: activeUser.email,
        agentName: activeUser.name,
      });
      if (opts?.id) params.set("id", opts.id);
      if (opts?.lat) params.set("lat", String(opts.lat));
      if (opts?.lon) params.set("lon", String(opts.lon));

      const res = await fetch(`${getApiBaseUrl()}/sags-api/property?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.profile) setProfile(data.profile);
        if (data.sellerCase) {
          syncCaseToState(data.sellerCase, data.profile);
        }
        if (Array.isArray(data.agentCases)) {
          setAgentCases(data.agentCases);
        }
        if (data.budget && typeof data.budget.spentDkk === "number") {
          setLiveCostDkk(data.budget.spentDkk);
        }
      }
    } catch (e) {
      console.error("Failed to load property profile:", e);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Hent gemt mægler-login og første sag ved opstart
  useEffect(() => {
    let initialAgent = currentAgent;
    try {
      const savedUser = localStorage.getItem("vejle_maegler_user");
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.email) {
          initialAgent = parsed;
          setCurrentAgent(parsed);
          setLoginEmail(parsed.email);
        }
      }
    } catch {
      // Ignore
    }

    fetch(`${getApiBaseUrl()}/sags-api/auth`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.agents)) setAvailableAgents(d.agents);
      })
      .catch(() => {});

    loadPropertyProfile("H C Hansens Vej 29, 7100 Vejle", { agent: initialAgent });
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
        const res = await fetch(`${getApiBaseUrl()}/sags-api/dawa?q=${encodeURIComponent(address)}`);
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
    loadPropertyProfile(suggestion.tekst, {
      id: suggestion.adresse?.id,
      lat: suggestion.adresse?.lat,
      lon: suggestion.adresse?.lon,
    });
  };

  // Skift mellem gemte sager i mæglerens sagsliste (inkl. smart dokument-overvågning uden limbo)
  const handleSelectSavedCase = async (savedCase: SellerCaseRecord, agentOverride?: AgentUser) => {
    const activeUser = agentOverride || currentAgent;
    setAddress(savedCase.address);
    setSelectedAddress(true);
    setVisualMode("skraafoto");
    setSkraafotoOrientation("south");
    setMailStatus(null);
    setIsLoadingProfile(true);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/sags-api/cases?id=${encodeURIComponent(savedCase.id)}&reopen=1`
      );
      if (res.ok) {
        const fullCase: SellerCaseRecord & { agentCases?: SellerCaseRecord[]; budget?: { spentDkk: number } } =
          await res.json();
        if (fullCase.profileSnapshot) {
          syncCaseToState(fullCase, fullCase.profileSnapshot);
          if (Array.isArray(fullCase.agentCases)) {
            setAgentCases(fullCase.agentCases);
          }
          if (fullCase.budget && typeof fullCase.budget.spentDkk === "number") {
            setLiveCostDkk(fullCase.budget.spentDkk);
          }
          setIsLoadingProfile(false);
          return;
        }
      }
      await loadPropertyProfile(savedCase.address, { agent: activeUser });
    } catch {
      await loadPropertyProfile(savedCase.address, { agent: activeUser });
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleDeleteSavedCase = async (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${getApiBaseUrl()}/sags-api/cases?id=${encodeURIComponent(idToDelete)}`, {
        method: "DELETE",
      });
      const remaining = agentCases.filter((c) => c.id !== idToDelete);
      setAgentCases(remaining);
      if (idToDelete === caseId && remaining.length > 0) {
        await handleSelectSavedCase(remaining[0]);
      }
    } catch {
      // Ignore
    }
  };

  const handleAgentLogin = async (e?: React.FormEvent, quickAgent?: AgentUser) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    const targetEmail = quickAgent ? quickAgent.email : loginEmail;
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          password: quickAgent ? "vejle2026" : loginPassword,
          name: quickAgent?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        setLoginError(data.error || "Kunne ikke logge ind");
        return;
      }
      setCurrentAgent(data.user);
      setLoginEmail(data.user.email);
      try {
        localStorage.setItem("vejle_maegler_user", JSON.stringify(data.user));
        if (data.token) localStorage.setItem("vejle_maegler_token", data.token);
      } catch {
        // Ignore
      }
      loginDialogRef.current?.close();

      if (Array.isArray(data.cases)) {
        setAgentCases(data.cases);
        if (data.budget && typeof data.budget.spentDkk === "number") {
          setLiveCostDkk(data.budget.spentDkk);
        }
        if (data.cases.length > 0) {
          await handleSelectSavedCase(data.cases[0], data.user);
          return;
        }
      }
      await loadPropertyProfile(address, { agent: data.user });
    } catch {
      setLoginError("Netværksfejl ved login");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleChangeRenovationLevel = async (lvlKey: RenovationLevelKey) => {
    setRenovationLevel(lvlKey);
    if (!activeCase || !profile) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          renovationLevel: lvlKey,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveCase(updated);
        setAgentCases((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, renovationLevel: lvlKey, valuationDkk: updated.valuationDkk } : c))
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleToggleFlagResolved = async (flagId: string) => {
    if (!activeCase || !profile) return;
    const currentResolved = new Set(activeCase.resolvedFlagIds || []);
    if (currentResolved.has(flagId)) {
      currentResolved.delete(flagId);
    } else {
      currentResolved.add(flagId);
    }
    const nextList = Array.from(currentResolved);
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          resolvedFlagIds: nextList,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveCase(updated);
        setAgentCases((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, workflowStatus: updated.workflowStatus, resolvedFlagIds: nextList } : c))
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleCalculateFloorplan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeCase || !profile) return;
    setIsSavingFloorplan(true);
    try {
      const l = parseFloat(fpLengthM.replace(",", ".")) || 10.4;
      const b = parseFloat(fpWidthM.replace(",", ".")) || 6.7;
      const walls = parseInt(fpInnerWalls, 10) || 5;

      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          floorplanInput: {
            sourceFileName:
              uploadedDocs.find((d) => /plan|tegning/i.test(d.name))?.name ||
              "Plantegningskontrol (L×B)",
            indvendigLaengdeM: l,
            indvendigBreddeM: b,
            antalIndervaegge: walls,
            indervaegTykkelseCm: 10,
            ydervaegTykkelseCm: 35,
            bbrBoligarealM2: profile.bbr.boligarealM2,
          },
        }),
      });
      if (res.ok) {
        const updated: SellerCaseRecord = await res.json();
        syncCaseToState(updated, profile);
      }
    } catch {
      // Ignore
    } finally {
      setIsSavingFloorplan(false);
    }
  };

  const handleAddClauseToAfsnit11 = async (clauseText: string) => {
    const clean = clauseText.trim();
    if (!clean || !activeCase || !profile) return;
    const existingList = activeCase.generatedAfsnit11Clauses || [];
    if (existingList.includes(clean)) return;
    const nextClauses = [clean, ...existingList];
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          generatedAfsnit11Clauses: nextClauses,
        }),
      });
      if (res.ok) {
        const updated: SellerCaseRecord = await res.json();
        setActiveCase(updated);
        setNewClauseInput("");
      }
    } catch {
      // Ignore
    }
  };

  const handleRemoveClauseFromAfsnit11 = async (clauseText: string) => {
    if (!activeCase || !profile) return;
    const nextClauses = (activeCase.generatedAfsnit11Clauses || []).filter((c) => c !== clauseText);
    const nextItems = (activeCase.afsnit11Items || []).filter((i) => i.tekst !== clauseText);
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          generatedAfsnit11Clauses: nextClauses,
          afsnit11Items: nextItems,
        }),
      });
      if (res.ok) {
        const updated: SellerCaseRecord = await res.json();
        setActiveCase(updated);
      }
    } catch {
      // Ignore
    }
  };

  const handleToggleSkipSellerQuestionnaire = async (skip: boolean) => {
    if (!activeCase || !profile) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          skipSellerQuestionnaire: skip,
        }),
      });
      if (res.ok) {
        const updated: SellerCaseRecord = await res.json();
        setActiveCase(updated);
      }
    } catch {
      // Ignore
    }
  };

  const handleToggleQuestionDisabled = async (qId: string) => {
    if (!activeCase || !profile) return;
    const set = new Set(activeCase.disabledQuestionIds || []);
    if (set.has(qId)) {
      set.delete(qId);
    } else {
      set.add(qId);
    }
    const nextDisabled = Array.from(set);
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          disabledQuestionIds: nextDisabled,
        }),
      });
      if (res.ok) {
        const updated: SellerCaseRecord = await res.json();
        setActiveCase(updated);
      }
    } catch {
      // Ignore
    }
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

  const runAnalysis = async (filesToAnalyze: File[]) => {
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("address", profile?.adresse || address);
    formData.append("agentEmail", currentAgent.email);
    formData.append("agentName", currentAgent.name);
    if (caseId) formData.append("caseId", caseId);
    filesToAnalyze.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysisResult(data.analysis);
        if (data.profile) setProfile(data.profile);
        if (data.sellerCase) {
          syncCaseToState(data.sellerCase, data.profile);
          setAgentCases((prev) => {
            const exists = prev.some((c) => c.id === data.sellerCase.id);
            if (!exists) return [data.sellerCase, ...prev];
            return prev.map((c) => (c.id === data.sellerCase.id ? data.sellerCase : c));
          });
        }
        if (data.budget && typeof data.budget.spentDkk === "number") {
          setLiveCostDkk(data.budget.spentDkk);
        }
      }
    } catch (err) {
      console.error(err);
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
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        type: isImage ? "photo" : "document",
        uploadedAt: nowStr,
        objectUrl: URL.createObjectURL(file),
      };
    });

    const updated = [...uploadedDocs, ...newItems];
    newItems.forEach((item) => {
      sessionFileCacheRef.current.set(`${caseId}:${item.name}`, item);
      sessionFileCacheRef.current.set(item.name, item);
    });
    setUploadedDocs(updated);

    // Kør altid aktiv AI-dokument-, billed- og plantegningskontrol (både ved dokumenter OG fotos/plantegninger!)
    const allLocalFiles = updated.filter((d) => d.file).map((d) => d.file!);
    await runAnalysis(allLocalFiles.length > 0 ? allLocalFiles : fileArray);
  };

  // Mægler skriver til Sags-AI (eller vedhæfter ekstra bilag til gennemgang)
  const handleSendToCaseAssistant = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? assistantInput).trim();
    if ((!textToSend && assistantFiles.length === 0) || isSendingToAi) return;

    setIsSendingToAi(true);
    try {
      const formData = new FormData();
      formData.append("caseId", caseId);
      formData.append("address", profile?.adresse || address);
      formData.append("agentEmail", currentAgent.email);
      formData.append("agentName", currentAgent.name);
      formData.append("message", textToSend);
      assistantFiles.forEach((f) => formData.append("files", f));

      if (assistantFiles.length > 0) {
        const nowStr = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
        const localAdds: UploadedDocItem[] = assistantFiles.map((file) => ({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          type: file.type.startsWith("image/") ? "photo" : "document",
          uploadedAt: nowStr,
          objectUrl: URL.createObjectURL(file),
        }));
        setUploadedDocs((prev) => [...prev, ...localAdds]);
      }

      if (!customPrompt) setAssistantInput("");
      setAssistantFiles([]);

      const res = await fetch(`${getApiBaseUrl()}/sags-api/case-assistant`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sellerCase) {
          syncCaseToState(data.sellerCase, profile || undefined);
        }
        if (Array.isArray(data.agentCases)) {
          setAgentCases(data.agentCases);
        }
        if (data.budget && typeof data.budget.spentDkk === "number") {
          setLiveCostDkk(data.budget.spentDkk);
        }
      }
    } catch (e) {
      console.error("Failed to send message to case assistant:", e);
    } finally {
      setIsSendingToAi(false);
    }
  };

  const handleRemoveUploadedItem = async (id: string) => {
    const filtered = uploadedDocs.filter((item) => item.id !== id);
    setUploadedDocs(filtered);
    if (activeCase && profile) {
      const nextChecks = (activeCase.documentChecks || []).filter(
        (chk) => !uploadedDocs.some((u) => u.id === id && u.name === chk.fileName)
      );
      const saveRes = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          uploadedDocMeta: filtered.map((u) => ({
            id: u.id,
            name: u.name,
            sizeKb: u.sizeKb,
            type: u.type,
            uploadedAt: u.uploadedAt,
            matchedReminderId: u.matchedReminderId || null,
          })),
          documentChecks: nextChecks,
        }),
      });
      if (saveRes.ok) {
        const savedRecord: SellerCaseRecord = await saveRes.json();
        setActiveCase(savedRecord);
        setAgentCases((prev) =>
          prev.map((c) => (c.id === savedRecord.id ? { ...c, ...savedRecord, profileSnapshot: undefined } : c))
        );
      }
    }
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
      if (!u.objectUrl) return;
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
    const photos = uploadedDocs.filter((d) => d.type === "photo" && d.objectUrl);
    const docs = uploadedDocs.filter((d) => d.type === "document");
    const activeClauses =
      activeCase?.generatedAfsnit11Clauses && activeCase.generatedAfsnit11Clauses.length > 0
        ? activeCase.generatedAfsnit11Clauses
        : profile.afsnit11Klausuler.map((k) => k.tekst);

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
        BFE-nr.: ${profile.bbr.bfeNummer || "—"} · Matr.nr.: ${profile.matrikel.matrikelnummer || "—"}, ${profile.matrikel.ejerlavsnavn || "—"} · Ansvarlig mægler: ${currentAgent.name} · Dato: ${new Date().toLocaleDateString("da-DK")}
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
  </div>

  <h2>3. Klausuler til Købsaftalens Afsnit 11</h2>
  ${activeClauses.map((txt) => `<div class="clause">"${txt}"</div>`).join("")}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
    }
  };

  const persistSellerInfo = async (nextName?: string, nextEmail?: string) => {
    if (!activeCase || !profile) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase.id,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          sellerName: nextName ?? sellerName,
          sellerEmail: nextEmail ?? sellerEmail,
        }),
      });
      if (res.ok) {
        const updated: SellerCaseRecord = await res.json();
        setActiveCase(updated);
      }
    } catch {
      // Ignore
    }
  };

  const handleSendSellerLink = async () => {
    if (!sellerEmail) {
      alert("Indtast venligst sælgers e-mailadresse");
      return;
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sellerEmail,
          sellerName: sellerName || "Sælger",
          address: profile?.adresse || address,
          caseId,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          aiQuestions: (profile?.saelgerSpoergsmaal || []).filter(
            (q) => !(activeCase?.disabledQuestionIds || []).includes(q.id)
          ),
          generatedAfsnit11Clauses:
            activeCase?.generatedAfsnit11Clauses ||
            profile?.afsnit11Klausuler.map((k) => k.tekst) ||
            [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.caseId) setCaseId(data.caseId);
        if (data.sellerCase) {
          setActiveCase(data.sellerCase);
          setAgentCases((prev) =>
            prev.map((c) => (c.id === data.sellerCase.id ? { ...c, ...data.sellerCase, profileSnapshot: undefined } : c))
          );
        }
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
    if (activeCase?.resolvedReminderIds?.includes(docId)) return true;
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

  const handleToggleReminderResolved = async (remId: string) => {
    if (!activeCase || !profile) return;
    const set = new Set(activeCase.resolvedReminderIds || []);
    if (set.has(remId)) {
      set.delete(remId);
    } else {
      set.add(remId);
    }
    const nextArr = Array.from(set);
    const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activeCase.id,
        agentEmail: currentAgent.email,
        agentName: currentAgent.name,
        address: profile.adresse,
        resolvedReminderIds: nextArr,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActiveCase(updated);
      setAgentCases((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, workflowStatus: updated.workflowStatus, resolvedReminderIds: nextArr } : c))
      );
    }
  };

  const activeValuation = profile?.vurdering.niveauer[renovationLevel] || null;
  const uploadedPhotos = uploadedDocs.filter((d) => d.type === "photo");
  const totalDocumentsInRoom = (profile?.automatiskeDokumenter.length || 0) + uploadedDocs.length;

  const exactMatchingBuyers = (profile?.koeberkartotek.matchendeKoebere || []).filter((buyer) => {
    if (!activeValuation?.estimatDkk) return true;
    return activeValuation.estimatDkk <= buyer.maksBudgetDkk;
  });

  const resolvedFlagsSet = new Set(activeCase?.resolvedFlagIds || []);
  const activeClausesList =
    activeCase?.generatedAfsnit11Clauses && activeCase.generatedAfsnit11Clauses.length > 0
      ? activeCase.generatedAfsnit11Clauses
      : profile?.afsnit11Klausuler.map((k) => k.tekst) || [];

  const structuredAfsnit11 =
    activeCase?.afsnit11Items && activeCase.afsnit11Items.length > 0
      ? activeCase.afsnit11Items
      : activeClausesList.map((txt, idx) => ({
          id: `cl-${idx}`,
          titel: "Forbehold til Købsaftalens Afsnit 11",
          kilde: "BBR / Registerkontrol",
          tekst: txt,
          prioritet: "anbefalet" as const,
          godkendtAfMaegler: true,
        }));

  const documentChecks: CaseDocumentCheckItem[] = activeCase?.documentChecks || [];
  const floorplanCheck: FloorplanCalculation | null = activeCase?.floorplanCheck || null;

  // Live LxB forhåndsberegning i UI (10 cm indervægge, 35 cm ydervægge mod BBR ±15 %)
  const liveBbrM2 = profile?.bbr?.boligarealM2 || 88;
  const liveLm = parseFloat(fpLengthM.replace(",", ".")) || 10.4;
  const liveBm = parseFloat(fpWidthM.replace(",", ".")) || 6.7;
  const liveWalls = parseInt(fpInnerWalls, 10) || 5;
  const liveNettoM2 = Number((liveLm * liveBm).toFixed(1));
  const liveInnerWallAddM2 = Number((liveWalls * Math.max(2.5, liveBm * 0.65) * 0.1).toFixed(1));
  const liveOuterWallAddM2 = Number((2 * (liveLm + liveBm) * 0.35 + 4 * 0.35 * 0.35).toFixed(1));
  const liveBruttoM2 = Math.round(liveNettoM2 + liveInnerWallAddM2 + liveOuterWallAddM2);
  const liveDiffM2 = liveBruttoM2 - liveBbrM2;
  const liveDiffPct = Number(((liveDiffM2 / Math.max(1, liveBbrM2)) * 100).toFixed(1));
  const liveWithin15Pct = Math.abs(liveDiffPct) <= 15.0;

  // Opmærksomhedspunkter (Alt hvad mægler SKAL være opmærksom på øverst)
  const unresolvedRegisterFlags = (profile?.roedeFlag || []).filter((f) => !resolvedFlagsSet.has(f.id));
  const attentionDocChecks = documentChecks.filter((d) => d.status !== "ok");
  const missingCoreDocs = (profile?.paamindelseDokumenter || []).filter((r) => !isReminderDocUploaded(r.id));

  // Kontrollerede og godkendte punkter (Nederst – mægler behøver ikke foretage sig mere)
  const verifiedItemsBottom: Array<{ label: string; detail: string; source: string }> = [];
  if (profile) {
    verifiedItemsBottom.push({
      label: "BBR Hovedbygning & Klimaskærm",
      detail: `${profile.bbr.boligarealM2} m² bolig · Opført ${profile.bbr.opfoerelsesaar ?? "—"} · ${profile.bbr.tagmaterialeTekst} · ${profile.bbr.ydervaegTekst}`,
      source: "BBR/v3",
    });
    if (profile.bbr.tekniskeAnlaeg.length === 0) {
      verifiedItemsBottom.push({
        label: "Olietanke & Tekniske Anlæg",
        detail: "Ingen aktive eller uafklarede olietanke registreret i BBR_TekniskAnlaeg",
        source: "BBR_TekniskAnlaeg",
      });
    }
    if (profile.bbr.byggesager.filter((b) => b.erAabenUdenIbrugtagning).length === 0) {
      verifiedItemsBottom.push({
        label: "Åbne Byggesager i BBR",
        detail: "Ingen uafsluttede byggesager registreret i BBR_Byggesag",
        source: "BBR_Byggesag",
      });
    }
    verifiedItemsBottom.push({
      label: "Matrikel & Skel",
      detail: `Matr.nr. ${profile.matrikel.matrikelnummer} (${profile.matrikel.ejerlavsnavn}) · ${profile.matrikel.registreretArealM2} m² grundareal`,
      source: "MAT/v2",
    });
    if (profile.matrikel.fredskovArealM2 === 0 && profile.matrikel.strandbeskyttelseArealM2 === 0) {
      verifiedItemsBottom.push({
        label: "Fredskov & Strandbeskyttelse",
        detail: "0 m² fredskov · 0 m² strandbeskyttelseslinje · 0 m² klitfredning",
        source: "MAT/v2",
      });
    }
    if (!profile.matrikel.jordforureningStatus.toLowerCase().includes("v1") || profile.matrikel.jordforureningStatus.toLowerCase().includes("ingen")) {
      verifiedItemsBottom.push({
        label: "Jordforurening (V1 / V2)",
        detail: profile.matrikel.jordforureningStatus || "Ingen registreret V1/V2 jordforurening på matriklen",
        source: "Miljø / MAT",
      });
    }
    if (profile.plandata.faktiskBebyggelsesprocent <= profile.plandata.tilladtBebyggelsesprocent) {
      verifiedItemsBottom.push({
        label: "Bebyggelsesprocent & Zonestatus",
        detail: `${profile.plandata.faktiskBebyggelsesprocent}% udnyttet (maks. ${profile.plandata.tilladtBebyggelsesprocent}%) · ${profile.plandata.zonestatus}`,
        source: "Plandata.dk",
      });
    }
    if (profile.cvr.registreredeVirksomheder.length === 0) {
      verifiedItemsBottom.push({
        label: "CVR & Erhverv på adressen",
        detail: "Ingen aktive selskaber eller erhvervslejemål registreret på adressen",
        source: "CVR",
      });
    }
    if (liveWithin15Pct) {
      verifiedItemsBottom.push({
        label: "Plantegnings-tolerance (±15 % mod BBR)",
        detail: `Beregnet brutto ${liveBruttoM2} m² (inkl. 10 cm indervæg / 35 cm ydervæg) mod BBR ${liveBbrM2} m² (${liveDiffPct > 0 ? "+" : ""}${liveDiffPct} %)`,
        source: "Plantegning L×B",
      });
    }
    for (const rf of profile.roedeFlag.filter((f) => resolvedFlagsSet.has(f.id))) {
      verifiedItemsBottom.push({
        label: `Afklaret af mægler: ${rf.title}`,
        detail: rf.description,
        source: rf.register,
      });
    }
    for (const dc of documentChecks.filter((d) => d.status === "ok")) {
      verifiedItemsBottom.push({
        label: `Tjekket uden anmærkninger: ${dc.fileName}`,
        detail: dc.fundOverskrift,
        source: dc.kategori,
      });
    }
  }

  const workflowMeta =
    WORKFLOW_STATUS_LABELS[activeCase?.workflowStatus || "afventer_dokumenter"];

  return (
    <div className="min-h-screen bg-[#f8fafc] py-4 px-4 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* TOPBAR MED MÆGLER-LOGIN & DISKRET LIVE-INDIKATOR */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl px-5 py-3 border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs tracking-tight">
              VM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-slate-900 leading-tight">Vejle Mægleren</h1>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200/70 text-[10px] font-medium text-slate-500"
                  aria-label="Live status"
                >
                  <Radio size={10} className="text-amber-500 animate-pulse" />
                  <span>{liveCostDkk.toFixed(2).replace(".", ",")} kr.</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Ejendomsdata · Dokument- & Billedkontrol · Afsnit 11
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loginDialogRef.current?.showModal()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                {currentAgent.initials}
              </span>
              <span className="font-semibold">{currentAgent.name}</span>
              <span className="text-[10px] text-slate-400">Skift</span>
            </button>

            <button
              type="button"
              onClick={openBuyerModal}
              disabled={!profile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <Users size={14} className="text-slate-600" />
              <span>Køberkartotek</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">
                {exactMatchingBuyers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={openDocumentRoom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <FolderOpen size={14} className="text-blue-600" />
              <span>Dokumentrum</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
                {totalDocumentsInRoom}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadValuationDocument}
              disabled={!profile}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <FileDown size={14} />
              <span>Download Vurderingsdokument</span>
            </button>
          </div>
        </header>

        {/* MINE SAGER + ADRESSEOPSLAG KOMPAKT SAMLET */}
        <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Briefcase size={13} className="text-slate-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Mine Sager · {currentAgent.name} ({agentCases.length})
              </span>
            </div>
            {isLoadingProfile || isSearching ? (
              <span className="text-xs text-blue-600 font-medium animate-pulse">
                Henter BBR, Matrikel, Plandata & Skråfoto...
              </span>
            ) : (
              selectedAddress &&
              profile && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 size={13} />
                  BFE {profile.bbr.bfeNummer} · Matr. {profile.matrikel.matrikelnummer} ({profile.matrikel.ejerlavsnavn})
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {agentCases.map((c) => {
              const isCurrent = c.id === caseId || c.address === profile?.adresse;
              const wf = WORKFLOW_STATUS_LABELS[c.workflowStatus || "afventer_dokumenter"];
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectSavedCase(c)}
                  className={`group flex-shrink-0 rounded-xl px-3 py-1.5 border transition-all cursor-pointer min-w-[215px] max-w-[255px] ${
                    isCurrent
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs truncate">{c.address.split(",")[0]}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          isCurrent ? "bg-white/15 text-white border-white/20" : wf.badgeClass
                        }`}
                      >
                        {wf.label}
                      </span>
                      {agentCases.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSavedCase(c.id, e)}
                          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity cursor-pointer ${
                            isCurrent ? "text-slate-300 hover:text-white" : "text-slate-400 hover:text-red-600"
                          }`}
                          title="Fjern sag fra listen"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className={`flex items-center justify-between text-[10px] mt-0.5 ${
                      isCurrent ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    <span>
                      {c.boligarealM2 || "—"} m² · {c.grundarealM2 || "—"} m²
                    </span>
                    <span className="font-semibold">
                      {c.valuationDkk ? `${(c.valuationDkk / 1e6).toFixed(2).replace(".", ",")} mio.` : ""}
                    </span>
                  </div>
                </div>
              );
            })}

            {[
              "H C Hansens Vej 29, 7100 Vejle",
              "Kløvertoften 38, 7100 Vejle",
              "Ibæk Strandvej 112, 7100 Vejle",
            ]
              .filter((sample) => !agentCases.some((c) => c.address.toLowerCase().includes(sample.split(",")[0].toLowerCase())))
              .map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() =>
                    handleSelectAddress({
                      tekst: sample,
                      adresse: { id: "", href: "" },
                    })
                  }
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 text-left text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  <span className="block font-semibold text-[11px]">+ {sample.split(",")[0]}</span>
                  <span className="text-[10px] text-slate-400">Åbn som ny sag</span>
                </button>
              ))}
          </div>

          <div className="relative" ref={wrapperRef}>
            <div className="flex items-center border border-slate-200 rounded-xl px-3.5 py-2 bg-slate-50/50 focus-within:bg-white focus-within:border-slate-900 transition-all">
              <Search className="text-slate-400 mr-2.5 flex-shrink-0" size={16} />
              <label htmlFor="property-address-search" className="sr-only">
                Slå adresse op
              </label>
              <input
                id="property-address-search"
                name="address-search"
                type="text"
                autoComplete="street-address"
                spellCheck={false}
                enterKeyHint="search"
                className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-900 placeholder:text-slate-400"
                placeholder="Indtast adresse, f.eks. H C Hansens Vej 29, 7100 Vejle..."
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && address.trim()) {
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
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors text-slate-800 text-xs cursor-pointer"
                    onClick={() => handleSelectAddress(suggestion)}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <MapPin size={15} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate font-medium">{suggestion.tekst}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">Åbn sag →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* SKRÅFOTO / LUFTFOTO (2/3) + BBR EJENDOMSDATA (1/3) */}
        {selectedAddress && profile && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            <div className="md:col-span-2">
              <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs h-[370px] relative group">
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
                            active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
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
                        visualMode === "ortofoto" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Luftfoto
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualMode("streetview")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        visualMode === "streetview" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
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

                <div className="relative w-full h-full bg-slate-900 overflow-hidden">
                  {visualMode === "skraafoto" && (
                    <>
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

                      <div className="absolute inset-y-0 left-3 flex items-center z-20 pointer-events-none">
                        <button
                          type="button"
                          onClick={handlePrevOrientation}
                          title="Forrige vinkel"
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/90 hover:bg-white backdrop-blur-sm shadow-lg border border-slate-200 text-slate-800 hover:scale-105 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                        >
                          <ChevronLeft size={18} />
                        </button>
                      </div>
                      <div className="absolute inset-y-0 right-3 flex items-center z-20 pointer-events-none">
                        <button
                          type="button"
                          onClick={handleNextOrientation}
                          title="Næste vinkel"
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/90 hover:bg-white backdrop-blur-sm shadow-lg border border-slate-200 text-slate-800 hover:scale-105 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                        >
                          <ChevronRight size={18} />
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

            <div className="md:col-span-1">
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs h-[370px] flex flex-col">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 flex-shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Ejendomsdata (BBR & Matrikel)</h2>
                    <p className="text-[11px] text-slate-500">
                      {profile.bbr.boligtype} · {profile.matrikel.ejerlavsnavn || "Vejle Kommune"}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    BFE {profile.bbr.bfeNummer}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 text-xs overflow-y-auto pr-1">
                  <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                    <span className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                      BBR Tag & Ydervæg:
                    </span>
                    <span className="font-semibold text-xs text-slate-900">
                      {profile.bbr.tagmaterialeTekst} · {profile.bbr.ydervaegTekst}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Boligareal / Plan:</span>
                      <span className="font-bold text-slate-900">
                        {profile.bbr.boligarealM2} m² ({profile.bbr.antalEtager} plan)
                      </span>
                    </div>
                    <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Bebygget (Hus / Total):</span>
                      <span className="font-bold text-slate-900">
                        {profile.bbr.bebyggetArealHovedbygningM2} / {profile.bbr.samletBebyggetArealM2} m²
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">
                        Grund (Matr. {profile.matrikel.matrikelnummer}):
                      </span>
                      <span className="font-bold text-slate-900">{profile.matrikel.registreretArealM2} m²</span>
                    </div>
                    <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Opført / Ombygget:</span>
                      <span className="font-bold text-slate-900">
                        {profile.bbr.opfoerelsesaar ?? "—"}
                        {profile.bbr.ombygningsaar ? ` / ${profile.bbr.ombygningsaar}` : " (Original)"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Værelser / Bad / Toilet:</span>
                      <span className="font-bold text-slate-900">
                        {profile.bbr.antalVaerelser ?? "—"} vær · {profile.bbr.antalBadevaerelser ?? "—"} bad
                      </span>
                    </div>
                    <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Bebyggelsesprocent:</span>
                      <span className="font-bold text-slate-900">
                        {profile.plandata.faktiskBebyggelsesprocent}% (maks {profile.plandata.tilladtBebyggelsesprocent}%)
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block text-[10px]">Varme & Afløb (BBR):</span>
                    <span className="font-semibold text-slate-900">
                      {profile.bbr.varmeinstallationTekst} · {profile.bbr.aflobsforholdTekst}
                    </span>
                  </div>

                  <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block text-[10px]">Sekundære bygninger & Plandata:</span>
                    <span className="font-semibold text-slate-900">
                      {profile.bbr.sekundaereBygninger.length > 0
                        ? profile.bbr.sekundaereBygninger
                            .map((s) => `${s.typeTekst} (${s.arealM2} m²)`)
                            .join(", ")
                        : "Ingen sekundære bygninger"}{" "}
                      · {profile.plandata.zonestatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 1. OVERSIGT OVER DET MÆGLER SKAL VÆRE OPMÆRKSOM PÅ (FREMTRÆDENDE ØVERST) */}
        {selectedAddress && profile && (
          <section className="bg-white rounded-2xl p-4 border-2 border-amber-300/90 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                  <AlertTriangle size={14} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Mæglerens Opmærksomhedspunkter (Kræver opmærksomhed / afklaring)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Her samles kun forhold der kræver din stillingtagen, dokumentation eller Afsnit 11-forbehold. Når et punkt markeres som afklaret, flyttes det ned i den grønne oversigt nederst.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                {unresolvedRegisterFlags.length +
                  attentionDocChecks.length +
                  (!liveWithin15Pct ? 1 : 0) +
                  missingCoreDocs.length}{" "}
                aktive punkter
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* A. Plantegnings-afvigelse hvis > 15 % */}
              {!liveWithin15Pct && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50/60 flex flex-col justify-between gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                        KRITISK · PLANTEGNING L×B (&gt; 15 %)
                      </span>
                      <span className="text-[11px] font-bold text-red-700">
                        {liveDiffPct > 0 ? `+${liveDiffPct}` : liveDiffPct} % afvigelse
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 mt-1">
                      Plantegning ({liveBruttoM2} m² brutto) afviger mere end 15 % fra BBR ({liveBbrM2} m²)
                    </h3>
                    <p className="text-[11px] text-slate-700 mt-0.5">
                      Indvendige mål ({liveLm} × {liveBm} m = {liveNettoM2} m²) + 10 cm indervægge ({liveInnerWallAddM2} m²) + 35 cm ydervægge ({liveOuterWallAddM2} m²) giver {liveBruttoM2} m² mod BBR {liveBbrM2} m².
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleAddClauseToAfsnit11(
                          `Ved kontrolopmåling af plantegning (indvendige mål ${liveLm} × ${liveBm} m korrigeret for 10 cm indervægge og 35 cm ydervægge) er det beregnede bruttoareal opgjort til ca. ${liveBruttoM2} m² mod det i BBR registrerede boligareal på ${liveBbrM2} m² (afvigelse på ${liveDiffPct} %). Køber er gjort udtrykkeligt opmærksom på arealafvigelsen og kan ikke rette krav mod sælger eller medvirkende ejendomsmægler.`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      <Plus size={11} /> Tilføj til Afsnit 11
                    </button>
                  </div>
                </div>
              )}

              {/* B. Aktive BBR / Matrikel / Plandata observanda */}
              {unresolvedRegisterFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                    flag.severity === "kritisk"
                      ? "border-red-200 bg-red-50/50"
                      : "border-amber-200 bg-amber-50/40"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          flag.severity === "kritisk"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {flag.register} · {flag.severity === "kritisk" ? "Kritisk" : "Observandum"}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 mt-1">{flag.title}</h3>
                    <p className="text-[11px] text-slate-700 mt-0.5">{flag.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {flag.afsnit11Clause && (
                      <button
                        type="button"
                        onClick={() => handleAddClauseToAfsnit11(flag.afsnit11Clause!)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
                      >
                        <Plus size={11} /> Tilføj til Afsnit 11
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleFlagResolved(flag.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 text-[10px] font-semibold cursor-pointer"
                    >
                      <Check size={11} /> Markér som afklaret
                    </button>
                  </div>
                </div>
              ))}

              {/* C. Fund fra aktiv dokument- og billedkontrol med opmærksomhed/afvigelse */}
              {attentionDocChecks.map((chk) => (
                <div
                  key={chk.id}
                  className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                        DOKUMENT-/BILLEDTJEK · {chk.fileName}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 mt-1">{chk.fundOverskrift}</h3>
                    <ul className="text-[11px] text-slate-700 mt-1 space-y-0.5 list-disc list-inside">
                      {chk.fundDetaljer.map((d, idx) => (
                        <li key={idx}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  {chk.afsnit11Forslag && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleAddClauseToAfsnit11(chk.afsnit11Forslag!)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
                      >
                        <Plus size={11} /> Tilføj forbehold til Afsnit 11
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* D. Manglende kernebilag */}
              {missingCoreDocs.map((rem) => (
                <div
                  key={rem.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-amber-700 block">
                      Mangler dokument ({rem.vigtighed})
                    </span>
                    <h3 className="text-xs font-bold text-slate-900">{rem.titel}</h3>
                    <p className="text-[11px] text-slate-500">{rem.beskrivelse}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleReminderResolved(rem.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200 text-[11px] font-semibold cursor-pointer"
                      title="Markér som modtaget/afklaret"
                    >
                      ✓ Modtaget
                    </button>
                  </div>
                </div>
              ))}

              {unresolvedRegisterFlags.length === 0 &&
                attentionDocChecks.length === 0 &&
                liveWithin15Pct &&
                missingCoreDocs.length === 0 && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>
                      Alle opmærksomhedspunkter og kernedokumenter på sagen er afklaret. Se de færdige Afsnit 11-klausuler nedenfor.
                    </span>
                  </div>
                )}
            </div>
          </section>
        )}

        {/* 2. AKTIV DOKUMENT-, BILLED- & PLANTEGNINGSKONTROL (VENSTRE) + FREMTRÆDENDE FORSLAG TIL KØBSAFTALENS AFSNIT 11 (HØJRE) */}
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
            className={`grid grid-cols-1 lg:grid-cols-12 gap-4 items-start ${
              isDraggingOver ? "ring-2 ring-blue-500 rounded-2xl" : ""
            }`}
          >
            {/* VENSTRE (6/12): KOMPAKT KERNE-DOKUMENTLISTE + AKTIV BILLED- & PLANTEGNINGSKONTROL (LxB MOD BBR ±15 %) */}
            <div className="lg:col-span-6 space-y-4">
              {/* A. KOMPAKT DOKUMENTLISTE (KUN DE VIGTIGSTE DOKUMENTER – MEGET MINDRE UI) */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Kerne-Dokumentliste & Aktiv Kontrol
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Kun sagens vigtigste dokumenter, fotos og plantegninger
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="file"
                      ref={docInputRef}
                      onChange={(e) => e.target.files && addFilesToCase(e.target.files)}
                      multiple
                      className="hidden"
                      accept="application/pdf,.pdf,.doc,.docx,.txt,image/*"
                    />
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      <Upload size={12} />
                      <span>{isAnalyzing ? "Tjekker..." : "+ Upload fil / foto / plantegning"}</span>
                    </button>
                    {uploadedDocs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => runAnalysis(uploadedDocs.filter((d) => d.file).map((d) => d.file!))}
                        disabled={isAnalyzing}
                        title="Kør aktiv AI-kontrol på alle bilag igen"
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                      >
                        <RefreshCw size={12} className={isAnalyzing ? "animate-spin" : ""} />
                        <span>Tjek igen</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Kompakt liste over de 4 vigtigste kernedokumenter */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80">
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 truncate">
                        1. BBR-Meddelelse, Matrikel & Plandata
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={openDocumentRoom}
                      className="text-[11px] font-semibold text-emerald-800 hover:underline flex-shrink-0 cursor-pointer"
                    >
                      Hentet automatisk →
                    </button>
                  </div>

                  {profile.paamindelseDokumenter.map((rem, idx) => {
                    const done = isReminderDocUploaded(rem.id);
                    return (
                      <div
                        key={rem.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${
                          done
                            ? "bg-emerald-50/60 border-emerald-200/80"
                            : "bg-amber-50/50 border-amber-200/80"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {done ? (
                            <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                          ) : (
                            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                          )}
                          <span className="font-semibold text-slate-800 truncate">
                            {idx + 2}. {rem.titel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleReminderResolved(rem.id)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                              done
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {done ? "✓ Tjekket" : "Markér modtaget"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Aktiv status for uploadede dokumenter & fotos */}
                {isAnalyzing && (
                  <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2.5 animate-pulse">
                    <RefreshCw size={15} className="animate-spin text-blue-600 flex-shrink-0" />
                    <div>
                      <strong className="block">Aktiv AI-dokument- & billedkontrol kører...</strong>
                      <span className="text-[11px]">
                        Krydstjekker uploadede filer, fotos og plantegning mod BBR ({profile.bbr.boligarealM2} m²), Byggesag og Afsnit 11.
                      </span>
                    </div>
                  </div>
                )}

                {uploadedDocs.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Uploadede filer & resultat af aktiv kontrol ({uploadedDocs.length} stk.):
                    </span>
                    {uploadedDocs.map((doc) => {
                      const check = documentChecks.find((c) => c.fileName === doc.name);
                      return (
                        <div
                          key={doc.id}
                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                  check?.status === "afvigelse"
                                    ? "bg-red-100 text-red-800"
                                    : check?.status === "opmaerksomhed"
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {check?.status === "afvigelse"
                                  ? "Afvigelse"
                                  : check?.status === "opmaerksomhed"
                                  ? "OBS"
                                  : "✓ Tjekket"}
                              </span>
                              <strong className="truncate text-slate-900">{doc.name}</strong>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {doc.objectUrl && (
                                <a
                                  href={doc.objectUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  Åbn
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveUploadedItem(doc.id)}
                                className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                title="Fjern fil"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                          {check && (
                            <p className="text-[11px] text-slate-600 leading-snug">
                              <strong>{check.kategori}:</strong> {check.fundOverskrift}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* B. PLANTEGNINGS- & BILLEDKONTROL (L×B MED 10 CM INDERVÆG, 35 CM YDERVÆG & ±15 % BBR-TOLERANCE) */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Ruler size={15} className="text-blue-600" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Plantegnings- & Billedkontrol (L×B mod BBR ±15 %)
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Indvendige mål tillægges 10 cm pr. indervæg og 35 cm pr. ydervæg
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      liveWithin15Pct
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-red-50 text-red-800 border-red-200"
                    }`}
                  >
                    {liveWithin15Pct
                      ? `✓ Inden for ±15 % (${liveDiffPct > 0 ? "+" : ""}${liveDiffPct} %)`
                      : `⚠ Afviger ${liveDiffPct > 0 ? "+" : ""}${liveDiffPct} % (>15 %)`}
                  </span>
                </div>

                <form onSubmit={handleCalculateFloorplan} className="space-y-2.5 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label htmlFor="fp-length-input" className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Indv. længde L (m)
                      </label>
                      <input
                        id="fp-length-input"
                        type="text"
                        inputMode="decimal"
                        value={fpLengthM}
                        onChange={(e) => setFpLengthM(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white font-semibold text-slate-900 outline-none focus:border-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="fp-width-input" className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Indv. bredde B (m)
                      </label>
                      <input
                        id="fp-width-input"
                        type="text"
                        inputMode="decimal"
                        value={fpWidthM}
                        onChange={(e) => setFpWidthM(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white font-semibold text-slate-900 outline-none focus:border-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="fp-walls-input" className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Skillevægge (10 cm)
                      </label>
                      <input
                        id="fp-walls-input"
                        type="number"
                        min={0}
                        max={25}
                        value={fpInnerWalls}
                        onChange={(e) => setFpInnerWalls(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white font-semibold text-slate-900 outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Indvendigt mål (L × B = {liveLm} × {liveBm} m):</span>
                      <strong className="text-slate-900">{liveNettoM2} m² netto</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">+ Tillæg indervægge ({liveWalls} stk. á 10 cm):</span>
                      <strong className="text-slate-900">+{liveInnerWallAddM2} m²</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">+ Tillæg ydervægge (klimaskærm á 35 cm):</span>
                      <strong className="text-slate-900">+{liveOuterWallAddM2} m²</strong>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-xs">
                      <span className="text-slate-900">Beregnet BBR-bruttoareal vs. BBR ({liveBbrM2} m²):</span>
                      <span className={liveWithin15Pct ? "text-emerald-700" : "text-red-700"}>
                        {liveBruttoM2} m² ({liveDiffM2 > 0 ? `+${liveDiffM2}` : liveDiffM2} m² /{" "}
                        {liveDiffPct > 0 ? `+${liveDiffPct}` : liveDiffPct} %)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="submit"
                      disabled={isSavingFloorplan}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      {isSavingFloorplan ? "Gemmer..." : "Gem L×B kontrol på sagen"}
                    </button>
                    {!liveWithin15Pct && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAddClauseToAfsnit11(
                            `Ved kontrolopmåling af plantegning (indvendige mål ${liveLm} × ${liveBm} m korrigeret for 10 cm indervægge og 35 cm ydervægge) er det beregnede bruttoareal opgjort til ca. ${liveBruttoM2} m² mod det i BBR registrerede boligareal på ${liveBbrM2} m² (afvigelse på ${liveDiffPct} %). Køber er gjort udtrykkeligt opmærksom på arealafvigelsen og kan ikke rette krav mod sælger eller medvirkende ejendomsmægler.`
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        + Overfør afvigelse til Afsnit 11
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* HØJRE (6/12): MEGET MERE FREMTRÆDENDE FORSLAG TIL KØBSAFTALENS AFSNIT 11 */}
            <div className="lg:col-span-6 bg-white rounded-2xl p-4 border-2 border-slate-900 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 text-white mb-1">
                    Købsaftalens Afsnit 11 · Individuelle Vilkår
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    Forslag til Købsaftalens Afsnit 11 ({structuredAfsnit11.length} stk.)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Genereret ud fra BBR, Matrikel, Tingbog, Plantegning (L×B) og uploadede dokumenter
                  </p>
                </div>

                {activeClausesList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopyClause("all-clauses", activeClausesList.join("\n\n"))}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {copiedClauseId === "all-clauses" ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedClauseId === "all-clauses" ? "Alle kopieret!" : "Kopiér alle klausuler"}</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
                {structuredAfsnit11.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                          {item.kilde}
                        </span>
                        <strong className="text-xs text-slate-900 truncate">{item.titel}</strong>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyClause(`cl-${idx}`, item.tekst)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
                        >
                          {copiedClauseId === `cl-${idx}` ? <Check size={11} /> : <Copy size={11} />}
                          <span>{copiedClauseId === `cl-${idx}` ? "Kopieret" : "Kopiér"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveClauseFromAfsnit11(item.tekst)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Fjern klausul"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200/80 italic">
                      &ldquo;{item.tekst}&rdquo;
                    </p>
                  </div>
                ))}
              </div>

              {/* Tilføj ekstra Afsnit 11-klausul direkte */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddClauseToAfsnit11(newClauseInput);
                }}
                className="flex items-center gap-2 pt-2 border-t border-slate-100"
              >
                <label htmlFor="new-afsnit11-input" className="sr-only">
                  Tilføj ny klausul til Afsnit 11
                </label>
                <input
                  id="new-afsnit11-input"
                  type="text"
                  value={newClauseInput}
                  onChange={(e) => setNewClauseInput(e.target.value)}
                  placeholder="Tilføj egen formulering til Købsaftalens Afsnit 11..."
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white outline-none focus:border-slate-900"
                />
                <button
                  type="submit"
                  disabled={!newClauseInput.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Tilføj</span>
                </button>
              </form>
            </div>
          </section>
        )}

        {/* 3. VURDERINGSBEREGNER (PROJEKT 15) – KUN 3 RENOVERINGSNIVEAUER + UPLOAD BILLEDER */}
        {selectedAddress && profile && (
          <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Vurderingsberegner (Projekt 15)</h2>
                <p className="text-[11px] text-slate-500">
                  Vælg stand ({profile.bbr.boligarealM2} m² bolig · {profile.matrikel.registreretArealM2} m² grund · Basis{" "}
                  {profile.vurdering.basisM2PrisDkk.toLocaleString("da-DK")} kr./m²)
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ImagePlus size={13} />
                  <span>Upload fotos / plantegning ({uploadedPhotos.length})</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["gennemrenoveret", "mellemrenoveret", "ikke_renoveret"] as RenovationLevelKey[]).map((lvlKey) => {
                const lvl = profile.vurdering.niveauer[lvlKey];
                const isSelected = renovationLevel === lvlKey;
                return (
                  <button
                    key={lvlKey}
                    type="button"
                    onClick={() => handleChangeRenovationLevel(lvlKey)}
                    className={`text-left rounded-xl p-3.5 border transition-all cursor-pointer ${
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 text-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">{lvl.label}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isSelected ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-700"
                        }`}
                      >
                        {lvl.m2PrisDkk.toLocaleString("da-DK")} kr./m²
                      </span>
                    </div>
                    <p className="text-lg font-extrabold tracking-tight">
                      {lvl.estimatDkk.toLocaleString("da-DK")} kr.
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                      Spænd: {(lvl.intervalMinDkk / 1e6).toFixed(2).replace(".", ",")} –{" "}
                      {(lvl.intervalMaxDkk / 1e6).toFixed(2).replace(".", ",")} mio. kr.
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. SAGS-AI & VALGFRIT SÆLGERSKEMA (MED MULIGHED FOR AT VINGE SÆLGERSPØRGSMÅL FRA) */}
        {selectedAddress && profile && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* SAGS-AI (7/12) */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-blue-600" />
                  <h2 className="text-xs font-bold text-slate-900">
                    Skriv til Sags-AI (Ret forhold, afklar dokumenter eller opdatér Afsnit 11)
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {[
                    "Carport/udhus er godkendt – fjern BBR-anmærkning",
                    "Tingbogsattest er tjekket uden anmærkninger",
                  ].map((quickPrompt) => (
                    <button
                      key={quickPrompt}
                      type="button"
                      disabled={isSendingToAi}
                      onClick={() => handleSendToCaseAssistant(quickPrompt)}
                      className="px-2 py-0.5 rounded-md bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      {quickPrompt}
                    </button>
                  ))}
                </div>
              </div>

              {activeCase?.assistantMessages && activeCase.assistantMessages.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto mb-2.5 pr-1">
                  {activeCase.assistantMessages.slice(-4).map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2 rounded-lg text-xs leading-relaxed border ${
                        msg.sender === "agent"
                          ? "bg-slate-900 text-white border-slate-900 ml-6"
                          : "bg-slate-50 text-slate-800 border-slate-200/90 mr-4"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold ${msg.sender === "agent" ? "text-slate-300" : "text-blue-700"}`}>
                          {msg.sender === "agent" ? currentAgent.name : "Sags-AI"}
                        </span>
                      </div>
                      <p className="text-[11px]">{msg.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {assistantFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {assistantFiles.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-medium"
                    >
                      <Paperclip size={11} />
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setAssistantFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-1 text-blue-600 hover:text-blue-900 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendToCaseAssistant();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="file"
                  ref={assistantFileInputRef}
                  multiple
                  className="hidden"
                  accept="application/pdf,.pdf,.doc,.docx,.txt,image/*"
                  onChange={(e) => {
                    if (e.target.files) {
                      setAssistantFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => assistantFileInputRef.current?.click()}
                  title="Vedhæft bilag til Sags-AI"
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer flex-shrink-0"
                >
                  <Paperclip size={14} />
                </button>

                <label htmlFor="case-assistant-input" className="sr-only">
                  Skriv instruks til Sags-AI
                </label>
                <input
                  id="case-assistant-input"
                  name="assistant-message"
                  type="text"
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onCompositionEnd={(e) => {
                    lastCompositionEndRef.current = e.timeStamp;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      if (
                        lastCompositionEndRef.current !== null &&
                        Math.abs(e.timeStamp - lastCompositionEndRef.current) < 50
                      ) {
                        return;
                      }
                      handleSendToCaseAssistant();
                    }
                  }}
                  placeholder="Skriv f.eks.: 'Carporten er godkendt' eller 'Tilføj til Afsnit 11 at...' "
                  className="flex-1 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-900"
                />

                <button
                  type="submit"
                  disabled={isSendingToAi || (!assistantInput.trim() && assistantFiles.length === 0)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer flex-shrink-0"
                >
                  <Send size={12} />
                  <span>{isSendingToAi ? "Opdaterer..." : "Opdatér"}</span>
                </button>
              </form>
            </div>

            {/* SÆLGERSPØRGSMÅL MED MULIGHED FOR AT VINGE FRA (5/12) */}
            <div className="lg:col-span-5 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div>
                  <h2 className="text-xs font-bold text-slate-900">
                    Spørgsmål til Sælger ({activeCase?.status || "udkast"})
                  </h2>
                  <p className="text-[10px] text-slate-500">
                    Ving fra hvis sælger ikke skal besvare spørgsmål på sagen
                  </p>
                </div>

                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none bg-slate-100 px-2.5 py-1 rounded-lg">
                  <input
                    type="checkbox"
                    checked={Boolean(activeCase?.skipSellerQuestionnaire)}
                    onChange={(e) => handleToggleSkipSellerQuestionnaire(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>Sælger skal ikke svare (Fravælg)</span>
                </label>
              </div>

              {activeCase?.skipSellerQuestionnaire ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                  ✓ <strong>Sælgerspørgsmål er vinget fra på denne sag.</strong> Sagen afventer ikke svar fra sælger. Fjern fluebenet ovenfor, hvis du senere ønsker at sende spørgsmål til sælger.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                    {profile.saelgerSpoergsmaal.map((q) => {
                      const isDisabled = (activeCase?.disabledQuestionIds || []).includes(q.id);
                      return (
                        <label
                          key={q.id}
                          className="flex items-start gap-2 text-[11px] cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={() => handleToggleQuestionDisabled(q.id)}
                            className="mt-0.5 rounded border-slate-300"
                          />
                          <span className={isDisabled ? "line-through text-slate-400" : "text-slate-700"}>
                            <strong>{q.category}:</strong> {q.text}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      id="seller-name-input"
                      name="sellerName"
                      type="text"
                      autoComplete="name"
                      placeholder="Sælgers navn"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      onBlur={() => persistSellerInfo()}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white text-xs outline-none focus:border-slate-900"
                    />
                    <input
                      id="seller-email-input"
                      name="sellerEmail"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      placeholder="saelger@mail.dk"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      onBlur={() => persistSellerInfo()}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white text-xs outline-none focus:border-slate-900"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/seller/${caseId}`}
                      onClick={async (e) => {
                        e.preventDefault();
                        await persistSellerInfo();
                        window.location.href = `/seller/${caseId}`;
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold"
                    >
                      <Eye size={12} /> Preview skema
                    </a>
                    <button
                      type="button"
                      onClick={handleSendSellerLink}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-[11px] font-semibold cursor-pointer"
                    >
                      <Mail size={12} /> Send til sælger
                    </button>
                    {mailStatus && (
                      <span className={`text-[11px] ${mailStatus.sent ? "text-emerald-700 font-semibold" : "text-red-600"}`}>
                        {mailStatus.sent ? "✓ Sendt" : mailStatus.error}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 5. NEDERST: MINDRE OVERSIGT OVER HVAD SYSTEMET HAR TJEKKET IGENNEM SOM MÆGLER IKKE SKAL TAGE SIG AF */}
        {selectedAddress && profile && (
          <section className="bg-emerald-50/40 rounded-2xl px-4 py-3 border border-emerald-200/70">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-700" />
                <h2 className="text-xs font-bold text-emerald-950">
                  Kontrolleret & Godkendt uden anmærkninger ({verifiedItemsBottom.length} punkter – mægler behøver ikke foretage sig yderligere)
                </h2>
              </div>
              <span className="text-[10px] font-semibold text-emerald-800">
                Verificeret mod BBR, Matrikel, Plandata, CVR & Bilag
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {verifiedItemsBottom.map((item, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1.5 rounded-lg bg-white/90 border border-emerald-200/60 flex items-start gap-2 text-[11px]"
                >
                  <CheckCircle2 size={12} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <strong className="text-slate-800 truncate">{item.label}</strong>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        {item.source}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate" title={item.detail}>
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* MÆGLER LOGIN MODAL */}
      <dialog
        ref={loginDialogRef}
        {...({ closedby: "any" } as any)}
        aria-labelledby="login-dialog-title"
        className="w-full max-w-md rounded-2xl p-0 bg-white text-slate-900 shadow-2xl border border-slate-200 m-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <h2 id="login-dialog-title" className="font-bold text-base text-slate-900">
                Mægler Login · Vejle Mægleren
              </h2>
              <p className="text-xs text-slate-500">
                Hver mægler har sin egen personlige sagsliste og statusovervågning
              </p>
            </div>
            <button
              type="button"
              onClick={() => loginDialogRef.current?.close()}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              aria-label="Luk login"
            >
              <X size={16} />
            </button>
          </div>

          {availableAgents.length > 0 && (
            <div className="mb-5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Hurtigvalg (1-klik skift mægler):
              </span>
              <div className="grid grid-cols-1 gap-2">
                {availableAgents.map((ag) => {
                  const isCurrent = ag.email.toLowerCase() === currentAgent.email.toLowerCase();
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      onClick={() => handleAgentLogin(undefined, ag)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        isCurrent
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 hover:bg-white text-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            isCurrent ? "bg-white text-slate-900" : "bg-slate-900 text-white"
                          }`}
                        >
                          {ag.initials}
                        </span>
                        <div>
                          <span className="font-bold block">{ag.name}</span>
                          <span className={`text-[11px] ${isCurrent ? "text-slate-300" : "text-slate-500"}`}>
                            {ag.email} · {ag.role}
                          </span>
                        </div>
                      </div>
                      <UserCheck size={15} className={isCurrent ? "text-emerald-400" : "text-slate-400"} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form method="post" onSubmit={handleAgentLogin} className="space-y-3.5">
            <div>
              <label htmlFor="agent-login-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Mægler e-mail
              </label>
              <input
                id="agent-login-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-slate-900 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="agent-login-password" className="block text-xs font-semibold text-slate-700">
                  Adgangskode
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{showPassword ? "Skjul kode" : "Vis kode"}</span>
                </button>
              </div>
              <input
                id="agent-login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-slate-900 outline-none"
              />
            </div>

            {loginError && (
              <p className="text-xs text-red-600 font-medium" role="alert">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {isLoggingIn ? "Logger ind..." : "Log ind på sagsliste"}
            </button>
          </form>
        </div>
      </dialog>

      {/* FULDSKÆRMS LIGHTBOX TIL SKRÅFOTO */}
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
          </div>
        </div>
      )}

      {/* KØBERKARTOTEK MODAL */}
      <dialog
        ref={buyerDialogRef}
        {...({ closedby: "any" } as any)}
        aria-labelledby="buyer-dialog-title"
        className="w-full max-w-2xl rounded-2xl p-0 bg-white text-slate-900 shadow-2xl border border-slate-200 m-auto"
      >
        {profile && (
          <div className="flex flex-col max-h-[82vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users size={18} className="text-slate-800" />
                <div>
                  <h2 id="buyer-dialog-title" className="font-bold text-base text-slate-900">
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
        {...({ closedby: "any" } as any)}
        aria-labelledby="docroom-dialog-title"
        className="w-full max-w-4xl rounded-2xl p-0 bg-white text-slate-900 shadow-2xl border border-slate-200 m-auto"
      >
        {profile && (
          <div className="flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen size={18} className="text-blue-400" />
                  <h2 id="docroom-dialog-title" className="font-bold text-base">
                    Samlet Dokumentrum · {profile.adresse}
                  </h2>
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
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                            {doc.kilde}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-semibold">✓ {doc.status}</span>
                        </div>
                        <h4 className="font-bold text-xs text-slate-900 mt-1">{doc.titel}</h4>
                        <p className="text-[11px] text-slate-600 mt-0.5">{doc.beskrivelse}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/70">
                        <button
                          type="button"
                          onClick={() => handleDownloadAutoDoc(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          <Download size={12} />
                          Hent
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewAutoDoc(previewAutoDoc?.id === doc.id ? null : doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Eye size={12} />
                          {previewAutoDoc?.id === doc.id ? "Skjul" : "Vis"}
                        </button>
                        {doc.externalUrl && (
                          <a
                            href={doc.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-blue-700 border border-slate-200 text-[11px] font-medium"
                          >
                            Kilde <ExternalLink size={11} />
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  2. Uploadede Dokumenter, Plantegninger & Fotos ({uploadedDocs.length} stk.)
                </h3>
                {uploadedDocs.length > 0 ? (
                  <div className="space-y-2">
                    {uploadedDocs.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <FileText size={16} className="text-blue-600 flex-shrink-0" />
                          <div className="truncate">
                            <p className="font-bold text-slate-900 truncate">{item.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.type === "photo" ? "Billede/Plantegning" : "Dokument"} · {item.sizeKb} KB · kl.{" "}
                              {item.uploadedAt}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {item.objectUrl && (
                            <a
                              href={item.objectUrl}
                              download={item.name}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold"
                            >
                              <Download size={12} />
                              Hent
                            </a>
                          )}
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
                  <p className="text-xs text-slate-500">Ingen filer uploadet endnu.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
