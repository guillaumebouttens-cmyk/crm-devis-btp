"use client";

import React, { useState } from "react";
import { Lock, LogIn, LogOut, ShieldCheck, UserCheck, X } from "lucide-react";
import {
  canRoleManageRules,
  getRoleLabel,
  isSupabaseConfigured,
  saveDemoRole,
  signInSupabase,
  signOutSupabase,
  signUpSupabase,
} from "@/lib/supabase";
import type { UserProfile, UserRole } from "@/lib/types";

interface AuthRoleBarProps {
  userProfile: UserProfile | null;
  onProfileChange: (next: UserProfile | null) => void;
  onNotify: (msg: string) => void;
}

export function AuthRoleBar({
  userProfile,
  onProfileChange,
  onNotify,
}: AuthRoleBarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("commercial");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isManager = canRoleManageRules(userProfile?.role);

  const handleDemoRoleSwitch = (role: UserRole) => {
    const next = saveDemoRole(role);
    onProfileChange(next);
    onNotify(
      role === "commercial"
        ? "Profil actif : Commercial (lecture seule sur les instructions métiers et tarifs, accès uniquement à ses devis)."
        : `Profil actif : ${getRoleLabel(role)} (peut actualiser les instructions au fil des conversations et gérer tous les devis).`
    );
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      if (authMode === "signin") {
        const profile = await signInSupabase(email.trim(), password);
        onProfileChange(profile);
        setModalOpen(false);
        onNotify(`Connecté en tant que ${profile.full_name} (${getRoleLabel(profile.role)}).`);
      } else {
        const { profile, needsEmailConfirmation } = await signUpSupabase(
          email.trim(),
          password,
          fullName.trim(),
          requestedRole
        );
        if (needsEmailConfirmation) {
          setModalOpen(false);
          onNotify("Compte créé ! Vérifiez votre boîte mail pour confirmer l'inscription.");
        } else if (profile) {
          onProfileChange(profile);
          setModalOpen(false);
          onNotify(`Bienvenue ${profile.full_name} (${getRoleLabel(profile.role)}).`);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur d'authentification");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutSupabase();
    onProfileChange(null);
    onNotify("Déconnecté.");
  };

  // Mode Démo Local (sans Supabase configuré) : sélecteur instantané pour tester les droits
  if (!isSupabaseConfigured) {
    return (
      <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
        {isManager ? (
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
        <span className="text-slate-400 hidden md:inline">Rôle RLS :</span>
        <select
          value={userProfile?.role ?? "directeur_commercial"}
          onChange={(e) => handleDemoRoleSwitch(e.target.value as UserRole)}
          className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer pr-1"
          title="Simuler les droits RLS d'un interlocuteur"
        >
          <option value="directeur_commercial" className="text-slate-900">
            Directeur Commercial
          </option>
          <option value="commercial" className="text-slate-900">
            Commercial
          </option>
          <option value="admin" className="text-slate-900">
            Administrateur
          </option>
        </select>
      </div>
    );
  }

  // Mode Supabase Connecté (vraie authentification JWT + RLS PostgreSQL)
  return (
    <>
      {userProfile ? (
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
          {isManager ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          )}
          <span className="font-medium text-white truncate max-w-[120px]">
            {userProfile.full_name}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              isManager
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-slate-700 text-slate-300"
            }`}
          >
            {getRoleLabel(userProfile.role)}
          </span>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-slate-400 hover:text-white p-0.5"
            title="Se déconnecter"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
        >
          <LogIn className="w-3.5 h-3.5" />
          Connexion RLS
        </button>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">
                {authMode === "signin" ? "Connexion Équipe" : "Créer un accès"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                className={`py-1.5 rounded-md ${
                  authMode === "signin" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
                }`}
              >
                Se connecter
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`py-1.5 rounded-md ${
                  authMode === "signup" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
                }`}
              >
                Inscription
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === "signup" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex: Claire Dubois"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Rôle souhaité
                    </label>
                    <select
                      value={requestedRole}
                      onChange={(e) => setRequestedRole(e.target.value as UserRole)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="commercial">Commercial</option>
                      <option value="directeur_commercial">Directeur Commercial</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  E-mail professionnel
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@entreprise.fr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loading
                  ? "Chargement…"
                  : authMode === "signin"
                  ? "Se connecter"
                  : "Créer le compte"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
