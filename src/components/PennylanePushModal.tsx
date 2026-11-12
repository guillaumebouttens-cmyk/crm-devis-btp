"use client";

import React, { useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Code2,
  FileSpreadsheet,
  Loader2,
  User,
  X,
} from "lucide-react";
import { computeQuoteTotals, formatCurrency, round2 } from "@/lib/quote-calc";
import { pushQuoteToPennylane } from "@/lib/supabase";
import type {
  PennylaneCustomerType,
  PennylaneInvoiceMode,
  PennylanePaymentConditions,
  PennylanePushResult,
  QuoteDraft,
  SavedQuote,
  UserProfile,
} from "@/lib/types";

interface PennylanePushModalProps {
  quote: QuoteDraft;
  userProfile: UserProfile | null;
  onClose: () => void;
  onSynced: (updatedQuote: SavedQuote, result: PennylanePushResult) => void;
}

export function PennylanePushModal({
  quote,
  userProfile,
  onClose,
  onSynced,
}: PennylanePushModalProps) {
  const [invoiceMode, setInvoiceMode] = useState<PennylaneInvoiceMode>("deposit");
  const [depositPercent, setDepositPercent] = useState<number>(30);
  const [customerType, setCustomerType] = useState<PennylaneCustomerType>("individual");
  const [paymentConditions, setPaymentConditions] =
    useState<PennylanePaymentConditions>("upon_receipt");
  const [createAsDraft, setCreateAsDraft] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PennylanePushResult | null>(null);
  const [showJsonPayload, setShowJsonPayload] = useState<boolean>(false);

  const quoteTotals = computeQuoteTotals(quote.lines);
  const previewRatio =
    invoiceMode === "deposit" ? Math.min(100, Math.max(1, depositPercent)) / 100 : 1;
  const previewTtc = round2(quoteTotals.totalTtc * previewRatio);
  const previewHt = round2(quoteTotals.totalHt * previewRatio);

  const handlePush = async (forceDryRun = false) => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { savedQuote, result } = await pushQuoteToPennylane(
        quote,
        {
          customerType,
          invoiceMode,
          depositPercent: invoiceMode === "deposit" ? depositPercent : 100,
          createAsDraft,
          paymentConditions,
          dryRun: forceDryRun,
        },
        userProfile
      );
      setLastResult(result);
      onSynced(savedQuote, result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur lors de l'envoi vers Pennylane");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white text-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* En-tête */}
        <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">
                Pont Facturation Pennylane API v2
              </h3>
              <p className="text-[11px] text-slate-400">
                Devis {quote.quote_number} • {quote.client_name || "Client à préciser"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Choix 1 : Acompte BTP vs Facture 100 % */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              1. Type de facture à créer dans Pennylane
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setInvoiceMode("deposit")}
                className={`p-3 rounded-xl border text-left transition ${
                  invoiceMode === "deposit"
                    ? "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="font-semibold text-sm text-slate-900">
                  Facture d&apos;acompte chantier
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Ventilation automatique par taux de TVA (5,5 % / 10 % / 20 %)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setInvoiceMode("full")}
                className={`p-3 rounded-xl border text-left transition ${
                  invoiceMode === "full"
                    ? "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="font-semibold text-sm text-slate-900">
                  Facture complète (100 %)
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Transfère les {quote.lines.length} ligne(s) détaillées du devis
                </div>
              </button>
            </div>

            {invoiceMode === "deposit" && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-xs font-medium text-slate-700">Pourcentage d&apos;acompte :</span>
                {[20, 30, 40, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDepositPercent(pct)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                      depositPercent === pct
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {pct} %
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value) || 30)}
                  className="w-16 px-2 py-1 text-xs text-right rounded-md border border-slate-300 bg-white"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            )}
          </div>

          {/* Choix 2 : Type de client & Échéance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                2. Profil client Pennylane
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCustomerType("individual")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition ${
                    customerType === "individual"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Particulier
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType("company")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition ${
                    customerType === "company"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" /> Pro / Société
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                3. Échéance de paiement
              </label>
              <select
                value={paymentConditions}
                onChange={(e) =>
                  setPaymentConditions(e.target.value as PennylanePaymentConditions)
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm bg-white"
              >
                <option value="upon_receipt">À réception de facture</option>
                <option value="7_days">À 7 jours</option>
                <option value="15_days">À 15 jours</option>
                <option value="30_days">À 30 jours</option>
                <option value="45_days">À 45 jours</option>
              </select>
            </div>
          </div>

          {/* Choix 3 : Sécurité Brouillon Factur-X */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 cursor-pointer">
            <input
              type="checkbox"
              checked={createAsDraft}
              onChange={(e) => setCreateAsDraft(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-xs text-slate-800">
              <span className="font-semibold text-blue-950">
                Créer en Brouillon dans Pennylane (Recommandé)
              </span>
              <p className="text-slate-600 mt-0.5">
                Permet à l&apos;administration / comptabilité de vérifier et sceller la numérotation légale Factur-X dans Pennylane avant envoi définitif.
              </p>
            </div>
          </label>

          {/* Récapitulatif montant envoyé */}
          <div className="rounded-xl bg-slate-900 text-white p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Montant poussé vers Pennylane
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                {formatCurrency(previewHt)} HT •{" "}
                {invoiceMode === "deposit" ? `Acompte ${depositPercent} %` : "100 % du devis"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-400">
                {formatCurrency(previewTtc)} TTC
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Résultat après envoi ou simulation */}
          {lastResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 space-y-1 flex-1">
                  <div className="font-semibold">{lastResult.message}</div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-emerald-800">
                    <span className="bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                      Client ID: {lastResult.pennylaneCustomerId}
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                      Facture: {lastResult.pennylaneInvoiceNumber}
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-emerald-200 uppercase font-semibold">
                      {lastResult.providerMode === "live" ? "API Live" : "Simulation JSON v2"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {lastResult.pennylaneInvoiceUrl && (
                  <a
                    href={lastResult.pennylaneInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                  >
                    Ouvrir le PDF Pennylane <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowJsonPayload((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 text-xs font-medium hover:bg-emerald-100"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showJsonPayload
                    ? "Masquer le payload API v2"
                    : "Inspecter le JSON envoyé à Pennylane"}
                </button>
              </div>

              {showJsonPayload && (
                <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-emerald-300 text-[11px] overflow-x-auto max-h-56">
                  {JSON.stringify(
                    {
                      step1_customer: {
                        endpoint: lastResult.customerEndpoint,
                        body: lastResult.customerPayload,
                      },
                      step2_invoice: {
                        endpoint: lastResult.invoiceEndpoint,
                        body: lastResult.invoicePayload,
                      },
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Pied d'actions */}
        <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handlePush(true)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            Tester à blanc (Dry-Run JSON)
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/70"
            >
              Fermer
            </button>
            <button
              type="button"
              disabled={submitting || quote.lines.length === 0}
              onClick={() => void handlePush(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Synchronisation…
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  Pousser vers Pennylane
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
