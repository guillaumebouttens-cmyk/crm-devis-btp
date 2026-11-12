# Devis Vocal & Clavier IA — Skills Métiers, Formulaires d'Entrevue & MCP Supabase

Application **100 % responsive (Mobile / Tablette / Desktop)** permettant à un commercial en rendez-vous ou sur chantier de chiffrer un devis via **la voix**, **le clavier** ou une **fiche d'entrevue commerciale paramétrable**, puis d'enregistrer les lignes dans **Supabase** et d'envoyer le **PDF** au client.

## Fonctionnalités clés

1. **Responsive Mobile-First & Multi-Modes (Voix + Clavier)** :
   - Bascule instantanée entre **Mode Vocal** (`Web Speech API` + `SpeechSynthesis`) et **Mode Clavier** (zone multiligne confortable + raccourcis rapides, activée automatiquement si le navigateur n'a pas de micro/reconnaissance vocale).
   - Sur smartphone : navigation ergonomique au pouce (`Dialogue`, `Entrevue`, `Devis`), lignes de devis en **cartes tactiles** sans défilement horizontal et barre récapitulative TTC fixe en bas d'écran.
2. **Formulaires d'Entrevue Commerciale Paramétrables (`trade_skills.intake_fields`)** :
   - Chaque métier possède son propre formulaire de découverte/relevé chantier configurable depuis l'onglet **Métiers & Formulaires** (`Texte`, `Nombre/Mesure`, `Liste déroulante`, `Oui/Non`, `Notes`).
   - Les réponses saisies (`quotes.intake_data`) pilotent automatiquement l'Agent Mistral (surfaces, TVA 10 % vs 20 %, contraintes techniques) et peuvent être imprimées en encadré sur le PDF client.
3. **Réactualisation de la Base de Prix par MCP Supabase** :
   - Modèle `cost_price_ht × margin_coef = unit_price_ht` avec audit automatique (`catalog_price_history`) et fonctions SQL `mcp_upsert_catalog_price()` / `mcp_apply_trade_inflation()`.
4. **Droits RBAC, Sécurité RLS Supabase & Évolution Conversationnelle des Consignes** :
   - Rôles `commercial`, `directeur_commercial` et `admin` gérés dans `user_profiles` avec politiques **Row Level Security (RLS)** sans récursion (`get_my_role()`, `can_manage_rules()`).
   - Un **Directeur Commercial** ou **Administrateur** peut enrichir ou corriger les instructions métier directement au fil de la conversation (*« Désormais impose toujours… »*) avec validation en 1 clic et journal d'audit (`skill_instruction_updates`).
   - Un **Commercial** ne voit que ses propres devis, accède aux skills et tarifs publics en lecture seule (coûts d'achat et coefficients de marge masqués) et ne peut pas altérer les règles métier.
5. **Pont Facturation Pennylane API v2 (`/api/pennylane/push-invoice`)** :
   - Dédoublonnage client automatique par `external_reference` (`individual_customers` B2C ou `company_customers` B2B avec `country_alpha2: "FR"`).
   - Choix **Facture d'acompte chantier** (ex: 30 %, ventilée automatiquement par taux de TVA `FR_55` / `FR_100` / `FR_200`) ou **Facture 100 %** (toutes les lignes), poussée en **Brouillon Pennylane** (recommandé pour scellement Factur-X) ou finalisée, avec mode **Simulation Dry-Run JSON** tant que `PENNYLANE_API_TOKEN` n'est pas renseigné.
6. **Ouvrages Composés & Ventilation Analytique ERP (`erp-tsm-app`)** :
   - Recettes multi-composants ventilées automatiquement sur les 5 postes analytiques de `erp.crm_devis` / `erp.affaires` (`heures`, `matiere`, `sous_traitance`, `materiel`, `autres_frais`) + calcul des heures sur `erp.cout_horaire_en_vigueur` (38 €/h chargé par défaut).
   - **Feu tricolore de marge (Décision D6)** : le commercial voit uniquement le feu (`Vert` >= 28 %, `Orange` 18–28 %, `Rouge` < 18 % bloquant l'envoi PDF) sans jamais voir les déboursés ni les marges en €/%, tandis que la Direction Commerciale / Admin voit la ventilation complète et peut exporter le payload JSON `erp.crm_devis` / `erp.preparation_ts`.
7. **Mode Avenant TS Vocal + Signature Tactile & Photo-Scan BL Chantier (`Pixtral`)** :
   - Bascule `Devis` / `Avenant TS` rattaché à un code affaire parent (`erp.preparation_ts`), signature manuscrite tactile *« Bon pour accord »* intégrée au PDF, et scan photo de Bon de Livraison fournisseur (`/api/ocr-bl` via `pixtral-12b-2409`) structuré pour `erp.achats_bl` avec conversion en Avenant TS en 1 clic.
8. **Paramétrage Modulaire en Mode Toggle (`Paramètres`)** :
   - Interrupteur général **Pack Pro Complet (8/8)**, 3 profils préconfigurés (*Production Complète*, *Mode Chantier & TS Mobile*, *Mode Chiffrage Minimal*) et **8 boutons Toggle ON/OFF individuels** pour activer/désactiver chaque brique à la volée, plus le réglage des seuils du Feu Tricolore et du coût horaire chargé (`erp.cout_horaire_en_vigueur`).
9. **Page Guide & Explication du Processus Métier (`/guide` et onglet « Guide & Processus »)** :
   - Parcours interactif pas-à-pas en 6 étapes (Découverte -> Chiffrage IA -> Contrôle ERP D6 -> Signature mobile -> Avenant/BL -> Facturation Pennylane).
   - Tableau comparatif des rôles et droits RLS (Commercial vs Direction) et FAQ interactive embarquée pour l'onboarding des équipes terrain.

## Démarrage rapide

1. Exécuter `supabase/schema.sql` dans le *SQL Editor* de Supabase.
2. Copier `.env.example` en `.env.local` (`MISTRAL_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Lancer l'application :
   ```bash
   npm run dev
   ```
