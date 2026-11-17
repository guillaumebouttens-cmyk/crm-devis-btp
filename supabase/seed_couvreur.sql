-- ============================================================================
-- ENRICHISSEMENT DU MÉTIER ET CATALOGUE DE PRIX COUVERTURE & ZINGUERIE
-- À exécuter dans le SQL Editor de Supabase (https://supabase.com/dashboard)
-- ============================================================================

-- 1. Insertion / Mise à jour du Skill Métier « Couverture, Zinguerie & Fenêtres de Toit »
insert into public.trade_skills (slug, name, default_vat_rate, system_instructions, intake_fields) values
(
  'couverture-zinguerie',
  'Couverture, Zinguerie & Fenêtres de Toit',
  10,
  'Tu es un métreur expert en toiture. Privilégie systématiquement les ouvrages composés au m² pour les réfections de toiture (tuiles mécaniques ou ardoises) et au forfait pour les fenêtres de toit (Velux). Inclus systématiquement l''échafaudage de pied réglementaire R408 et la sécurité antichute. Pour toute toiture complète, prévois l''écran de sous-toiture HPV avec contre-lattage ventilé et les liteaux traités. En zinguerie, détaille les gouttières zinc 33, tuyaux de descente, noues et abergements de cheminée soudés. Pour les imprévus (chevrons vermoulus, volige à remplacer), propose immédiatement un Avenant TS détaillé à faire signer.',
  '[
    {"id":"anciennete","label":"Ancienneté du bâtiment & fiscalité","type":"select","options":["Plus de 2 ans (TVA 10 % rénovation)","Moins de 2 ans / Neuf (TVA 20 %)","Rénovation thermique globale RGE (TVA 5.5 %)"],"required":true},
    {"id":"surface_toiture_m2","label":"Surface développée de toiture (m²)","type":"number","placeholder":"Ex: 95","required":true},
    {"id":"type_couverture","label":"Type de couverture souhaité","type":"select","options":["Tuiles terre cuite mécaniques (Romane / HP10 / Plate)","Ardoises naturelles d''Espagne 32×22","Tuiles béton","Bac acier avec feutre régulateur de condensation","Zinc naturel joint debout"],"required":true},
    {"id":"hauteur_egout_m","label":"Hauteur à l''égout du toit (m)","type":"number","placeholder":"Ex: 5.50 (RDC + 1 étage)","required":false},
    {"id":"pente_toit_pct","label":"Pente estimée de la toiture (%)","type":"number","placeholder":"Ex: 45","required":false},
    {"id":"etat_charpente","label":"État de la charpente existante","type":"select","options":["Charpente saine (conservation sans reprise)","Reprise ponctuelle (quelques chevrons / liteaux)","Remplacement partiel ou calage important"],"required":false},
    {"id":"gouttieres_ml","label":"Mètres linéaires de gouttières à remplacer (ml)","type":"number","placeholder":"Ex: 18","required":false},
    {"id":"nb_velux","label":"Nombre de fenêtres de toit Velux à créer ou remplacer","type":"number","placeholder":"Ex: 2","required":false},
    {"id":"echafaudage_necessaire","label":"Échafaudage de pied réglementaire R408 requis","type":"boolean","required":false},
    {"id":"acces_benne","label":"Accès & stationnement benne à gravats faciles","type":"boolean","required":false}
  ]'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  default_vat_rate = excluded.default_vat_rate,
  system_instructions = excluded.system_instructions,
  intake_fields = excluded.intake_fields;

-- 2. Insertion des Ouvrages Composés et Fournitures Réalistes
insert into public.catalog_items (
  supplier_ref, trade_slug, name, unit, item_kind, cost_nature, hours_per_unit,
  cost_price_ht, margin_coef, unit_price_ht, vat_rate, price_source, components
) values
(
  'OUV-COUV-TUILES-M2',
  'couverture-zinguerie',
  'Ouvrage : Réfection toiture tuiles terre cuite complète au m² (dépose + écran HPV + liteaux + tuiles)',
  'm²',
  'ouvrage',
  'matiere',
  1.10,
  75.03,
  1.44,
  108.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-couv-1","label":"Dépose de l''ancienne toiture, tri & chargement benne à gravats","cost_nature":"heures","quantity_per_unit":0.25,"unit":"h","unit_cost_ht":39},
    {"id":"c-couv-2","label":"Écran de sous-toiture HPV R2 respirant + contre-lattes 27×40 ventilées","cost_nature":"matiere","quantity_per_unit":1.1,"unit":"m²","unit_cost_ht":4.8},
    {"id":"c-couv-3","label":"Liteaux sapin traité classe 2 (27×40 mm) fixés au pas de la tuile","cost_nature":"matiere","quantity_per_unit":3.2,"unit":"m","unit_cost_ht":0.95},
    {"id":"c-couv-4","label":"Tuiles terre cuite mécaniques grand moule + 8% perte/découpe","cost_nature":"matiere","quantity_per_unit":1.08,"unit":"m²","unit_cost_ht":21},
    {"id":"c-couv-5","label":"Faîtage closoir ventilé aluminium laqué plissé et accessoires","cost_nature":"matiere","quantity_per_unit":0.15,"unit":"m","unit_cost_ht":7.5},
    {"id":"c-couv-6","label":"Pose couverture tuiles, découpes arêtiers/noues & finitions faîtières","cost_nature":"heures","quantity_per_unit":0.85,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-COUV-ARDOISES-M2',
  'couverture-zinguerie',
  'Ouvrage : Réfection toiture ardoises naturelles 32×22 posées au crochet inox au m²',
  'm²',
  'ouvrage',
  'matiere',
  1.65,
  114.01,
  1.45,
  165.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-ard-1","label":"Dépose ancienne toiture & évacuation déchetterie pro","cost_nature":"heures","quantity_per_unit":0.3,"unit":"h","unit_cost_ht":39},
    {"id":"c-ard-2","label":"Écran sous-toiture HPV R2 + contre-lattage sapin","cost_nature":"matiere","quantity_per_unit":1.1,"unit":"m²","unit_cost_ht":4.8},
    {"id":"c-ard-3","label":"Voligeage sapin du Nord traité classe 2 (18×100 mm)","cost_nature":"matiere","quantity_per_unit":1.05,"unit":"m²","unit_cost_ht":11.5},
    {"id":"c-ard-4","label":"Ardoises naturelles d''Espagne sélection 32×22 + crochets inox 18/10","cost_nature":"matiere","quantity_per_unit":38,"unit":"u","unit_cost_ht":0.85},
    {"id":"c-ard-5","label":"Main-d''œuvre couvreur ardoisier qualifié : traçage, pureau & clouage/crochet","cost_nature":"heures","quantity_per_unit":1.35,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-VELUX-MK04-PACK',
  'couverture-zinguerie',
  'Ouvrage : Fenêtre de toit Velux Tout Confort 78×118 cm (MK04) fournie posée complète',
  'u',
  'ouvrage',
  'matiere',
  4.50,
  738.50,
  1.45,
  1070.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-vel-1","label":"Châssis Velux MK04 (78×118) double vitrage thermo-acoustique feuilleté","cost_nature":"matiere","quantity_per_unit":1,"unit":"u","unit_cost_ht":375},
    {"id":"c-vel-2","label":"Raccord d''étanchéité tuiles EDW (ou ardoises EDL)","cost_nature":"matiere","quantity_per_unit":1,"unit":"u","unit_cost_ht":98},
    {"id":"c-vel-3","label":"Kit collerette d''isolation BDX + pare-vapeur BFX","cost_nature":"matiere","quantity_per_unit":1,"unit":"u","unit_cost_ht":65},
    {"id":"c-vel-4","label":"Bois de charpente sapin 60×80 mm pour création du chevêtre","cost_nature":"matiere","quantity_per_unit":1,"unit":"lot","unit_cost_ht":25},
    {"id":"c-vel-5","label":"Pose couvreur : découpe couverture, chevêtre, étanchéité & réglage","cost_nature":"heures","quantity_per_unit":4.5,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-ZING-GOUTTIERE-ZINC-ML',
  'couverture-zinguerie',
  'Ouvrage : Gouttière demi-ronde zinc 33 fournie posée au ml + crochets & soudures',
  'm',
  'ouvrage',
  'matiere',
  0.40,
  34.82,
  1.49,
  52.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-gout-1","label":"Profilé gouttière zinc naturel dév. 33 épaisseur 0,65 mm","cost_nature":"matiere","quantity_per_unit":1,"unit":"m","unit_cost_ht":13.5},
    {"id":"c-gout-2","label":"Crochets bandeau galvanisés + bagues de maintien (tous les 45 cm)","cost_nature":"matiere","quantity_per_unit":2.2,"unit":"u","unit_cost_ht":1.6},
    {"id":"c-gout-3","label":"Étain à souder 33%, fond de gouttière & moignon conique","cost_nature":"matiere","quantity_per_unit":1,"unit":"lot","unit_cost_ht":2.2},
    {"id":"c-gout-4","label":"Pose zingueur : pente, tracé, fixation des crochets et soudures étanches","cost_nature":"heures","quantity_per_unit":0.4,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-ZING-DESCENTE-ZINC-ML',
  'couverture-zinguerie',
  'Ouvrage : Tuyau de descente d''eau pluviale zinc diam. 80 mm fourni posé au ml',
  'm',
  'ouvrage',
  'matiere',
  0.30,
  25.99,
  1.50,
  39.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-desc-1","label":"Tuyau zinc naturel cylindrique diam. 80 mm","cost_nature":"matiere","quantity_per_unit":1,"unit":"m","unit_cost_ht":11.2},
    {"id":"c-desc-2","label":"Colliers de descente à sceller + chevilles","cost_nature":"matiere","quantity_per_unit":0.7,"unit":"u","unit_cost_ht":2.8},
    {"id":"c-desc-3","label":"Coudes & bagues d''emboîtement zinc","cost_nature":"matiere","quantity_per_unit":0.25,"unit":"u","unit_cost_ht":4.5},
    {"id":"c-desc-4","label":"Pose tuyau descente zinc & raccordement dauphin/regard","cost_nature":"heures","quantity_per_unit":0.3,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-ZING-ABERGEMENT-CHEMINEE',
  'couverture-zinguerie',
  'Ouvrage : Abergement complet de souche de cheminée en zinc façonné et soudé',
  'forfait',
  'ouvrage',
  'matiere',
  4.00,
  304.00,
  1.48,
  450.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-ab-1","label":"Feuille de zinc naturel 0,65 mm + bande de plomb plissé","cost_nature":"matiere","quantity_per_unit":1,"unit":"ens","unit_cost_ht":110},
    {"id":"c-ab-2","label":"Bandes solin alu, mastic PU et étain à souder","cost_nature":"matiere","quantity_per_unit":1,"unit":"ens","unit_cost_ht":38},
    {"id":"c-ab-3","label":"Main-d''œuvre zingueur d''art : relevé, traçage, pliage, soudures étanches","cost_nature":"heures","quantity_per_unit":4,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-SEC-ECHAFAUDAGE-TOIT',
  'couverture-zinguerie',
  'Ouvrage : Forfait montage, location 3 sem. et repli échafaudage de pied R408 + filets pare-gravats',
  'forfait',
  'ouvrage',
  'materiel',
  8.00,
  732.00,
  1.43,
  1050.00,
  10,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-ech-1","label":"Transport, amortissement matériel échafaudage de pied & filets pare-gravats","cost_nature":"materiel","quantity_per_unit":1,"unit":"lot","unit_cost_ht":420},
    {"id":"c-ech-2","label":"Main-d''œuvre monteurs certifiés R408 (montage + vérification + démontage)","cost_nature":"heures","quantity_per_unit":8,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'OUV-ISOL-RAMPANTS-RGE',
  'couverture-zinguerie',
  'Ouvrage : Isolation thermique toiture sous rampants laine minérale R=7,00 m².K/W (TVA 5.5% RGE)',
  'm²',
  'ouvrage',
  'matiere',
  0.65,
  50.80,
  1.48,
  75.00,
  5.5,
  'Recette Ouvrage BTP',
  '[
    {"id":"c-iso-1","label":"Laine de verre Isoconfort 35 épaisseur 240 mm R=6,85","cost_nature":"matiere","quantity_per_unit":1.05,"unit":"m²","unit_cost_ht":16.5},
    {"id":"c-iso-2","label":"Membrane pare-vapeur hygro-régulante + adhésifs d''étanchéité à l''air","cost_nature":"matiere","quantity_per_unit":1.1,"unit":"m²","unit_cost_ht":4.2},
    {"id":"c-iso-3","label":"Suspentes et ossature métallique","cost_nature":"matiere","quantity_per_unit":1,"unit":"m²","unit_cost_ht":3.5},
    {"id":"c-iso-4","label":"Pose isolant, pare-vapeur étanche selon règles RGE","cost_nature":"heures","quantity_per_unit":0.65,"unit":"h","unit_cost_ht":39}
  ]'::jsonb
),
(
  'COUV-TUILE-MEC-M2',
  'couverture-zinguerie',
  'Tuiles terre cuite mécaniques grand moule (Romane / HP10) au m²',
  'm²',
  'article',
  'matiere',
  0.45,
  22.00,
  1.50,
  33.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-ARDOISE-NAT-M2',
  'couverture-zinguerie',
  'Ardoises naturelles d''Espagne sélection 32×22 au m²',
  'm²',
  'article',
  'matiere',
  0.70,
  34.00,
  1.50,
  51.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-ECRAN-HPV-75M2',
  'couverture-zinguerie',
  'Écran de sous-toiture HPV R2 haute perméabilité (rouleau 75 m²)',
  'rouleau',
  'article',
  'matiere',
  1.20,
  115.00,
  1.48,
  170.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-LITEAU-27X40',
  'couverture-zinguerie',
  'Liteaux sapin traité classe 2 (27×40 mm, botte 10×3m = 30 ml)',
  'botte',
  'article',
  'matiere',
  0.35,
  19.00,
  1.53,
  29.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-CLOISOIR-VENTILE-5M',
  'couverture-zinguerie',
  'Closoir de faîtage ventilé aluminium laqué plissé (rouleau 5 ml)',
  'rouleau',
  'article',
  'matiere',
  0.40,
  32.00,
  1.50,
  48.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-SOLIN-ALU-PU',
  'couverture-zinguerie',
  'Bande de solin aluminium avec joint mastic d''étanchéité polyuréthane au ml',
  'm',
  'article',
  'matiere',
  0.15,
  7.50,
  1.60,
  12.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-MO-QUALIFIE-H',
  'couverture-zinguerie',
  'Main-d''œuvre Couvreur - Zingueur qualifié N3P2',
  'h',
  'article',
  'heures',
  1.00,
  39.00,
  1.46,
  57.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-CHARP-CHEVRON-ML',
  'couverture-zinguerie',
  'Remplacement chevron de charpente sapin traité 60×80 mm (Avenant TS chantier)',
  'm',
  'article',
  'matiere',
  0.25,
  8.50,
  1.53,
  13.00,
  10,
  'Initial',
  '[]'::jsonb
),
(
  'COUV-BENNE-GRAVATS',
  'couverture-zinguerie',
  'Forfait benne à gravats 8 m³ spécial tuiles/DIB + transport et recyclage',
  'forfait',
  'article',
  'autres_frais',
  0.00,
  320.00,
  1.35,
  432.00,
  10,
  'Initial',
  '[]'::jsonb
)
on conflict (supplier_ref) do update set
  trade_slug = excluded.trade_slug,
  name = excluded.name,
  unit = excluded.unit,
  item_kind = excluded.item_kind,
  cost_nature = excluded.cost_nature,
  hours_per_unit = excluded.hours_per_unit,
  cost_price_ht = excluded.cost_price_ht,
  margin_coef = excluded.margin_coef,
  unit_price_ht = excluded.unit_price_ht,
  vat_rate = excluded.vat_rate,
  components = excluded.components;
