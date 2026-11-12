-- ============================================================================
-- Schéma CRM Devis Vocal & Clavier IA — Gouvernance des Rôles & RLS Stricte
-- Rôles : 'commercial' | 'directeur_commercial' | 'admin'
-- À exécuter dans le SQL Editor de votre projet Supabase
-- ============================================================================

-- ============================================================================
-- 0. GESTION DES UTILISATEURS, RÔLES & FONCTIONS DE DROITS (RLS)
-- ============================================================================

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'commercial'
    check (role in ('commercial', 'directeur_commercial', 'admin')),
  created_at timestamptz not null default now()
);

-- Création automatique du profil lors de l'inscription via Supabase Auth
-- Astuce : le tout premier utilisateur inscrit devient 'directeur_commercial' par défaut
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_count int;
  v_default_role text;
begin
  select count(*) into v_existing_count from public.user_profiles;
  if v_existing_count = 0 then
    v_default_role := 'directeur_commercial';
  else
    v_default_role := coalesce(
      nullif(new.raw_user_meta_data->>'role', ''),
      'commercial'
    );
    if v_default_role not in ('commercial', 'directeur_commercial', 'admin') then
      v_default_role := 'commercial';
    end if;
  end if;

  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    v_default_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Fonctions SECURITY DEFINER (évitent toute récursion RLS lors de la lecture du rôle)
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_profiles where id = auth.uid()),
    'commercial'
  );
$$;

create or replace function public.can_manage_rules()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() in ('directeur_commercial', 'admin');
$$;

-- ============================================================================
-- 1. SKILLS MÉTIERS & JOURNAL DES MISES À JOUR CONVERSATIONNELLES
-- ============================================================================

create table if not exists public.trade_skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  default_vat_rate numeric(5,2) not null default 20,
  system_instructions text not null,
  intake_fields jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.trade_skills
  add column if not exists intake_fields jsonb not null default '[]'::jsonb,
  add column if not exists updated_by uuid references auth.users(id);

-- Journal d'audit des évolutions d'instructions (notamment au fil des conversations du Directeur Commercial)
create table if not exists public.skill_instruction_updates (
  id uuid primary key default gen_random_uuid(),
  trade_slug text not null references public.trade_skills(slug) on delete cascade,
  author_id uuid references auth.users(id),
  author_name text not null default 'Directeur Commercial',
  author_role text not null default 'directeur_commercial',
  source_utterance text not null default '',     -- Phrase prononcée/écrite dans la conversation
  change_summary text not null default '',       -- Résumé de la règle ajoutée/modifiée
  previous_instructions text not null default '',
  new_instructions text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_skill_updates_slug on public.skill_instruction_updates(trade_slug);

-- ============================================================================
-- 2. BASE DE PRIX & RÉACTUALISATION MCP SUPABASE
-- ============================================================================

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  supplier_ref text unique,
  trade_slug text not null default 'general',
  name text not null,
  unit text not null default 'u',
  cost_price_ht numeric(12,2) not null default 0,
  margin_coef numeric(6,3) not null default 1.40,
  unit_price_ht numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 20,
  price_source text not null default 'Initial',
  price_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_items_trade on public.catalog_items(trade_slug);

create table if not exists public.catalog_price_history (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  old_cost_ht numeric(12,2),
  new_cost_ht numeric(12,2),
  old_unit_price_ht numeric(12,2),
  new_unit_price_ht numeric(12,2),
  source text not null default 'MCP Supabase',
  changed_at timestamptz not null default now()
);

create or replace function public.trg_log_catalog_price_change()
returns trigger
language plpgsql
as $$
begin
  if (old.unit_price_ht is distinct from new.unit_price_ht)
     or (old.cost_price_ht is distinct from new.cost_price_ht) then
    insert into public.catalog_price_history (
      catalog_item_id, old_cost_ht, new_cost_ht, old_unit_price_ht, new_unit_price_ht, source
    ) values (
      new.id, old.cost_price_ht, new.cost_price_ht, old.unit_price_ht, new.unit_price_ht, coalesce(new.price_source, 'Update')
    );
    new.price_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists after_catalog_price_change on public.catalog_items;
create trigger after_catalog_price_change
before update on public.catalog_items
for each row execute function public.trg_log_catalog_price_change();

-- Fonctions RPC dédiées au MCP Supabase & aux Directeurs Commerciaux / Admins
create or replace function public.mcp_upsert_catalog_price(
  p_supplier_ref text,
  p_name text,
  p_trade_slug text,
  p_unit text,
  p_cost_price_ht numeric,
  p_margin_coef numeric default 1.40,
  p_vat_rate numeric default 20,
  p_source text default 'MCP Supabase'
)
returns public.catalog_items
language plpgsql
as $$
declare
  v_selling_price numeric(12,2);
  v_result public.catalog_items;
begin
  -- Si appelé par un client web (auth.uid() non null), vérifie le rôle directeur_commercial / admin
  if auth.uid() is not null and not public.can_manage_rules() then
    raise exception 'Accès refusé (RLS) : seul un Directeur Commercial ou Admin peut modifier la base de prix.';
  end if;

  v_selling_price := round(p_cost_price_ht * p_margin_coef, 2);

  insert into public.catalog_items (
    supplier_ref, trade_slug, name, unit, cost_price_ht, margin_coef, unit_price_ht, vat_rate, price_source, price_updated_at
  ) values (
    p_supplier_ref, p_trade_slug, p_name, p_unit, p_cost_price_ht, p_margin_coef, v_selling_price, p_vat_rate, p_source, now()
  )
  on conflict (supplier_ref) do update set
    name = excluded.name,
    trade_slug = excluded.trade_slug,
    unit = excluded.unit,
    cost_price_ht = excluded.cost_price_ht,
    margin_coef = coalesce(p_margin_coef, public.catalog_items.margin_coef),
    unit_price_ht = round(excluded.cost_price_ht * coalesce(p_margin_coef, public.catalog_items.margin_coef), 2),
    vat_rate = excluded.vat_rate,
    price_source = excluded.price_source,
    price_updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.mcp_apply_trade_inflation(
  p_trade_slug text,
  p_percent_change numeric,
  p_source text default 'MCP Supabase - Indice'
)
returns int
language plpgsql
as $$
declare
  v_factor numeric;
  v_count int;
begin
  if auth.uid() is not null and not public.can_manage_rules() then
    raise exception 'Accès refusé (RLS) : seul un Directeur Commercial ou Admin peut réévaluer les prix.';
  end if;

  v_factor := 1 + (p_percent_change / 100.0);

  update public.catalog_items
  set
    cost_price_ht = round(cost_price_ht * v_factor, 2),
    unit_price_ht = round(unit_price_ht * v_factor, 2),
    price_source = p_source,
    price_updated_at = now()
  where (p_trade_slug = 'all' or trade_slug = p_trade_slug);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- 3. DEVIS & LIGNES (avec rattachement au commercial créateur)
-- ============================================================================

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  created_by uuid references auth.users(id) default auth.uid(),
  trade_slug text not null default 'general',
  client_name text not null,
  client_email text default '',
  client_phone text default '',
  site_address text default '',
  title text not null default 'Devis',
  notes text default '',
  intake_data jsonb not null default '{}'::jsonb,
  status text not null default 'validated',
  total_ht numeric(12,2) not null default 0,
  total_vat numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  pennylane_status text not null default 'not_pushed'
    check (pennylane_status in ('not_pushed', 'draft_pushed', 'deposit_pushed', 'finalized_pushed', 'simulated')),
  pennylane_customer_id text default '',
  pennylane_invoice_id text default '',
  pennylane_invoice_number text default '',
  pennylane_invoice_url text default '',
  pennylane_pushed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.quotes
  add column if not exists created_by uuid references auth.users(id) default auth.uid(),
  add column if not exists client_phone text default '',
  add column if not exists site_address text default '',
  add column if not exists intake_data jsonb not null default '{}'::jsonb,
  add column if not exists pennylane_status text not null default 'not_pushed',
  add column if not exists pennylane_customer_id text default '',
  add column if not exists pennylane_invoice_id text default '',
  add column if not exists pennylane_invoice_number text default '',
  add column if not exists pennylane_invoice_url text default '',
  add column if not exists pennylane_pushed_at timestamptz;

-- Journal d'audit des synchronisations vers Pennylane API v2
create table if not exists public.pennylane_sync_logs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete cascade,
  quote_number text not null,
  pushed_by uuid references auth.users(id) default auth.uid(),
  provider_mode text not null default 'live' check (provider_mode in ('live', 'dry-run')),
  invoice_mode text not null default 'deposit' check (invoice_mode in ('deposit', 'full')),
  deposit_percent numeric(5,2) not null default 100,
  customer_type text not null default 'individual' check (customer_type in ('individual', 'company')),
  is_draft boolean not null default true,
  pennylane_customer_id text default '',
  pennylane_invoice_id text default '',
  pennylane_invoice_number text default '',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pennylane_logs_quote_id on public.pennylane_sync_logs(quote_id);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position int not null default 0,
  designation text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'u',
  unit_price_ht numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 20,
  total_ht numeric(12,2) not null default 0
);

create index if not exists idx_quote_lines_quote_id on public.quote_lines(quote_id);

-- ============================================================================
-- 4. POLITIQUES ROW LEVEL SECURITY (RLS) PAR RÔLE
-- ============================================================================

alter table public.user_profiles enable row level security;
alter table public.trade_skills enable row level security;
alter table public.skill_instruction_updates enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_price_history enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;

-- Nettoyage des anciennes politiques ouvertes éventuelles
drop policy if exists "Allow all on trade_skills" on public.trade_skills;
drop policy if exists "Allow all on catalog_items" on public.catalog_items;
drop policy if exists "Allow all on catalog_price_history" on public.catalog_price_history;
drop policy if exists "Allow all on quotes" on public.quotes;
drop policy if exists "Allow all on quote_lines" on public.quote_lines;

-- A) user_profiles : chacun lit son profil ; Directeur Commercial / Admin voit l'équipe ; seul Admin change les rôles
drop policy if exists "profiles_select" on public.user_profiles;
create policy "profiles_select" on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.can_manage_rules());

drop policy if exists "profiles_update_admin" on public.user_profiles;
create policy "profiles_update_admin" on public.user_profiles
  for update to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- B) trade_skills : lecture pour tous (connectés et visiteurs) ; écriture réservée à directeur_commercial & admin
drop policy if exists "trade_skills_select" on public.trade_skills;
create policy "trade_skills_select" on public.trade_skills
  for select to authenticated, anon
  using (true);

drop policy if exists "trade_skills_write_managers" on public.trade_skills;
create policy "trade_skills_write_managers" on public.trade_skills
  for all to authenticated
  using (public.can_manage_rules())
  with check (public.can_manage_rules());

-- C) skill_instruction_updates : lecture pour tous les connectés ; insertion réservée à directeur_commercial & admin
drop policy if exists "skill_updates_select" on public.skill_instruction_updates;
create policy "skill_updates_select" on public.skill_instruction_updates
  for select to authenticated, anon
  using (true);

drop policy if exists "skill_updates_insert_managers" on public.skill_instruction_updates;
create policy "skill_updates_insert_managers" on public.skill_instruction_updates
  for insert to authenticated
  with check (public.can_manage_rules());

-- D) catalog_items & catalog_price_history : lecture des prix de vente publics pour tous ; modification réservée à directeur_commercial & admin
drop policy if exists "catalog_select" on public.catalog_items;
create policy "catalog_select" on public.catalog_items
  for select to authenticated, anon
  using (true);

drop policy if exists "catalog_write_managers" on public.catalog_items;
create policy "catalog_write_managers" on public.catalog_items
  for all to authenticated
  using (public.can_manage_rules())
  with check (public.can_manage_rules());

drop policy if exists "price_history_select_managers" on public.catalog_price_history;
create policy "price_history_select_managers" on public.catalog_price_history
  for select to authenticated
  using (public.can_manage_rules());

-- E) quotes & quote_lines :
--    - Un 'commercial' ne lit/modifie que SES propres devis (created_by = auth.uid())
--    - Un 'directeur_commercial' ou 'admin' voit et peut superviser TOUS les devis de l'équipe
drop policy if exists "quotes_select" on public.quotes;
create policy "quotes_select" on public.quotes
  for select to authenticated
  using (created_by = auth.uid() or public.can_manage_rules());

drop policy if exists "quotes_insert" on public.quotes;
create policy "quotes_insert" on public.quotes
  for insert to authenticated
  with check (created_by = auth.uid() or public.can_manage_rules());

drop policy if exists "quotes_update" on public.quotes;
create policy "quotes_update" on public.quotes
  for update to authenticated
  using (created_by = auth.uid() or public.can_manage_rules())
  with check (created_by = auth.uid() or public.can_manage_rules());

drop policy if exists "quotes_delete" on public.quotes;
create policy "quotes_delete" on public.quotes
  for delete to authenticated
  using (created_by = auth.uid() or public.can_manage_rules());

drop policy if exists "quote_lines_access" on public.quote_lines;
create policy "quote_lines_access" on public.quote_lines
  for all to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and (q.created_by = auth.uid() or public.can_manage_rules())
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and (q.created_by = auth.uid() or public.can_manage_rules())
    )
  );

alter table public.pennylane_sync_logs enable row level security;

drop policy if exists "pennylane_logs_select" on public.pennylane_sync_logs;
create policy "pennylane_logs_select" on public.pennylane_sync_logs
  for select to authenticated
  using (pushed_by = auth.uid() or public.can_manage_rules());

drop policy if exists "pennylane_logs_insert" on public.pennylane_sync_logs;
create policy "pennylane_logs_insert" on public.pennylane_sync_logs
  for insert to authenticated
  with check (pushed_by = auth.uid() or public.can_manage_rules());

-- ============================================================================
-- 5. DONNÉES INITIALES (Skills Métiers + Formulaires + Base de Prix)
-- ============================================================================

insert into public.trade_skills (slug, name, default_vat_rate, system_instructions, intake_fields) values
  (
    'general',
    'Généraliste / Multi-lots',
    20,
    'Vérifie systématiquement si la main-d''œuvre (heures de pose) et le forfait déplacement doivent être inclus. Appuie-toi sur les réponses du formulaire d''entrevue (ancienneté du bien pour TVA 10% vs 20%, accès chantier, délais).',
    '[
      {"id":"anciennete","label":"Ancienneté du bâtiment","type":"select","options":["Plus de 2 ans (TVA 10%)","Moins de 2 ans / Neuf (TVA 20%)"],"required":true},
      {"id":"surface_m2","label":"Surface concernée (m²)","type":"number","placeholder":"Ex: 35","required":false},
      {"id":"acces_chantier","label":"Accès & Stationnement faciles","type":"boolean","required":false},
      {"id":"delai_souhaite","label":"Délai d''intervention souhaité","type":"text","placeholder":"Ex: Sous 3 semaines","required":false}
    ]'::jsonb
  ),
  (
    'electricite',
    'Électricité & Éclairage',
    20,
    'Pour chaque pose d''appareillage (prises, interrupteurs, spots), demande s''il faut chiffrer le tirage de câble R2V (+10 % de marge de longueur) et la protection disjoncteur au tableau. En pièce d''eau ou extérieur, propose systématiquement du matériel étanche IP65.',
    '[
      {"id":"anciennete","label":"Ancienneté du logement","type":"select","options":["Plus de 2 ans (TVA 10%)","Moins de 2 ans / Neuf (TVA 20%)"],"required":true},
      {"id":"type_pose","label":"Mode de passage des câbles","type":"select","options":["Encastré (saignées/cloisons)","Sous moulure / goulotte","Apparent / tube IRL"],"required":true},
      {"id":"piece_humide","label":"Intervention en salle d''eau / extérieur (IP65)","type":"boolean","required":false},
      {"id":"tableau_conforme","label":"Tableau électrique existant aux normes (diff. 30mA)","type":"boolean","required":false},
      {"id":"nb_points","label":"Nombre estimé de points (prises/éclairage)","type":"number","placeholder":"Ex: 8","required":false}
    ]'::jsonb
  ),
  (
    'plomberie',
    'Plomberie & Sanitaire',
    10,
    'Lors d''un remplacement sanitaire ou chauffe-eau, demande toujours si la dépose et l''évacuation de l''existant sont incluses, et vérifie le raccordement alimentation multicouche/PER ainsi que l''évacuation PVC.',
    '[
      {"id":"depose_existant","label":"Dépose & évacuation de l''existant à chiffrer","type":"boolean","required":true},
      {"id":"type_reseau","label":"Type de réseau existant","type":"select","options":["Cuivre","Multicouche","PER","Plomb / Acier à reprendre"],"required":false},
      {"id":"etage","label":"Étage d''intervention","type":"number","placeholder":"0 = RDC","required":false},
      {"id":"coupure_eau_accessible","label":"Vanne d''arrêt accessible dans le logement","type":"boolean","required":false}
    ]'::jsonb
  ),
  (
    'platrerie-peinture',
    'Plâtrerie, Isolation & Peinture',
    10,
    'Propose +10 % de chute sur les surfaces de plaques BA13 et d''isolant. Pour du placo, vérifie si l''ossature métallique et les bandes sont incluses. En peinture, vérifie l''état du support pour intégrer impression ou ratissage.',
    '[
      {"id":"surface_murs_m2","label":"Surface murs / cloisons (m²)","type":"number","placeholder":"Ex: 45","required":true},
      {"id":"hauteur_plafond","label":"Hauteur sous plafond (m)","type":"number","placeholder":"Ex: 2.50","required":false},
      {"id":"etat_support","label":"État actuel des supports","type":"select","options":["Bon état (impression + 2 couches)","Moyen (rebouchage partiel)","Dégradé (enduit de ratissage complet)"],"required":true},
      {"id":"piece_eau","label":"Pièce humide (plaques hydrofuges / peinture satin)","type":"boolean","required":false}
    ]'::jsonb
  ),
  (
    'sols-carrelage',
    'Sols & Carrelage',
    20,
    'Propose systématiquement +10 % de perte/découpe sur la surface nette de carrelage ou parquet. Vérifie si un ragréage préalable du sol, la colle, les joints et les plinthes assorties doivent être ajoutés.',
    '[
      {"id":"surface_nette_m2","label":"Surface nette à couvrir (m²)","type":"number","placeholder":"Ex: 28","required":true},
      {"id":"ragreage_requis","label":"Ragréage de remise à niveau requis","type":"boolean","required":false},
      {"id":"format_carreaux","label":"Format / Type de revêtement","type":"select","options":["Carrelage standard (<= 60x60)","Grand format (> 60x60 double encollage)","Parquet / Stratifié"],"required":false},
      {"id":"ml_plinthes","label":"Mètres linéaires de plinthes (ml)","type":"number","placeholder":"Ex: 22","required":false}
    ]'::jsonb
  )
on conflict (slug) do update set
  intake_fields = excluded.intake_fields;

insert into public.catalog_items (supplier_ref, trade_slug, name, unit, cost_price_ht, margin_coef, unit_price_ht, vat_rate, price_source) values
  ('GEN-MO-H', 'general', 'Main-d''œuvre / Pose qualifiée', 'h', 38.00, 1.45, 55.00, 20, 'Initial'),
  ('GEN-DEPL', 'general', 'Forfait déplacement et mise en chantier', 'forfait', 60.00, 1.50, 90.00, 20, 'Initial'),
  ('ELEC-R2V-25', 'electricite', 'Câble électrique R2V 3G2.5', 'm', 1.65, 1.52, 2.50, 20, 'Initial'),
  ('ELEC-PRISE-2PT', 'electricite', 'Prise de courant 2P+T encastrée', 'u', 8.50, 1.65, 14.00, 20, 'Initial'),
  ('ELEC-INTER-VV', 'electricite', 'Interrupteur va-et-vient', 'u', 7.20, 1.67, 12.00, 20, 'Initial'),
  ('ELEC-SPOT-IP65', 'electricite', 'Spot LED encastrable étanche IP65', 'u', 17.50, 1.60, 28.00, 20, 'Initial'),
  ('ELEC-DISJ-16A', 'electricite', 'Disjoncteur divisionnaire 16A/20A au tableau', 'u', 19.00, 1.68, 32.00, 20, 'Initial'),
  ('PLOMB-DEPOSE', 'plomberie', 'Dépose et évacuation équipement sanitaire existant', 'forfait', 75.00, 1.47, 110.00, 10, 'Initial'),
  ('PLOMB-MULTI-ML', 'plomberie', 'Réseau alimentation multicouche + raccords', 'm', 9.50, 1.58, 15.00, 10, 'Initial'),
  ('PLOMB-CE-200L', 'plomberie', 'Chauffe-eau électrique 200L stéatite + groupe sécurité', 'u', 390.00, 1.45, 565.50, 10, 'Initial'),
  ('PLAT-BA13-STD', 'platrerie-peinture', 'Plaque de plâtre BA13 standard + ossature', 'm²', 16.00, 1.50, 24.00, 10, 'Initial'),
  ('PLAT-BA13-HYD', 'platrerie-peinture', 'Plaque de plâtre BA13 hydrofuge + ossature', 'm²', 20.00, 1.50, 30.00, 10, 'Initial'),
  ('PEINT-ACRYL-2C', 'platrerie-peinture', 'Peinture acrylique velours (impression + 2 couches)', 'm²', 15.00, 1.60, 24.00, 10, 'Initial'),
  ('SOL-GRES-60', 'sols-carrelage', 'Carrelage grès cérame 60x60 + colle et joints', 'm²', 36.00, 1.53, 55.00, 20, 'Initial'),
  ('SOL-RAGR', 'sols-carrelage', 'Ragréage autolissant fibré P3', 'm²', 11.00, 1.55, 17.00, 20, 'Initial')
on conflict (supplier_ref) do nothing;

-- Commande utile pour promouvoir un utilisateur en Directeur Commercial depuis le SQL Editor :
-- update public.user_profiles set role = 'directeur_commercial' where email = 'directeur@entreprise.fr';

-- ============================================================================
-- 6. EXTENSION OUVRAGES COMPOSÉS, VENTILATION ERP, AVENANTS TS & BL SCANNÉS
-- ============================================================================

alter table public.catalog_items
  add column if not exists item_kind text not null default 'article'
    check (item_kind in ('article', 'ouvrage')),
  add column if not exists cost_nature text not null default 'matiere'
    check (cost_nature in ('heures', 'matiere', 'sous_traitance', 'materiel', 'autres_frais')),
  add column if not exists hours_per_unit numeric(8,2) not null default 0,
  add column if not exists components jsonb not null default '[]'::jsonb;

alter table public.quotes
  add column if not exists document_type text not null default 'devis'
    check (document_type in ('devis', 'avenant_ts')),
  add column if not exists parent_project_ref text default '',
  add column if not exists signature_data jsonb;

alter table public.quote_lines
  add column if not exists catalog_ref text,
  add column if not exists item_kind text not null default 'article',
  add column if not exists cost_nature text not null default 'matiere',
  add column if not exists hours_per_unit numeric(8,2) not null default 0,
  add column if not exists components_snapshot jsonb not null default '[]'::jsonb;

create table if not exists public.delivery_notes_bl (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) default auth.uid(),
  supplier_name text not null,
  bl_number text not null,
  bl_date date not null default current_date,
  project_ref text not null default '',
  total_cost_ht numeric(12,2) not null default 0,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.delivery_notes_bl enable row level security;

drop policy if exists "bl_select_own_or_manager" on public.delivery_notes_bl;
create policy "bl_select_own_or_manager" on public.delivery_notes_bl
  for select to authenticated
  using (created_by = auth.uid() or public.can_manage_rules());

drop policy if exists "bl_insert_authenticated" on public.delivery_notes_bl;
create policy "bl_insert_authenticated" on public.delivery_notes_bl
  for insert to authenticated
  with check (created_by = auth.uid() or public.can_manage_rules());

-- ============================================================================
-- 7. PARAMÉTRAGE MODULAIRE (TOGGLES ON/OFF) — app_settings
-- ============================================================================

create table if not exists public.app_settings (
  key text primary key,
  flags jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all" on public.app_settings
  for select to authenticated, anon
  using (true);

drop policy if exists "app_settings_write_managers" on public.app_settings;
create policy "app_settings_write_managers" on public.app_settings
  for all to authenticated
  using (public.can_manage_rules())
  with check (public.can_manage_rules());


