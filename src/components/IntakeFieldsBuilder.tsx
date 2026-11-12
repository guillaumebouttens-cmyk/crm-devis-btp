"use client";

import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { IntakeFieldDefinition, IntakeFieldType } from "@/lib/types";

interface IntakeFieldsBuilderProps {
  fields: IntakeFieldDefinition[];
  onChange: (next: IntakeFieldDefinition[]) => void;
}

export function IntakeFieldsBuilder({ fields, onChange }: IntakeFieldsBuilderProps) {
  const addField = () => {
    const idx = fields.length + 1;
    onChange([
      ...fields,
      {
        id: `champ_${Date.now().toString().slice(-4)}_${idx}`,
        label: "Nouvelle question d'entrevue",
        type: "text",
        placeholder: "",
        required: false,
      },
    ]);
  };

  const updateField = (index: number, patch: Partial<IntakeFieldDefinition>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const copy = [...fields];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    onChange(copy);
  };

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Formulaire d&apos;entrevue commerciale paramétrable ({fields.length} champ
            {fields.length > 1 ? "s" : ""})
          </h4>
          <p className="text-xs text-slate-500">
            Questions affichées au commercial lors du rendez-vous (sans voix ou en complément) et transmises à l&apos;agent.
          </p>
        </div>
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter un champ
        </button>
      </div>

      {fields.length === 0 ? (
        <div className="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">
          Aucun champ configuré pour ce métier.
        </div>
      ) : (
        <div className="space-y-2.5">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Libellé de la question
                  </label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Type de saisie
                  </label>
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, { type: e.target.value as IntakeFieldType })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="text">Texte court</option>
                    <option value="number">Nombre / Mesure</option>
                    <option value="select">Liste de choix</option>
                    <option value="boolean">Oui / Non</option>
                    <option value="textarea">Notes multilignes</option>
                  </select>
                </div>

                <div className="sm:col-span-2 pt-3 sm:pt-4">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Requis
                  </label>
                </div>

                <div className="sm:col-span-2 flex items-center justify-end gap-1 pt-2 sm:pt-4">
                  <button
                    type="button"
                    onClick={() => moveField(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    title="Monter"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(index, 1)}
                    disabled={index === fields.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    title="Descendre"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="p-1 text-slate-400 hover:text-red-600"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {field.type === "select" && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Options de la liste (séparées par une virgule)
                  </label>
                  <input
                    type="text"
                    value={(field.options ?? []).join(", ")}
                    placeholder="Ex: Plus de 2 ans (TVA 10%), Neuf (TVA 20%)"
                    onChange={(e) =>
                      updateField(index, {
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              )}

              {(field.type === "text" ||
                field.type === "number" ||
                field.type === "textarea") && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Texte d&apos;exemple (placeholder)
                  </label>
                  <input
                    type="text"
                    value={field.placeholder ?? ""}
                    placeholder="Ex: 35 m²"
                    onChange={(e) => updateField(index, { placeholder: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
