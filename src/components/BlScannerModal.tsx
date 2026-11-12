"use client";

import React, { useState } from "react";
import {
  ArrowRightCircle,
  Camera,
  CheckCircle2,
  Copy,
  FileSearch,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { formatCurrency, getCostNatureLabel } from "@/lib/quote-calc";
import type { ScannedBlRecord } from "@/lib/types";

interface BlScannerModalProps {
  tradeSlug: string;
  defaultProjectRef?: string;
  recentBls: ScannedBlRecord[];
  onClose: () => void;
  onBlRecorded: (record: ScannedBlRecord) => void;
  onConvertBlToAvenantTs: (record: ScannedBlRecord, marginCoef: number) => void;
  onNotify: (msg: string) => void;
}

export function BlScannerModal({
  tradeSlug,
  defaultProjectRef,
  recentBls,
  onClose,
  onBlRecorded,
  onConvertBlToAvenantTs,
  onNotify,
}: BlScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState<ScannedBlRecord | null>(null);
  const [marginCoef, setMarginCoef] = useState("1.50");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const runScan = async (imageDataUrl?: string, fileName?: string) => {
    setIsScanning(true);
    try {
      const res = await fetch("/api/ocr-bl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          fileName,
          defaultProjectRef,
          tradeSlug,
        }),
      });
      const data = (await res.json()) as ScannedBlRecord & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Échec analyse BL");
      }
      setScanned(data);
      onBlRecorded(data);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Erreur OCR BL");
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setPreviewUrl(dataUrl);
      void runScan(dataUrl, file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleCopyErpAchatsBl = async () => {
    if (!scanned) return;
    const payload = {
      target_table: "erp.achats_bl",
      fournisseur: scanned.supplier_name,
      numero_bl: scanned.bl_number,
      date_bl: scanned.bl_date,
      affaire_code: scanned.project_ref,
      montant_ht: scanned.total_cost_ht,
      lignes: scanned.lines,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    onNotify("Payload JSON erp.achats_bl copié dans le presse-papiers !");
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden my-auto">
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-sm">
              Photo-Scan BL Fournisseur (Mistral Pixtral ➔ <code>erp.achats_bl</code>)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 p-3.5 flex flex-col items-center justify-center gap-1.5 text-center transition">
              <Upload className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-950">
                Prendre en photo / Importer un BL
              </span>
              <span className="text-[11px] text-slate-500">
                Appareil photo mobile ou image JPG/PNG
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <button
              type="button"
              disabled={isScanning}
              onClick={() => void runScan(undefined, "BL_Chantier_Terrain.jpg")}
              className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3.5 flex flex-col items-center justify-center gap-1.5 text-center transition disabled:opacity-50"
            >
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-semibold text-slate-900">
                Simuler un BL chantier en 1 clic
              </span>
              <span className="text-[11px] text-slate-500">
                Teste le flux complet vers <code>erp.achats_bl</code> &amp; Avenant TS
              </span>
            </button>
          </div>

          {isScanning && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-900 animate-pulse text-center font-medium">
              Extraction vision Mistral Pixtral en cours sur le Bon de Livraison…
            </div>
          )}

          {scanned && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  BL extrait ({scanned.provider === "pixtral" ? "Mistral Pixtral" : "Mode démo"})
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyErpAchatsBl()}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
                >
                  <Copy className="w-3.5 h-3.5" /> Copier JSON <code>erp.achats_bl</code>
                </button>
              </div>

              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Aperçu BL"
                  className="max-h-32 rounded-lg border border-slate-200 object-contain bg-white"
                />
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500">Fournisseur</div>
                  <div className="font-semibold text-slate-900">
                    {scanned.supplier_name}
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500">N° BL</div>
                  <div className="font-mono font-semibold text-slate-900">
                    {scanned.bl_number}
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500">Affaire imputée</div>
                  <div className="font-mono font-semibold text-blue-700">
                    {scanned.project_ref}
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500">Déboursé HT BL</div>
                  <div className="font-bold text-slate-900">
                    {formatCurrency(scanned.total_cost_ht)}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
                {scanned.lines.map((l, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-medium text-slate-800">{l.designation}</div>
                      <div className="text-[11px] text-slate-500">
                        {getCostNatureLabel(l.cost_nature)} • {l.quantity} {l.unit} ×{" "}
                        {formatCurrency(l.unit_cost_ht)} HT
                      </div>
                    </div>
                    <span className="font-semibold text-slate-900 shrink-0">
                      {formatCurrency(l.quantity * l.unit_cost_ht)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pont direct : Refacturer cet imprévu en Avenant TS client */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-xs text-amber-950">
                  <strong>Fourniture liée à une demande client imprévue ?</strong>
                  <div className="text-[11px] text-amber-800">
                    Convertissez ce BL directement en <strong>Avenant TS</strong> prêt à faire signer sur mobile.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-[11px] text-amber-900 flex items-center gap-1">
                    Coef :
                    <input
                      type="number"
                      step="0.05"
                      min="1.1"
                      value={marginCoef}
                      onChange={(e) => setMarginCoef(e.target.value)}
                      className="w-16 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-right"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onConvertBlToAvenantTs(
                        scanned,
                        Math.max(1.05, Number(marginCoef) || 1.5)
                      );
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                  >
                    <ArrowRightCircle className="w-3.5 h-3.5" /> Créer Avenant TS
                  </button>
                </div>
              </div>
            </div>
          )}

          {recentBls.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <FileSearch className="w-3.5 h-3.5" /> BL chantier enregistrés dans la session (
                {recentBls.length})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {recentBls.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setScanned(b)}
                    className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <span>
                      <strong>{b.supplier_name}</strong> • {b.bl_number} ({b.project_ref})
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(b.total_cost_ht)} HT
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
