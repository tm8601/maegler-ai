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
  Sparkles,
  Radio,
  Ruler,
  ShieldCheck,
  Plus,
  RefreshCw,
  Lock,
  LogOut,
  ZoomIn,
  ZoomOut,
  Save,
  Flame,
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
  detectedCategory?: string;
}

type SkraafotoOrientation = "south" | "west" | "north" | "east";
type WorkspaceTab = "forside" | "dokumentrum" | "vurdering" | "saerlige_forhold";

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
  // Mægler Login & Auth Gate state (mail@tobiasmeng.dk / HDKSA77B!)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [currentAgent, setCurrentAgent] = useState<AgentUser>({
    id: "agent-tobias",
    email: "mail@tobiasmeng.dk",
    name: "Tobias Meng",
    role: "Indehaver · Vejle Mægleren",
    initials: "TM",
    phone: "+45 75 82 00 00",
  });
  const [availableAgents, setAvailableAgents] = useState<AgentUser[]>([]);
  const [agentCases, setAgentCases] = useState<SellerCaseRecord[]>([]);
  const [loginEmail, setLoginEmail] = useState("mail@tobiasmeng.dk");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Hovedfaner: 1. Forside (Kolde Fakta & OBS), 2. Dokumentrum, 3. Vurdering, 4. Særlige forhold (Afsnit 11 & Olietank)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("forside");

  // Diskret Live Cost state (loft: 5,00 kr. pr. sag)
  const [liveCostDkk, setLiveCostDkk] = useState<number>(0);
  const [caseSavedNotice, setCaseSavedNotice] = useState<boolean>(false);

  // Adresse & Ejendomsprofil state
  const [address, setAddress] = useState("Vinkelvej 24, 7100 Vejle");
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<PropertyFullProfile | null>(null);
  const [activeCase, setActiveCase] = useState<SellerCaseRecord | null>(null);
  const [caseId, setCaseId] = useState<string>("default");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // De 3 renoveringsniveauer i Vurderingsberegneren
  const [renovationLevel, setRenovationLevel] = useState<RenovationLevelKey>("mellemrenoveret");

  // Skråfoto & Luftfoto state – starter meget tættere på (zoom 1.5x på 100% iframe)
  const [visualMode, setVisualMode] = useState<"skraafoto" | "ortofoto" | "streetview">("skraafoto");
  const [skraafotoOrientation, setSkraafotoOrientation] = useState<SkraafotoOrientation>("south");
  const [skraafotoZoom, setSkraafotoZoom] = useState<number>(1.5);
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

  // Olietank-Vagthund & Beslutningsmail (Golden Standard) state
  const [oilSellerType, setOilSellerType] = useState<"privat" | "doedsbo">("privat");
  const [oilStage, setOilStage] = useState<"foer_udbud" | "under_udbud" | "konkret_bud">("under_udbud");
  const [oilFindingText, setOilFindingText] = useState<string>(
    "et ældre udluftningsrør / påfyldningsstuds ved soklen/skellet, som kan stamme fra en tidligere nedgravet olietank"
  );

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

  // Light-dismiss fallback til <dialog>
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
          event.clientY <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialogs.forEach((d) => d.addEventListener("click", handler));
      return () => dialogs.forEach((d) => d.removeEventListener("click", handler));
    }
  }, []);

  // Gem sagsliste lokalt som backup + synkronisér state
  const persistCasesToLocalBackup = (casesList: SellerCaseRecord[], currentRecord?: SellerCaseRecord) => {
    try {
      if (casesList.length > 0) {
        localStorage.setItem("vejle_maegler_saved_cases_v2", JSON.stringify(casesList.slice(0, 30)));
      }
      if (currentRecord?.id && currentRecord?.address) {
        localStorage.setItem("vejle_maegler_last_case_id", currentRecord.id);
        localStorage.setItem("vejle_maegler_last_case_address", currentRecord.address);
      }
    } catch {
      // Ignore storage quota errors
    }
  };

  // Synkronisér aktiv sag til lokal UI-state
  const syncCaseToState = (record: SellerCaseRecord, prof?: PropertyFullProfile) => {
    setActiveCase(record);
    setCaseId(record.id);
    if (record.address) {
      setAddress(record.address);
    }
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

    try {
      localStorage.setItem("vejle_maegler_last_case_id", record.id);
      localStorage.setItem("vejle_maegler_last_case_address", record.address);
    } catch {
      // Ignore
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

    // Flet gemte dokument-metadata med lokalt uploadede filer + server-side fil-URL + AI-genkendt kategori
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
            detectedCategory: meta.detectedCategory || existingLocal.detectedCategory,
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
            detectedCategory: meta.detectedCategory,
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
          persistCasesToLocalBackup(data.agentCases, data.sellerCase);
        }
        if (data.budget && typeof data.budget.spentDkk === "number") {
          setLiveCostDkk(data.budget.spentDkk);
        }
        setCaseSavedNotice(true);
        setTimeout(() => setCaseSavedNotice(false), 2500);
      }
    } catch (e) {
      console.error("Failed to load property profile:", e);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Eksplicit "Gem sag" funktion (gemmer både på server og i localStorage)
  const handleExplicitSaveCase = async () => {
    if (!profile) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/sags-api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCase?.id || caseId,
          agentEmail: currentAgent.email,
          agentName: currentAgent.name,
          address: profile.adresse,
          profile,
          sellerName,
          sellerEmail,
          renovationLevel,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        syncCaseToState(saved, profile);
        if (Array.isArray(saved.agentCases)) {
          setAgentCases(saved.agentCases);
          persistCasesToLocalBackup(saved.agentCases, saved);
        } else {
          setAgentCases((prev) => {
            const exists = prev.some((c) => c.id === saved.id);
            const next = exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
            persistCasesToLocalBackup(next, saved);
            return next;
          });
        }
        setCaseSavedNotice(true);
        setTimeout(() => setCaseSavedNotice(false), 2500);
      }
    } catch {
      // Ignore
    }
  };

  // Hent gemt mægler-login og seneste gemte sag ved opstart (overskriv ALDRIG en oprettet sag!)
  useEffect(() => {
    let initialAgent = currentAgent;
    let hasValidSession = false;
    let lastAddress = "";
    let lastCaseId = "";

    try {
      const savedToken = localStorage.getItem("vejle_maegler_token");
      const savedUser = localStorage.getItem("vejle_maegler_user");
      lastAddress = localStorage.getItem("vejle_maegler_last_case_address") || "";
      lastCaseId = localStorage.getItem("vejle_maegler_last_case_id") || "";
      const backupCases = localStorage.getItem("vejle_maegler_saved_cases_v2");
      if (backupCases) {
        const parsedBackup = JSON.parse(backupCases);
        if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
          setAgentCases(parsedBackup);
        }
      }
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.email) {
          initialAgent = {
            ...parsed,
            email: parsed.email === "tobias@vejlemaegleren.dk" ? "mail@tobiasmeng.dk" : parsed.email,
          };
          setCurrentAgent(initialAgent);
          setLoginEmail(initialAgent.email);
        }
      }
      if (savedToken) {
        hasValidSession = true;
        setIsAuthenticated(true);
      }
    } catch {
      // Ignore
    }
    setAuthChecked(true);

    fetch(`${getApiBaseUrl()}/sags-api/auth`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.agents)) setAvailableAgents(d.agents);
      })
      .catch(() => {});

    // Hent mæglerens gemte sager fra serveren og åbn den seneste sag
    fetch(`${getApiBaseUrl()}/sags-api/cases?list=1&agentEmail=${encodeURIComponent(initialAgent.email)}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (Array.isArray(d.cases) && d.cases.length > 0) {
          setAgentCases(d.cases);
          const targetCase =
            (lastCaseId && d.cases.find((c: SellerCaseRecord) => c.id === lastCaseId)) ||
            (lastAddress && d.cases.find((c: SellerCaseRecord) => c.address === lastAddress)) ||
            d.cases[0];
          if (targetCase) {
            await handleSelectSavedCase(targetCase, initialAgent);
            return;
          }
        }
        await loadPropertyProfile(lastAddress || "Vinkelvej 24, 7100 Vejle", { agent: initialAgent });
      })
      .catch(() => {
        loadPropertyProfile(lastAddress || "Vinkelvej 24, 7100 Vejle", { agent: initialAgent });
      });
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

  // Skift mellem gemte sager i mæglerens sagsliste
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
            persistCasesToLocalBackup(fullCase.agentCases, fullCase);
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

  const handleDeleteSavedCase = async (idToDelete: string) => {
    try {
      await fetch(`${getApiBaseUrl()}/sags-api/cases?id=${encodeURIComponent(idToDelete)}`, {
        method: "DELETE",
      });
      const remaining = agentCases.filter((c) => c.id !== idToDelete);
      setAgentCases(remaining);
      persistCasesToLocalBackup(remaining);
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
          password: quickAgent ? "HDKSA77B!" : loginPassword,
          name: quickAgent?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        setLoginError(data.error || "Forkert e-mail eller adgangskode");
        return;
      }
      setCurrentAgent(data.user);
      setLoginEmail(data.user.email);
      setIsAuthenticated(true);
      try {
        localStorage.setItem("vejle_maegler_user", JSON.stringify(data.user));
        if (data.token) localStorage.setItem("vejle_maegler_token", data.token);
      } catch {
        // Ignore
      }
      loginDialogRef.current?.close();

      if (Array.isArray(data.cases)) {
        setAgentCases(data.cases);
        persistCasesToLocalBackup(data.cases);
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

  const handleLogout = () => {
    try {
      localStorage.removeItem("vejle_maegler_token");
    } catch {
      // Ignore
    }
    setLoginPassword("");
    setIsAuthenticated(false);
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
        if (Array.isArray(updated.agentCases)) {
          setAgentCases(updated.agentCases);
          persistCasesToLocalBackup(updated.agentCases, updated);
        }
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
        if (Array.isArray(updated.agentCases)) {
          setAgentCases(updated.agentCases);
          persistCasesToLocalBackup(updated.agentCases, updated);
        }
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
            const next = !exists
              ? [data.sellerCase, ...prev]
              : prev.map((c) => (c.id === data.sellerCase.id ? data.sellerCase : c));
            persistCasesToLocalBackup(next, data.sellerCase);
            return next;
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

    // Kør altid aktiv AI-dokument-, billed- og plantegningskontrol (med indholdsgenkendelse uanset filnavn!)
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
          persistCasesToLocalBackup(data.agentCases, data.sellerCase);
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
            detectedCategory: u.detectedCategory,
          })),
          documentChecks: nextChecks,
        }),
      });
      if (saveRes.ok) {
        const savedRecord: SellerCaseRecord = await saveRes.json();
        setActiveCase(savedRecord);
      }
    }
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
    const activeClauses =
      activeCase?.generatedAfsnit11Clauses && activeCase.generatedAfsnit11Clauses.length > 0
        ? activeCase.generatedAfsnit11Clauses
        : profile.afsnit11Klausuler.map((k) => k.tekst);

    const firstFloorM2 =
      profile.bbr.udnyttetTagetageM2 > 0
        ? profile.bbr.udnyttetTagetageM2
        : profile.bbr.antalEtager > 1 && profile.bbr.boligarealM2 > profile.bbr.bebyggetArealHovedbygningM2
        ? Math.max(
            0,
            profile.bbr.boligarealM2 -
              profile.bbr.bebyggetArealHovedbygningM2 -
              profile.bbr.lovligBeboelseKaelderM2
          )
        : 0;

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

  <h2>1. De 3 Renoveringsniveauer</h2>
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

  <h2>2. Verificerede Hårde Fakta (BBR, Matrikel & Plandata)</h2>
  <div class="grid">
    <div class="card">
      <div class="card-label">Boligareal (BBR)</div>
      <div class="card-val">${profile.bbr.boligarealM2} m² (${profile.bbr.antalEtager} plan)</div>
    </div>
    <div class="card">
      <div class="card-label">Bebygget (Hus / Total) & 1. sal</div>
      <div class="card-val">${profile.bbr.bebyggetArealHovedbygningM2} / ${profile.bbr.samletBebyggetArealM2} m² (1. sal: ${firstFloorM2} m²)</div>
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
    if (uploadedDocs.some((d) => d.matchedReminderId === docId)) return true;
    const names = uploadedDocs
      .map((d) => `${d.name} ${d.detectedCategory || ""}`.toLowerCase())
      .join(" ");
    if (docId === "rem-tingbogsattest") {
      return names.includes("tingbog") || names.includes("attest") || names.includes("servitut") || names.includes("pant");
    }
    if (docId === "rem-byggesag") {
      return names.includes("byggesag") || names.includes("tegning") || names.includes("plantegning") || names.includes("tilladelse") || names.includes("arkiv") || names.includes("olietank");
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
    }
  };

  // Beregn 1. sal / udnyttet tagetage m² så den ALTID vises tydeligt under Bebygget (Hus / Total)
  const firstFloorM2 = profile
    ? profile.bbr.udnyttetTagetageM2 > 0
      ? profile.bbr.udnyttetTagetageM2
      : profile.bbr.antalEtager > 1 && profile.bbr.boligarealM2 > profile.bbr.bebyggetArealHovedbygningM2
      ? Math.max(
          0,
          profile.bbr.boligarealM2 -
            profile.bbr.bebyggetArealHovedbygningM2 -
            profile.bbr.lovligBeboelseKaelderM2
        )
      : 0
    : 0;

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

  // Live LxB forhåndsberegning i UI (10 cm indervægge, 35 cm ydervægge mod BBR ±15 %)
  const liveBbrM2 = profile?.bbr?.boligarealM2 || 85;
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

  // Opmærksomhedspunkter på Forsiden
  const unresolvedRegisterFlags = (profile?.roedeFlag || []).filter((f) => !resolvedFlagsSet.has(f.id));
  const attentionDocChecks = documentChecks.filter((d) => d.status !== "ok");
  const missingCoreDocs = (profile?.paamindelseDokumenter || []).filter((r) => !isReminderDocUploaded(r.id));
  const totalObsCount =
    unresolvedRegisterFlags.length +
    attentionDocChecks.length +
    (!liveWithin15Pct ? 1 : 0) +
    missingCoreDocs.length;

  // Kontrollerede og godkendte punkter (Kolde fakta)
  const verifiedItemsBottom: Array<{ label: string; detail: string; source: string }> = [];
  if (profile) {
    verifiedItemsBottom.push({
      label: "BBR Hovedbygning, 1. sal & Klimaskærm",
      detail: `${profile.bbr.boligarealM2} m² bolig (Bebygget: ${profile.bbr.bebyggetArealHovedbygningM2}/${profile.bbr.samletBebyggetArealM2} m², 1. sal: ${firstFloorM2} m²) · Opført ${profile.bbr.opfoerelsesaar ?? "—"} · ${profile.bbr.tagmaterialeTekst} · ${profile.bbr.ydervaegTekst}`,
      source: "BBR/v3",
    });
    if (profile.bbr.tekniskeAnlaeg.length === 0) {
      verifiedItemsBottom.push({
        label: "Olietanke & Tekniske Anlæg (BBR)",
        detail: `0 aktive olietanke i BBR_TekniskAnlaeg · Varme: ${profile.bbr.varmeinstallationTekst} (${profile.bbr.opvarmningsmiddelTekst})`,
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
      label: "Matrikel & Grundareal",
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
        label: "Bebyggelsesprocent (BR18) & Zonestatus",
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
    for (const rf of profile.roedeFlag.filter((f) => resolvedFlagsSet.has(f.id))) {
      verifiedItemsBottom.push({
        label: `Afklaret af mægler: ${rf.title}`,
        detail: rf.description,
        source: rf.register,
      });
    }
    for (const dc of documentChecks.filter((d) => d.status === "ok")) {
      verifiedItemsBottom.push({
        label: `Genkendt & tjekket: ${dc.fileName}`,
        detail: dc.fundOverskrift,
        source: dc.kategori,
      });
    }
  }

  // Golden Standard Beslutningsmail til Sælger / Bobestyrer (Mulighed 1, 2 og 3)
  const pronounSubj = oilSellerType === "doedsbo" ? "boet" : "du/I";
  const pronounPoss = oilSellerType === "doedsbo" ? "boets" : "din/jeres";
  const recipientTitle = sellerName || (oilSellerType === "doedsbo" ? "Bobestyrer" : "Sælger");
  const stageSentence =
    oilStage === "konkret_bud"
      ? "Da vi står med en konkret køber, hvor købsaftalen endnu ikke er udarbejdet, skal vi have valgt den rette håndtering nu, så handlen kan gennemføres på et oplyst og sikkert grundlag."
      : oilStage === "foer_udbud"
      ? "Inden vi sætter ejendommen til salg, skal vi have taget stilling til, hvordan forholdet skal håndteres over for kommende købere."
      : "For at sikre et trygt salgsforløb uden senere mangelsindsigelser skal vi have valgt, hvordan forholdet skal håndteres i salgsopstillingen og en kommende købsaftale.";

  const goldenStandardSellerMail = `Hej ${recipientTitle}

Jeg er ved gennemgang og besigtigelse af ${profile?.adresse || address} stødt på ${oilFindingText}.

Ved opslag i BBR og kommunens digitale byggesagsarkiv (Weblager) fremgår der på nuværende tidspunkt ingen sløjfningsattest eller tømningsattest for en olietank på dette sted, mens ejendommen i dag opvarmes med ${profile?.bbr.varmeinstallationTekst.toLowerCase() || "fjernvarme"}. ${stageSentence}

Som ejendomsmægler må og kan jeg ikke træffe valget på ${pronounPoss} vegne, men jeg vil her kridte banen objektivt op med de 3 muligheder, ${pronounSubj} har:

MULIGHED 1: Fuld afklaring og evt. sløjfning/opgravning nu (Før handel)
${pronounSubj.charAt(0).toUpperCase() + pronounSubj.slice(1)} rekvirerer en autoriseret miljø-/entreprenøraktør til at undersøge røret/sporet med kamera eller prøvegravning. Hvis der ligger en uregistreret olietank, tømmes, renses og sløjfes/opgraves den lovligt, og der udtages evt. jordprøve, hvorefter sløjfningsattesten indsendes til Vejle Kommune til BBR-registrering.
• Fordel: Usikkerheden fjernes 100 % før salg, hvilket giver køber fuld tryghed og beskytter mod senere krav.
• Ulempe/risiko: ${pronounSubj.charAt(0).toUpperCase() + pronounSubj.slice(1)} afholder omkostningen til undersøgelse/sløjfning nu, og hvis der mod forventning konstateres en forurening, bliver ${pronounSubj} bekendt med den.

MULIGHED 2: Aftalt fordeling / prisnedslag med køber kombineret med fuld oplysning i Afsnit 11
Forholdet oplyses 100 % loyalt med fotos i salgsopstillingen og i købsaftalens Afsnit 11, og det aftales som et konkret vilkår i handlen, hvordan udgiften til undersøgelse/sløjfning håndteres mellem parterne (eller der aftales et beløb/afslag til dækning heraf).
• Fordel: Handlen kan gennemføres hurtigt med klare rammer for økonomien.
• Ulempe/risiko: En ansvarsfraskrivelse over for køber beskytter ikke nødvendigvis mod et offentligretligt påbud fra kommunen efter Jordforureningsloven, hvis tanken senere viser sig at udgøre en miljørisiko.

MULIGHED 3: Salg med fuld og loyal oplysning uden yderligere undersøgelse
${pronounSubj.charAt(0).toUpperCase() + pronounSubj.slice(1)} foretager ikke fysiske undersøgelser nu, men vi oplyser fuldt og loyalt i salgsopstillingen og købsaftalens Afsnit 11 (vedlagt fotos), at der er observeret ${oilFindingText}, og at hverken BBR eller kommunens arkiv indeholder oplysninger herom.
• Fordel: Ingen udgifter til entreprenør her og nu, og den loyale oplysning sikrer åbenhed i handlen.
• Ulempe/risiko: Usikkerheden kan påvirke købers bud/finansiering, og offentligretlige krav fra miljømyndigheder kan som udgangspunkt ikke fraskrives ved aftale.

Giv mig gerne besked om, hvilken løsning (Mulighed 1, 2 eller 3) ${pronounSubj} ønsker at gå videre med, så sørger jeg for det videre forløb og de korrekte formuleringer.

Med venlig hilsen
${currentAgent.name}
${currentAgent.role}
Tlf.: ${currentAgent.phone} · ${currentAgent.email}`;

  const municipalityArchiveMail = `Til Teknik & Miljø / Byggesagsarkivet i Vejle Kommune

Vedr.: Forespørgsel om olietank- og byggesagsdokumentation på ${profile?.adresse || address} (BFE: ${profile?.bbr.bfeNummer || "—"}, Matr.nr.: ${profile?.matrikel.matrikelnummer || "—"} ${profile?.matrikel.ejerlavsnavn || ""})

Til brug for formidling af ovennævnte ejendom skal jeg venligst høre, om Vejle Kommune i det uklassificerede arkiv, miljøarkivet eller byggesagsarkivet ligger inde med:
1. Sløjfningsattest, tømningsattest eller anmeldelse vedrørende olietank på ejendommen (herunder evt. ældre sager på matriklen).
2. Eventuelle øvrige byggetilladelser eller færdigmeldinger, som endnu ikke er indscannet på Weblager.

Såfremt kommunen ikke ligger inde med yderligere materiale ud over det, der fremgår af Weblager og BBR, bedes dette venligst bekræftet skriftligt pr. mail.

På forhånd tak for hjælpen.

Med venlig hilsen
${currentAgent.name}
${currentAgent.role}
Tlf.: ${currentAgent.phone} · ${currentAgent.email}`;

  // LOGIN GATE SKÆRM (mail@tobiasmeng.dk / HDKSA77B!)
  if (authChecked && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
              VM
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900 leading-tight">
                Vejle Mægleren · Olietank & Sags-AI
              </h1>
              <p className="text-xs text-slate-500">
                Log ind med din mæglerkonto for at åbne dine gemte sager
              </p>
            </div>
          </div>

          <form onSubmit={(e) => handleAgentLogin(e)} className="space-y-4">
            <div>
              <label htmlFor="gate-login-email" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mailadresse
              </label>
              <input
                id="gate-login-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-slate-900 outline-none text-slate-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="gate-login-password" className="block text-xs font-semibold text-slate-700">
                  Adgangskode
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{showPassword ? "Skjul" : "Vis"}</span>
                </button>
              </div>
              <input
                id="gate-login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Indtast din adgangskode..."
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-slate-900 outline-none text-slate-900"
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock size={15} />
              <span>{isLoggingIn ? "Logger ind..." : "Log ind"}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] py-3 px-3 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-3.5">
        {/* KOMPAKT TOPBAR MED ADRESSE-OPSLAG, SAGS-SKIFTER (UDEN ØVERSTE BJÆLKE MED MINE SAGER) & LOGIN */}
        <header className="bg-white rounded-2xl px-4 py-3 border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs tracking-tight">
                VM
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-sm text-slate-900 leading-tight">
                    Vejle Mægleren · Olietank & Sags-AI
                  </h1>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200/70 text-[10px] font-medium text-slate-600"
                    title="AI-forbrug på sagen (maks. 5,00 kr. pr. sag)"
                  >
                    <Radio size={10} className="text-emerald-500 animate-pulse" />
                    <span>{liveCostDkk.toFixed(2).replace(".", ",")} / 5,00 kr.</span>
                  </span>
                  {caseSavedNotice && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                      <Check size={10} /> Sag gemt
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {profile
                    ? `Aktiv sag: ${profile.adresse} · BFE ${profile.bbr.bfeNummer} · Matr. ${profile.matrikel.matrikelnummer}`
                    : "Indtast adresse eller vælg en gemt sag"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleExplicitSaveCase}
                disabled={!profile}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                title="Gem sagen permanent"
              >
                <Save size={13} />
                <span>Gem sag</span>
              </button>

              <button
                type="button"
                onClick={openBuyerModal}
                disabled={!profile}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Users size={13} className="text-slate-600" />
                <span>Købere</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">
                  {exactMatchingBuyers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadValuationDocument}
                disabled={!profile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <FileDown size={13} />
                <span>PDF Vurdering</span>
              </button>

              <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <span className="font-semibold">{currentAgent.email}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Log ud"
                  className="ml-1 text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* ADRESSE-SØGEFELT + KOMPAKT DROPDOWN TIL GEMTE SAGER (INGEN STOR MINE-SAGER BJÆLKE) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1" ref={wrapperRef}>
              <div className="flex items-center border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50/70 focus-within:bg-white focus-within:border-slate-900 transition-all">
                <Search className="text-slate-400 mr-2 flex-shrink-0" size={15} />
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
                  className="flex-1 bg-transparent outline-none text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400"
                  placeholder="Søg og opret ny sag på adresse (f.eks. Vinkelvej 24, 7100 Vejle)..."
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
                {isLoadingProfile || isSearching ? (
                  <span className="text-[11px] text-blue-600 font-semibold animate-pulse ml-2">
                    Henter data...
                  </span>
                ) : null}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors text-slate-800 text-xs cursor-pointer"
                      onClick={() => handleSelectAddress(suggestion)}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate font-medium">{suggestion.tekst}</span>
                      </div>
                      <span className="text-[11px] text-blue-600 font-semibold flex-shrink-0">
                        Åbn & gem sag →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {agentCases.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="saved-cases-select" className="sr-only">
                  Skift mellem gemte sager
                </label>
                <select
                  id="saved-cases-select"
                  value={caseId}
                  onChange={(e) => {
                    const found = agentCases.find((c) => c.id === e.target.value);
                    if (found) handleSelectSavedCase(found);
                  }}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 hover:bg-white text-xs font-semibold text-slate-800 outline-none focus:border-slate-900 cursor-pointer max-w-[260px]"
                >
                  {agentCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      📁 {c.address} ({c.boligarealM2 || "—"} m²)
                    </option>
                  ))}
                </select>
                {agentCases.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSavedCase(caseId)}
                    title="Slet aktuel sag fra gemte sager"
                    className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* TOP SEKTION: KORT / SKRÅFOTO TÆT PÅ (VENSTRE 2/3) + VIGTIGSTE BBR INFO (HØJRE 1/3 MED 1. SAL M²) */}
        {selectedAddress && profile && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
            {/* VENSTRE: SKRÅFOTO & LUFTFOTO (STARTER MEGET TÆTTERE PÅ) */}
            <div className="md:col-span-2">
              <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs h-[360px] relative group">
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

                  <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-md border border-slate-200/80 pointer-events-auto">
                    {visualMode === "skraafoto" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSkraafotoZoom((z) => Math.max(1.0, Number((z - 0.25).toFixed(2))))}
                          title="Zoom ud"
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          <ZoomOut size={14} />
                        </button>
                        <span className="text-[10px] font-bold text-slate-700 px-1">
                          {Math.round(skraafotoZoom * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setSkraafotoZoom((z) => Math.min(2.75, Number((z + 0.25).toFixed(2))))}
                          title="Zoom tættere på"
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          <ZoomIn size={14} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setSkraafotoLightbox(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <Maximize2 size={12} />
                      <span>Fuldt</span>
                    </button>
                  </div>
                </div>

                <div className="relative w-full h-full bg-slate-900 overflow-hidden">
                  {visualMode === "skraafoto" && (
                    <>
                      <iframe
                        key={`${profile.adresse}-${skraafotoOrientation}`}
                        src={getSkraafotoUrlForOrientation(skraafotoOrientation)}
                        className="absolute inset-0 w-full h-full"
                        style={{
                          width: "100%",
                          height: "100%",
                          border: 0,
                          transform: `scale(${skraafotoZoom})`,
                          transformOrigin: "50% 50%",
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
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/90 hover:bg-white backdrop-blur-sm shadow-lg border border-slate-200 text-slate-800 hover:scale-105 transition-all pointer-events-auto cursor-pointer"
                        >
                          <ChevronLeft size={16} />
                        </button>
                      </div>
                      <div className="absolute inset-y-0 right-3 flex items-center z-20 pointer-events-none">
                        <button
                          type="button"
                          onClick={handleNextOrientation}
                          title="Næste vinkel"
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/90 hover:bg-white backdrop-blur-sm shadow-lg border border-slate-200 text-slate-800 hover:scale-105 transition-all pointer-events-auto cursor-pointer"
                        >
                          <ChevronRight size={16} />
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

            {/* HØJRE FOR KORTET: BBR & MATRIKEL I PRIORITERET RÆKKEFØLGE (VIGTIGSTE FØRST + 1. SAL M²) */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs h-[360px] flex flex-col">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 flex-shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">BBR & Ejendomsfakta</h2>
                    <p className="text-[11px] text-slate-500">
                      {profile.bbr.boligtype} · Matr. {profile.matrikel.matrikelnummer}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-900 text-white">
                    BFE {profile.bbr.bfeNummer}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 text-xs overflow-y-auto pr-0.5">
                  {/* 1. VIGTIGST: BOLIGAREAL / PLAN & BEBYGGET (HUS / TOTAL) INKL. 1. SAL M² */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-900 text-white px-2.5 py-2 rounded-xl">
                      <span className="text-slate-300 block text-[10px]">Boligareal / Plan:</span>
                      <span className="font-extrabold text-sm">
                        {profile.bbr.boligarealM2} m² ({profile.bbr.antalEtager} plan)
                      </span>
                    </div>
                    <div className="bg-blue-50/90 border border-blue-200 px-2.5 py-2 rounded-xl">
                      <span className="text-blue-900 block text-[10px] font-semibold">
                        Bebygget (Hus / Total):
                      </span>
                      <span className="font-extrabold text-slate-900 text-xs block">
                        {profile.bbr.bebyggetArealHovedbygningM2} / {profile.bbr.samletBebyggetArealM2} m²
                      </span>
                      <span className="text-[10px] font-bold text-blue-800 block">
                        1. sal: {firstFloorM2} m²
                        {profile.bbr.kaelderArealM2 > 0 ? ` · Kælder: ${profile.bbr.kaelderArealM2} m²` : ""}
                      </span>
                    </div>
                  </div>

                  {/* 2. GRUNDAREAL & OPFØRT / OMBYGGET */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-slate-500 block text-[10px]">
                        Grund (Matr. {profile.matrikel.matrikelnummer}):
                      </span>
                      <span className="font-bold text-slate-900">{profile.matrikel.registreretArealM2} m²</span>
                    </div>
                    <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-slate-500 block text-[10px]">Opført / Ombygget:</span>
                      <span className="font-bold text-slate-900">
                        {profile.bbr.opfoerelsesaar ?? "—"}
                        {profile.bbr.ombygningsaar ? ` / ${profile.bbr.ombygningsaar}` : " (Original)"}
                      </span>
                    </div>
                  </div>

                  {/* 3. VARME & OLIETANK STATUS */}
                  <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                    <span className="text-slate-500 block text-[10px]">Varme & Olietank (BBR_TekniskAnlaeg):</span>
                    <span className="font-semibold text-slate-900 block">
                      {profile.bbr.varmeinstallationTekst} ·{" "}
                      {profile.bbr.tekniskeAnlaeg.length > 0
                        ? `${profile.bbr.tekniskeAnlaeg.length} tank(e) i BBR`
                        : "0 tanke i BBR"}
                    </span>
                  </div>

                  {/* 4. TAG & YDERVÆG */}
                  <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                    <span className="text-slate-500 block text-[10px]">Tag & Ydervæg (Klimaskærm):</span>
                    <span className="font-semibold text-slate-900">
                      {profile.bbr.tagmaterialeTekst} · {profile.bbr.ydervaegTekst}
                    </span>
                  </div>

                  {/* 5. VÆRELSER / BAD & BEBYGGELSESPROCENT */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-slate-500 block text-[10px]">Værelser / Bad:</span>
                      <span className="font-bold text-slate-900">
                        {profile.bbr.antalVaerelser ?? "—"} vær · {profile.bbr.antalBadevaerelser ?? "—"} bad
                      </span>
                    </div>
                    <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                      <span className="text-slate-500 block text-[10px]">Bebyggelses-% (BR18):</span>
                      <span className="font-bold text-slate-900">
                        {profile.plandata.faktiskBebyggelsesprocent}% (maks {profile.plandata.tilladtBebyggelsesprocent}%)
                      </span>
                    </div>
                  </div>

                  {/* 6. SEKUNDÆRE BYGNINGER */}
                  <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                    <span className="text-slate-500 block text-[10px]">Sekundære bygninger:</span>
                    <span className="font-semibold text-slate-900">
                      {profile.bbr.sekundaereBygninger.length > 0
                        ? profile.bbr.sekundaereBygninger
                            .map((s) => `${s.typeTekst} (${s.arealM2} m²)`)
                            .join(", ")
                        : "Ingen sekundære bygninger"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* HOVEDFANER: 1. FORSIDE (KOLDE FAKTA & OBS) | 2. DOKUMENTRUM | 3. VURDERING | 4. SÆRLIGE FORHOLD (AFSNIT 11 & OLIETANK) */}
        {selectedAddress && profile && (
          <nav
            aria-label="Sagsfaner"
            className="bg-white rounded-2xl p-1.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => setActiveTab("forside")}
              className={`flex-1 min-w-[175px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "forside"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span>1. Forside: Kolde Fakta & OBS</span>
              {totalObsCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                    activeTab === "forside" ? "bg-amber-400 text-slate-950" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {totalObsCount} OBS
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("dokumentrum")}
              className={`flex-1 min-w-[175px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "dokumentrum"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <FolderOpen size={14} />
              <span>2. Dokumentrum</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === "dokumentrum" ? "bg-white/20 text-white" : "bg-blue-50 text-blue-800"
                }`}
              >
                {uploadedDocs.length} / {totalDocumentsInRoom}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("vurdering")}
              className={`flex-1 min-w-[175px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "vurdering"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Ruler size={14} />
              <span>3. Vurdering & Plantegning</span>
              {activeValuation && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                    activeTab === "vurdering" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {(activeValuation.estimatDkk / 1e6).toFixed(2).replace(".", ",")} mio.
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("saerlige_forhold")}
              className={`flex-1 min-w-[195px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "saerlige_forhold"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Flame size={14} />
              <span>4. Særlige Forhold (Afsnit 11 & Olietank)</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === "saerlige_forhold" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                {structuredAfsnit11.length}
              </span>
            </button>
          </nav>
        )}

        {/* =====================================================================
            FANE 1: FORSIDE – VIGTIGE OBS-PUNKTER, FUNGERENDE SAGS-AI CHAT & KOLDE FAKTA
           ===================================================================== */}
        {selectedAddress && profile && activeTab === "forside" && (
          <div className="space-y-4">
            {/* A. BOKS MED VIGTIGE OBS-PUNKTER PÅ FORSIDEN SOM MÆGLER SKAL VÆRE OPMÆRKSOM PÅ */}
            <section className="bg-white rounded-2xl p-4 border-2 border-amber-400 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                    <AlertTriangle size={15} />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Vigtige OBS-punkter på sagen (Kræver mæglers opmærksomhed)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Alle kritiske BBR-/matrikel-afvigelser, olietank-forhold, dokumentfund og manglende bilag samlet ét sted
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Upload size={13} />
                    <span>{isAnalyzing ? "Genkender dokumenter..." : "+ Upload dokumenter / fotos"}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {!liveWithin15Pct && (
                  <div className="p-3 rounded-xl border border-red-200 bg-red-50/60 flex flex-col justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                        AREALAFVIGELSE &gt; 15 %
                      </span>
                      <h3 className="text-xs font-bold text-slate-900 mt-1">
                        Plantegning ({liveBruttoM2} m² brutto) afviger {liveDiffPct > 0 ? `+${liveDiffPct}` : liveDiffPct} % fra BBR ({liveBbrM2} m²)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("saerlige_forhold")}
                      className="self-start px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      Se Afsnit 11-forbehold →
                    </button>
                  </div>
                )}

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
                          {flag.register} · {flag.severity === "kritisk" ? "Kritisk OBS" : "OBS"}
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-slate-900 mt-1">{flag.title}</h3>
                      <p className="text-[11px] text-slate-700 mt-0.5">{flag.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {flag.afsnit11Clause && (
                        <button
                          type="button"
                          onClick={() => {
                            handleAddClauseToAfsnit11(flag.afsnit11Clause!);
                            setActiveTab("saerlige_forhold");
                          }}
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
                        <Check size={11} /> Afklaret
                      </button>
                    </div>
                  </div>
                ))}

                {attentionDocChecks.map((chk) => (
                  <div
                    key={chk.id}
                    className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                        GENKENDT: {chk.kategori} ({chk.fileName})
                      </span>
                      <h3 className="text-xs font-bold text-slate-900 mt-1">{chk.fundOverskrift}</h3>
                      <p className="text-[11px] text-slate-700 mt-0.5">{chk.fundDetaljer[0]}</p>
                    </div>
                    {chk.afsnit11Forslag && (
                      <button
                        type="button"
                        onClick={() => {
                          handleAddClauseToAfsnit11(chk.afsnit11Forslag!);
                          setActiveTab("saerlige_forhold");
                        }}
                        className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
                      >
                        <Plus size={11} /> Tilføj til Afsnit 11
                      </button>
                    )}
                  </div>
                ))}

                {missingCoreDocs.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase text-amber-700 block">
                        Afventer dokument ({rem.vigtighed})
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
                        className="px-2 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200 text-[11px] font-semibold cursor-pointer"
                      >
                        ✓ Modtaget
                      </button>
                    </div>
                  </div>
                ))}

                {totalObsCount === 0 && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>
                      Alle opmærksomhedspunkter og kernedokumenter på sagen er afklaret!
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* B. INTERAKTIV SAGS-AI CHAT (SVARER DIREKTE PÅ SPØRGSMÅL OM STATUS, OLIETANK, BILLEDER & BBR) */}
            <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Sparkles size={15} />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Spørg Sags-AI & Olietank-Vagthund
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Stil spørgsmål til sagen, tjek billeder for olietankspor, eller giv instrukser til Afsnit 11
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    "Hvor langt er du? Har du tjekket billeder på olietank eller synlige tegn herpå?",
                    "Giv mig overblik over BBR, 1. sal m² og sekundære bygninger",
                    "Carport/udhus er godkendt – fjern BBR-anmærkning",
                  ].map((quickPrompt) => (
                    <button
                      key={quickPrompt}
                      type="button"
                      disabled={isSendingToAi}
                      onClick={() => handleSendToCaseAssistant(quickPrompt)}
                      className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      {quickPrompt}
                    </button>
                  ))}
                </div>
              </div>

              {activeCase?.assistantMessages && activeCase.assistantMessages.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto mb-3 pr-1 bg-slate-50/60 p-3 rounded-xl border border-slate-100">
                  {activeCase.assistantMessages.slice(-8).map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-xl text-xs leading-relaxed border ${
                        msg.sender === "agent"
                          ? "bg-slate-900 text-white border-slate-900 ml-8"
                          : "bg-white text-slate-800 border-slate-200/90 mr-4 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`text-[10px] font-bold ${
                            msg.sender === "agent" ? "text-slate-300" : "text-blue-700"
                          }`}
                        >
                          {msg.sender === "agent" ? currentAgent.name : "Sags-AI · Olietank & Dokumentkontrol"}
                        </span>
                      </div>
                      <p className="text-xs whitespace-pre-line">{msg.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-600">
                  Skriv et spørgsmål nedenfor (f.eks. <em>&ldquo;Hvor langt er du? Har du tjekket billeder på olietank?&rdquo;</em>) eller vedhæft dokumenter/fotos direkte i chatten.
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
                  title="Vedhæft bilag eller fotos til Sags-AI"
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer flex-shrink-0"
                >
                  <Paperclip size={15} />
                </button>

                <label htmlFor="case-assistant-input" className="sr-only">
                  Spørg Sags-AI
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
                  placeholder="Spørg Sags-AI (f.eks. 'Hvor langt er du? Har du tjekket billeder på olietank?')..."
                  className="flex-1 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 outline-none focus:border-slate-900"
                />

                <button
                  type="submit"
                  disabled={isSendingToAi || (!assistantInput.trim() && assistantFiles.length === 0)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer flex-shrink-0"
                >
                  <Send size={13} />
                  <span>{isSendingToAi ? "Svarer..." : "Send"}</span>
                </button>
              </form>
            </section>

            {/* C. KOLDE FAKTA & VERIFICEREDE REGISTERPUNKTER PÅ FORSIDEN */}
            <section className="bg-emerald-50/40 rounded-2xl px-4 py-3.5 border border-emerald-200/70">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-emerald-700" />
                  <h2 className="text-xs font-bold text-emerald-950">
                    Kolde Fakta · Kontrolleret & Godkendt i Registrene ({verifiedItemsBottom.length} punkter)
                  </h2>
                </div>
                <span className="text-[10px] font-semibold text-emerald-800">
                  Verificeret mod BBR, Matrikel, Plandata, Miljø & CVR
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {verifiedItemsBottom.map((item, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 rounded-xl bg-white/95 border border-emerald-200/70 flex items-start gap-2 text-xs"
                  >
                    <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <strong className="text-slate-800 truncate">{item.label}</strong>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold flex-shrink-0">
                          {item.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* =====================================================================
            FANE 2: DOKUMENTRUM – KOMPAKT, LETLÆSELIGT & AUTOMATISK INDHOLDSGENKENDELSE
           ===================================================================== */}
        {selectedAddress && profile && activeTab === "dokumentrum" && (
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
            className={`bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-4 ${
              isDraggingOver ? "ring-2 ring-blue-500" : ""
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Kompakt Dokumentrum · Automatisk Indholdsgenkendelse (uanset filnavn)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Systemet læser indholdet i alle uploadede PDF&apos;er og fotos (op til 5,00 kr. AI-budget pr. sag) og kategoriserer dem automatisk
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Upload size={13} />
                  <span>{isAnalyzing ? "Læser indhold..." : "+ Upload dokumenter / fotos"}</span>
                </button>
                {uploadedDocs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => runAnalysis(uploadedDocs.filter((d) => d.file).map((d) => d.file!))}
                    disabled={isAnalyzing}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <RefreshCw size={12} className={isAnalyzing ? "animate-spin" : ""} />
                    <span>Gen-analyser</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownloadAllDocuments}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download size={12} />
                  <span>Hent alle</span>
                </button>
              </div>
            </div>

            {isAnalyzing && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2.5 animate-pulse">
                <RefreshCw size={15} className="animate-spin text-blue-600 flex-shrink-0" />
                <span>
                  Læser indholdet af uploadede dokumenter og fotos og krydstjekker mod BBR ({profile.bbr.boligarealM2} m²), Olietank-regler og Afsnit 11...
                </span>
              </div>
            )}

            {/* 1. KOMPAKT STATUS PÅ SAGENS 4 KERNEDOKUMENT-KRAV */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                1. Status på lovpligtige kernedokumenter
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                <div className="px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                    <span className="font-semibold text-slate-800 truncate">BBR, Matrikel & Plandata</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800">Hentet</span>
                </div>
                {profile.paamindelseDokumenter.map((rem) => {
                  const done = isReminderDocUploaded(rem.id);
                  return (
                    <div
                      key={rem.id}
                      className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                        done ? "bg-emerald-50/70 border-emerald-200" : "bg-amber-50/60 border-amber-200"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {done ? (
                          <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                        )}
                        <span className="font-semibold text-slate-800 truncate" title={rem.titel}>
                          {rem.titel.split("(")[0].trim()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleReminderResolved(rem.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer flex-shrink-0 ${
                          done
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        {done ? "✓ OK" : "Mangler"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. UPLOADEDE DOKUMENTER & FOTOS (MEGET KOMPAKT, LETLÆSELIG TABEL MED GENKENDT DOKUMENTTYPE) */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                2. Uploadede dokumenter & fotos ({uploadedDocs.length} stk.)
              </h3>
              {uploadedDocs.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {uploadedDocs.map((doc) => {
                    const check = documentChecks.find((c) => c.fileName === doc.name);
                    const recognizedType =
                      doc.detectedCategory || check?.kategori || (doc.type === "photo" ? "Besigtigelsesfoto" : "Sagsdokument");
                    return (
                      <div
                        key={doc.id}
                        className="px-3 py-2 bg-white hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
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
                              : "✓ OK"}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 flex-shrink-0">
                            {recognizedType}
                          </span>
                          <strong className="text-slate-900 truncate" title={doc.name}>
                            {doc.name}
                          </strong>
                          {check && (
                            <span className="text-[11px] text-slate-500 truncate hidden md:inline">
                              — {check.fundOverskrift}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {check?.afsnit11Forslag && (
                            <button
                              type="button"
                              onClick={() => handleAddClauseToAfsnit11(check.afsnit11Forslag!)}
                              className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-semibold cursor-pointer"
                            >
                              + Afsnit 11
                            </button>
                          )}
                          {doc.objectUrl && (
                            <a
                              href={doc.objectUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-semibold"
                            >
                              Åbn
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveUploadedItem(doc.id)}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Slet"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center text-xs text-slate-500">
                  Træk PDF&apos;er, tingbogsattest, byggesagsarkiv, tilstandsrapport eller fotos ind her — de genkendes automatisk på indholdet uanset filnavn.
                </div>
              )}
            </div>

            {/* 3. AUTOMATISK HENTEDE REGISTERDOKUMENTER (KOMPAKT 1-LINJES RÆKKER) */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                3. Automatisk hentede registerdokumenter ({profile.automatiskeDokumenter.length} stk.)
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {profile.automatiskeDokumenter.map((doc) => (
                  <div
                    key={doc.id}
                    className="px-3 py-2 bg-slate-50/40 hover:bg-white flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-800 flex-shrink-0">
                        {doc.kilde}
                      </span>
                      <strong className="text-slate-900 truncate">{doc.titel}</strong>
                      <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
                        — {doc.beskrivelse}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewAutoDoc(previewAutoDoc?.id === doc.id ? null : doc)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold cursor-pointer"
                      >
                        {previewAutoDoc?.id === doc.id ? "Skjul" : "Læs"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadAutoDoc(doc)}
                        className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
                      >
                        Hent
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {previewAutoDoc && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap border border-slate-700 max-h-72 overflow-y-auto">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-700">
                    <strong className="font-sans text-xs text-white">{previewAutoDoc.titel}</strong>
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
          </section>
        )}

        {/* =====================================================================
            FANE 3: VURDERING & PLANTEGNINGSKONTROL (L×B MOD BBR ±15 %)
           ===================================================================== */}
        {selectedAddress && profile && activeTab === "vurdering" && (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Vurderingsberegner · 3 Renoveringsniveauer
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {profile.bbr.boligarealM2} m² bolig (Bebygget: {profile.bbr.bebyggetArealHovedbygningM2}/{profile.bbr.samletBebyggetArealM2} m², 1. sal: {firstFloorM2} m²) · Områdepris:{" "}
                    {profile.vurdering.basisM2PrisDkk.toLocaleString("da-DK")} kr./m²
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    <ImagePlus size={13} />
                    <span>Upload fotos ({uploadedPhotos.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadValuationDocument}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <FileDown size={13} />
                    <span>Download Vurderingsdokument</span>
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

            <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Ruler size={15} className="text-blue-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Plantegnings- & Arealberegner (L×B mod BBR ±15 %)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Indvendige mål tillægges 10 cm pr. indervæg og 35 cm pr. ydervæg
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
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

              <form onSubmit={handleCalculateFloorplan} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
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
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold">
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
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isSavingFloorplan ? "Gemmer..." : "Gem L×B kontrol på sagen"}
                  </button>
                  {!liveWithin15Pct && (
                    <button
                      type="button"
                      onClick={() =>
                        handleAddClauseToAfsnit11(
                          `Ved kontrolopmåling af plantegning (indvendige mål ${liveLm} × ${liveBm} m korrigeret for 10 cm indervægge og 35 cm ydervægge) er det beregnede bruttoareal opgjort til ca. ${liveBruttoM2} m² mod det i BBR registrerede boligareal på ${liveBbrM2} m² (afvigelse på ${liveDiffPct} %). Køber er gjort udtrykkeligt opmærksom på arealafvigelsen og kan ikke rette krav mod sælger i anledning heraf.`
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      + Overfør afvigelse til Afsnit 11
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>
        )}

        {/* =====================================================================
            FANE 4: SÆRLIGE FORHOLD – AFSNIT 11, OLIETANK BESLUTNINGSMAILS & SÆLGERSKEMA
           ===================================================================== */}
        {selectedAddress && profile && activeTab === "saerlige_forhold" && (
          <div className="space-y-4">
            {/* 1. KØBSAFTALENS AFSNIT 11 – INDIVIDUELLE VILKÅR */}
            <section className="bg-white rounded-2xl p-4 border-2 border-slate-900 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 text-white mb-1">
                    Købsaftalens Afsnit 11 · Individuelle Vilkår
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    Forslag til Købsaftalens Afsnit 11 ({structuredAfsnit11.length} stk.)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Genereret ud fra BBR, Matrikel, Olietank-kontrol og uploadede dokumenter (uden ulovlig mægler-ansvarsfraskrivelse)
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

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
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
            </section>

            {/* 2. OLIETANK-VAGTHUND: GOLDEN STANDARD BESLUTNINGSMAIL TIL SÆLGER/BOBESTYRER (MULIGHED 1, 2 OG 3) + KOMMUNEMAIL */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      Golden Standard · LFFE §§ 24-26
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 mt-1">
                      Beslutningsmail til Sælger / Bobestyrer (Mulighed 1, 2 og 3)
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyClause("golden-seller-mail", goldenStandardSellerMail)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    {copiedClauseId === "golden-seller-mail" ? <Check size={13} /> : <Copy size={13} />}
                    <span>
                      {copiedClauseId === "golden-seller-mail" ? "Mail kopieret!" : "Kopiér beslutningsmail"}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Sælgertype:</label>
                    <select
                      value={oilSellerType}
                      onChange={(e) => setOilSellerType(e.target.value as "privat" | "doedsbo")}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 font-semibold text-slate-800"
                    >
                      <option value="privat">Privat sælger (du / I)</option>
                      <option value="doedsbo">Dødsbo v/bobestyrer (boet)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Handelsstadie:</label>
                    <select
                      value={oilStage}
                      onChange={(e) =>
                        setOilStage(e.target.value as "foer_udbud" | "under_udbud" | "konkret_bud")
                      }
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 font-semibold text-slate-800"
                    >
                      <option value="foer_udbud">Før udbud</option>
                      <option value="under_udbud">Under udbud (uden bud)</option>
                      <option value="konkret_bud">Konkret bud modtaget (før købsaftale)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Konkret observation på grunden / billeder:
                  </label>
                  <input
                    type="text"
                    value={oilFindingText}
                    onChange={(e) => setOilFindingText(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white outline-none focus:border-slate-900"
                  />
                </div>

                <pre className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-800 whitespace-pre-wrap font-sans leading-relaxed max-h-72 overflow-y-auto">
                  {goldenStandardSellerMail}
                </pre>
              </div>

              {/* HØJRE: KOMMUNEMAIL + SÆLGERSKEMA */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">
                        Mail til Kommune / Byggesagsarkiv (Weblager)
                      </h3>
                      <p className="text-[10px] text-slate-500">
                        Indhent skriftlig bekræftelse på evt. olietank-/byggesagsakter
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyClause("muni-mail", municipalityArchiveMail)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      {copiedClauseId === "muni-mail" ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedClauseId === "muni-mail" ? "Kopieret" : "Kopiér"}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
                    {municipalityArchiveMail}
                  </pre>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">
                        Spørgsmål til Sælger ({activeCase?.status || "udkast"})
                      </h3>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none bg-slate-100 px-2 py-1 rounded-lg">
                      <input
                        type="checkbox"
                        checked={Boolean(activeCase?.skipSellerQuestionnaire)}
                        onChange={(e) => handleToggleSkipSellerQuestionnaire(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Fravælg skema</span>
                    </label>
                  </div>

                  {!activeCase?.skipSellerQuestionnaire && (
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Sælgers / Bobestyrers navn"
                          value={sellerName}
                          onChange={(e) => setSellerName(e.target.value)}
                          onBlur={() => persistSellerInfo()}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white text-xs outline-none"
                        />
                        <input
                          type="email"
                          placeholder="saelger@mail.dk"
                          value={sellerEmail}
                          onChange={(e) => setSellerEmail(e.target.value)}
                          onBlur={() => persistSellerInfo()}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white text-xs outline-none"
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
                          <span
                            className={`text-[11px] ${
                              mailStatus.sent ? "text-emerald-700 font-semibold" : "text-red-600"
                            }`}
                          >
                            {mailStatus.sent ? "✓ Sendt" : mailStatus.error}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* FULDSKÆRMS LIGHTBOX TIL SKRÅFOTO (TÆT PÅ) */}
      {skraafotoLightbox && profile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          onClick={() => setSkraafotoLightbox(false)}
        >
          <div
            className="relative w-[94vw] max-w-6xl h-[85vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/15"
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
              className="absolute inset-0 w-full h-full"
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                transform: `scale(${skraafotoZoom})`,
                transformOrigin: "50% 50%",
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
    </div>
  );
}
