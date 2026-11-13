"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  HardHat,
  HelpCircle,
  History,
  Keyboard,
  Layers,
  Lock,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AppProcessGuide } from "@/components/AppProcessGuide";
import { AuthRoleBar } from "@/components/AuthRoleBar";
import { BlScannerModal } from "@/components/BlScannerModal";
import { ErpMarginPanel } from "@/components/ErpMarginPanel";
import { FeatureSettingsPanel } from "@/components/FeatureSettingsPanel";
import { IntakeFieldsBuilder } from "@/components/IntakeFieldsBuilder";
import { IntakeFormPanel } from "@/components/IntakeFormPanel";
import { OuvrageComposerForm } from "@/components/OuvrageComposerForm";
import { PennylanePushModal } from "@/components/PennylanePushModal";
import { SignaturePadModal } from "@/components/SignaturePadModal";
import { downloadQuotePdf, shareOrEmailQuotePdf } from "@/lib/pdf";
import {
  DEFAULT_HOURLY_LOADED_COST,
  computeErpAnalytics,
  computeLineTotalHt,
  computeQuoteTotals,
  enrichLineFromCatalog,
  formatCurrency,
  generateQuoteNumber,
  getCostNatureLabel,
  round2,
} from "@/lib/quote-calc";
import {
  DEFAULT_FEATURE_FLAGS,
  addCatalogItem,
  applyConversationalSkillUpdate,
  applyTradeInflation,
  canRoleManageRules,
  deleteTradeSkill,
  fetchAppFeatureFlags,
  fetchCatalog,
  fetchCurrentUserProfile,
  fetchLocalScannedBls,
  fetchSavedQuotes,
  fetchSkillInstructionLogs,
  fetchTradeSkills,
  getRoleLabel,
  isSupabaseConfigured,
  removeCatalogItem,
  saveAppFeatureFlags,
  saveLocalScannedBl,
  saveQuote,
  upsertTradeSkill,
} from "@/lib/supabase";
import type {
  AgentApiPayload,
  AppFeatureFlags,
  CatalogItem,
  ChatMessage,
  CostNature,
  DocumentType,
  IntakeFieldDefinition,
  ProposedSkillUpdate,
  QuoteDraft,
  QuoteLine,
  SavedQuote,
  ScannedBlRecord,
  SkillInstructionUpdateLog,
  TradeSkill,
  UserProfile,
} from "@/lib/types";

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [alt: number]: { transcript: string };
    };
  };
}

function createEmptyDraft(
  tradeSlug = "menuiserie-ext",
  docType: DocumentType = "devis"
): QuoteDraft {
  const isTs = docType === "avenant_ts";
  return {
    quote_number: generateQuoteNumber(docType),
    document_type: docType,
    parent_project_ref: isTs ? "AFF-2026-042" : "",
    trade_slug: tradeSlug,
    client_name: "",
    client_email: "",
    client_phone: "",
    site_address: "",
    title: isTs
      ? "Avenant — Travaux supplémentaires constatés sur chantier"
      : "Devis ouvrages & prestations",
    notes: isTs
      ? "Travaux supplémentaires exécutés après accord signé du maître d'ouvrage sur chantier."
      : "Validité du devis : 30 jours. Acompte de 30 % à la commande.",
    intake_data: {},
    include_intake_on_pdf: true,
    include_ouvrage_detail_on_pdf: true,
    signature: null,
    lines: [],
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<
    "studio" | "skills" | "catalog" | "history" | "settings" | "guide"
  >("studio");
  const [studioPane, setStudioPane] = useState<"chat" | "intake" | "quote">("chat");
  const [featureFlags, setFeatureFlags] = useState<AppFeatureFlags>(
    DEFAULT_FEATURE_FLAGS
  );

  // État du bandeau menu gauche : replié/déplié (desktop) et tiroir (mobile)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("crm_btp_sidebar_collapsed");
      if (stored !== null) {
        setIsSidebarCollapsed(stored === "true");
      }
    } catch {}
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("crm_btp_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const [speechSupported, setSpeechSupported] = useState(true);
  const [inputMode, setInputMode] = useState<"voice" | "keyboard">("voice");

  // Utilisateur & Rôle RLS ('commercial' | 'directeur_commercial' | 'admin')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const canManageRules = useMemo(
    () => canRoleManageRules(userProfile?.role),
    [userProfile]
  );

  const [tradeSkills, setTradeSkills] = useState<TradeSkill[]>([]);
  const [skillLogs, setSkillLogs] = useState<SkillInstructionUpdateLog[]>([]);
  const [draft, setDraft] = useState<QuoteDraft>(() =>
    createEmptyDraft("menuiserie-ext", "devis")
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [scannedBls, setScannedBls] = useState<ScannedBlRecord[]>([]);
  const [hourlyLoadedCost, setHourlyLoadedCost] = useState<number>(
    DEFAULT_HOURLY_LOADED_COST
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Bonjour ! Chiffrez un devis ou un Avenant TS à la voix, au clavier ou via les Ouvrages Composés (qui ventilent automatiquement Heures, Matière et Matériel pour l'ERP).",
      timestamp: new Date().toISOString(),
    },
  ]);

  const [textInput, setTextInput] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [agentProvider, setAgentProvider] = useState<"mistral" | "demo-fallback" | null>(null);
  const [readyToValidate, setReadyToValidate] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [pennylaneModalQuote, setPennylaneModalQuote] = useState<QuoteDraft | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showBlModal, setShowBlModal] = useState(false);

  // État édition Skills Métiers + Formulaires paramétrables
  const [selectedSkillSlug, setSelectedSkillSlug] = useState("menuiserie-ext");
  const [editSkillName, setEditSkillName] = useState("");
  const [editSkillSlug, setEditSkillSlug] = useState("");
  const [editSkillVat, setEditSkillVat] = useState("10");
  const [editSkillInstructions, setEditSkillInstructions] = useState("");
  const [editSkillFields, setEditSkillFields] = useState<IntakeFieldDefinition[]>([]);
  const [isCreatingNewSkill, setIsCreatingNewSkill] = useState(false);

  // État Base de Prix & Réactualisation MCP
  const [catalogFilterTrade, setCatalogFilterTrade] = useState("all");
  const [newCatRef, setNewCatRef] = useState("");
  const [newCatTrade, setNewCatTrade] = useState("menuiserie-ext");
  const [newCatName, setNewCatName] = useState("");
  const [newCatUnit, setNewCatUnit] = useState("u");
  const [newCatNature, setNewCatNature] = useState<CostNature>("matiere");
  const [newCatCost, setNewCatCost] = useState("");
  const [newCatCoef, setNewCatCoef] = useState("1.50");
  const [newCatVat, setNewCatVat] = useState("10");

  const [inflationTrade, setInflationTrade] = useState("menuiserie-ext");
  const [inflationPct, setInflationPct] = useState("3.5");
  const [inflationSource, setInflationSource] = useState("Indice Matériaux / MCP");

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const totals = useMemo(() => computeQuoteTotals(draft.lines), [draft.lines]);

  const erpAnalytics = useMemo(
    () =>
      computeErpAnalytics(draft.lines, catalog, hourlyLoadedCost, {
        greenMarginThresholdPct: featureFlags.greenMarginThresholdPct,
        orangeMarginThresholdPct: featureFlags.orangeMarginThresholdPct,
        blockCommercialOnRedMargin:
          featureFlags.enableErpMarginLight &&
          featureFlags.blockCommercialOnRedMargin,
      }),
    [draft.lines, catalog, hourlyLoadedCost, featureFlags]
  );

  const activeModulesCount = useMemo(
    () =>
      [
        featureFlags.enableOuvragesComposes,
        featureFlags.enableErpMarginLight,
        featureFlags.enableAvenantTsMode,
        featureFlags.enableMobileSignature,
        featureFlags.enablePhotoScanBl,
        featureFlags.enablePennylaneBridge,
        featureFlags.enableIntakeForms,
        featureFlags.enableConversationalRules,
      ].filter(Boolean).length,
    [featureFlags]
  );

  const ouvragesForTrade = useMemo(() => {
    const allOuvrages = catalog.filter((c) => c.item_kind === "ouvrage");
    const matching = allOuvrages.filter((c) => c.trade_slug === draft.trade_slug);
    return matching.length > 0 ? matching : allOuvrages;
  }, [catalog, draft.trade_slug]);

  const quickPrompts = useMemo(() => {
    if (draft.document_type === "avenant_ts") {
      return [
        "Imprévu chantier : 4 ml de tranchée et le déplacement",
        "Ajoute 2h de main-d'œuvre supplémentaire",
        "Oui c'est validé, prêt à faire signer",
      ];
    }
    if (draft.trade_slug === "menuiserie-ext") {
      return [
        "1 portail coulissant 4m et 12 ml de clôture pour M. Martin",
        "Passe la TVA à 10 %",
        "Oui c'est parfait, je valide le devis",
      ];
    }
    if (draft.trade_slug === "electricite") {
      return [
        "1 tableau 2 rangées et 1 borne IRVE pour Mme Dupont",
        "Ajoute 4 spots IP65 et le déplacement",
        "Oui c'est parfait, je valide le devis",
      ];
    }
    return [
      "Ajoute 2h de main-d'œuvre et le déplacement",
      "Passe la TVA à 10 %",
      "Oui c'est parfait, je valide le devis",
    ];
  }, [draft.document_type, draft.trade_slug]);

  const activeTradeSkill = useMemo(
    () => tradeSkills.find((s) => s.slug === draft.trade_slug) ?? tradeSkills[0],
    [tradeSkills, draft.trade_slug]
  );

  const activeIntakeFields = useMemo(
    () => activeTradeSkill?.intake_fields ?? [],
    [activeTradeSkill]
  );

  const filledIntakeCount = useMemo(
    () =>
      activeIntakeFields.filter((f) => {
        const v = draft.intake_data?.[f.id];
        return v !== undefined && v !== "";
      }).length,
    [activeIntakeFields, draft.intake_data]
  );

  const filteredCatalog = useMemo(
    () =>
      catalogFilterTrade === "all"
        ? catalog
        : catalog.filter((c) => c.trade_slug === catalogFilterTrade),
    [catalog, catalogFilterTrade]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSpeech = Boolean(
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
      );
      setSpeechSupported(hasSpeech);
      if (!hasSpeech) {
        setInputMode("keyboard");
        setVoiceOutputEnabled(false);
      }
    }

    fetchCurrentUserProfile().then((profile) => {
      setUserProfile(profile);
      fetchSavedQuotes(profile).then(setSavedQuotes);
    });

    fetchTradeSkills().then((skills) => {
      setTradeSkills(skills);
      const initial =
        skills.find((s) => s.slug === "menuiserie-ext") ?? skills[0];
      if (initial) {
        loadSkillIntoEditor(initial);
      }
    });
    fetchSkillInstructionLogs().then(setSkillLogs);
    fetchCatalog().then(setCatalog);
    setScannedBls(fetchLocalScannedBls());
    fetchAppFeatureFlags().then((flags) => {
      setFeatureFlags(flags);
      setHourlyLoadedCost(flags.defaultHourlyLoadedCost || DEFAULT_HOURLY_LOADED_COST);
    });
  }, []);

  const handleUpdateFeatureFlags = (nextFlags: AppFeatureFlags, label?: string) => {
    setFeatureFlags(nextFlags);
    if (nextFlags.defaultHourlyLoadedCost !== featureFlags.defaultHourlyLoadedCost) {
      setHourlyLoadedCost(nextFlags.defaultHourlyLoadedCost);
    }
    if (!nextFlags.enableAvenantTsMode && draft.document_type === "avenant_ts") {
      handleSwitchDocumentType("devis");
    }
    if (!nextFlags.enableIntakeForms && studioPane === "intake") {
      setStudioPane("chat");
    }
    void saveAppFeatureFlags(nextFlags, userProfile);
    if (label) {
      setStatusBanner(label);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimTranscript]);

  const handleProfileChanged = (nextProfile: UserProfile | null) => {
    setUserProfile(nextProfile);
    fetchSavedQuotes(nextProfile).then(setSavedQuotes);
  };

  const loadSkillIntoEditor = (skill: TradeSkill) => {
    setIsCreatingNewSkill(false);
    setSelectedSkillSlug(skill.slug);
    setEditSkillSlug(skill.slug);
    setEditSkillName(skill.name);
    setEditSkillVat(String(skill.default_vat_rate));
    setEditSkillInstructions(skill.system_instructions);
    setEditSkillFields(skill.intake_fields ?? []);
  };

  const startNewSkillCreation = () => {
    if (!canManageRules) return;
    setIsCreatingNewSkill(true);
    setEditSkillSlug("");
    setEditSkillName("");
    setEditSkillVat("20");
    setEditSkillInstructions(
      "Indiquez les réflexes métier de l'agent : accessoires liés obligatoires, pourcentage de perte/chute, questions techniques…"
    );
    setEditSkillFields([
      {
        id: "surface_m2",
        label: "Surface ou quantité estimée",
        type: "number",
        placeholder: "Ex: 25",
        required: false,
      },
    ]);
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRules || !editSkillName.trim() || !editSkillInstructions.trim()) return;
    try {
      const slugToUse = isCreatingNewSkill ? editSkillSlug || editSkillName : editSkillSlug;

      const saved = await upsertTradeSkill(
        {
          slug: slugToUse,
          name: editSkillName.trim(),
          default_vat_rate: Number(editSkillVat) || 20,
          system_instructions: editSkillInstructions.trim(),
          intake_fields: editSkillFields,
        },
        userProfile
      );

      const refreshed = await fetchTradeSkills();
      setTradeSkills(refreshed);
      loadSkillIntoEditor(saved);
      setDraft((d) => ({ ...d, trade_slug: saved.slug }));
      setStatusBanner(`Métier « ${saved.name} » enregistré dans Supabase.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const handleApplyConversationalUpdate = async (
    messageId: string,
    proposal: ProposedSkillUpdate
  ) => {
    try {
      const targetSkill =
        tradeSkills.find((s) => s.slug === proposal.trade_slug) ?? activeTradeSkill;
      if (!targetSkill) return;

      const updated = await applyConversationalSkillUpdate(
        targetSkill,
        proposal,
        userProfile
      );

      const refreshedSkills = await fetchTradeSkills();
      setTradeSkills(refreshedSkills);
      if (selectedSkillSlug === updated.slug) {
        loadSkillIntoEditor(updated);
      }
      setSkillLogs(await fetchSkillInstructionLogs());

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.proposed_skill_update
            ? {
                ...m,
                proposed_skill_update: { ...m.proposed_skill_update, applied: true },
              }
            : m
        )
      );

      setStatusBanner(
        `Instructions du métier « ${updated.name} » actualisées et journalisées par ${
          userProfile?.full_name ?? "Directeur Commercial"
        }.`
      );
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const handleDeleteSkill = async (slug: string) => {
    try {
      await deleteTradeSkill(slug, userProfile);
      const refreshed = await fetchTradeSkills();
      setTradeSkills(refreshed);
      if (refreshed[0]) {
        loadSkillIntoEditor(refreshed[0]);
      }
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const speakText = (text: string) => {
    if (
      !voiceOutputEnabled ||
      inputMode === "keyboard" ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/^\(Mode démo[^)]*\)\s*/i, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "fr-FR";
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  const sendToAgent = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isLoadingAgent) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setTextInput("");
    setInterimTranscript("");
    setIsLoadingAgent(true);
    setStatusBanner(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userProfile?.access_token) {
        headers.Authorization = `Bearer ${userProfile.access_token}`;
      }

      const res = await fetch("/api/agent", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: updatedMessages,
          currentDraft: draft,
          catalog,
          tradeSkill: activeTradeSkill,
          userRole: userProfile?.role ?? "commercial",
        }),
      });

      const data = (await res.json()) as AgentApiPayload & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Erreur lors de l'appel à l'agent");
      }

      setAgentProvider(data.provider);
      setReadyToValidate(Boolean(data.ready_to_validate));

      setDraft((prev) => ({
        ...prev,
        client_name: data.client_name ?? prev.client_name,
        client_email: data.client_email ?? prev.client_email,
        client_phone: data.client_phone ?? prev.client_phone,
        site_address: data.site_address ?? prev.site_address,
        parent_project_ref: data.parent_project_ref ?? prev.parent_project_ref,
        title: data.title ?? prev.title,
        notes: data.notes ?? prev.notes,
        intake_data: data.intake_data
          ? { ...prev.intake_data, ...data.intake_data }
          : prev.intake_data,
        lines: Array.isArray(data.lines)
          ? data.lines.map((l) =>
              enrichLineFromCatalog(
                {
                  id: crypto.randomUUID(),
                  catalog_ref: l.catalog_ref,
                  designation: l.designation,
                  quantity: Number(l.quantity),
                  unit: l.unit,
                  unit_price_ht: Number(l.unit_price_ht),
                  vat_rate: Number(l.vat_rate),
                  item_kind: l.item_kind,
                  cost_nature: l.cost_nature,
                  hours_per_unit: l.hours_per_unit,
                  unit_cost_ht: l.unit_cost_ht,
                  components: l.components,
                },
                catalog
              )
            )
          : prev.lines,
      }));

      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString(),
        proposed_skill_update: data.proposed_skill_update ?? undefined,
      };
      setMessages((prev) => [...prev, botMsg]);
      speakText(data.reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setStatusBanner(`Erreur : ${msg}`);
    } finally {
      setIsLoadingAgent(false);
    }
  };

  const handleSendIntakeSummaryToAgent = () => {
    const summaryParts = activeIntakeFields
      .map((f) => {
        const val = draft.intake_data?.[f.id];
        if (val === undefined || val === "") return null;
        const formatted = typeof val === "boolean" ? (val ? "Oui" : "Non") : String(val);
        return `${f.label}: ${formatted}`;
      })
      .filter(Boolean);

    const promptText =
      summaryParts.length > 0
        ? `Voici le relevé commercial de la fiche d'entrevue (${activeTradeSkill?.name ?? ""}) : ${summaryParts.join(" ; ")}. Propose ou mets à jour les lignes du devis correspondantes.`
        : `Prépare une base de devis type à partir de la fiche d'entrevue pour le métier ${activeTradeSkill?.name ?? "Généraliste"}.`;

    setStudioPane("chat");
    void sendToAgent(promptText);
  };

  const toggleVoiceRecording = () => {
    if (typeof window === "undefined") return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      setInputMode("keyboard");
      setStatusBanner(
        "Reconnaissance vocale indisponible sur ce navigateur : bascule automatique en Mode Clavier."
      );
      return;
    }

    window.speechSynthesis?.cancel();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalSpoken = "";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalSpoken += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript((finalSpoken + interim).trim());
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        setStatusBanner(`Micro : ${event.error} — Vous pouvez utiliser le Mode Clavier.`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (finalSpoken.trim()) {
        void sendToAgent(finalSpoken.trim());
      }
    };

    recognitionRef.current = recognition;
    setInterimTranscript("");
    setIsListening(true);
    recognition.start();
  };

  const updateLine = (id: string, patch: Partial<QuoteLine>) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const handleInsertOuvrage = (ouv: CatalogItem) => {
    setDraft((prev) => {
      const existingIdx = prev.lines.findIndex(
        (l) => l.catalog_ref === ouv.supplier_ref || l.designation === ouv.name
      );
      if (existingIdx >= 0) {
        const nextLines = [...prev.lines];
        nextLines[existingIdx] = {
          ...nextLines[existingIdx],
          quantity: round2(nextLines[existingIdx].quantity + 1),
        };
        return { ...prev, lines: nextLines };
      }
      const line = enrichLineFromCatalog(
        {
          id: crypto.randomUUID(),
          catalog_ref: ouv.supplier_ref,
          designation: ouv.name,
          quantity: 1,
          unit: ouv.unit,
          unit_price_ht: ouv.unit_price_ht,
          vat_rate: ouv.vat_rate || (activeTradeSkill?.default_vat_rate ?? 10),
        },
        catalog
      );
      return { ...prev, lines: [...prev.lines, line] };
    });
    setStatusBanner(
      `Ouvrage « ${ouv.name.replace(/^Ouvrage\s*:\s*/i, "")} » inséré (${
        ouv.hours_per_unit ?? 0
      } h + fournitures ventilées automatiquement).`
    );
  };

  const handleSwitchDocumentType = (nextType: DocumentType) => {
    if ((draft.document_type ?? "devis") === nextType) return;
    const isTs = nextType === "avenant_ts";
    setDraft((prev) => ({
      ...prev,
      document_type: nextType,
      quote_number: generateQuoteNumber(nextType),
      parent_project_ref: isTs ? prev.parent_project_ref || "AFF-2026-042" : "",
      title:
        prev.lines.length === 0
          ? isTs
            ? "Avenant — Travaux supplémentaires constatés sur chantier"
            : "Devis ouvrages & prestations"
          : prev.title,
      notes: isTs
        ? "Travaux supplémentaires exécutés après accord signé du maître d'ouvrage sur chantier."
        : "Validité du devis : 30 jours. Acompte de 30 % à la commande.",
    }));
  };

  const handleConvertBlToAvenantTs = (record: ScannedBlRecord, marginCoef: number) => {
    const defaultVat = activeTradeSkill?.default_vat_rate ?? 10;
    const tsLines: QuoteLine[] = record.lines.map((l) => ({
      id: crypto.randomUUID(),
      designation: l.designation,
      quantity: l.quantity,
      unit: l.unit,
      unit_cost_ht: l.unit_cost_ht,
      unit_price_ht: round2(l.unit_cost_ht * marginCoef),
      vat_rate: defaultVat,
      item_kind: "article",
      cost_nature: l.cost_nature,
      hours_per_unit: 0,
    }));

    setDraft((prev) => ({
      ...prev,
      document_type: "avenant_ts",
      quote_number: generateQuoteNumber("avenant_ts"),
      parent_project_ref: record.project_ref || prev.parent_project_ref || "AFF-2026-042",
      title: `Avenant TS — Fournitures complémentaires (${record.supplier_name} ${record.bl_number})`,
      notes: `Refacturation sur accord client suite au BL ${record.bl_number} du ${record.bl_date}.`,
      signature: null,
      lines: tsLines,
    }));
    setActiveTab("studio");
    setStudioPane("quote");
    setStatusBanner(
      `BL ${record.bl_number} converti en Avenant TS (coef ×${marginCoef}) prêt à faire signer sur mobile !`
    );
  };

  const addManualLine = () => {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: crypto.randomUUID(),
          designation: "Nouvel article",
          quantity: 1,
          unit: "u",
          unit_price_ht: 0,
          vat_rate: activeTradeSkill?.default_vat_rate ?? 20,
          item_kind: "article",
          cost_nature: "matiere",
        },
      ],
    }));
  };

  const deleteLine = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.id !== id),
    }));
  };

  const resetQuote = () => {
    const docType = draft.document_type ?? "devis";
    setDraft(createEmptyDraft(draft.trade_slug, docType));
    setReadyToValidate(false);
    setStatusBanner(null);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          docType === "avenant_ts"
            ? `Nouvel Avenant TS chantier prêt (${activeTradeSkill?.name ?? "Métier"}).`
            : `Nouveau devis (${activeTradeSkill?.name ?? "Métier"}) prêt.`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSaveQuote = async (status: SavedQuote["status"] = "validated") => {
    try {
      const { storage } = await saveQuote(draft, status, userProfile);
      const refreshed = await fetchSavedQuotes(userProfile);
      setSavedQuotes(refreshed);
      const docLabel = draft.document_type === "avenant_ts" ? "Avenant TS" : "Devis";
      setStatusBanner(
        storage === "supabase"
          ? `${docLabel} ${draft.quote_number} consigné dans Supabase (RLS appliquée).`
          : `${docLabel} ${draft.quote_number} sauvegardé localement pour ${
              userProfile?.full_name ?? "cet utilisateur"
            }.`
      );
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Erreur de sauvegarde");
    }
  };

  const handleSendPdfToClient = async () => {
    if (erpAnalytics.requires_manager_approval && !canManageRules) {
      setStatusBanner(
        "Envoi bloqué (Feu Rouge de marge) : basculez en profil Directeur Commercial ou ajustez les prix de vente."
      );
      return;
    }
    await handleSaveQuote("sent");
    const mode = await shareOrEmailQuotePdf(draft, activeIntakeFields);
    setStatusBanner(
      mode === "shared"
        ? `Document ${draft.quote_number} enregistré et partagé avec le client.`
        : `PDF téléchargé et e-mail préparé pour ${draft.client_email || "le client"}.`
    );
  };

  const handleAddCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRules || !newCatName.trim()) return;
    try {
      await addCatalogItem(
        {
          supplier_ref: newCatRef.trim() || undefined,
          trade_slug: newCatTrade,
          name: newCatName.trim(),
          unit: newCatUnit.trim() || "u",
          item_kind: "article",
          cost_nature: newCatNature,
          hours_per_unit: newCatNature === "heures" ? 1 : 0,
          cost_price_ht: Number(newCatCost) || 0,
          margin_coef: Number(newCatCoef) || 1.4,
          vat_rate: Number(newCatVat) || 20,
          price_source: "Manuel UI",
        },
        userProfile
      );
      setNewCatRef("");
      setNewCatName("");
      setNewCatCost("");
      setCatalog(await fetchCatalog());
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const handleCreateCompositeOuvrage = async (payload: {
    supplier_ref?: string;
    trade_slug: string;
    name: string;
    unit: string;
    margin_coef: number;
    vat_rate: number;
    components: CatalogItem["components"];
  }) => {
    if (!canManageRules) return;
    try {
      const created = await addCatalogItem(
        {
          supplier_ref: payload.supplier_ref,
          trade_slug: payload.trade_slug,
          name: payload.name,
          unit: payload.unit,
          item_kind: "ouvrage",
          cost_nature: "matiere",
          components: payload.components,
          cost_price_ht: 0,
          margin_coef: payload.margin_coef,
          vat_rate: payload.vat_rate,
          price_source: "Recette Ouvrage UI",
        },
        userProfile
      );
      setCatalog(await fetchCatalog());
      setStatusBanner(
        `Ouvrage composé « ${created.name} » enregistré (${created.hours_per_unit ?? 0} h / ${
          created.unit
        }).`
      );
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const handleApplyInflation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRules) return;
    const pct = Number(inflationPct);
    if (!Number.isFinite(pct) || pct === 0) return;
    try {
      const count = await applyTradeInflation(
        inflationTrade,
        pct,
        inflationSource.trim() || "Réactualisation MCP",
        userProfile
      );
      setCatalog(await fetchCatalog());
      setStatusBanner(
        `${count} article(s)/ouvrage(s) réactualisé(s) (${pct > 0 ? "+" : ""}${pct} %) avec historique.`
      );
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const handleCopyMcpPrompt = async () => {
    const mcpPrompt = `Via le serveur MCP Supabase (outil execute_sql), consulte la table public.catalog_items (métier : "${inflationTrade === "all" ? "tous métiers" : inflationTrade}"), recherche les derniers tarifs fournisseurs / indices matériaux actuels du marché français, puis mets à jour les prix d'achat HT en appelant la fonction SQL public.mcp_upsert_catalog_price(p_supplier_ref, p_name, p_trade_slug, p_unit, p_cost_price_ht, p_margin_coef, p_vat_rate, 'MCP Supabase - Réactualisation Auto') afin de recalculer automatiquement les prix de vente HT et d'historiser les écarts dans public.catalog_price_history.`;
    await navigator.clipboard.writeText(mcpPrompt);
    setStatusBanner("Commande de réactualisation MCP Supabase copiée !");
  };

  const handleDeleteCatalogItem = async (id: string) => {
    try {
      await removeCatalogItem(id, userProfile);
      setCatalog(await fetchCatalog());
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Refus RLS");
    }
  };

  const loadSavedQuote = (q: SavedQuote) => {
    setDraft({
      quote_number: q.quote_number,
      document_type: q.document_type ?? "devis",
      parent_project_ref: q.parent_project_ref ?? "",
      trade_slug: q.trade_slug || "general",
      client_name: q.client_name,
      client_email: q.client_email,
      client_phone: q.client_phone || "",
      site_address: q.site_address || "",
      title: q.title,
      notes: q.notes,
      intake_data: q.intake_data || {},
      include_intake_on_pdf: q.include_intake_on_pdf ?? true,
      include_ouvrage_detail_on_pdf: q.include_ouvrage_detail_on_pdf ?? true,
      signature: q.signature ?? null,
      lines: q.lines.map((l) => enrichLineFromCatalog(l, catalog)),
    });
    setActiveTab("studio");
    setStudioPane("quote");
  };

  const navItems = [
    {
      id: "studio" as const,
      label: "Studio Devis",
      sub: "Vocal, formulaire & chiffrage",
      icon: Sparkles,
      badge: draft.lines.length > 0 ? `${draft.lines.length} l.` : null,
      badgeColor: "bg-blue-600 text-white",
    },
    {
      id: "guide" as const,
      label: "Guide & Processus",
      sub: "Comprendre l'application",
      icon: HelpCircle,
      badge: "Tuto",
      badgeColor: "bg-blue-900/60 text-blue-200 border border-blue-700/50",
    },
    {
      id: "skills" as const,
      label: "Métiers & Formulaires",
      sub: "Instructions & questions chantiers",
      icon: Sliders,
      badge: tradeSkills.length,
      badgeColor: "bg-slate-800 text-slate-300 border border-slate-700",
      locked: !canManageRules,
    },
    {
      id: "catalog" as const,
      label: "Prix & MCP",
      sub: "Ouvrages, matériaux & barèmes",
      icon: BookOpen,
      badge: catalog.length,
      badgeColor: "bg-slate-800 text-slate-300 border border-slate-700",
      locked: !canManageRules,
    },
    {
      id: "history" as const,
      label: "Historique Devis",
      sub: "Devis sauvegardés & signés",
      icon: History,
      badge: savedQuotes.length,
      badgeColor: "bg-slate-800 text-slate-300 border border-slate-700",
    },
    {
      id: "settings" as const,
      label: "Paramètres & Modules",
      sub: "Toggles de prod & activation",
      icon: Settings2,
      badge: `${activeModulesCount}/8`,
      badgeColor: "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50",
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-800">
      {/* ================================================================== */}
      {/* BACKDROP SOMBRE MOBILE (quand le menu tiroir est ouvert)          */}
      {/* ================================================================== */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* ================================================================== */}
      {/* BANDEAU MENU LATÉRAL À GAUCHE (AVEC TOGGLE DE REPLI)               */}
      {/* ================================================================== */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 text-white border-r border-slate-800 transition-all duration-300 ease-in-out lg:static lg:h-screen lg:sticky lg:top-0 ${
          isMobileMenuOpen
            ? "translate-x-0 shadow-2xl"
            : "-translate-x-full lg:translate-x-0"
        } ${
          isSidebarCollapsed ? "lg:w-20" : "lg:w-64"
        } w-72 select-none shrink-0`}
      >
        {/* Entête du menu latéral */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-800 h-14 shrink-0">
          {!isSidebarCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-sm">
                  DV
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm leading-tight text-white truncate">
                    Devis Vocal BTP
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate">
                    IA Métier &amp; Chiffrage
                  </p>
                </div>
              </div>

              {/* Bouton replier sur desktop */}
              <button
                type="button"
                onClick={toggleSidebar}
                className="hidden lg:flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Replier le bandeau menu"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>

              {/* Bouton fermer sur mobile */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Fermer le menu"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm text-white shadow-sm shrink-0">
                DV
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Déplier le bandeau menu"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Liste des liens de navigation principale */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1.5 no-scrollbar">
          {!isSidebarCollapsed && (
            <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Navigation
            </div>
          )}

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            if (isSidebarCollapsed) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  title={`${item.label} — ${item.sub}`}
                  className={`relative w-full flex items-center justify-center h-11 rounded-xl transition group ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/80"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {item.badge !== null && item.badge !== undefined && (
                    <span className="absolute top-1 right-1.5 min-w-[15px] h-3.5 px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-blue-500 text-white border border-slate-900">
                      {typeof item.badge === "number" && item.badge > 99
                        ? "99+"
                        : item.badge}
                    </span>
                  )}
                  {item.locked && (
                    <span className="absolute bottom-1 right-1.5">
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition group text-left ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 transition ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-800 text-slate-400 group-hover:text-white group-hover:bg-slate-700"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate flex items-center gap-1.5">
                      <span>{item.label}</span>
                      {item.locked && (
                        <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <p
                      className={`text-[10px] truncate ${
                        isActive ? "text-blue-100" : "text-slate-400"
                      }`}
                    >
                      {item.sub}
                    </p>
                  </div>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ml-1.5 ${
                      isActive
                        ? "bg-white/25 text-white"
                        : item.badgeColor || "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Séparateur et Actions Rapides */}
          <div className="pt-3 pb-1">
            <div className="border-t border-slate-800 my-2" />
            {!isSidebarCollapsed && (
              <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Actions Rapides
              </div>
            )}

            <div className="space-y-1">
              {/* Bouton Nouveau Devis */}
              <button
                type="button"
                onClick={() => {
                  setDraft(createEmptyDraft(draft.trade_slug, "devis"));
                  setActiveTab("studio");
                  setStudioPane("chat");
                  setStatusBanner("Nouveau devis vierge initialisé.");
                  setIsMobileMenuOpen(false);
                }}
                title="Créer un nouveau devis vierge"
                className={`w-full flex items-center ${
                  isSidebarCollapsed
                    ? "justify-center h-10 px-0"
                    : "gap-2.5 px-3 py-2"
                } rounded-xl text-xs font-semibold text-blue-300 hover:text-white bg-blue-950/40 hover:bg-blue-900/60 border border-blue-900/50 transition group`}
              >
                <Plus className="w-4 h-4 text-blue-400 group-hover:text-blue-200 shrink-0" />
                {!isSidebarCollapsed && <span>Nouveau Devis</span>}
              </button>

              {/* Bouton Scanner BL */}
              <button
                type="button"
                onClick={() => {
                  setShowBlModal(true);
                  setIsMobileMenuOpen(false);
                }}
                title="Scanner un Bon de Livraison (BL)"
                className={`w-full flex items-center ${
                  isSidebarCollapsed
                    ? "justify-center h-10 px-0"
                    : "gap-2.5 px-3 py-2"
                } rounded-xl text-xs font-semibold text-amber-300 hover:text-white bg-amber-950/40 hover:bg-amber-900/60 border border-amber-900/50 transition group`}
              >
                <Camera className="w-4 h-4 text-amber-400 group-hover:text-amber-200 shrink-0" />
                {!isSidebarCollapsed && <span>Scanner BL (OCR)</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Pied du menu latéral : Statuts & Toggle repli */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/80 shrink-0 space-y-2">
          {!isSidebarCollapsed ? (
            <>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      isSupabaseConfigured ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <span className="truncate">
                    {isSupabaseConfigured ? "Supabase Cloud" : "Mode local"}
                  </span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {agentProvider === "mistral" ? "Mistral" : "Démo"}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleSidebar}
                className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Replier le menu</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span
                title={isSupabaseConfigured ? "Supabase Cloud connecté" : "Mode local"}
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  isSupabaseConfigured ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <button
                type="button"
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Déplier le menu"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ================================================================== */}
      {/* ZONE CENTRALE : HEADER REFACTORISÉ SANS DÉFILEMENT + CONTENU       */}
      {/* ================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-slate-50">
        {/* Entête haute épurée et sans bandeau à défilement */}
        <header className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-4 py-2.5 sticky top-0 z-30 shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5">
            {/* Côté gauche : Burger mobile + Toggle repli desktop + Titre */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Bouton burger sur mobile */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition shrink-0"
                aria-label="Ouvrir le menu de navigation"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Bouton replier/déplier sur desktop */}
              <button
                type="button"
                onClick={toggleSidebar}
                className="hidden lg:inline-flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition shrink-0"
                title={isSidebarCollapsed ? "Déplier le bandeau de menu" : "Replier le bandeau de menu"}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>

              {/* Titre dynamique de l'onglet actif */}
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-semibold text-sm sm:text-base text-white truncate">
                  {activeTab === "studio" && "Studio Devis Vocal & Chiffrage"}
                  {activeTab === "guide" && "Guide d'Utilisation & Processus"}
                  {activeTab === "skills" && "Instructions Métiers & Formulaires"}
                  {activeTab === "catalog" && "Catalogue des Prix & MCP"}
                  {activeTab === "history" && "Historique des Devis"}
                  {activeTab === "settings" && "Paramètres & Activation des Modules"}
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-900/60 text-blue-200 border border-blue-700/60 shrink-0">
                  {draft.document_type === "avenant_ts" ? "Avenant TS" : "Devis"}
                </span>
              </div>
            </div>

            {/* Côté droit : Sélecteur de rôle & Authentification RLS */}
            <div className="flex items-center gap-2 shrink-0">
              <AuthRoleBar
                userProfile={userProfile}
                onProfileChange={handleProfileChanged}
                onNotify={setStatusBanner}
              />
            </div>
          </div>
        </header>

        {statusBanner && (
          <div className="bg-blue-50 border-b border-blue-200 px-3 sm:px-4 py-2 text-xs sm:text-sm text-blue-900">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
              <span>{statusBanner}</span>
              <button
                onClick={() => setStatusBanner(null)}
                className="text-xs font-semibold underline shrink-0"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* CONTENU PRINCIPAL                                                */}
        {/* ================================================================ */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 pb-20 lg:pb-6">
        {/* ================================================================ */}
        {/* ONGLET 1 : STUDIO DEVIS                                          */}
        {/* ================================================================ */}
        {activeTab === "studio" && (
          <div className="space-y-3">
            {/* Barre supérieure Métier + Mode Devis / Avenant TS + Scan BL + Sélecteur Mobile */}
            <div className="bg-white rounded-xl border border-slate-200 p-2.5 sm:p-3 shadow-sm space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {featureFlags.enableAvenantTsMode && (
                    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSwitchDocumentType("devis")}
                        className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 transition ${
                          (draft.document_type ?? "devis") === "devis"
                            ? "bg-slate-900 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Devis initial
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchDocumentType("avenant_ts")}
                        className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 transition ${
                          draft.document_type === "avenant_ts"
                            ? "bg-amber-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <HardHat className="w-3.5 h-3.5" />
                        Avenant / TS Chantier
                      </button>
                    </div>
                  )}

                  <select
                    value={draft.trade_slug}
                    onChange={(e) => setDraft((d) => ({ ...d, trade_slug: e.target.value }))}
                    className="flex-1 sm:max-w-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900"
                  >
                    {tradeSkills.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name} (TVA {s.default_vat_rate} %)
                      </option>
                    ))}
                  </select>

                  {featureFlags.enablePhotoScanBl && (
                    <button
                      type="button"
                      onClick={() => setShowBlModal(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-semibold transition"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Scanner un BL ({scannedBls.length})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveTab("settings")}
                    title="Activer / désactiver les modules en mode Toggle"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-blue-600" />
                    Modules ({activeModulesCount}/8)
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("guide")}
                    title="Comprendre le fonctionnement de l'application et le processus"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-semibold transition"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    Guide &amp; Processus
                  </button>
                </div>

                {featureFlags.enableConversationalRules &&
                  (canManageRules ? (
                    <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Consignes conversationnelles actives
                    </span>
                  ) : (
                    <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                      <Lock className="w-3 h-3" /> Consignes en lecture seule
                    </span>
                  ))}
              </div>

              <div
                className={`grid ${
                  featureFlags.enableIntakeForms ? "grid-cols-3" : "grid-cols-2"
                } lg:hidden bg-slate-100 p-1 rounded-lg text-xs font-semibold gap-1`}
              >
                <button
                  type="button"
                  onClick={() => setStudioPane("chat")}
                  className={`py-2 px-2 rounded-md flex items-center justify-center gap-1 transition ${
                    studioPane === "chat"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Dialogue
                </button>
                {featureFlags.enableIntakeForms && (
                  <button
                    type="button"
                    onClick={() => setStudioPane("intake")}
                    className={`py-2 px-2 rounded-md flex items-center justify-center gap-1 transition ${
                      studioPane === "intake"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Entrevue ({filledIntakeCount}/{activeIntakeFields.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStudioPane("quote")}
                  className={`py-2 px-2 rounded-md flex items-center justify-center gap-1 transition ${
                    studioPane === "quote"
                      ? draft.document_type === "avenant_ts"
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-blue-600 text-white shadow-sm"
                      : "text-slate-700"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {draft.document_type === "avenant_ts" ? "TS" : "Devis"} ({draft.lines.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              {/* ========================================================== */}
              {/* COLONNE GAUCHE : DIALOGUE OU FICHE D'ENTREVUE              */}
              {/* ========================================================== */}
              <section
                className={`lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col lg:h-[calc(100vh-195px)] lg:min-h-[540px] ${
                  studioPane === "quote" ? "hidden lg:flex" : "flex min-h-[480px]"
                }`}
              >
                <div className="hidden lg:flex items-center justify-between p-2.5 border-b border-slate-100 bg-slate-50/70 rounded-t-xl">
                  <div className="inline-flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setStudioPane("chat")}
                      className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                        studioPane !== "intake"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Dialogue Agent
                    </button>
                    {featureFlags.enableIntakeForms && (
                      <button
                        type="button"
                        onClick={() => setStudioPane("intake")}
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                          studioPane === "intake"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Fiche d&apos;Entrevue ({filledIntakeCount}/{activeIntakeFields.length})
                      </button>
                    )}
                  </div>

                  {studioPane !== "intake" && (
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setInputMode("voice")}
                        className={`px-2 py-1 rounded flex items-center gap-1 ${
                          inputMode === "voice"
                            ? "bg-slate-900 text-white"
                            : "text-slate-600"
                        }`}
                      >
                        <Mic className="w-3 h-3" /> Voix
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          window.speechSynthesis?.cancel();
                          setInputMode("keyboard");
                        }}
                        className={`px-2 py-1 rounded flex items-center gap-1 ${
                          inputMode === "keyboard"
                            ? "bg-slate-900 text-white"
                            : "text-slate-600"
                        }`}
                      >
                        <Keyboard className="w-3 h-3" /> Clavier
                      </button>
                    </div>
                  )}
                </div>

                {studioPane === "intake" ? (
                  <div className="flex flex-col flex-1 min-h-0">
                    <IntakeFormPanel
                      tradeName={activeTradeSkill?.name ?? "Métier"}
                      fields={activeIntakeFields}
                      draft={draft}
                      isLoadingAgent={isLoadingAgent}
                      onUpdateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                      onUpdateIntakeValue={(fieldId, val) =>
                        setDraft((d) => ({
                          ...d,
                          intake_data: { ...d.intake_data, [fieldId]: val },
                        }))
                      }
                      onSendIntakeToAgent={handleSendIntakeSummaryToAgent}
                      onOpenFormCustomizer={() => {
                        if (activeTradeSkill) loadSkillIntoEditor(activeTradeSkill);
                        setActiveTab("skills");
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex lg:hidden items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setInputMode("voice")}
                          className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                            inputMode === "voice"
                              ? "bg-slate-900 text-white"
                              : "text-slate-600"
                          }`}
                        >
                          <Mic className="w-3.5 h-3.5" /> Vocal
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.speechSynthesis?.cancel();
                            setInputMode("keyboard");
                          }}
                          className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                            inputMode === "keyboard"
                              ? "bg-slate-900 text-white"
                              : "text-slate-600"
                          }`}
                        >
                          <Keyboard className="w-3.5 h-3.5" /> Clavier
                        </button>
                      </div>

                      {inputMode === "voice" && (
                        <button
                          type="button"
                          onClick={() => {
                            window.speechSynthesis?.cancel();
                            setVoiceOutputEnabled((v) => !v);
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                            voiceOutputEnabled
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {voiceOutputEnabled ? (
                            <>
                              <Volume2 className="w-3.5 h-3.5" /> Audio ON
                            </>
                          ) : (
                            <>
                              <VolumeX className="w-3.5 h-3.5" /> Muet
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Fil des messages + Cartes d'actualisation d'instructions au fil de l'eau */}
                    <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
                      {messages.map((m) => (
                        <div key={m.id} className="space-y-2">
                          <div
                            className={`flex ${
                              m.role === "user" ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                m.role === "user"
                                  ? "bg-blue-600 text-white rounded-br-sm"
                                  : "bg-slate-100 text-slate-800 rounded-bl-sm"
                              }`}
                            >
                              {m.content}
                            </div>
                          </div>

                          {/* Carte d'approbation d'une nouvelle consigne métier détectée dans la conversation */}
                          {m.proposed_skill_update && canManageRules && (
                            <div className="ml-1 mr-4 rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 space-y-2 shadow-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                  Évolution des instructions métier détectée
                                </span>
                                {m.proposed_skill_update.applied && (
                                  <span className="text-[11px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                                    ✓ Enregistrée
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-emerald-800">
                                {m.proposed_skill_update.summary}
                              </p>
                              <div className="rounded-lg bg-white border border-emerald-200 p-2 text-xs text-slate-700 leading-relaxed">
                                {m.proposed_skill_update.updated_instructions}
                              </div>
                              {!m.proposed_skill_update.applied && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleApplyConversationalUpdate(
                                      m.id,
                                      m.proposed_skill_update!
                                    )
                                  }
                                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  Appliquer au Skill « {activeTradeSkill?.name} » (Supabase)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {interimTranscript && (
                        <div className="flex justify-end">
                          <div className="max-w-[88%] rounded-2xl px-3.5 py-2 text-sm italic bg-blue-100 text-blue-900 border border-blue-200">
                            « {interimTranscript}… »
                          </div>
                        </div>
                      )}

                      {isLoadingAgent && (
                        <div className="flex justify-start">
                          <div className="rounded-2xl px-3.5 py-2.5 text-xs bg-slate-100 text-slate-500 animate-pulse">
                            Analyse en cours ({activeTradeSkill?.name})…
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Zone de saisie (Voix / Clavier + Raccourci Directeur Commercial) */}
                    <div className="p-3.5 border-t border-slate-100 bg-slate-50/80 rounded-b-xl space-y-2.5">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        {canManageRules && featureFlags.enableConversationalRules && (
                          <button
                            type="button"
                            onClick={() => {
                              setInputMode("keyboard");
                              setTextInput(
                                "Désormais retiens comme consigne métier : "
                              );
                            }}
                            className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold hover:bg-emerald-100 transition"
                          >
                            + Nouvelle consigne métier…
                          </button>
                        )}
                        {quickPrompts.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            disabled={isLoadingAgent}
                            onClick={() => void sendToAgent(chip)}
                            className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>

                      {inputMode === "voice" && speechSupported ? (
                        <>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={toggleVoiceRecording}
                              disabled={isLoadingAgent}
                              className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition ${
                                isListening
                                  ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                                  : "bg-slate-900 hover:bg-slate-800 text-white"
                              }`}
                            >
                              {isListening ? (
                                <>
                                  <MicOff className="w-5 h-5 shrink-0" />
                                  Écoute… Appuyez pour envoyer
                                </>
                              ) : (
                                <>
                                  <Mic className="w-5 h-5 shrink-0" />
                                  Parler à l&apos;agent
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                window.speechSynthesis?.cancel();
                                setVoiceOutputEnabled((v) => !v);
                              }}
                              title="Activer / couper le retour vocal"
                              className={`hidden lg:flex p-3 rounded-xl border transition ${
                                voiceOutputEnabled
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-white text-slate-500 border-slate-200"
                              }`}
                            >
                              {voiceOutputEnabled ? (
                                <Volume2 className="w-5 h-5" />
                              ) : (
                                <VolumeX className="w-5 h-5" />
                              )}
                            </button>
                          </div>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void sendToAgent(textInput);
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={textInput}
                              onChange={(e) => setTextInput(e.target.value)}
                              placeholder={
                                canManageRules
                                  ? "Écrivez un besoin ou « Désormais impose toujours… »"
                                  : "Ou écrivez au clavier ici…"
                              }
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="submit"
                              disabled={!textInput.trim() || isLoadingAgent}
                              className="p-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </form>
                        </>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void sendToAgent(textInput);
                          }}
                          className="space-y-2"
                        >
                          <textarea
                            rows={3}
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void sendToAgent(textInput);
                              }
                            }}
                            placeholder={
                              canManageRules
                                ? "Décrivez un devis / TS OU actualisez les règles du métier…"
                                : "Décrivez le besoin au clavier… (Entrée pour envoyer)"
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">
                              Entrée = envoyer • Maj+Entrée = nouvelle ligne
                            </span>
                            <button
                              type="submit"
                              disabled={!textInput.trim() || isLoadingAgent}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
                            >
                              <Send className="w-4 h-4" />
                              Envoyer à l&apos;agent
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* ========================================================== */}
              {/* COLONNE DROITE : DEVIS / AVENANT TS TEMPS RÉEL             */}
              {/* ========================================================== */}
              <section
                className={`lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col ${
                  studioPane === "quote" ? "flex" : "hidden lg:flex"
                }`}
              >
                <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-mono text-xs px-2.5 py-1 rounded-md font-semibold ${
                        draft.document_type === "avenant_ts"
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {draft.quote_number}
                    </span>
                    {draft.document_type === "avenant_ts" && (
                      <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                        erp.preparation_ts
                      </span>
                    )}
                    {draft.signature && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        <PenTool className="w-3 h-3" /> Signé ({draft.signature.signer_name})
                      </span>
                    )}
                    {readyToValidate && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Prêt à envoyer
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={resetQuote}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
                  >
                    <FilePlus2 className="w-4 h-4" />{" "}
                    {draft.document_type === "avenant_ts" ? "Nouveau TS" : "Nouveau devis"}
                  </button>
                </div>

                <div className="p-3.5 sm:p-4 space-y-3.5 flex-1">
                  {/* Ouvrages composés 1-clic + Feu Tricolore de Marge ERP */}
                  <ErpMarginPanel
                    analytics={erpAnalytics}
                    canViewCosts={canManageRules}
                    documentType={draft.document_type ?? "devis"}
                    parentProjectRef={draft.parent_project_ref}
                    hourlyLoadedCost={hourlyLoadedCost}
                    onChangeHourlyLoadedCost={setHourlyLoadedCost}
                    ouvrages={ouvragesForTrade}
                    onInsertOuvrage={handleInsertOuvrage}
                    onNotify={setStatusBanner}
                    showOuvrageLibrary={featureFlags.enableOuvragesComposes}
                    showMarginLight={featureFlags.enableErpMarginLight}
                  />

                  <div
                    className={`grid grid-cols-1 ${
                      draft.document_type === "avenant_ts"
                        ? "sm:grid-cols-4"
                        : "sm:grid-cols-3"
                    } gap-2.5`}
                  >
                    {draft.document_type === "avenant_ts" && (
                      <div>
                        <label className="block text-xs font-medium text-amber-800 mb-1">
                          Affaire rattachée
                        </label>
                        <input
                          type="text"
                          value={draft.parent_project_ref ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              parent_project_ref: e.target.value,
                            }))
                          }
                          placeholder="AFF-2026-042"
                          className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-1.5 text-sm font-mono"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Client
                      </label>
                      <input
                        type="text"
                        value={draft.client_name}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, client_name: e.target.value }))
                        }
                        placeholder="Ex: M. Martin"
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        E-mail client
                      </label>
                      <input
                        type="email"
                        value={draft.client_email}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, client_email: e.target.value }))
                        }
                        placeholder="client@email.fr"
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Objet
                      </label>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  {/* Cartes tactiles Mobile (< md) */}
                  <div className="md:hidden space-y-2.5">
                    {draft.lines.length === 0 ? (
                      <div className="py-8 px-4 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                        Aucune ligne. Insérez un Ouvrage Composé ci-dessus ou parlez à l&apos;agent.
                      </div>
                    ) : (
                      draft.lines.map((line) => (
                        <div
                          key={line.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex flex-wrap items-center gap-1">
                              {line.item_kind === "ouvrage" ? (
                                <span className="text-[10px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                                  Ouvrage composé
                                </span>
                              ) : (
                                <span className="text-[10px] bg-slate-200/70 text-slate-600 px-1.5 py-0.5 rounded">
                                  {getCostNatureLabel(line.cost_nature ?? "matiere")}
                                </span>
                              )}
                              {Boolean(line.hours_per_unit && line.hours_per_unit > 0) && (
                                <span className="text-[10px] font-medium text-slate-600">
                                  ⏱ {round2((line.hours_per_unit ?? 0) * line.quantity)} h
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteLine(line.id)}
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={line.designation}
                            onChange={(e) =>
                              updateLine(line.id, { designation: e.target.value })
                            }
                            className="w-full font-medium text-sm bg-white rounded-lg border border-slate-200 px-2.5 py-1.5"
                          />

                          {line.item_kind === "ouvrage" &&
                            line.components &&
                            line.components.length > 0 && (
                              <div className="text-[11px] text-slate-500 space-y-0.5 pl-1">
                                {line.components.map((c) => (
                                  <div key={c.id}>
                                    • {c.label} ({round2(c.quantity_per_unit * line.quantity)}{" "}
                                    {c.unit})
                                  </div>
                                ))}
                              </div>
                            )}

                          <div className="grid grid-cols-4 gap-2 items-end text-xs">
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Qté
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(line.id, { quantity: Number(e.target.value) })
                                }
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-right"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Unité
                              </label>
                              <input
                                type="text"
                                value={line.unit}
                                onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                PU HT (€)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={line.unit_price_ht}
                                onChange={(e) =>
                                  updateLine(line.id, { unit_price_ht: Number(e.target.value) })
                                }
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-right"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                TVA
                              </label>
                              <select
                                value={line.vat_rate}
                                onChange={(e) =>
                                  updateLine(line.id, { vat_rate: Number(e.target.value) })
                                }
                                className="w-full rounded border border-slate-200 bg-white px-1 py-1.5"
                              >
                                <option value={20}>20%</option>
                                <option value={10}>10%</option>
                                <option value={5.5}>5,5%</option>
                                <option value={0}>0%</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-1 text-xs">
                            <span className="text-slate-500">Sous-total ligne HT</span>
                            <span className="font-bold text-slate-900">
                              {formatCurrency(computeLineTotalHt(line))}
                            </span>
                          </div>
                        </div>
                      ))
                    )}

                    <button
                      type="button"
                      onClick={addManualLine}
                      className="w-full py-2.5 rounded-xl border border-dashed border-blue-300 text-blue-700 bg-blue-50/40 text-xs font-semibold flex items-center justify-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Ajouter une ligne manuelle
                    </button>
                  </div>

                  {/* Tableau Desktop (>= md) */}
                  <div className="hidden md:block border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                          <tr>
                            <th className="text-left px-3 py-2.5">
                              Désignation &amp; Recette Ouvrage
                            </th>
                            <th className="text-right px-2 py-2.5 w-20">Qté</th>
                            <th className="text-center px-2 py-2.5 w-20">Unité</th>
                            <th className="text-right px-2 py-2.5 w-24">PU HT (€)</th>
                            <th className="text-right px-2 py-2.5 w-20">TVA</th>
                            <th className="text-right px-3 py-2.5 w-28">Total HT</th>
                            <th className="w-9" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draft.lines.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-8 text-center text-slate-400 text-sm"
                              >
                                Aucune ligne pour l&apos;instant. Insérez un Ouvrage Composé ou dictez votre besoin.
                              </td>
                            </tr>
                          ) : (
                            draft.lines.map((line) => (
                              <tr key={line.id} className="hover:bg-slate-50/70 align-top">
                                <td className="px-2 py-2">
                                  <input
                                    type="text"
                                    value={line.designation}
                                    onChange={(e) =>
                                      updateLine(line.id, { designation: e.target.value })
                                    }
                                    className="w-full px-2 py-1 rounded border border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none font-medium"
                                  />
                                  <div className="px-2 pt-1 flex flex-wrap items-center gap-1.5">
                                    {line.item_kind === "ouvrage" ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
                                        <Layers className="w-3 h-3" /> Ouvrage composé
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                        {getCostNatureLabel(line.cost_nature ?? "matiere")}
                                      </span>
                                    )}
                                    {Boolean(line.hours_per_unit && line.hours_per_unit > 0) && (
                                      <span className="text-[10px] text-slate-500 font-medium">
                                        ⏱ {round2((line.hours_per_unit ?? 0) * line.quantity)} h
                                        prévues
                                      </span>
                                    )}
                                  </div>
                                  {line.item_kind === "ouvrage" &&
                                    line.components &&
                                    line.components.length > 0 && (
                                      <div className="px-2 pt-1 text-[11px] text-slate-500 space-y-0.5">
                                        {line.components.map((c) => (
                                          <div key={c.id}>
                                            • {c.label} (
                                            {round2(c.quantity_per_unit * line.quantity)} {c.unit})
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                </td>
                                <td className="px-1.5 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(line.id, { quantity: Number(e.target.value) })
                                    }
                                    className="w-full text-right px-1.5 py-1 rounded border border-slate-200"
                                  />
                                </td>
                                <td className="px-1.5 py-2">
                                  <input
                                    type="text"
                                    value={line.unit}
                                    onChange={(e) =>
                                      updateLine(line.id, { unit: e.target.value })
                                    }
                                    className="w-full text-center px-1.5 py-1 rounded border border-slate-200"
                                  />
                                </td>
                                <td className="px-1.5 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={line.unit_price_ht}
                                    onChange={(e) =>
                                      updateLine(line.id, {
                                        unit_price_ht: Number(e.target.value),
                                      })
                                    }
                                    className="w-full text-right px-1.5 py-1 rounded border border-slate-200"
                                  />
                                </td>
                                <td className="px-1.5 py-2">
                                  <select
                                    value={line.vat_rate}
                                    onChange={(e) =>
                                      updateLine(line.id, { vat_rate: Number(e.target.value) })
                                    }
                                    className="w-full px-1 py-1 rounded border border-slate-200 bg-white text-right"
                                  >
                                    <option value={20}>20%</option>
                                    <option value={10}>10%</option>
                                    <option value={5.5}>5,5%</option>
                                    <option value={0}>0%</option>
                                  </select>
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">
                                  {formatCurrency(computeLineTotalHt(line))}
                                </td>
                                <td className="pr-2 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => deleteLine(line.id)}
                                    className="p-1 text-slate-400 hover:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={addManualLine}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ajouter une ligne manuelle
                      </button>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.include_ouvrage_detail_on_pdf ?? true}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              include_ouvrage_detail_on_pdf: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300"
                        />
                        Afficher le descriptif inclus des ouvrages sur le PDF
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                    <div className="sm:col-span-7">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Conditions &amp; Notes PDF
                      </label>
                      <textarea
                        rows={3}
                        value={draft.notes}
                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                      />
                    </div>
                    <div className="sm:col-span-5 bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1.5 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>Total HT</span>
                        <span className="font-medium">{formatCurrency(totals.totalHt)}</span>
                      </div>
                      {totals.vatBreakdown.map((b) => (
                        <div key={b.rate} className="flex justify-between text-xs text-slate-500">
                          <span>TVA ({b.rate} %)</span>
                          <span>{formatCurrency(b.vatAmount)}</span>
                        </div>
                      ))}
                      <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-slate-900">
                        <span>Total TTC</span>
                        <span>{formatCurrency(totals.totalTtc)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/70 rounded-b-xl grid grid-cols-1 sm:flex sm:flex-wrap items-center justify-end gap-2">
                  {featureFlags.enableMobileSignature && (
                    <button
                      type="button"
                      disabled={draft.lines.length === 0}
                      onClick={() => setShowSignatureModal(true)}
                      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-40 ${
                        draft.signature
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      }`}
                    >
                      <PenTool className="w-4 h-4" />
                      {draft.signature ? "Accord signé ✓" : "Signer sur mobile"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={draft.lines.length === 0}
                    onClick={() => void handleSaveQuote("validated")}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Save className="w-4 h-4" />
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    disabled={draft.lines.length === 0}
                    onClick={() => downloadQuotePdf(draft, activeIntakeFields)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                  <button
                    type="button"
                    disabled={
                      draft.lines.length === 0 ||
                      (erpAnalytics.requires_manager_approval && !canManageRules)
                    }
                    onClick={() => void handleSendPdfToClient()}
                    title={
                      erpAnalytics.requires_manager_approval && !canManageRules
                        ? "Feu Rouge de marge : validation Directeur Commercial requise"
                        : undefined
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-40"
                  >
                    <Share2 className="w-4 h-4" />
                    {erpAnalytics.requires_manager_approval && !canManageRules
                      ? "Validation Direction requise"
                      : "Valider & Envoyer PDF"}
                  </button>
                  {featureFlags.enablePennylaneBridge && (
                    <button
                      type="button"
                      disabled={draft.lines.length === 0}
                      onClick={() => setPennylaneModalQuote(draft)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-40"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Pennylane
                    </button>
                  )}
                </div>
              </section>
            </div>

            {studioPane !== "quote" && (
              <div className="lg:hidden fixed bottom-0 inset-x-0 bg-slate-900 text-white px-4 py-2.5 border-t border-slate-800 flex items-center justify-between z-20">
                <div className="text-xs">
                  <span className="text-slate-400">{draft.lines.length} ligne(s) • </span>
                  <span className="font-bold text-sm">
                    {formatCurrency(totals.totalTtc)} TTC
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStudioPane("quote")}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold"
                >
                  Voir le devis →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET 2 : SKILLS MÉTIERS, FORMULAIRES & JOURNAL D'AUDIT RLS     */}
        {/* ================================================================ */}
        {activeTab === "skills" && (
          <div className="space-y-5 max-w-6xl mx-auto">
            {!canManageRules && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-center gap-3 text-xs sm:text-sm text-amber-900">
                <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <strong>Accès en lecture seule (RLS PostgreSQL) :</strong> votre profil{" "}
                  <code>{getRoleLabel(userProfile?.role ?? "commercial")}</code> peut consulter les instructions et formulaires métiers, mais seul un <strong>Directeur Commercial</strong> ou <strong>Administrateur</strong> est autorisé à les modifier.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <aside className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">Métiers configurés</h2>
                  {canManageRules && (
                    <button
                      type="button"
                      onClick={startNewSkillCreation}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nouveau métier
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {tradeSkills.map((s) => (
                    <div
                      key={s.slug}
                      onClick={() => loadSkillIntoEditor(s)}
                      className={`cursor-pointer p-3 rounded-lg border transition flex items-center justify-between ${
                        !isCreatingNewSkill && selectedSkillSlug === s.slug
                          ? "bg-blue-50 border-blue-300 text-blue-950"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-slate-500">
                          {s.intake_fields?.length ?? 0} champ(s) • TVA {s.default_vat_rate} %
                        </div>
                      </div>
                      {canManageRules && s.slug !== "general" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteSkill(s.slug);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </aside>

              <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
                <form onSubmit={handleSaveSkill} className="space-y-5">
                  <fieldset disabled={!canManageRules} className="space-y-5 disabled:opacity-75">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-semibold text-base sm:text-lg text-slate-900">
                        {isCreatingNewSkill
                          ? "Créer un nouveau Métier & Formulaire"
                          : `Paramétrage : ${editSkillName}`}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Ces instructions peuvent être éditées ici ou enrichies directement en parlant à l&apos;agent en tant que Directeur Commercial.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Nom du métier
                        </label>
                        <input
                          type="text"
                          required
                          value={editSkillName}
                          onChange={(e) => setEditSkillName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          TVA par défaut
                        </label>
                        <select
                          value={editSkillVat}
                          onChange={(e) => setEditSkillVat(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                        >
                          <option value="20">20 % (Standard / Neuf)</option>
                          <option value="10">10 % (Rénovation &gt; 2 ans)</option>
                          <option value="5.5">5,5 % (Rénov. énergétique)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Instructions métier injectées dans l&apos;Agent Mistral
                      </label>
                      <textarea
                        rows={4}
                        required
                        value={editSkillInstructions}
                        onChange={(e) => setEditSkillInstructions(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-relaxed"
                      />
                    </div>

                    <IntakeFieldsBuilder
                      fields={editSkillFields}
                      onChange={setEditSkillFields}
                    />
                  </fieldset>

                  {canManageRules && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                      >
                        <Save className="w-4 h-4" />
                        Enregistrer Métier &amp; Formulaire dans Supabase
                      </button>
                    </div>
                  )}
                </form>
              </section>
            </div>

            {/* Journal d'audit des instructions mises à jour au fil des conversations */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <h3 className="font-semibold text-sm sm:text-base text-slate-900">
                Journal des actualisations d&apos;instructions au fil des conversations (
                {skillLogs.length})
              </h3>
              {skillLogs.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aucune modification conversationnelle enregistrée pour l&apos;instant. En tant que Directeur Commercial, dites par exemple dans le chat : « Désormais impose toujours une visite préalable au-delà de 5 000 € ».
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {skillLogs.map((log) => (
                    <div key={log.id} className="p-3.5 space-y-1 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {log.author_name}
                          </span>
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            {getRoleLabel(log.author_role)}
                          </span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                            {log.trade_slug}
                          </span>
                        </div>
                        <span className="text-slate-400">
                          {new Date(log.created_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800">{log.change_summary}</p>
                      {log.source_utterance && (
                        <p className="text-slate-500 italic">
                          Message d&apos;origine : « {log.source_utterance} »
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET 3 : BASE DE PRIX & RÉACTUALISATION MCP SUPABASE           */}
        {/* ================================================================ */}
        {activeTab === "catalog" && (
          <div className="space-y-5 max-w-6xl mx-auto">
            {!canManageRules ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-center gap-3 text-xs sm:text-sm text-amber-900">
                <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <strong>Base de prix verrouillée (RLS) :</strong> en tant que{" "}
                  <code>Commercial</code>, vous consultez les prix de vente HT officiels. La modification des coûts d&apos;achat, des coefficients de marge et la réactualisation MCP sont réservées au <strong>Directeur Commercial</strong>.
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 max-w-2xl">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-400">
                      <RefreshCw className="w-3.5 h-3.5" /> Connecteur MCP Supabase
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold">
                      Réactualisation automatisée de la base de prix
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Formule <strong>Achat HT × Coef = PU Vente HT</strong> protégée par RLS et auditée dans <code>catalog_price_history</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyMcpPrompt()}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                    Copier la commande MCP
                  </button>
                </div>

                <form
                  onSubmit={handleApplyInflation}
                  className="bg-slate-800/90 border border-slate-700 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                >
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Métier à réévaluer
                    </label>
                    <select
                      value={inflationTrade}
                      onChange={(e) => setInflationTrade(e.target.value)}
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-sm text-white"
                    >
                      <option value="all">Tous les métiers</option>
                      {tradeSkills.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Variation (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={inflationPct}
                      onChange={(e) => setInflationPct(e.target.value)}
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-sm text-white"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Source / Motif
                    </label>
                    <input
                      type="text"
                      value={inflationSource}
                      onChange={(e) => setInflationSource(e.target.value)}
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-sm text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="sm:col-span-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3"
                  >
                    Appliquer %
                  </button>
                </form>
              </div>
            )}

            {canManageRules && featureFlags.enableOuvragesComposes && (
              <OuvrageComposerForm
                tradeSkills={tradeSkills}
                onCreateOuvrage={handleCreateCompositeOuvrage}
              />
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900">
                  Ouvrages Composés &amp; Articles tarifés ({filteredCatalog.length})
                </h3>
                <select
                  value={catalogFilterTrade}
                  onChange={(e) => setCatalogFilterTrade(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="all">Tous les métiers ({catalog.length})</option>
                  {tradeSkills.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {canManageRules && (
                <form
                  onSubmit={handleAddCatalogItem}
                  className="grid grid-cols-2 sm:grid-cols-12 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200"
                >
                  <input
                    type="text"
                    placeholder="Réf (ELEC-01)"
                    value={newCatRef}
                    onChange={(e) => setNewCatRef(e.target.value)}
                    className="col-span-1 sm:col-span-2 rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                  />
                  <select
                    value={newCatTrade}
                    onChange={(e) => setNewCatTrade(e.target.value)}
                    className="col-span-1 sm:col-span-2 rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
                  >
                    {tradeSkills.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="Article unitaire"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="col-span-2 sm:col-span-2 rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                  />
                  <select
                    value={newCatNature}
                    onChange={(e) => setNewCatNature(e.target.value as CostNature)}
                    className="col-span-1 sm:col-span-2 rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="matiere">Matière</option>
                    <option value="heures">Heures MO</option>
                    <option value="materiel">Matériel</option>
                    <option value="sous_traitance">Sous-traitance</option>
                    <option value="autres_frais">Autres frais</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Unité"
                    value={newCatUnit}
                    onChange={(e) => setNewCatUnit(e.target.value)}
                    className="col-span-1 sm:col-span-1 rounded border border-slate-300 px-2 py-1.5 text-xs bg-white text-center"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Achat HT"
                    value={newCatCost}
                    onChange={(e) => setNewCatCost(e.target.value)}
                    className="col-span-1 sm:col-span-1 rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
                  />
                  <input
                    type="number"
                    step="0.05"
                    min="1"
                    required
                    placeholder="Coef"
                    value={newCatCoef}
                    onChange={(e) => setNewCatCoef(e.target.value)}
                    className="col-span-1 sm:col-span-1 rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
                  />
                  <button
                    type="submit"
                    className="col-span-2 sm:col-span-1 rounded bg-slate-900 text-white text-xs font-semibold px-2 py-2 sm:py-1.5 hover:bg-slate-800"
                  >
                    + Article
                  </button>
                </form>
              )}

              <div className="md:hidden space-y-2">
                {filteredCatalog.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-400">
                        <span>{item.supplier_ref}</span>
                        {item.item_kind === "ouvrage" ? (
                          <span className="font-sans font-bold text-[10px] uppercase bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                            Ouvrage ({item.hours_per_unit ?? 0}h)
                          </span>
                        ) : (
                          <span className="font-sans text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {getCostNatureLabel(item.cost_nature ?? "matiere")}
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-sm text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {canManageRules && (
                          <>
                            Déboursé {formatCurrency(item.cost_price_ht)} ×{" "}
                            {round2(item.margin_coef)} ={" "}
                          </>
                        )}
                        <strong className="text-slate-900">
                          {formatCurrency(item.unit_price_ht)} / {item.unit}
                        </strong>
                      </div>
                    </div>
                    {canManageRules && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteCatalogItem(item.id)}
                        className="p-2 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden md:block border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2.5">Réf / Type</th>
                      <th className="text-left px-3 py-2.5">Métier</th>
                      <th className="text-left px-3 py-2.5">Désignation &amp; Recette</th>
                      <th className="text-center px-2 py-2.5">Unité</th>
                      {canManageRules && (
                        <>
                          <th className="text-right px-3 py-2.5">Déboursé HT</th>
                          <th className="text-right px-3 py-2.5">Coef</th>
                        </>
                      )}
                      <th className="text-right px-3 py-2.5">PU Vente HT</th>
                      <th className="text-left px-3 py-2.5">Source / Maj</th>
                      {canManageRules && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCatalog.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 align-top">
                        <td className="px-3 py-2 font-mono text-xs text-slate-500 space-y-1">
                          <div>{item.supplier_ref}</div>
                          {item.item_kind === "ouvrage" ? (
                            <span className="inline-block font-sans font-bold text-[10px] uppercase bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                              Ouvrage • {item.hours_per_unit ?? 0}h
                            </span>
                          ) : (
                            <span className="inline-block font-sans text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {getCostNatureLabel(item.cost_nature ?? "matiere")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {item.trade_slug}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{item.name}</div>
                          {item.item_kind === "ouvrage" &&
                            item.components &&
                            item.components.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.components.map((c) => (
                                  <span
                                    key={c.id}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                                  >
                                    {getCostNatureLabel(c.cost_nature)}: {c.quantity_per_unit}{" "}
                                    {c.unit}
                                    {canManageRules
                                      ? ` (${formatCurrency(
                                          c.quantity_per_unit * c.unit_cost_ht
                                        )})`
                                      : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{item.unit}</td>
                        {canManageRules && (
                          <>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {formatCurrency(item.cost_price_ht)}
                            </td>
                            <td className="px-2 py-2 text-right text-xs text-slate-500">
                              ×{round2(item.margin_coef)}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">
                          {formatCurrency(item.unit_price_ht)}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          <div>{item.price_source}</div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(item.price_updated_at).toLocaleDateString("fr-FR")}
                          </div>
                        </td>
                        {canManageRules && (
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => void handleDeleteCatalogItem(item.id)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET 4 : HISTORIQUE DES DEVIS & AVENANTS TS (FILTRÉ PAR RLS)   */}
        {/* ================================================================ */}
        {activeTab === "history" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4 max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-lg text-slate-900">
                Devis &amp; Avenants TS enregistrés
              </h2>
              <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                {canManageRules
                  ? "Vue Direction : toute l'équipe"
                  : "Vue Commercial (RLS) : uniquement vos documents"}
              </span>
            </div>

            {savedQuotes.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Aucun document visible pour ce profil.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {savedQuotes.map((q) => (
                  <div
                    key={q.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-mono text-xs px-2 py-0.5 rounded font-semibold ${
                            q.document_type === "avenant_ts"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {q.quote_number}
                        </span>
                        {q.document_type === "avenant_ts" && (
                          <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                            TS ({q.parent_project_ref || "Chantier"})
                          </span>
                        )}
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {q.trade_slug}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {q.client_name || "Client"}
                        </span>
                        {q.signature && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 font-medium">
                            ✓ Signé mobile
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {q.status === "sent" ? "Envoyé" : "Enregistré"}
                        </span>
                        {q.pennylane_status && q.pennylane_status !== "not_pushed" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-medium">
                            {q.pennylane_status === "deposit_pushed"
                              ? `Pennylane Acompte (${q.pennylane_invoice_number || "OK"})`
                              : q.pennylane_status === "simulated"
                              ? "Pennylane Simulé"
                              : `Pennylane (${q.pennylane_invoice_number || "Synchronisé"})`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {q.title} • {q.lines.length} ligne(s) •{" "}
                        {new Date(q.created_at).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5">
                      <span className="font-bold text-slate-900">
                        {formatCurrency(q.total_ttc)} TTC
                      </span>
                      {featureFlags.enablePennylaneBridge && (
                        <button
                          type="button"
                          onClick={() => setPennylaneModalQuote(q)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Pennylane
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => loadSavedQuote(q)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800"
                      >
                        Ouvrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET 5 : PARAMÈTRES MODULAIRES (TOGGLES ON / OFF)              */}
        {/* ================================================================ */}
        {activeTab === "settings" && (
          <FeatureSettingsPanel
            flags={featureFlags}
            canManageRules={canManageRules}
            onUpdateFlags={handleUpdateFeatureFlags}
          />
        )}

        {/* ================================================================ */}
        {/* ONGLET 6 : GUIDE & EXPLICATION DU PROCESSUS                      */}
        {/* ================================================================ */}
        {activeTab === "guide" && (
          <AppProcessGuide
            onGoToStudio={() => setActiveTab("studio")}
            onGoToSettings={() => setActiveTab("settings")}
            onGoToSkills={() => setActiveTab("skills")}
          />
        )}
      </main>

      {pennylaneModalQuote && (
        <PennylanePushModal
          quote={pennylaneModalQuote}
          userProfile={userProfile}
          onClose={() => setPennylaneModalQuote(null)}
          onSynced={(updatedQuote, result) => {
            setSavedQuotes((prev) => {
              const filtered = prev.filter(
                (item) => item.quote_number !== updatedQuote.quote_number
              );
              return [updatedQuote, ...filtered];
            });
            setStatusBanner(result.message);
          }}
        />
      )}

      {showSignatureModal && (
        <SignaturePadModal
          quoteNumber={draft.quote_number}
          documentType={draft.document_type ?? "devis"}
          defaultSignerName={draft.client_name}
          totalTtc={totals.totalTtc}
          existingSignature={draft.signature}
          onClose={() => setShowSignatureModal(false)}
          onSaveSignature={(sig) => {
            setDraft((d) => ({ ...d, signature: sig }));
            setStatusBanner(
              `Signature « Bon pour accord » de ${sig.signer_name} enregistrée et intégrée au PDF !`
            );
          }}
        />
      )}

      {showBlModal && (
        <BlScannerModal
          tradeSlug={draft.trade_slug}
          defaultProjectRef={draft.parent_project_ref || "AFF-2026-042"}
          recentBls={scannedBls}
          onClose={() => setShowBlModal(false)}
          onBlRecorded={(rec) => {
            setScannedBls(saveLocalScannedBl(rec));
          }}
          onConvertBlToAvenantTs={handleConvertBlToAvenantTs}
          onNotify={setStatusBanner}
        />
      )}
      </div>
    </div>
  );
}
