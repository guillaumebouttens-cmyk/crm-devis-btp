"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  EyeOff,
  Layers,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency, getCostNatureLabel, round2 } from "@/lib/quote-calc";
import type {
  CatalogItem,
  DocumentType,
  ErpAnalyticalBreakdown,
} from "@/lib/types";

interface ErpMarginPanelProps {
  analytics: ErpAnalyticalBreakdown;
  canViewCosts: boolean;
  documentType: DocumentType;
  parentProjectRef?: string;
  hourlyLoadedCost: number;
  onChangeHourlyLoadedCost: (val: number) => void;
  ouvrages: CatalogItem[];
  onInsertOuvrage: (ouvrage: CatalogItem) => void;
  onNotify: (msg: string) => void;
  showOuvrageLibrary?: boolean;
  showMarginLight?: boolean;
}

export function ErpMarginPanel({
  analytics,
  canViewCosts,
  documentType,
  parentProjectRef,
  hourlyLoadedCost,
  onChangeHourlyLoadedCost,
  ouvrages,
  onInsertOuvrage,
  onNotify,
  showOuvrageLibrary = true,
  showMarginLight = true,
}: ErpMarginPanelProps) {
  const [showOuvragePicker, setShowOuvragePicker] = useState(false);
  const [showErpDetails, setShowErpDetails] = useState(false);

  if (!showOuvrageLibrary && !showMarginLight) {
    return null;
  }

  const badgeConfig = (() => {
    switch (analytics.feu_marge) {
      case "vert":
        return {
          bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
          dot: "bg-emerald-500",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
          label: "Feu Vert — Rentabilité conforme",
          hint: "Envoyable directement au client.",
        };
      case "orange":
        return {
          bg: "bg-amber-50 border-amber-300 text-amber-900",
          dot: "bg-amber-500",
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
          label: "Feu Orange — Marge serrée",
          hint: "Vérifiez les heures de pose et le déplacement avant remise.",
        };
      case "rouge":
        return {
          bg: "bg-red-50 border-red-300 text-red-900",
          dot: "bg-red-600 animate-pulse",
          icon: <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />,
          label: "Feu Rouge — Sous le plancher de rentabilité",
          hint: "Validation Directeur Commercial requise avant envoi PDF.",
        };
      default:
        return {
          bg: "bg-slate-50 border-slate-200 text-slate-600",
          dot: "bg-slate-400",
          icon: <Layers className="w-4 h-4 text-slate-400 shrink-0" />,
          label: "En attente de chiffrage",
          hint: "Ajoutez un ouvrage composé ou dictez le besoin.",
        };
    }
  })();

  const handleCopyErpPayload = async () => {
    const rpcPayload =
      documentType === "avenant_ts"
        ? {
            target_table: "erp.preparation_ts",
            affaire_ref: parentProjectRef || "AFF-A-PRECISER",
            montant_vente_ht: analytics.montant_ht,
            heures_prevues: analytics.heures_prevues,
            matiere_prevue: analytics.matiere_prevue,
            sous_traitance_prevue: analytics.sous_traitance_prevue,
            materiel: analytics.materiel,
            autres_frais: analytics.autres_frais,
          }
        : {
            rpc: "erp.crm_devis_enregistrer",
            p_montant_ht: analytics.montant_ht,
            p_heures_prevues: analytics.heures_prevues,
            p_matiere_prevue: analytics.matiere_prevue,
            p_sous_traitance_prevue: analytics.sous_traitance_prevue,
            p_materiel: analytics.materiel,
            p_autres_frais: analytics.autres_frais,
          };

    await navigator.clipboard.writeText(JSON.stringify(rpcPayload, null, 2));
    onNotify(
      documentType === "avenant_ts"
        ? "Payload analytique erp.preparation_ts copié dans le presse-papiers !"
        : "Payload analytique RPC erp.crm_devis_enregistrer copié !"
    );
  };

  return (
    <div className="space-y-2.5">
      {/* Barre rapide : Insertion 1-clic d'Ouvrages Composés */}
      {showOuvrageLibrary && (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowOuvragePicker((v) => !v)}
            className="flex items-center gap-2 text-left text-xs font-semibold text-indigo-950"
          >
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Bibliothèque d&apos;Ouvrages Composés ({ouvrages.length}) — ventilation auto
              Heures + Matière + Matériel
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowOuvragePicker((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shrink-0"
          >
            {showOuvragePicker ? (
              <>
                Masquer <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                + Ouvrage <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {showOuvragePicker && (
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ouvrages.map((ouv) => (
              <div
                key={ouv.id}
                className="rounded-lg bg-white border border-indigo-200 p-2.5 flex flex-col justify-between gap-2 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 font-mono">
                    <span>{ouv.supplier_ref}</span>
                    <span className="font-sans font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {ouv.hours_per_unit ?? 0} h / {ouv.unit}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900 mt-0.5 leading-snug">
                    {ouv.name.replace(/^Ouvrage\s*:\s*/i, "")}
                  </div>
                  {ouv.components && ouv.components.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ouv.components.map((c) => (
                        <span
                          key={c.id}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                        >
                          {getCostNatureLabel(c.cost_nature)} ({c.quantity_per_unit}{" "}
                          {c.unit})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-900">
                    {formatCurrency(ouv.unit_price_ht)} HT / {ouv.unit}
                  </span>
                  <button
                    type="button"
                    onClick={() => onInsertOuvrage(ouv)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" /> Insérer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Bandeau Feu Tricolore de Marge (RLS Décision D6 : coûts masqués aux commerciaux) */}
      {showMarginLight && (
      <div className={`rounded-xl border p-3 transition ${badgeConfig.bg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${badgeConfig.dot}`} />
            {badgeConfig.icon}
            <div>
              <div className="text-xs sm:text-sm font-bold leading-tight">
                {badgeConfig.label}
              </div>
              <div className="text-[11px] opacity-85">{badgeConfig.hint}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-semibold bg-white/80 border border-black/10 px-2.5 py-1 rounded-lg text-slate-800">
              ⏱ {analytics.heures_prevues} h prévues
            </span>

            {canViewCosts ? (
              <button
                type="button"
                onClick={() => setShowErpDetails((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-900 text-white px-2.5 py-1 rounded-lg hover:bg-slate-800"
              >
                {analytics.montant_ht > 0
                  ? `Marge ${analytics.taux_marge_pct} % (${formatCurrency(
                      analytics.marge_brute_ht
                    )})`
                  : "Ventilation ERP"}
                {showErpDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span
                title="Conformément à la Décision D6 d'erp-tsm-app, les déboursés et le coût horaire chargé sont masqués au profil Commercial."
                className="inline-flex items-center gap-1 text-[11px] font-medium bg-white/75 px-2 py-1 rounded-lg text-slate-600 border border-black/5"
              >
                <EyeOff className="w-3 h-3" /> Coûts masqués (RLS D6)
              </span>
            )}
          </div>
        </div>

        {/* Ventilation analytique complète réservée au Directeur Commercial / Admin */}
        {canViewCosts && showErpDetails && (
          <div className="mt-3 pt-3 border-t border-black/10 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                Ventilation analytique automatique ➔{" "}
                <code className="bg-white/80 px-1.5 py-0.5 rounded">
                  {documentType === "avenant_ts"
                    ? "erp.preparation_ts"
                    : "erp.crm_devis → erp.affaires"}
                </code>
              </span>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-700 flex items-center gap-1">
                  Coût horaire chargé (<code>previ</code>) :
                  <input
                    type="number"
                    min="20"
                    max="120"
                    step="0.5"
                    value={hourlyLoadedCost}
                    onChange={(e) =>
                      onChangeHourlyLoadedCost(Number(e.target.value) || 38)
                    }
                    className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right font-semibold text-slate-900"
                  />
                  €/h
                </label>
                <button
                  type="button"
                  onClick={() => void handleCopyErpPayload()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-50"
                >
                  <Copy className="w-3 h-3" /> JSON ERP
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div className="bg-white/90 rounded-lg p-2 border border-black/5">
                <div className="text-[10px] text-slate-500 uppercase">Heures MO</div>
                <div className="font-bold text-slate-900">
                  {analytics.heures_prevues} h
                </div>
                <div className="text-[11px] text-slate-500">
                  {formatCurrency(analytics.cout_main_oeuvre_ht)}
                </div>
              </div>
              <div className="bg-white/90 rounded-lg p-2 border border-black/5">
                <div className="text-[10px] text-slate-500 uppercase">Matière</div>
                <div className="font-bold text-slate-900">
                  {formatCurrency(analytics.matiere_prevue)}
                </div>
              </div>
              <div className="bg-white/90 rounded-lg p-2 border border-black/5">
                <div className="text-[10px] text-slate-500 uppercase">Sous-trait.</div>
                <div className="font-bold text-slate-900">
                  {formatCurrency(analytics.sous_traitance_prevue)}
                </div>
              </div>
              <div className="bg-white/90 rounded-lg p-2 border border-black/5">
                <div className="text-[10px] text-slate-500 uppercase">Matériel</div>
                <div className="font-bold text-slate-900">
                  {formatCurrency(analytics.materiel)}
                </div>
              </div>
              <div className="bg-white/90 rounded-lg p-2 border border-black/5">
                <div className="text-[10px] text-slate-500 uppercase">Autres frais</div>
                <div className="font-bold text-slate-900">
                  {formatCurrency(analytics.autres_frais)}
                </div>
              </div>
              <div className="bg-slate-900 text-white rounded-lg p-2">
                <div className="text-[10px] text-slate-300 uppercase">
                  Marge Brute HT
                </div>
                <div className="font-bold">
                  {formatCurrency(analytics.marge_brute_ht)}
                </div>
                <div className="text-[11px] text-emerald-300">
                  {round2(analytics.taux_marge_pct)} % du PV
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
