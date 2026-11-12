"use client";

import React, { useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import {
  computeOuvrageTotalsFromComponents,
  formatCurrency,
  getCostNatureLabel,
  round2,
} from "@/lib/quote-calc";
import type { CostNature, OuvrageComponent, TradeSkill } from "@/lib/types";

interface OuvrageComposerFormProps {
  tradeSkills: TradeSkill[];
  onCreateOuvrage: (payload: {
    supplier_ref?: string;
    trade_slug: string;
    name: string;
    unit: string;
    margin_coef: number;
    vat_rate: number;
    components: OuvrageComponent[];
  }) => Promise<void>;
}

export function OuvrageComposerForm({
  tradeSkills,
  onCreateOuvrage,
}: OuvrageComposerFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [trade, setTrade] = useState("menuiserie-ext");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("ens");
  const [coef, setCoef] = useState("1.48");
  const [vat, setVat] = useState("10");
  const [components, setComponents] = useState<OuvrageComponent[]>([
    {
      id: "comp-init-1",
      label: "Fourniture principale",
      cost_nature: "matiere",
      quantity_per_unit: 1,
      unit: "ens",
      unit_cost_ht: 450,
    },
    {
      id: "comp-init-2",
      label: "Main-d'œuvre de pose & réglages",
      cost_nature: "heures",
      quantity_per_unit: 6,
      unit: "h",
      unit_cost_ht: 38,
    },
  ]);

  const { unitCostHt, hoursPerUnit } = computeOuvrageTotalsFromComponents(components);
  const previewSaleHt = round2(unitCostHt * (Number(coef) || 1.45));

  const addRow = () => {
    setComponents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: "",
        cost_nature: "matiere",
        quantity_per_unit: 1,
        unit: "u",
        unit_cost_ht: 0,
      },
    ]);
  };

  const updateRow = (id: string, patch: Partial<OuvrageComponent>) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const removeRow = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validComps = components.filter((c) => c.label.trim());
    if (!name.trim() || validComps.length === 0) return;

    const cleanTitle = /^ouvrage\s*:/i.test(name.trim())
      ? name.trim()
      : `Ouvrage : ${name.trim()}`;

    await onCreateOuvrage({
      supplier_ref: ref.trim() || undefined,
      trade_slug: trade,
      name: cleanTitle,
      unit: unit.trim() || "ens",
      margin_coef: Number(coef) || 1.45,
      vat_rate: Number(vat) || 10,
      components: validComps,
    });

    setRef("");
    setName("");
    setIsOpen(false);
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          <div>
            <div className="text-xs sm:text-sm font-semibold text-indigo-950">
              Constructeur d&apos;Ouvrages Composés (Recette Heures + Matière + Matériel)
            </div>
            <div className="text-[11px] text-indigo-800/80">
              Ventile automatiquement les natures analytiques pour{" "}
              <code>erp.crm_devis</code> et <code>erp.affaires</code>.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
        >
          {isOpen ? "Fermer" : "+ Créer un Ouvrage Composé"}
        </button>
      </div>

      {isOpen && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-xl border border-indigo-200 p-3.5 space-y-3"
        >
          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
            <input
              type="text"
              placeholder="Réf (OUV-FEN-01)"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="col-span-1 sm:col-span-2 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="col-span-1 sm:col-span-3 rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
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
              placeholder="Libellé de l'ouvrage (ex: Porte de garage sectionnelle motorisée posée)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-2 sm:col-span-4 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              placeholder="Unité (ens, m²)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="col-span-1 sm:col-span-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-center"
            />
            <input
              type="number"
              step="0.05"
              min="1.05"
              value={coef}
              onChange={(e) => setCoef(e.target.value)}
              title="Coefficient de vente"
              className="col-span-1 sm:col-span-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-right"
            />
            <select
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              className="col-span-2 sm:col-span-1 rounded border border-slate-300 px-1.5 py-1.5 text-xs bg-white"
            >
              <option value="10">10%</option>
              <option value="20">20%</option>
              <option value="5.5">5,5%</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-700">
              Sous-détail de l&apos;ouvrage (pour 1 {unit || "unité"}) :
            </div>
            {components.map((comp) => (
              <div
                key={comp.id}
                className="grid grid-cols-2 sm:grid-cols-12 gap-1.5 items-center bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs"
              >
                <select
                  value={comp.cost_nature}
                  onChange={(e) => {
                    const nextNature = e.target.value as CostNature;
                    updateRow(comp.id, {
                      cost_nature: nextNature,
                      unit: nextNature === "heures" ? "h" : comp.unit,
                      unit_cost_ht:
                        nextNature === "heures" && comp.unit_cost_ht === 0
                          ? 38
                          : comp.unit_cost_ht,
                    });
                  }}
                  className="col-span-1 sm:col-span-2 rounded border border-slate-300 bg-white px-2 py-1"
                >
                  {(
                    [
                      "matiere",
                      "heures",
                      "materiel",
                      "sous_traitance",
                      "autres_frais",
                    ] as CostNature[]
                  ).map((n) => (
                    <option key={n} value={n}>
                      {getCostNatureLabel(n)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  placeholder="Désignation composant (ex: Motorisation + rail)"
                  value={comp.label}
                  onChange={(e) => updateRow(comp.id, { label: e.target.value })}
                  className="col-span-2 sm:col-span-5 rounded border border-slate-300 bg-white px-2 py-1"
                />
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={comp.quantity_per_unit}
                  onChange={(e) =>
                    updateRow(comp.id, {
                      quantity_per_unit: Number(e.target.value),
                    })
                  }
                  placeholder="Qté"
                  className="col-span-1 sm:col-span-1 rounded border border-slate-300 bg-white px-2 py-1 text-right"
                />
                <input
                  type="text"
                  value={comp.unit}
                  onChange={(e) => updateRow(comp.id, { unit: e.target.value })}
                  placeholder="Unité"
                  className="col-span-1 sm:col-span-1 rounded border border-slate-300 bg-white px-2 py-1 text-center"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={comp.unit_cost_ht}
                  onChange={(e) =>
                    updateRow(comp.id, { unit_cost_ht: Number(e.target.value) })
                  }
                  placeholder="Coût u. HT"
                  className="col-span-1 sm:col-span-2 rounded border border-slate-300 bg-white px-2 py-1 text-right"
                />
                <button
                  type="button"
                  disabled={components.length <= 1}
                  onClick={() => removeRow(comp.id)}
                  className="col-span-2 sm:col-span-1 flex justify-center text-slate-400 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 pt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter un composant (Heures / Matière / Engin)
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="text-slate-600">
              Déboursé sec calculé : <strong>{formatCurrency(unitCostHt)} HT</strong> (dont{" "}
              <strong>{hoursPerUnit} h</strong>) ➔ Prix de vente auto :{" "}
              <strong className="text-indigo-700 text-sm">
                {formatCurrency(previewSaleHt)} HT / {unit || "u"}
              </strong>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
            >
              Enregistrer l&apos;Ouvrage Composé
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
