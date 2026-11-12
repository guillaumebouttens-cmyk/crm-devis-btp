"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Eraser, PenTool, X } from "lucide-react";
import { formatCurrency } from "@/lib/quote-calc";
import type { ClientSignature, DocumentType } from "@/lib/types";

interface SignaturePadModalProps {
  quoteNumber: string;
  documentType: DocumentType;
  defaultSignerName: string;
  totalTtc: number;
  existingSignature?: ClientSignature | null;
  onClose: () => void;
  onSaveSignature: (sig: ClientSignature) => void;
}

export function SignaturePadModal({
  quoteNumber,
  documentType,
  defaultSignerName,
  totalTtc,
  existingSignature,
  onClose,
  onSaveSignature,
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [signerName, setSignerName] = useState(
    existingSignature?.signer_name || defaultSignerName || ""
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasStrokes(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canvasRef.current || !hasStrokes) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSaveSignature({
      signer_name: signerName.trim() || "Client",
      signed_at: new Date().toISOString(),
      data_url: dataUrl,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-sm">
              Bon pour accord mobile —{" "}
              {documentType === "avenant_ts" ? "Avenant TS" : "Devis"} {quoteNumber}
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

        <form onSubmit={handleConfirm} className="p-4 space-y-3.5">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between text-xs">
            <span className="text-slate-600">
              Montant accepté ({documentType === "avenant_ts" ? "Travaux Supplémentaires" : "Devis"}) :
            </span>
            <span className="font-bold text-base text-slate-900">
              {formatCurrency(totalTtc)} TTC
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nom &amp; qualité du signataire
            </label>
            <input
              type="text"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Ex: M. Martin (Maître d'ouvrage)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">
                Signature manuscrite au doigt ou stylet (« Bon pour accord »)
              </label>
              <button
                type="button"
                onClick={clearCanvas}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
              >
                <Eraser className="w-3.5 h-3.5" /> Effacer
              </button>
            </div>
            <div className="rounded-xl border-2 border-dashed border-slate-300 overflow-hidden bg-white touch-none">
              <canvas
                ref={canvasRef}
                width={520}
                height={180}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="w-full h-40 cursor-crosshair touch-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!hasStrokes || !signerName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              Apposer sur le PDF &amp; verrouiller l&apos;accord
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
