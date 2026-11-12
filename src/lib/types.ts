export type UserRole = "commercial" | "directeur_commercial" | "admin";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  access_token?: string;
}

export interface ProposedSkillUpdate {
  trade_slug: string;
  summary: string;
  updated_instructions: string;
  source_utterance: string;
  applied?: boolean;
}

export interface SkillInstructionUpdateLog {
  id: string;
  trade_slug: string;
  author_name: string;
  author_role: UserRole;
  source_utterance: string;
  change_summary: string;
  previous_instructions: string;
  new_instructions: string;
  created_at: string;
}

export type IntakeFieldType = "text" | "number" | "select" | "boolean" | "textarea";

export interface IntakeFieldDefinition {
  id: string;
  label: string;
  type: IntakeFieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export type IntakeDataMap = Record<string, string | number | boolean>;

export interface TradeSkill {
  id: string;
  slug: string;
  name: string;
  default_vat_rate: number;
  system_instructions: string;
  intake_fields: IntakeFieldDefinition[];
  updated_at: string;
}

/**
 * Natures analytiques alignées à 100 % sur erp.crm_devis et erp.affaires (erp-tsm-app)
 */
export type CostNature =
  | "heures"
  | "matiere"
  | "sous_traitance"
  | "materiel"
  | "autres_frais";

export type CatalogItemKind = "article" | "ouvrage";

/**
 * Composant unitaire d'un Ouvrage Composé (recette Heures + Matière + Matériel + ST)
 */
export interface OuvrageComponent {
  id: string;
  label: string;
  cost_nature: CostNature;
  quantity_per_unit: number;
  unit: string;
  unit_cost_ht: number;
}

export interface CatalogItem {
  id: string;
  supplier_ref: string;
  trade_slug: string;
  name: string;
  unit: string;
  item_kind?: CatalogItemKind;
  cost_nature?: CostNature;
  hours_per_unit?: number;
  components?: OuvrageComponent[];
  cost_price_ht: number;
  margin_coef: number;
  unit_price_ht: number;
  vat_rate: number;
  price_source: string;
  price_updated_at: string;
}

export interface QuoteLine {
  id: string;
  designation: string;
  quantity: number;
  unit: string;
  unit_price_ht: number;
  vat_rate: number;
  catalog_ref?: string;
  item_kind?: CatalogItemKind;
  cost_nature?: CostNature;
  hours_per_unit?: number;
  unit_cost_ht?: number;
  components?: OuvrageComponent[];
}

export type DocumentType = "devis" | "avenant_ts";

export interface ClientSignature {
  signer_name: string;
  signed_at: string;
  data_url: string;
}

export interface QuoteDraft {
  quote_number: string;
  document_type?: DocumentType;
  parent_project_ref?: string;
  trade_slug: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  site_address: string;
  title: string;
  notes: string;
  intake_data: IntakeDataMap;
  include_intake_on_pdf: boolean;
  include_ouvrage_detail_on_pdf?: boolean;
  signature?: ClientSignature | null;
  lines: QuoteLine[];
}

export type MarginTrafficLight = "vert" | "orange" | "rouge" | "neutre";

/**
 * Ventilation analytique prête à alimenter erp.crm_devis -> erp.affaires / erp.preparation_ts
 */
export interface ErpAnalyticalBreakdown {
  montant_ht: number;
  heures_prevues: number;
  cout_horaire_charge: number;
  cout_main_oeuvre_ht: number;
  matiere_prevue: number;
  sous_traitance_prevue: number;
  materiel: number;
  autres_frais: number;
  debourse_sec_total_ht: number;
  marge_brute_ht: number;
  taux_marge_pct: number;
  feu_marge: MarginTrafficLight;
  requires_manager_approval: boolean;
}

export interface ScannedBlLine {
  designation: string;
  quantity: number;
  unit: string;
  unit_cost_ht: number;
  cost_nature: CostNature;
}

export interface ScannedBlRecord {
  id: string;
  supplier_name: string;
  bl_number: string;
  bl_date: string;
  project_ref: string;
  total_cost_ht: number;
  lines: ScannedBlLine[];
  provider: "pixtral" | "demo-ocr";
  created_at: string;
}

export type PennylaneSyncStatus =
  | "not_pushed"
  | "draft_pushed"
  | "deposit_pushed"
  | "finalized_pushed"
  | "simulated";

export type PennylaneCustomerType = "individual" | "company";
export type PennylaneInvoiceMode = "deposit" | "full";
export type PennylanePaymentConditions =
  | "upon_receipt"
  | "7_days"
  | "15_days"
  | "30_days"
  | "45_days";

export interface PennylanePushOptions {
  customerType: PennylaneCustomerType;
  invoiceMode: PennylaneInvoiceMode;
  depositPercent: number;
  createAsDraft: boolean;
  paymentConditions: PennylanePaymentConditions;
  dryRun?: boolean;
}

export interface PennylanePushResult {
  ok: boolean;
  providerMode: "live" | "dry-run";
  syncStatus: PennylaneSyncStatus;
  pennylaneCustomerId: string;
  pennylaneInvoiceId: string;
  pennylaneInvoiceNumber: string;
  pennylaneInvoiceUrl: string;
  billedAmountHt: number;
  billedAmountTtc: number;
  message: string;
  customerEndpoint: string;
  customerPayload: Record<string, unknown>;
  invoiceEndpoint: string;
  invoicePayload: Record<string, unknown>;
  rawResponse?: Record<string, unknown>;
}

export interface SavedQuote extends QuoteDraft {
  id: string;
  created_by?: string;
  status: "draft" | "validated" | "sent";
  total_ht: number;
  total_vat: number;
  total_ttc: number;
  created_at: string;
  pennylane_status?: PennylaneSyncStatus;
  pennylane_customer_id?: string;
  pennylane_invoice_id?: string;
  pennylane_invoice_number?: string;
  pennylane_invoice_url?: string;
  pennylane_pushed_at?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  proposed_skill_update?: ProposedSkillUpdate;
}

export interface AgentApiPayload {
  reply: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  site_address?: string;
  parent_project_ref?: string;
  title?: string;
  notes?: string;
  intake_data?: IntakeDataMap;
  proposed_skill_update?: ProposedSkillUpdate | null;
  lines: Array<{
    designation: string;
    quantity: number;
    unit: string;
    unit_price_ht: number;
    vat_rate: number;
    catalog_ref?: string;
    item_kind?: CatalogItemKind;
    cost_nature?: CostNature;
    hours_per_unit?: number;
    unit_cost_ht?: number;
    components?: OuvrageComponent[];
  }>;
  ready_to_validate?: boolean;
  provider: "mistral" | "demo-fallback";
}

/**
 * Paramétrage modulaire (Feature Flags / Toggles ON-OFF) activable/désactivable
 * selon les besoins de l'entité (FENBAT, ABD, Accès Nord, TSM).
 */
export interface AppFeatureFlags {
  /** Bibliothèque & recettes d'Ouvrages Composés (Heures + Matière + Matériel) */
  enableOuvragesComposes: boolean;
  /** Feu Tricolore de Marge ERP & masquage des coûts (Décision D6) */
  enableErpMarginLight: boolean;
  /** Mode Avenant / Travaux Supplémentaires (TS) rattaché à une affaire (erp.preparation_ts) */
  enableAvenantTsMode: boolean;
  /** Signature tactile manuscrite « Bon pour accord » sur mobile/tablette */
  enableMobileSignature: boolean;
  /** Photo-Scan BL chantier via Mistral Pixtral (erp.achats_bl) + conversion TS */
  enablePhotoScanBl: boolean;
  /** Pont de facturation API v2 Pennylane (Acompte / 100 % Factur-X) */
  enablePennylaneBridge: boolean;
  /** Fiches d'entrevue commerciale & relevé chantier paramétrables */
  enableIntakeForms: boolean;
  /** Actualisation conversationnelle des consignes métier par le Directeur Commercial */
  enableConversationalRules: boolean;
  /** Bloquer l'envoi PDF par un commercial lorsque la marge est en Feu Rouge */
  blockCommercialOnRedMargin: boolean;
  /** Seuil de marge brute (%) pour le Feu Vert (défaut : 28 %) */
  greenMarginThresholdPct: number;
  /** Seuil plancher de marge brute (%) pour le Feu Orange / Rouge (défaut : 18 %) */
  orangeMarginThresholdPct: number;
  /** Coût horaire chargé par défaut en €/h (erp.cout_horaire_en_vigueur, défaut : 38 €/h) */
  defaultHourlyLoadedCost: number;
}
