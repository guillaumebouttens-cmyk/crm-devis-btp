import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CATALOG, DEFAULT_TRADE_SKILLS } from "./default-catalog";
import {
  computeLineTotalHt,
  computeOuvrageTotalsFromComponents,
  computeQuoteTotals,
  round2,
} from "./quote-calc";
import type {
  AppFeatureFlags,
  CatalogItem,
  CatalogItemKind,
  ClientSignature,
  CostNature,
  DocumentType,
  IntakeDataMap,
  IntakeFieldDefinition,
  OuvrageComponent,
  PennylanePushOptions,
  PennylanePushResult,
  PennylaneSyncStatus,
  ProposedSkillUpdate,
  QuoteDraft,
  SavedQuote,
  ScannedBlRecord,
  SkillInstructionUpdateLog,
  TradeSkill,
  UserProfile,
  UserRole,
} from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes("votre-projet") &&
  !supabaseAnonKey.includes("votre_cle");

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
}

const LS_SKILLS_KEY = "devis_vocal_skills_v5";
const LS_SKILL_LOGS_KEY = "devis_vocal_skill_logs_v5";
const LS_CATALOG_KEY = "devis_vocal_catalog_v5";
const LS_QUOTES_KEY = "devis_vocal_quotes_v5";
const LS_BLS_KEY = "devis_vocal_scanned_bls_v1";
const LS_DEMO_ROLE_KEY = "devis_vocal_demo_role_v1";
const LS_FEATURE_FLAGS_KEY = "devis_vocal_feature_flags_v1";

export const DEFAULT_FEATURE_FLAGS: AppFeatureFlags = {
  enableOuvragesComposes: true,
  enableErpMarginLight: true,
  enableAvenantTsMode: true,
  enableMobileSignature: true,
  enablePhotoScanBl: true,
  enablePennylaneBridge: true,
  enableIntakeForms: true,
  enableConversationalRules: true,
  blockCommercialOnRedMargin: true,
  greenMarginThresholdPct: 28,
  orangeMarginThresholdPct: 18,
  defaultHourlyLoadedCost: 38,
};

// ============================================================================
// 0. AUTHENTIFICATION, RÔLES & VÉRIFICATION DES DROITS
// ============================================================================

export function canRoleManageRules(role?: UserRole | null): boolean {
  return role === "directeur_commercial" || role === "admin";
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "directeur_commercial":
      return "Directeur Commercial";
    case "admin":
      return "Administrateur";
    default:
      return "Commercial";
  }
}

export function getDemoProfile(roleOverride?: UserRole): UserProfile {
  let role: UserRole = roleOverride ?? "directeur_commercial";
  if (!roleOverride && typeof window !== "undefined") {
    const saved = window.localStorage.getItem(LS_DEMO_ROLE_KEY) as UserRole | null;
    if (saved && ["commercial", "directeur_commercial", "admin"].includes(saved)) {
      role = saved;
    }
  }
  return {
    id: role === "commercial" ? "demo-user-commercial" : "demo-user-manager",
    email:
      role === "commercial"
        ? "commercial@demo-btp.fr"
        : "directeur.commercial@demo-btp.fr",
    full_name: getRoleLabel(role),
    role,
  };
}

export function saveDemoRole(role: UserRole): UserProfile {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LS_DEMO_ROLE_KEY, role);
  }
  return getDemoProfile(role);
}

export async function fetchCurrentUserProfile(): Promise<UserProfile | null> {
  const sb = getSupabase();
  if (!sb) {
    return getDemoProfile();
  }

  const { data: sessionData } = await sb.auth.getSession();
  const session = sessionData?.session;
  if (!session?.user) {
    return null;
  }

  const { data: profileRow } = await sb
    .from("user_profiles")
    .select("id, email, full_name, role")
    .eq("id", session.user.id)
    .single();

  const role = (profileRow?.role as UserRole | undefined) ?? "commercial";
  return {
    id: session.user.id,
    email: session.user.email ?? String(profileRow?.email ?? ""),
    full_name:
      String(profileRow?.full_name || "").trim() ||
      (session.user.email?.split("@")[0] ?? "Utilisateur"),
    role,
    access_token: session.access_token,
  };
}

export async function signInSupabase(
  email: string,
  password: string
): Promise<UserProfile> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase n'est pas configuré dans .env.local");

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  const profile = await fetchCurrentUserProfile();
  if (!profile) throw new Error("Profil utilisateur introuvable");
  return profile;
}

export async function signUpSupabase(
  email: string,
  password: string,
  fullName: string,
  requestedRole: UserRole
): Promise<{ profile: UserProfile | null; needsEmailConfirmation: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase n'est pas configuré dans .env.local");

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: requestedRole,
      },
    },
  });
  if (error) throw new Error(error.message);

  if (!data.session) {
    return { profile: null, needsEmailConfirmation: true };
  }
  const profile = await fetchCurrentUserProfile();
  return { profile, needsEmailConfirmation: false };
}

export async function signOutSupabase(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.auth.signOut();
  }
}

// ============================================================================
// 1. SKILLS MÉTIERS & ACTUALISATION AU FIL DES CONVERSATIONS
// ============================================================================

function parseIntakeFields(raw: unknown): IntakeFieldDefinition[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === "object"))
    .map((f) => ({
      id: String(f.id ?? crypto.randomUUID()),
      label: String(f.label ?? "Champ"),
      type: (["text", "number", "select", "boolean", "textarea"].includes(String(f.type))
        ? f.type
        : "text") as IntakeFieldDefinition["type"],
      placeholder: f.placeholder ? String(f.placeholder) : undefined,
      options: Array.isArray(f.options) ? f.options.map(String) : undefined,
      required: Boolean(f.required),
    }));
}

export async function fetchTradeSkills(): Promise<TradeSkill[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("trade_skills")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data && data.length > 0) {
      const dbSkills = data.map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        default_vat_rate: Number(row.default_vat_rate),
        system_instructions: String(row.system_instructions),
        intake_fields: parseIntakeFields(row.intake_fields),
        updated_at: String(row.updated_at),
      }));

      // Compléter automatiquement avec les skills par défaut manquants (ex: Couverture & Zinguerie)
      const existingSlugs = new Set(dbSkills.map((s) => s.slug));
      const missingDefaults = DEFAULT_TRADE_SKILLS.filter(
        (s) => !existingSlugs.has(s.slug)
      );

      if (missingDefaults.length > 0) {
        void (async () => {
          try {
            await sb.from("trade_skills").insert(
              missingDefaults.map((s) => ({
                slug: s.slug,
                name: s.name,
                default_vat_rate: s.default_vat_rate,
                system_instructions: s.system_instructions,
                intake_fields: s.intake_fields,
              }))
            );
          } catch {}
        })();
      }

      return [...dbSkills, ...missingDefaults];
    }
  }

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_SKILLS_KEY);
    if (raw) {
      try {
        const cached = JSON.parse(raw) as TradeSkill[];
        const cachedSlugs = new Set(cached.map((s) => s.slug));
        const missing = DEFAULT_TRADE_SKILLS.filter((s) => !cachedSlugs.has(s.slug));
        if (missing.length > 0) {
          const merged = [...cached, ...missing];
          window.localStorage.setItem(LS_SKILLS_KEY, JSON.stringify(merged));
          return merged;
        }
        return cached;
      } catch {
        // fallback below
      }
    }
    window.localStorage.setItem(LS_SKILLS_KEY, JSON.stringify(DEFAULT_TRADE_SKILLS));
  }
  return DEFAULT_TRADE_SKILLS;
}

export async function upsertTradeSkill(
  skill: Omit<TradeSkill, "id" | "updated_at"> & { id?: string },
  actor?: UserProfile | null
): Promise<TradeSkill> {
  if (actor && !canRoleManageRules(actor.role)) {
    throw new Error(
      "Accès refusé (RLS) : seul un Directeur Commercial ou Administrateur peut modifier les instructions métiers."
    );
  }

  const cleanSlug = skill.slug
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("trade_skills")
      .upsert(
        {
          slug: cleanSlug,
          name: skill.name,
          default_vat_rate: skill.default_vat_rate,
          system_instructions: skill.system_instructions,
          intake_fields: skill.intake_fields,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Refus RLS Supabase : ${error.message}`);
    }
    if (data) {
      return {
        id: String(data.id),
        slug: String(data.slug),
        name: String(data.name),
        default_vat_rate: Number(data.default_vat_rate),
        system_instructions: String(data.system_instructions),
        intake_fields: parseIntakeFields(data.intake_fields),
        updated_at: String(data.updated_at),
      };
    }
  }

  const saved: TradeSkill = {
    id: skill.id ?? crypto.randomUUID(),
    slug: cleanSlug,
    name: skill.name,
    default_vat_rate: skill.default_vat_rate,
    system_instructions: skill.system_instructions,
    intake_fields: skill.intake_fields,
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const current = await fetchTradeSkills();
    const idx = current.findIndex((s) => s.slug === cleanSlug);
    const updated =
      idx >= 0 ? current.map((s, i) => (i === idx ? saved : s)) : [...current, saved];
    window.localStorage.setItem(LS_SKILLS_KEY, JSON.stringify(updated));
  }
  return saved;
}

export async function applyConversationalSkillUpdate(
  currentSkill: TradeSkill,
  proposal: ProposedSkillUpdate,
  actor: UserProfile | null
): Promise<TradeSkill> {
  if (!actor || !canRoleManageRules(actor.role)) {
    throw new Error(
      "Droits insuffisants : seul le Directeur Commercial ou l'Administrateur peut actualiser les instructions du métier."
    );
  }

  const previousInstructions = currentSkill.system_instructions;
  const updatedSkill = await upsertTradeSkill(
    {
      id: currentSkill.id,
      slug: currentSkill.slug,
      name: currentSkill.name,
      default_vat_rate: currentSkill.default_vat_rate,
      system_instructions: proposal.updated_instructions,
      intake_fields: currentSkill.intake_fields,
    },
    actor
  );

  const logEntry: SkillInstructionUpdateLog = {
    id: crypto.randomUUID(),
    trade_slug: currentSkill.slug,
    author_name: actor.full_name || actor.email,
    author_role: actor.role,
    source_utterance: proposal.source_utterance,
    change_summary: proposal.summary,
    previous_instructions: previousInstructions,
    new_instructions: proposal.updated_instructions,
    created_at: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("skill_instruction_updates").insert({
      trade_slug: logEntry.trade_slug,
      author_id: actor.access_token ? actor.id : null,
      author_name: logEntry.author_name,
      author_role: logEntry.author_role,
      source_utterance: logEntry.source_utterance,
      change_summary: logEntry.change_summary,
      previous_instructions: logEntry.previous_instructions,
      new_instructions: logEntry.new_instructions,
    });
    if (error) {
      throw new Error(`Erreur journalisation RLS : ${error.message}`);
    }
  } else if (typeof window !== "undefined") {
    const existing = await fetchSkillInstructionLogs();
    window.localStorage.setItem(
      LS_SKILL_LOGS_KEY,
      JSON.stringify([logEntry, ...existing].slice(0, 50))
    );
  }

  return updatedSkill;
}

export async function fetchSkillInstructionLogs(
  tradeSlug?: string
): Promise<SkillInstructionUpdateLog[]> {
  const sb = getSupabase();
  if (sb) {
    let query = sb
      .from("skill_instruction_updates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    if (tradeSlug) {
      query = query.eq("trade_slug", tradeSlug);
    }
    const { data, error } = await query;
    if (!error && data) {
      return data.map((row) => ({
        id: String(row.id),
        trade_slug: String(row.trade_slug),
        author_name: String(row.author_name ?? "Directeur Commercial"),
        author_role: (row.author_role as UserRole) ?? "directeur_commercial",
        source_utterance: String(row.source_utterance ?? ""),
        change_summary: String(row.change_summary ?? ""),
        previous_instructions: String(row.previous_instructions ?? ""),
        new_instructions: String(row.new_instructions ?? ""),
        created_at: String(row.created_at),
      }));
    }
  }

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_SKILL_LOGS_KEY);
    if (raw) {
      try {
        const all = JSON.parse(raw) as SkillInstructionUpdateLog[];
        return tradeSlug ? all.filter((l) => l.trade_slug === tradeSlug) : all;
      } catch {
        return [];
      }
    }
  }
  return [];
}

export async function deleteTradeSkill(
  slug: string,
  actor?: UserProfile | null
): Promise<void> {
  if (slug === "general") return;
  if (actor && !canRoleManageRules(actor.role)) {
    throw new Error("Accès refusé (RLS) : droits Directeur Commercial requis.");
  }
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("trade_skills").delete().eq("slug", slug);
    if (error) throw new Error(error.message);
    return;
  }
  if (typeof window !== "undefined") {
    const current = await fetchTradeSkills();
    window.localStorage.setItem(
      LS_SKILLS_KEY,
      JSON.stringify(current.filter((s) => s.slug !== slug))
    );
  }
}

// ============================================================================
// 2. BASE DE PRIX, OUVRAGES COMPOSÉS & RÉACTUALISATION MCP (catalog_items)
// ============================================================================

function parseComponents(raw: unknown): OuvrageComponent[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
    .map((c) => ({
      id: String(c.id ?? crypto.randomUUID()),
      label: String(c.label ?? "Composant"),
      cost_nature: (["heures", "matiere", "sous_traitance", "materiel", "autres_frais"].includes(
        String(c.cost_nature)
      )
        ? c.cost_nature
        : "matiere") as CostNature,
      quantity_per_unit: Number(c.quantity_per_unit ?? 1),
      unit: String(c.unit ?? "u"),
      unit_cost_ht: Number(c.unit_cost_ht ?? 0),
    }));
}

function mapCatalogRow(row: Record<string, unknown>): CatalogItem {
  const unitPrice = Number(row.unit_price_ht ?? 0);
  const costPrice = Number(row.cost_price_ht ?? round2(unitPrice / 1.4));
  const coef = Number(row.margin_coef ?? 1.4);
  const components = parseComponents(row.components);
  const itemKind: CatalogItemKind =
    row.item_kind === "ouvrage" || (components && components.length > 0)
      ? "ouvrage"
      : "article";

  return {
    id: String(row.id),
    supplier_ref: String(row.supplier_ref ?? ""),
    trade_slug: String(row.trade_slug ?? "general"),
    name: String(row.name),
    unit: String(row.unit ?? "u"),
    item_kind: itemKind,
    cost_nature: (row.cost_nature as CostNature) ?? "matiere",
    hours_per_unit: Number(row.hours_per_unit ?? 0),
    components,
    cost_price_ht: costPrice,
    margin_coef: coef,
    unit_price_ht: unitPrice,
    vat_rate: Number(row.vat_rate ?? 20),
    price_source: String(row.price_source ?? "Manuel"),
    price_updated_at: String(row.price_updated_at ?? new Date().toISOString()),
  };
}

export async function fetchCatalog(): Promise<CatalogItem[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("catalog_items")
      .select("*")
      .order("trade_slug", { ascending: true })
      .order("name", { ascending: true });
    if (!error && data && data.length > 0) {
      const dbItems = data.map((row) => mapCatalogRow(row as Record<string, unknown>));
      const existingRefs = new Set(dbItems.map((c) => c.supplier_ref));
      const missingDefaults = DEFAULT_CATALOG.filter(
        (c) => !existingRefs.has(c.supplier_ref)
      );

      if (missingDefaults.length > 0) {
        void (async () => {
          try {
            await sb.from("catalog_items").insert(
              missingDefaults.map((c) => ({
                supplier_ref: c.supplier_ref,
                trade_slug: c.trade_slug,
                name: c.name,
                unit: c.unit,
                item_kind: c.item_kind,
                cost_nature: c.cost_nature,
                hours_per_unit: c.hours_per_unit ?? 0,
                components: c.components ?? [],
                cost_price_ht: c.cost_price_ht,
                margin_coef: c.margin_coef,
                unit_price_ht: c.unit_price_ht,
                vat_rate: c.vat_rate,
                price_source: c.price_source,
              }))
            );
          } catch {}
        })();
      }

      return [...dbItems, ...missingDefaults];
    }
  }

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_CATALOG_KEY);
    if (raw) {
      try {
        const cached = JSON.parse(raw) as CatalogItem[];
        const cachedRefs = new Set(cached.map((c) => c.supplier_ref));
        const missing = DEFAULT_CATALOG.filter((c) => !cachedRefs.has(c.supplier_ref));
        if (missing.length > 0) {
          const merged = [...cached, ...missing];
          window.localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(merged));
          return merged;
        }
        return cached;
      } catch {
        // fallback below
      }
    }
    window.localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(DEFAULT_CATALOG));
  }
  return DEFAULT_CATALOG;
}

export async function addCatalogItem(
  input: {
    supplier_ref?: string;
    trade_slug: string;
    name: string;
    unit: string;
    item_kind?: CatalogItemKind;
    cost_nature?: CostNature;
    hours_per_unit?: number;
    components?: OuvrageComponent[];
    cost_price_ht: number;
    margin_coef: number;
    vat_rate: number;
    price_source?: string;
  },
  actor?: UserProfile | null
): Promise<CatalogItem> {
  if (actor && !canRoleManageRules(actor.role)) {
    throw new Error("Accès refusé (RLS) : seul le Directeur Commercial peut modifier les prix.");
  }

  const isOuvrage =
    input.item_kind === "ouvrage" && input.components && input.components.length > 0;
  const computedOuvrage = isOuvrage
    ? computeOuvrageTotalsFromComponents(input.components!)
    : null;

  const finalCostHt = computedOuvrage ? computedOuvrage.unitCostHt : input.cost_price_ht;
  const finalHours = computedOuvrage
    ? computedOuvrage.hoursPerUnit
    : input.hours_per_unit ?? (input.cost_nature === "heures" ? 1 : 0);
  const sellingPrice = round2(finalCostHt * input.margin_coef);

  const prefix = isOuvrage ? "OUV" : input.trade_slug.slice(0, 4).toUpperCase();
  const ref =
    input.supplier_ref?.trim() ||
    `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("catalog_items")
      .upsert(
        {
          supplier_ref: ref,
          trade_slug: input.trade_slug,
          name: input.name,
          unit: input.unit,
          item_kind: isOuvrage ? "ouvrage" : "article",
          cost_nature: input.cost_nature ?? "matiere",
          hours_per_unit: finalHours,
          components: input.components ?? [],
          cost_price_ht: finalCostHt,
          margin_coef: input.margin_coef,
          unit_price_ht: sellingPrice,
          vat_rate: input.vat_rate,
          price_source: input.price_source ?? (isOuvrage ? "Recette Ouvrage UI" : "Manuel UI"),
          price_updated_at: new Date().toISOString(),
        },
        { onConflict: "supplier_ref" }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (data) {
      return mapCatalogRow(data as Record<string, unknown>);
    }
  }

  const created: CatalogItem = {
    id: crypto.randomUUID(),
    supplier_ref: ref,
    trade_slug: input.trade_slug,
    name: input.name,
    unit: input.unit,
    item_kind: isOuvrage ? "ouvrage" : "article",
    cost_nature: input.cost_nature ?? "matiere",
    hours_per_unit: finalHours,
    components: isOuvrage ? input.components : undefined,
    cost_price_ht: finalCostHt,
    margin_coef: input.margin_coef,
    unit_price_ht: sellingPrice,
    vat_rate: input.vat_rate,
    price_source: input.price_source ?? (isOuvrage ? "Recette Ouvrage UI" : "Manuel UI"),
    price_updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const existing = await fetchCatalog();
    const filtered = existing.filter((c) => c.supplier_ref !== ref);
    window.localStorage.setItem(LS_CATALOG_KEY, JSON.stringify([created, ...filtered]));
  }
  return created;
}

export async function applyTradeInflation(
  tradeSlug: string,
  percentChange: number,
  sourceLabel = "Réactualisation Indice",
  actor?: UserProfile | null
): Promise<number> {
  if (actor && !canRoleManageRules(actor.role)) {
    throw new Error("Accès refusé (RLS) : droits Directeur Commercial requis.");
  }

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc("mcp_apply_trade_inflation", {
      p_trade_slug: tradeSlug,
      p_percent_change: percentChange,
      p_source: sourceLabel,
    });
    if (error) throw new Error(error.message);
    if (typeof data === "number") {
      return data;
    }
  }

  if (typeof window !== "undefined") {
    const existing = await fetchCatalog();
    const factor = 1 + percentChange / 100;
    let count = 0;
    const now = new Date().toISOString();
    const updated = existing.map((item) => {
      if (tradeSlug === "all" || item.trade_slug === tradeSlug) {
        count++;
        const nextComponents = item.components?.map((c) =>
          c.cost_nature === "heures"
            ? c
            : { ...c, unit_cost_ht: round2(c.unit_cost_ht * factor) }
        );
        const nextCost = nextComponents?.length
          ? computeOuvrageTotalsFromComponents(nextComponents).unitCostHt
          : round2(item.cost_price_ht * factor);

        return {
          ...item,
          components: nextComponents,
          cost_price_ht: nextCost,
          unit_price_ht: round2(nextCost * item.margin_coef),
          price_source: sourceLabel,
          price_updated_at: now,
        };
      }
      return item;
    });
    window.localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(updated));
    return count;
  }
  return 0;
}

export async function removeCatalogItem(
  id: string,
  actor?: UserProfile | null
): Promise<void> {
  if (actor && !canRoleManageRules(actor.role)) {
    throw new Error("Accès refusé (RLS) : droits Directeur Commercial requis.");
  }
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("catalog_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  if (typeof window !== "undefined") {
    const existing = await fetchCatalog();
    window.localStorage.setItem(
      LS_CATALOG_KEY,
      JSON.stringify(existing.filter((c) => c.id !== id))
    );
  }
}

// ============================================================================
// 3. DEVIS, AVENANTS TS & BL SCANNÉS
// ============================================================================

export async function saveQuote(
  draft: QuoteDraft,
  status: SavedQuote["status"] = "validated",
  actor?: UserProfile | null
): Promise<{ saved: SavedQuote; storage: "supabase" | "local" }> {
  const totals = computeQuoteTotals(draft.lines);
  const sb = getSupabase();

  if (sb) {
    const { data: quoteRow, error: quoteErr } = await sb
      .from("quotes")
      .upsert(
        {
          quote_number: draft.quote_number,
          document_type: draft.document_type ?? "devis",
          parent_project_ref: draft.parent_project_ref ?? "",
          trade_slug: draft.trade_slug || "general",
          client_name: draft.client_name || "Client à préciser",
          client_email: draft.client_email || "",
          client_phone: draft.client_phone || "",
          site_address: draft.site_address || "",
          title: draft.title || "Devis",
          notes: draft.notes || "",
          intake_data: draft.intake_data || {},
          signature_data: draft.signature ?? null,
          status,
          total_ht: totals.totalHt,
          total_vat: totals.totalVat,
          total_ttc: totals.totalTtc,
        },
        { onConflict: "quote_number" }
      )
      .select()
      .single();

    if (quoteErr) {
      throw new Error(`Erreur RLS / sauvegarde Supabase : ${quoteErr.message}`);
    }

    if (quoteRow) {
      await sb.from("quote_lines").delete().eq("quote_id", quoteRow.id);

      if (draft.lines.length > 0) {
        const lineRows = draft.lines.map((line, index) => ({
          quote_id: quoteRow.id,
          position: index,
          catalog_ref: line.catalog_ref ?? null,
          item_kind: line.item_kind ?? "article",
          cost_nature: line.cost_nature ?? "matiere",
          hours_per_unit: line.hours_per_unit ?? 0,
          components_snapshot: line.components ?? [],
          designation: line.designation,
          quantity: line.quantity,
          unit: line.unit,
          unit_price_ht: line.unit_price_ht,
          vat_rate: line.vat_rate,
          total_ht: computeLineTotalHt(line),
        }));
        const { error: linesErr } = await sb.from("quote_lines").insert(lineRows);
        if (linesErr) {
          throw new Error(`Erreur sauvegarde lignes Supabase : ${linesErr.message}`);
        }
      }

      return {
        storage: "supabase",
        saved: {
          ...draft,
          id: String(quoteRow.id),
          created_by: quoteRow.created_by ? String(quoteRow.created_by) : actor?.id,
          status,
          total_ht: totals.totalHt,
          total_vat: totals.totalVat,
          total_ttc: totals.totalTtc,
          created_at: String(quoteRow.created_at),
          pennylane_status:
            (quoteRow.pennylane_status as PennylaneSyncStatus) ?? "not_pushed",
          pennylane_customer_id: String(quoteRow.pennylane_customer_id ?? ""),
          pennylane_invoice_id: String(quoteRow.pennylane_invoice_id ?? ""),
          pennylane_invoice_number: String(quoteRow.pennylane_invoice_number ?? ""),
          pennylane_invoice_url: String(quoteRow.pennylane_invoice_url ?? ""),
          pennylane_pushed_at: quoteRow.pennylane_pushed_at
            ? String(quoteRow.pennylane_pushed_at)
            : undefined,
        },
      };
    }
  }

  let existingLocal: SavedQuote | undefined;
  let allLocal: SavedQuote[] = [];
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_QUOTES_KEY);
    allLocal = raw ? (JSON.parse(raw) as SavedQuote[]) : [];
    existingLocal = allLocal.find((q) => q.quote_number === draft.quote_number);
  }

  const savedLocal: SavedQuote = {
    ...draft,
    id: existingLocal?.id ?? crypto.randomUUID(),
    created_by: existingLocal?.created_by ?? actor?.id ?? "demo-user-commercial",
    status,
    total_ht: totals.totalHt,
    total_vat: totals.totalVat,
    total_ttc: totals.totalTtc,
    created_at: existingLocal?.created_at ?? new Date().toISOString(),
    pennylane_status: existingLocal?.pennylane_status ?? "not_pushed",
    pennylane_customer_id: existingLocal?.pennylane_customer_id ?? "",
    pennylane_invoice_id: existingLocal?.pennylane_invoice_id ?? "",
    pennylane_invoice_number: existingLocal?.pennylane_invoice_number ?? "",
    pennylane_invoice_url: existingLocal?.pennylane_invoice_url ?? "",
    pennylane_pushed_at: existingLocal?.pennylane_pushed_at,
  };

  if (typeof window !== "undefined") {
    const filtered = allLocal.filter((q) => q.quote_number !== draft.quote_number);
    window.localStorage.setItem(LS_QUOTES_KEY, JSON.stringify([savedLocal, ...filtered]));
  }

  return { saved: savedLocal, storage: "local" };
}

export async function fetchSavedQuotes(actor?: UserProfile | null): Promise<SavedQuote[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("quotes")
      .select("*, quote_lines(*)")
      .order("created_at", { ascending: false })
      .limit(30);

    if (!error && data) {
      return data.map((row) => ({
        id: String(row.id),
        created_by: row.created_by ? String(row.created_by) : undefined,
        quote_number: String(row.quote_number),
        document_type: ((row.document_type as DocumentType) ?? "devis"),
        parent_project_ref: String(row.parent_project_ref ?? ""),
        trade_slug: String(row.trade_slug ?? "general"),
        client_name: String(row.client_name),
        client_email: String(row.client_email ?? ""),
        client_phone: String(row.client_phone ?? ""),
        site_address: String(row.site_address ?? ""),
        title: String(row.title),
        notes: String(row.notes ?? ""),
        intake_data: (row.intake_data && typeof row.intake_data === "object"
          ? row.intake_data
          : {}) as IntakeDataMap,
        include_intake_on_pdf: true,
        include_ouvrage_detail_on_pdf: true,
        signature: (row.signature_data as ClientSignature | null) ?? null,
        status: (row.status as SavedQuote["status"]) ?? "validated",
        total_ht: Number(row.total_ht),
        total_vat: Number(row.total_vat),
        total_ttc: Number(row.total_ttc),
        created_at: String(row.created_at),
        pennylane_status: (row.pennylane_status as PennylaneSyncStatus) ?? "not_pushed",
        pennylane_customer_id: String(row.pennylane_customer_id ?? ""),
        pennylane_invoice_id: String(row.pennylane_invoice_id ?? ""),
        pennylane_invoice_number: String(row.pennylane_invoice_number ?? ""),
        pennylane_invoice_url: String(row.pennylane_invoice_url ?? ""),
        pennylane_pushed_at: row.pennylane_pushed_at
          ? String(row.pennylane_pushed_at)
          : undefined,
        lines: Array.isArray(row.quote_lines)
          ? row.quote_lines
              .sort(
                (a: { position: number }, b: { position: number }) =>
                  a.position - b.position
              )
              .map((l: Record<string, unknown>) => ({
                id: String(l.id),
                catalog_ref: l.catalog_ref ? String(l.catalog_ref) : undefined,
                item_kind: (l.item_kind as CatalogItemKind) ?? "article",
                cost_nature: (l.cost_nature as CostNature) ?? "matiere",
                hours_per_unit: Number(l.hours_per_unit ?? 0),
                components: parseComponents(l.components_snapshot),
                designation: String(l.designation),
                quantity: Number(l.quantity),
                unit: String(l.unit),
                unit_price_ht: Number(l.unit_price_ht),
                vat_rate: Number(l.vat_rate),
              }))
          : [],
      }));
    }
  }

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_QUOTES_KEY);
    if (raw) {
      try {
        const all = JSON.parse(raw) as SavedQuote[];
        if (actor && !canRoleManageRules(actor.role)) {
          return all.filter((q) => !q.created_by || q.created_by === actor.id);
        }
        return all;
      } catch {
        return [];
      }
    }
  }
  return [];
}

export function fetchLocalScannedBls(): ScannedBlRecord[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LS_BLS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ScannedBlRecord[];
  } catch {
    return [];
  }
}

export function saveLocalScannedBl(record: ScannedBlRecord): ScannedBlRecord[] {
  if (typeof window === "undefined") return [record];
  const existing = fetchLocalScannedBls();
  const next = [record, ...existing].slice(0, 20);
  window.localStorage.setItem(LS_BLS_KEY, JSON.stringify(next));
  return next;
}

export async function pushQuoteToPennylane(
  draft: QuoteDraft,
  options: PennylanePushOptions,
  actor?: UserProfile | null
): Promise<{ savedQuote: SavedQuote; result: PennylanePushResult }> {
  const { saved } = await saveQuote(draft, "validated", actor);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (actor?.access_token) {
    headers.Authorization = `Bearer ${actor.access_token}`;
  }

  const res = await fetch("/api/pennylane/push-invoice", {
    method: "POST",
    headers,
    body: JSON.stringify({ quote: draft, options }),
  });

  const payload = (await res.json()) as PennylanePushResult & { error?: string };
  if (!res.ok || !payload.ok) {
    throw new Error(
      payload.error || "Échec de la synchronisation avec Pennylane API v2."
    );
  }

  const pushedAt = new Date().toISOString();
  const updatedQuote: SavedQuote = {
    ...saved,
    pennylane_status: payload.syncStatus,
    pennylane_customer_id: payload.pennylaneCustomerId,
    pennylane_invoice_id: payload.pennylaneInvoiceId,
    pennylane_invoice_number: payload.pennylaneInvoiceNumber,
    pennylane_invoice_url: payload.pennylaneInvoiceUrl,
    pennylane_pushed_at: pushedAt,
  };

  const sb = getSupabase();
  if (sb) {
    await sb
      .from("quotes")
      .update({
        pennylane_status: updatedQuote.pennylane_status,
        pennylane_customer_id: updatedQuote.pennylane_customer_id,
        pennylane_invoice_id: updatedQuote.pennylane_invoice_id,
        pennylane_invoice_number: updatedQuote.pennylane_invoice_number,
        pennylane_invoice_url: updatedQuote.pennylane_invoice_url,
        pennylane_pushed_at: pushedAt,
      })
      .eq("id", saved.id);

    await sb.from("pennylane_sync_logs").insert({
      quote_id: saved.id,
      quote_number: saved.quote_number,
      provider_mode: payload.providerMode,
      invoice_mode: options.invoiceMode,
      deposit_percent: options.depositPercent,
      customer_type: options.customerType,
      is_draft: options.createAsDraft,
      pennylane_customer_id: payload.pennylaneCustomerId,
      pennylane_invoice_id: payload.pennylaneInvoiceId,
      pennylane_invoice_number: payload.pennylaneInvoiceNumber,
      request_payload: {
        customer: payload.customerPayload,
        invoice: payload.invoicePayload,
      },
      response_payload: payload.rawResponse ?? { simulated: true },
    });
  } else if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_QUOTES_KEY);
    const all: SavedQuote[] = raw ? (JSON.parse(raw) as SavedQuote[]) : [];
    const updatedList = all.map((q) =>
      q.quote_number === updatedQuote.quote_number ? updatedQuote : q
    );
    window.localStorage.setItem(LS_QUOTES_KEY, JSON.stringify(updatedList));
  }

  return { savedQuote: updatedQuote, result: payload };
}

// ============================================================================
// 5. PARAMÉTRAGE MODULAIRE (TOGGLES ON/OFF) — app_settings + localStorage
// ============================================================================

export async function fetchAppFeatureFlags(): Promise<AppFeatureFlags> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("app_settings")
      .select("flags")
      .eq("key", "global_feature_flags")
      .maybeSingle();

    if (!error && data?.flags && typeof data.flags === "object") {
      const merged: AppFeatureFlags = {
        ...DEFAULT_FEATURE_FLAGS,
        ...(data.flags as Partial<AppFeatureFlags>),
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_FEATURE_FLAGS_KEY, JSON.stringify(merged));
      }
      return merged;
    }
  }

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_FEATURE_FLAGS_KEY);
    if (raw) {
      try {
        return {
          ...DEFAULT_FEATURE_FLAGS,
          ...(JSON.parse(raw) as Partial<AppFeatureFlags>),
        };
      } catch {
        // fallback below
      }
    }
    window.localStorage.setItem(
      LS_FEATURE_FLAGS_KEY,
      JSON.stringify(DEFAULT_FEATURE_FLAGS)
    );
  }
  return DEFAULT_FEATURE_FLAGS;
}

export async function saveAppFeatureFlags(
  flags: AppFeatureFlags,
  actor?: UserProfile | null
): Promise<{ flags: AppFeatureFlags; storage: "supabase" | "local" }> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LS_FEATURE_FLAGS_KEY, JSON.stringify(flags));
  }

  const sb = getSupabase();
  if (sb && (!actor || canRoleManageRules(actor.role))) {
    const { error } = await sb.from("app_settings").upsert(
      {
        key: "global_feature_flags",
        flags,
        updated_by: actor?.access_token ? actor.id : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (!error) {
      return { flags, storage: "supabase" };
    }
  }

  return { flags, storage: "local" };
}
