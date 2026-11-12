"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Play, Sparkles } from "lucide-react";
import { AppProcessGuide } from "@/components/AppProcessGuide";

export default function GuidePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-4 py-2.5 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1.5 rounded-lg transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Retour au Studio
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                DV
              </div>
              <h1 className="font-semibold text-sm sm:text-base leading-tight">
                Guide &amp; Fonctionnement
              </h1>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            Créer un Devis
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5">
        <AppProcessGuide
          onGoToStudio={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/";
            }
          }}
          onGoToSettings={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/#settings";
            }
          }}
        />
      </main>
    </div>
  );
}
