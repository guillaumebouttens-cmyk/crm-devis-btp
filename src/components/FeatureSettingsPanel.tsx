"use client";

import React from "react";
import {
  Camera,
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  Layers,
  Lock,
  PenTool,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/supabase";
import type { AppFeatureFlags } from "@/lib/types";

interface FeatureSettingsPanelProps {
  flags: AppFeatureFlags;
  canManageRules: boolean;
  onUpdateFlags: (next: AppFeatureFlags, label?: string) => void;
}

type BooleanFlagKey =
  | "enableOuvragesComposes"
  | "enableErpMarginLight"
  | "enableAvenantTsMode"
  | "enableMobileSignature"
  | "enablePhotoScanBl"
  | "enablePennylaneBridge"
  | "enableIntakeForms"
  | "enableConversationalRules";

const MODULE_TOGGLES: Array<{
  key: BooleanFlagKey;
  title: string;
  badge: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: "enableOuvragesComposes",
    title: "Ouvrages Composés & Recettes multi-composants",
    badge: "Catalogue & IA",
    description:
      "Active la bibliothèque d'ouvrages en 1 clic (Heures + Matière + Matériel + ST), l'éditeur de recettes et la priorité aux ouvrages dans l'agent vocal.",
    icon: <Layers className="w-4 h-4 text-indigo-600" />,
  },
  {
    key: "enableErpMarginLight",
    title: "Feu Tricolore de Marge & Ventilation ERP (Décision D6)",
    badge: "erp.crm_devis",
    description:
      "Affiche le feu tricolore en temps réel (coûts et marges masqués aux commerciaux, ventilation analytique complète et export JSON pour la Direction).",
    icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
  },
  {
    key: "enableAvenantTsMode",
    title: "Mode Avenant / Travaux Supplémentaires (TS)",
    badge: "erp.preparation_ts",
    description:
      "Permet de basculer entre un Devis initial (DEV-...) et un Avenant TS (TS-...) rattaché au code d'une affaire parente en cours.",
    icon: <HardHat className="w-4 h-4 text-amber-600" />,
  },
  {
    key: "enableMobileSignature",
    title: "Signature Tactile « Bon pour accord » sur Mobile",
    badge: "PDF Signé",
    description:
      "Active le pavé de signature manuscrite au doigt sur smartphone/tablette et incruste la signature horodatée dans l'encadré PDF.",
    icon: <PenTool className="w-4 h-4 text-blue-600" />,
  },
  {
    key: "enablePhotoScanBl",
    title: "Photo-Scan BL Chantier (Mistral Pixtral Vision)",
    badge: "erp.achats_bl",
    description:
      "Active la prise de photo des Bons de Livraison fournisseurs sur chantier et leur conversion en 1 clic en Avenant TS chiffré.",
    icon: <Camera className="w-4 h-4 text-sky-600" />,
  },
  {
    key: "enablePennylaneBridge",
    title: "Pont Facturation Pennylane API v2 (Factur-X)",
    badge: "Pennylane v2",
    description:
      "Active l'envoi direct des factures d'acompte (ex: 30 % ventilé par TVA) ou factures 100 % vers Pennylane depuis le Studio et l'Historique.",
    icon: <FileSpreadsheet className="w-4 h-4 text-teal-600" />,
  },
  {
    key: "enableIntakeForms",
    title: "Fiches d'Entrevue Commerciale & Relevé Technique",
    badge: "trade_skills",
    description:
      "Active le questionnaire de découverte métier dans le Studio et l'option d'impression du relevé chantier sur le PDF client.",
    icon: <ClipboardList className="w-4 h-4 text-violet-600" />,
  },
  {
    key: "enableConversationalRules",
    title: "Apprentissage Conversationnel des Consignes Métier",
    badge: "RLS Audit",
    description:
      "Permet au Directeur Commercial d'enrichir les instructions de l'Agent Mistral directement en discutant dans le chat (« Désormais impose toujours… »).",
    icon: <Sparkles className="w-4 h-4 text-fuchsia-600" />,
  },
];

export function FeatureSettingsPanel({
  flags,
  canManageRules,
  onUpdateFlags,
}: FeatureSettingsPanelProps) {
  const activeCount = MODULE_TOGGLES.filter((m) => Boolean(flags[m.key])).length;
  const allEnabled = activeCount === MODULE_TOGGLES.length;

  const handleToggleSingle = (key: BooleanFlagKey, title: string) => {
    const nextVal = !flags[key];
    onUpdateFlags(
      {
        ...flags,
        [key]: nextVal,
      },
      `Module « ${title} » ${nextVal ? "activé" : "désactivé"}.`
    );
  };

  const handleToggleAll = (enableAll: boolean) => {
    onUpdateFlags(
      {
        ...flags,
        enableOuvragesComposes: enableAll,
        enableErpMarginLight: enableAll,
        enableAvenantTsMode: enableAll,
        enableMobileSignature: enableAll,
        enablePhotoScanBl: enableAll,
        enablePennylaneBridge: enableAll,
        enableIntakeForms: enableAll,
        enableConversationalRules: enableAll,
      },
      enableAll
        ? "Tous les modules Pro (8/8) ont été activés."
        : "Modules optionnels désactivés (mode Devis minimaliste actif)."
    );
  };

  const applyFieldPreset = (preset: "full" | "terrain" | "minimal") => {
    if (preset === "full") {
      onUpdateFlags(
        { ...DEFAULT_FEATURE_FLAGS },
        "Profil « Production Complète (8/8 modules) » activé."
      );
      return;
    }
    if (preset === "terrain") {
      onUpdateFlags(
        {
          ...flags,
          enableOuvragesComposes: true,
          enableErpMarginLight: true,
          enableAvenantTsMode: true,
          enableMobileSignature: true,
          enablePhotoScanBl: true,
          enablePennylaneBridge: false,
          enableIntakeForms: true,
          enableConversationalRules: false,
        },
        "Profil « Commercial / Conducteur Terrain » appliqué."
      );
      return;
    }
    onUpdateFlags(
      {
        ...flags,
        enableOuvragesComposes: true,
        enableErpMarginLight: false,
        enableAvenantTsMode: false,
        enableMobileSignature: false,
        enablePhotoScanBl: false,
        enablePennylaneBridge: false,
        enableIntakeForms: false,
        enableConversationalRules: false,
      },
      "Profil « Chiffrage Express Minimal » appliqué."
    );
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {!canManageRules && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-center gap-3 text-xs sm:text-sm text-amber-900">
          <Lock className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong>Note RLS :</strong> en mode démonstration vous pouvez tester les interrupteurs (toggles) en direct sur votre appareil. En production Supabase, la sauvegarde globale pour toute l&apos;équipe est réservée au <strong>Directeur Commercial</strong> ou <strong>Administrateur</strong>.
          </div>
        </div>
      )}

      {/* Bandeau Maître : Interrupteur Général (Master Toggle) + Presets */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-400">
              <Settings2 className="w-3.5 h-3.5" /> Paramétrage Modulaire à la Carte
            </div>
            <h2 className="text-base sm:text-lg font-bold">
              Activer / Désactiver les fonctionnalités selon vos besoins ({activeCount}/
              {MODULE_TOGGLES.length} actifs)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Chaque entité (FENBAT, ABD, Accès Nord, TSM) peut activer ou masquer à la volée les modules métiers et ERP sans redéployer l&apos;application.
            </p>
          </div>

          {/* Bouton Toggle Général (Master Switch) */}
          <div className="flex items-center justify-between sm:justify-end gap-3 bg-slate-800/90 border border-slate-700 px-3.5 py-2.5 rounded-xl shrink-0">
            <div className="text-right">
              <div className="text-xs font-semibold text-white">
                Pack Pro Complet
              </div>
              <div className="text-[11px] text-slate-400">
                {allEnabled ? "Tout est activé" : "Personnalisé"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allEnabled}
              onClick={() => handleToggleAll(!allEnabled)}
              className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                allEnabled ? "bg-emerald-500" : "bg-slate-600"
              }`}
              style={{ width: "52px" }}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  allEnabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Presets rapides */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
          <span className="text-slate-400 font-medium mr-1">
            Configurations rapides :
          </span>
          <button
            type="button"
            onClick={() => applyFieldPreset("full")}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
          >
            Production Complète (8/8)
          </button>
          <button
            type="button"
            onClick={() => applyFieldPreset("terrain")}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition"
          >
            Mode Chantier &amp; TS Mobile (6/8)
          </button>
          <button
            type="button"
            onClick={() => applyFieldPreset("minimal")}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition"
          >
            Mode Chiffrage Minimal (1/8)
          </button>
          <button
            type="button"
            onClick={() => applyFieldPreset("full")}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser par défaut
          </button>
        </div>
      </div>

      {/* Grille des 8 Toggles individuels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {MODULE_TOGGLES.map((item) => {
          const isEnabled = Boolean(flags[item.key]);
          return (
            <div
              key={item.key}
              onClick={() => handleToggleSingle(item.key, item.title)}
              className={`cursor-pointer rounded-xl border p-4 transition flex items-start justify-between gap-3.5 ${
                isEnabled
                  ? "bg-white border-blue-200 shadow-xs hover:border-blue-300"
                  : "bg-slate-100/70 border-slate-200 opacity-75 hover:opacity-100"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200/80">
                    {item.icon}
                  </div>
                  <span className="font-semibold text-sm text-slate-900">
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {item.badge}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      isEnabled ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {isEnabled ? "● Actif" : "○ Désactivé"}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {/* Bouton Toggle Switch accessible */}
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSingle(item.key, item.title);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-1 ${
                  isEnabled ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Seuils analytiques ERP & Règle de blocage Feu Rouge */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-slate-900">
              Seuils du Feu Tricolore &amp; Coût Horaire Chargé ERP (<code>previ</code>)
            </h3>
            <p className="text-xs text-slate-500">
              Paramètres utilisés par le moteur de rentabilité pour calculer la marge brute HT et contrôler l&apos;envoi PDF.
            </p>
          </div>

          {/* Toggle Blocage Commercial sur Feu Rouge */}
          <div
            onClick={() =>
              onUpdateFlags(
                {
                  ...flags,
                  blockCommercialOnRedMargin: !flags.blockCommercialOnRedMargin,
                },
                `Blocage commercial sur Feu Rouge ${
                  !flags.blockCommercialOnRedMargin ? "activé" : "désactivé"
                }.`
              )
            }
            className="cursor-pointer flex items-center gap-2.5 bg-red-50/70 border border-red-200 px-3 py-2 rounded-xl"
          >
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-xs font-semibold text-red-950">
              Bloquer l&apos;envoi PDF Commercial si Feu Rouge
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={flags.blockCommercialOnRedMargin}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateFlags(
                  {
                    ...flags,
                    blockCommercialOnRedMargin: !flags.blockCommercialOnRedMargin,
                  },
                  `Blocage commercial sur Feu Rouge ${
                    !flags.blockCommercialOnRedMargin ? "activé" : "désactivé"
                  }.`
                );
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                flags.blockCommercialOnRedMargin ? "bg-red-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                  flags.blockCommercialOnRedMargin ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <label className="block font-semibold text-slate-700">
              Coût horaire chargé (<code>erp.cout_horaire_en_vigueur</code>)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="20"
                max="150"
                step="0.5"
                value={flags.defaultHourlyLoadedCost}
                onChange={(e) =>
                  onUpdateFlags({
                    ...flags,
                    defaultHourlyLoadedCost: Number(e.target.value) || 38,
                  })
                }
                className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-900"
              />
              <span className="text-slate-600 font-medium">€ HT / heure</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1">
            <label className="block font-semibold text-emerald-950">
              Seuil Feu Vert (Rentabilité cible ≥ %)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="80"
                step="1"
                value={flags.greenMarginThresholdPct}
                onChange={(e) =>
                  onUpdateFlags({
                    ...flags,
                    greenMarginThresholdPct: Number(e.target.value) || 28,
                  })
                }
                className="w-24 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-sm font-bold text-emerald-950"
              />
              <span className="text-emerald-800 font-medium">% de marge brute</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200 space-y-1">
            <label className="block font-semibold text-amber-950">
              Plancher Feu Orange (Feu Rouge si &lt; %)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="70"
                step="1"
                value={flags.orangeMarginThresholdPct}
                onChange={(e) =>
                  onUpdateFlags({
                    ...flags,
                    orangeMarginThresholdPct: Number(e.target.value) || 18,
                  })
                }
                className="w-24 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm font-bold text-amber-950"
              />
              <span className="text-amber-800 font-medium">% de marge brute</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
