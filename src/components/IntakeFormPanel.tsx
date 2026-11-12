"use client";

import React from "react";
import { ClipboardCheck, Sliders, Sparkles } from "lucide-react";
import type { IntakeDataMap, IntakeFieldDefinition, QuoteDraft } from "@/lib/types";

interface IntakeFormPanelProps {
  tradeName: string;
  fields: IntakeFieldDefinition[];
  draft: QuoteDraft;
  isLoadingAgent: boolean;
  onUpdateDraft: (patch: Partial<QuoteDraft>) => void;
  onUpdateIntakeValue: (fieldId: string, value: string | number | boolean) => void;
  onSendIntakeToAgent: () => void;
  onOpenFormCustomizer: () => void;
}

export function IntakeFormPanel({
  tradeName,
  fields,
  draft,
  isLoadingAgent,
  onUpdateDraft,
  onUpdateIntakeValue,
  onSendIntakeToAgent,
  onOpenFormCustomizer,
}: IntakeFormPanelProps) {
  const filledCount = fields.filter((f) => {
    const v = draft.intake_data?.[f.id];
    return v !== undefined && v !== "";
  }).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Fiche d&apos;Entrevue — {tradeName}
            </h3>
            <p className="text-[11px] text-slate-500">
              {filledCount}/{fields.length} critère(s) renseigné(s) • transmis automatiquement à l&apos;agent
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenFormCustomizer}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          <Sliders className="w-3.5 h-3.5" />
          Personnaliser champs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Coordonnées Client & Chantier */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Coordonnées Client & Lieu
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nom / Société client
              </label>
              <input
                type="text"
                value={draft.client_name}
                onChange={(e) => onUpdateDraft({ client_name: e.target.value })}
                placeholder="Ex: Mme Lefèvre"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Téléphone
              </label>
              <input
                type="tel"
                value={draft.client_phone}
                onChange={(e) => onUpdateDraft({ client_phone: e.target.value })}
                placeholder="06 12 34 56 78"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={draft.client_email}
                onChange={(e) => onUpdateDraft({ client_email: e.target.value })}
                placeholder="client@email.fr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Adresse du chantier
              </label>
              <input
                type="text"
                value={draft.site_address}
                onChange={(e) => onUpdateDraft({ site_address: e.target.value })}
                placeholder="Ex: 14 rue Victor Hugo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Champs dynamiques paramétrés pour ce métier */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Relevé Métier ({tradeName})
          </div>

          {fields.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              Aucun champ configuré pour ce métier. Cliquez sur « Personnaliser champs » pour en ajouter.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((field) => {
                const rawVal: IntakeDataMap[string] | undefined = draft.intake_data?.[field.id];
                const isWide = field.type === "textarea" || field.type === "select";

                return (
                  <div
                    key={field.id}
                    className={isWide ? "sm:col-span-2" : "sm:col-span-1"}
                  >
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>

                    {field.type === "text" && (
                      <input
                        type="text"
                        value={typeof rawVal === "string" ? rawVal : ""}
                        placeholder={field.placeholder || ""}
                        onChange={(e) => onUpdateIntakeValue(field.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}

                    {field.type === "number" && (
                      <input
                        type="number"
                        step="any"
                        value={rawVal !== undefined && rawVal !== "" ? Number(rawVal) : ""}
                        placeholder={field.placeholder || "0"}
                        onChange={(e) =>
                          onUpdateIntakeValue(
                            field.id,
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}

                    {field.type === "select" && (
                      <select
                        value={typeof rawVal === "string" ? rawVal : ""}
                        onChange={(e) => onUpdateIntakeValue(field.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">— Sélectionner —</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type === "boolean" && (
                      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => onUpdateIntakeValue(field.id, true)}
                          className={`px-3.5 py-2 transition ${
                            rawVal === true
                              ? "bg-blue-600 text-white"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIntakeValue(field.id, false)}
                          className={`px-3.5 py-2 border-l border-slate-300 transition ${
                            rawVal === false
                              ? "bg-slate-800 text-white"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          Non
                        </button>
                      </div>
                    )}

                    {field.type === "textarea" && (
                      <textarea
                        rows={2}
                        value={typeof rawVal === "string" ? rawVal : ""}
                        placeholder={field.placeholder || ""}
                        onChange={(e) => onUpdateIntakeValue(field.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Option d'affichage sur le PDF */}
        <label className="flex items-center gap-2 pt-2 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.include_intake_on_pdf}
            onChange={(e) => onUpdateDraft({ include_intake_on_pdf: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Imprimer le récapitulatif de ce relevé d&apos;entrevue sur le PDF client
        </label>
      </div>

      <div className="p-3.5 border-t border-slate-100 bg-slate-50/80 rounded-b-xl">
        <button
          type="button"
          disabled={isLoadingAgent}
          onClick={onSendIntakeToAgent}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition"
        >
          <Sparkles className="w-4 h-4" />
          Pré-chiffrer / Mettre à jour le devis depuis cette fiche
        </button>
      </div>
    </div>
  );
}
