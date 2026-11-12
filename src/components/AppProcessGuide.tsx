"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HardHat,
  HelpCircle,
  Layers,
  Lock,
  MessageSquare,
  Mic,
  PenTool,
  Play,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

interface AppProcessGuideProps {
  onGoToStudio?: () => void;
  onGoToSettings?: () => void;
  onGoToSkills?: () => void;
}

export function AppProcessGuide({
  onGoToStudio,
  onGoToSettings,
  onGoToSkills,
}: AppProcessGuideProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const steps = [
    {
      num: 1,
      title: "Découverte & Relevé Chantier",
      subtitle: "Fiche d'entrevue commerciale",
      icon: <ClipboardList className="w-5 h-5 text-violet-600" />,
      badge: "Formulaire dynamique",
      color: "border-violet-200 bg-violet-50/70",
      activeColor: "ring-2 ring-violet-500 bg-violet-50",
      description:
        "En rendez-vous client, vous sélectionnez le métier concerné (Menuiserie Ext., Électricité, Plomberie, etc.) et complétez les critères clés du chantier.",
      keyPoints: [
        "Détection automatique de la TVA (10 % en rénovation > 2 ans vs 20 % dans le neuf).",
        "Relevé des dimensions, accès camion, contraintes de pose et délais souhaités.",
        "Possibilité d'imprimer ce relevé technique directement en encadré sur le devis PDF client.",
      ],
      tip: "Le formulaire guide le commercial pour ne rien oublier avant de lancer le chiffrage.",
    },
    {
      num: 2,
      title: "Chiffrage IA & Ouvrages Composés",
      subtitle: "Voix, Clavier ou Clic 1-seconde",
      icon: <Mic className="w-5 h-5 text-blue-600" />,
      badge: "Mistral IA + Recettes",
      color: "border-blue-200 bg-blue-50/70",
      activeColor: "ring-2 ring-blue-500 bg-blue-50",
      description:
        "Décrivez simplement le besoin à l'oral ou au clavier. L'agent IA comprend le langage métier du BTP et compose les lignes de devis.",
      keyPoints: [
        "Mode vocal au micro : parlez naturellement (« 1 portail coulissant motorisé 4m et 15 ml de clôture pour M. Martin »).",
        "Mode clavier toujours disponible si le micro est coupé ou sur PC de bureau.",
        "Ouvrages composés en 1 clic : ajout d'un ouvrage qui embarque sa recette complète (ex: Heures de pose + Portail + Moteur + Quincaillerie + Forfait déplacement).",
      ],
      tip: "L'IA utilise uniquement les prix de vente publics : aucun coût d'achat secret n'est envoyé au modèle.",
    },
    {
      num: 3,
      title: "Contrôle Rentabilité ERP & Feu Tricolore",
      subtitle: "Sécurité de marge (Décision D6)",
      icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
      badge: "erp.crm_devis",
      color: "border-emerald-200 bg-emerald-50/70",
      activeColor: "ring-2 ring-emerald-500 bg-emerald-50",
      description:
        "L'application calcule en temps réel le déboursé sec sur les 5 postes analytiques de l'ERP pour garantir la rentabilité du chantier.",
      keyPoints: [
        "Ventilation automatique : Heures de main-d'œuvre, Matière, Sous-traitance, Matériel/Engins, Autres frais.",
        "Feu Vert (marge ≥ 28 %) : devis rentable, validable et envoyable immédiatement.",
        "Feu Orange (18 % à 28 %) : marge serrée, vérification conseillée.",
        "Feu Rouge (< 18 %) : bloque l'envoi PDF pour le commercial jusqu'à validation de la Direction.",
      ],
      tip: "Décision D6 : le commercial voit seulement le feu de couleur. Seule la Direction voit les montants en euros et pourcentages.",
    },
    {
      num: 4,
      title: "Accord Client & Signature au Doigt",
      subtitle: "Bon pour accord immédiat sur mobile",
      icon: <PenTool className="w-5 h-5 text-amber-600" />,
      badge: "Signature tactile",
      color: "border-amber-200 bg-amber-50/70",
      activeColor: "ring-2 ring-amber-500 bg-amber-50",
      description:
        "En fin de rendez-vous, présentez le devis au client sur votre smartphone ou tablette et recueillez son accord signé sur-le-champ.",
      keyPoints: [
        "Pavé tactile ergonomique pour signer du doigt ou au stylet.",
        "Enregistrement du nom du signataire, de sa qualité et horodatage certifié.",
        "Incrustation de la signature manuscrite directement dans le bloc « Bon pour accord » du PDF.",
        "Partage direct via l'e-mail du téléphone ou messagerie en un tap.",
      ],
      tip: "Supprime les relances interminables : 60 % des devis signés sur place sont transformés le jour même.",
    },
    {
      num: 5,
      title: "Chantier, Avenant TS & Scan de Bon de Livraison",
      subtitle: "Gestion des imprévus & refacturation",
      icon: <HardHat className="w-5 h-5 text-sky-600" />,
      badge: "Photo-Scan Pixtral",
      color: "border-sky-200 bg-sky-50/70",
      activeColor: "ring-2 ring-sky-500 bg-sky-50",
      description:
        "Sur le terrain, un imprévu ou des fournitures complémentaires surviennent ? Gérez-les sans quitter le chantier.",
      keyPoints: [
        "Mode Avenant TS : bascule en 1 clic pour chiffrer un avenant numéroté TS-... rattaché au code affaire (ex: AFF-2026-042).",
        "Photo-Scan BL : prenez en photo le bon de livraison fournisseur avec l'appareil photo du smartphone.",
        "L'IA Pixtral extrait les fournitures et montants d'achat pour l'ERP (erp.achats_bl).",
        "Bouton « Convertir en Avenant TS » : applique le coefficient de marge et génère le TS prêt à faire signer au client.",
      ],
      tip: "Zéro fourniture oubliée : chaque achat imprévu sur chantier est immédiatement valorisé et refacturé.",
    },
    {
      num: 6,
      title: "Facturation & Synchronisation Pennylane",
      subtitle: "Conformité Factur-X & Comptabilité",
      icon: <FileSpreadsheet className="w-5 h-5 text-teal-600" />,
      badge: "Pennylane API v2",
      color: "border-teal-200 bg-teal-50/70",
      activeColor: "ring-2 ring-teal-500 bg-teal-50",
      description:
        "Dès l'acceptation du devis, poussez les factures directement dans Pennylane sans double saisie.",
      keyPoints: [
        "Création ou rapprochement automatique de la fiche client (B2C Particulier ou B2B Entreprise).",
        "Choix Facture d'Acompte (ex: 30 % avec ventilation automatique par taux de TVA 10 % et 20 %).",
        "Choix Facture 100 % reprenant l'intégralité des lignes d'articles et d'ouvrages.",
        "Statut brouillon pour scellement Factur-X officiel ou émission directe avec lien de paiement.",
      ],
      tip: "Le pont fonctionne en mode simulation (Dry-Run) sans clé API, et bascule en direct dès que le jeton Pennylane est renseigné.",
    },
  ];

  const faqs = [
    {
      q: "L'application fonctionne-t-elle sans connexion Internet sur un chantier ?",
      a: "Oui ! L'application embarque un catalogue local complet et un moteur de calcul déterministe hors ligne. Vous pouvez saisir au clavier, insérer des ouvrages composés, calculer le feu tricolore de rentabilité, faire signer le client et générer le devis PDF sans aucune connexion. Dès que le réseau est disponible, les données se synchronisent avec Supabase et Pennylane.",
    },
    {
      q: "Qu'est-ce que la « Décision D6 » sur le masquage des marges ?",
      a: "Dans la plupart des entreprises du BTP, il est essentiel que les commerciaux sur le terrain sachent si leur devis est rentable sans pour autant connaître les prix de revient d'achat des fournisseurs ou la marge exacte en euros. La Décision D6 affiche pour le commercial un feu tricolore simple (Vert / Orange / Rouge). Seul le Directeur Commercial ou Administrateur a accès au détail chiffré des déboursés et marges.",
    },
    {
      q: "Comment fonctionne la reconnaissance vocale ?",
      a: "Sur smartphone (Chrome, Safari iOS 15+) ou sur ordinateur équipé d'un micro, vous appuyez sur « Parler à l'agent ». L'application utilise la reconnaissance vocale de votre navigateur. Si votre navigateur ne supporte pas le micro ou si vous êtes dans un environnement bruyant, l'application bascule automatiquement en Mode Clavier tout en conservant toute la puissance de l'agent IA.",
    },
    {
      q: "Peut-on désactiver des modules si on souhaite une interface très simple ?",
      a: "Absolument. Rendez-vous dans l'onglet « Paramètres » : vous disposez de 8 interrupteurs (toggles ON/OFF) pour activer ou masquer chaque fonctionnalité selon les besoins (par exemple : masquer Pennylane pour un conducteur de travaux, ou masquer le scanner BL pour une secrétaire au bureau). Des profils rapides (« Production Complète », « Mode Chantier », « Mode Chiffrage Minimal ») sont activables en 1 clic.",
    },
    {
      q: "Comment un Directeur Commercial peut-il modifier les consignes de l'IA ?",
      a: "Deux méthodes : soit via l'onglet « Métiers & Formulaires » où chaque règle est éditable, soit directement dans le chat en parlant à l'agent (« Désormais retiens comme consigne métier : prévois toujours un forfait déplacement de 85 € au-delà de 25 km »). L'agent détecte l'instruction, propose la mise à jour et la journalise avec audit d'auteur dans Supabase.",
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* En-tête de bienvenue & Pitch général */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-5 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" /> Guide Utilisateur &amp; Processus Métier
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Comment fonctionne l&apos;application Devis Vocal IA ?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Une solution mobile-first conçue pour les équipes du BTP : du premier contact client sur chantier jusqu&apos;à la facture Pennylane, en passant par le contrôle automatique de marge ERP et la signature tactile.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
            {onGoToStudio && (
              <button
                type="button"
                onClick={onGoToStudio}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-sm transition"
              >
                <Play className="w-4 h-4 fill-white" />
                Accéder au Studio Devis
              </button>
            )}
            {onGoToSettings && (
              <button
                type="button"
                onClick={onGoToSettings}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
              >
                <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                Paramétrage des Toggles
              </button>
            )}
          </div>
        </div>

        {/* 3 piliers synthétiques */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-2.5 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <Smartphone className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <div className="font-semibold text-white">100 % Mobile &amp; Voix</div>
              <div className="text-[11px] text-slate-400">Ergonomie chantier au pouce</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-semibold text-white">Sécurité de Marge ERP</div>
              <div className="text-[11px] text-slate-400">Feu tricolore sans fuite de coûts</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <FileSpreadsheet className="w-5 h-5 text-teal-400 shrink-0" />
            <div>
              <div className="font-semibold text-white">Pont Pennylane Direct</div>
              <div className="text-[11px] text-slate-400">Acomptes &amp; Factur-X en 1 clic</div>
            </div>
          </div>
        </div>
      </div>

      {/* Le Processus pas-à-pas en 6 étapes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                6
              </span>
              Le Cycle de Vie d&apos;un Devis (Processus Complet)
            </h3>
            <p className="text-xs text-slate-500">
              Cliquez sur une étape pour en découvrir les fonctionnalités et les automatismes.
            </p>
          </div>

          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full self-start sm:self-auto">
            Étape {activeStep} / {steps.length}
          </span>
        </div>

        {/* Timeline des boutons d'étapes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {steps.map((st) => (
            <button
              key={st.num}
              type="button"
              onClick={() => setActiveStep(st.num)}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
                activeStep === st.num
                  ? `${st.activeColor} border-blue-400 shadow-xs`
                  : "bg-white border-slate-200 hover:bg-slate-50 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    activeStep === st.num
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {st.num}
                </span>
                {st.icon}
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900 line-clamp-1">
                  {st.title}
                </div>
                <div className="text-[10px] text-slate-500 line-clamp-1">
                  {st.subtitle}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Carte détaillée de l'étape sélectionnée */}
        {(() => {
          const current = steps[activeStep - 1] ?? steps[0];
          return (
            <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${current.color}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-white border border-black/10 shadow-xs shrink-0">
                    {current.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Étape {current.num}
                      </span>
                      <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                        {current.badge}
                      </span>
                    </div>
                    <h4 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                      {current.title} — {current.subtitle}
                    </h4>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={activeStep <= 1}
                    onClick={() => setActiveStep((s) => Math.max(1, s - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    disabled={activeStep >= steps.length}
                    onClick={() => setActiveStep((s) => Math.min(steps.length, s + 1))}
                    className="px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40"
                  >
                    Suivant →
                  </button>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                {current.description}
              </p>

              <div className="bg-white rounded-xl p-3.5 border border-black/5 space-y-2">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Points clés &amp; Automatismes :
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {current.keyPoints.map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 italic bg-white/70 px-3 py-2 rounded-lg border border-black/5">
                <span className="font-bold not-italic text-slate-800">Conseil Pro :</span>
                <span>{current.tip}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Rôles & Sécurité RLS (Commercial vs Direction) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Gestion des Droits &amp; Sécurité RLS (PostgreSQL)
          </h3>
          <p className="text-xs text-slate-500">
            Chaque utilisateur n&apos;accède qu&apos;aux données strictement nécessaires à sa mission.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Carte Commercial */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h4 className="font-bold text-sm text-slate-900">Profil Commercial</h4>
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                Terrain &amp; Vente
              </span>
            </div>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>Accès complet au chiffrage vocal, clavier et fiches d&apos;entrevue.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>Consultation de ses propres devis enregistrés uniquement.</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Coûts d&apos;achat masqués :</strong> ne voit que le Feu Tricolore (Décision D6).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Feu Rouge bloquant :</strong> l&apos;envoi PDF est verrouillé si la marge est trop faible.
                </span>
              </li>
            </ul>
          </div>

          {/* Carte Directeur Commercial / Admin */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <h4 className="font-bold text-sm text-emerald-950">
                  Directeur Commercial &amp; Admin
                </h4>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">
                Supervision &amp; Règles
              </span>
            </div>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Vision 360° :</strong> consulte et supervise les devis de toute l&apos;équipe.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Déboursés démasqués :</strong> ventilation Heures/Matière/Matériel et % de marge en clair.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-fuchsia-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Consignes au fil de l&apos;eau :</strong> modifie les règles de l&apos;IA en parlant dans le chat.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Export ERP :</strong> copie 1-clic du JSON prêt pour <code>erp.crm_devis</code> ou <code>erp.preparation_ts</code>.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Foire Aux Questions (FAQ) interactive */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            Questions Fréquentes (FAQ)
          </h3>
          <p className="text-xs text-slate-500">
            Tout ce qu&apos;il faut savoir pour démarrer rapidement.
          </p>
        </div>

        <div className="space-y-2">
          {faqs.map((f, i) => {
            const isExp = expandedFaq === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-200 overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isExp ? null : i)}
                  className="w-full p-3.5 text-left font-semibold text-xs sm:text-sm text-slate-900 flex items-center justify-between gap-2 hover:bg-slate-50"
                >
                  <span>{f.q}</span>
                  {isExp ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>
                {isExp && (
                  <div className="px-3.5 pb-3.5 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-2.5 bg-slate-50/50">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Barre d'action finale */}
      <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-bold text-sm sm:text-base">Prêt à créer votre premier devis ?</div>
          <div className="text-xs text-slate-400">
            Testez la dictée vocale ou insérez un Ouvrage Composé en 1 clic.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onGoToStudio && (
            <button
              type="button"
              onClick={onGoToStudio}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition"
            >
              Lancer le Studio Devis <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
