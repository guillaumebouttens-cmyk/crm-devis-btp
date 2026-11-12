import type {
  CatalogItem,
  CostNature,
  DocumentType,
  ErpAnalyticalBreakdown,
  MarginTrafficLight,
  OuvrageComponent,
  QuoteLine,
} from "./types";

export interface VatBucket {
  rate: number;
  baseHt: number;
  vatAmount: number;
}

export interface QuoteTotals {
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  vatBreakdown: VatBucket[];
}

export const DEFAULT_HOURLY_LOADED_COST = 38; // Simule erp.cout_horaire_en_vigueur (schéma previ)

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function computeLineTotalHt(
  line: Pick<QuoteLine, "quantity" | "unit_price_ht">
): number {
  const qty = Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0;
  const price = Number.isFinite(line.unit_price_ht)
    ? Math.max(0, line.unit_price_ht)
    : 0;
  return round2(qty * price);
}

/**
 * Calcule le déboursé sec unitaire et les heures unitaires d'une recette d'ouvrage composé.
 */
export function computeOuvrageTotalsFromComponents(
  components: OuvrageComponent[]
): { unitCostHt: number; hoursPerUnit: number } {
  let unitCostHt = 0;
  let hoursPerUnit = 0;
  for (const comp of components) {
    const q = Math.max(0, Number(comp.quantity_per_unit) || 0);
    const c = Math.max(0, Number(comp.unit_cost_ht) || 0);
    unitCostHt += q * c;
    if (comp.cost_nature === "heures") {
      hoursPerUnit += q;
    }
  }
  return {
    unitCostHt: round2(unitCostHt),
    hoursPerUnit: round2(hoursPerUnit),
  };
}

/**
 * Rattache une ligne de devis à son article ou ouvrage composé du catalogue
 * afin de récupérer sa recette analytique sans jamais exposer les coûts dans le prompt client.
 */
export function enrichLineFromCatalog(
  line: QuoteLine,
  catalog: CatalogItem[]
): QuoteLine {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const targetNorm = norm(line.designation);
  const matched =
    (line.catalog_ref
      ? catalog.find((c) => c.supplier_ref === line.catalog_ref)
      : undefined) ??
    catalog.find((c) => norm(c.name) === targetNorm) ??
    catalog.find(
      (c) =>
        targetNorm.length >= 6 &&
        (norm(c.name).includes(targetNorm) || targetNorm.includes(norm(c.name)))
    );

  if (!matched) {
    // Heuristique propre pour une ligne libre hors catalogue
    const inferredNature: CostNature =
      line.cost_nature ??
      (line.unit === "h" || /main[- ]d'oeuvre|pose|heures?/i.test(line.designation)
        ? "heures"
        : /sous[- ]trait/i.test(line.designation)
        ? "sous_traitance"
        : /engin|nacelle|mini[- ]pelle|benne/i.test(line.designation)
        ? "materiel"
        : /deplacement|frais|voirie/i.test(line.designation)
        ? "autres_frais"
        : "matiere");

    const inferredHours =
      line.hours_per_unit ?? (inferredNature === "heures" ? 1 : 0);

    const inferredUnitCost =
      line.unit_cost_ht ?? round2(line.unit_price_ht / 1.45);

    return {
      ...line,
      item_kind: line.item_kind ?? "article",
      cost_nature: inferredNature,
      hours_per_unit: inferredHours,
      unit_cost_ht: inferredUnitCost,
    };
  }

  return {
    ...line,
    catalog_ref: matched.supplier_ref,
    item_kind: matched.item_kind ?? "article",
    cost_nature: matched.cost_nature ?? "matiere",
    hours_per_unit: matched.hours_per_unit ?? 0,
    unit_cost_ht: matched.cost_price_ht,
    components: matched.components,
  };
}

/**
 * Calcule la ventilation analytique exacte attendue par erp.crm_devis et erp.affaires
 * (heures_prevues, matiere_prevue, sous_traitance_prevue, materiel, autres_frais)
 * ainsi que le Feu Tricolore de Marge (Décision D6 : masquage des coûts aux commerciaux).
 */
export function computeErpAnalytics(
  lines: QuoteLine[],
  catalog: CatalogItem[],
  coutHoraireCharge = DEFAULT_HOURLY_LOADED_COST,
  options?: {
    greenMarginThresholdPct?: number;
    orangeMarginThresholdPct?: number;
    blockCommercialOnRedMargin?: boolean;
  }
): ErpAnalyticalBreakdown {
  const greenThreshold = options?.greenMarginThresholdPct ?? 28;
  const orangeThreshold = options?.orangeMarginThresholdPct ?? 18;
  const blockOnRed = options?.blockCommercialOnRedMargin ?? true;
  let montantHt = 0;
  let heuresPrevues = 0;
  let matierePrevue = 0;
  let sousTraitancePrevue = 0;
  let materiel = 0;
  let autresFrais = 0;

  for (const rawLine of lines) {
    const line = enrichLineFromCatalog(rawLine, catalog);
    const qty = Math.max(0, Number(line.quantity) || 0);
    montantHt += computeLineTotalHt(line);

    if (line.item_kind === "ouvrage" && line.components && line.components.length > 0) {
      // Éclatement automatique de la recette de l'ouvrage composé !
      for (const comp of line.components) {
        const compQty = qty * Math.max(0, Number(comp.quantity_per_unit) || 0);
        const compCost = compQty * Math.max(0, Number(comp.unit_cost_ht) || 0);
        switch (comp.cost_nature) {
          case "heures":
            heuresPrevues += compQty;
            break;
          case "matiere":
            matierePrevue += compCost;
            break;
          case "sous_traitance":
            sousTraitancePrevue += compCost;
            break;
          case "materiel":
            materiel += compCost;
            break;
          case "autres_frais":
            autresFrais += compCost;
            break;
        }
      }
    } else {
      const nature = line.cost_nature ?? "matiere";
      const unitCost = Math.max(
        0,
        Number(line.unit_cost_ht ?? round2(line.unit_price_ht / 1.45)) || 0
      );

      if (nature === "heures") {
        const hrs =
          (line.hours_per_unit && line.hours_per_unit > 0
            ? line.hours_per_unit
            : 1) * qty;
        heuresPrevues += hrs;
      } else {
        // Pour un article fourni avec un léger temps de pose unitaire associé
        if (line.hours_per_unit && line.hours_per_unit > 0 && line.unit !== "h") {
          // On comptabilise uniquement le coût matière/matériel dans sa nature dédiée
        }
        const totalCost = qty * unitCost;
        switch (nature) {
          case "matiere":
            matierePrevue += totalCost;
            break;
          case "sous_traitance":
            sousTraitancePrevue += totalCost;
            break;
          case "materiel":
            materiel += totalCost;
            break;
          case "autres_frais":
            autresFrais += totalCost;
            break;
        }
      }
    }
  }

  montantHt = round2(montantHt);
  heuresPrevues = round2(heuresPrevues);
  matierePrevue = round2(matierePrevue);
  sousTraitancePrevue = round2(sousTraitancePrevue);
  materiel = round2(materiel);
  autresFrais = round2(autresFrais);

  const coutMainOeuvreHt = round2(heuresPrevues * coutHoraireCharge);
  const debourseSecTotalHt = round2(
    coutMainOeuvreHt + matierePrevue + sousTraitancePrevue + materiel + autresFrais
  );
  const margeBruteHt = round2(montantHt - debourseSecTotalHt);
  const tauxMargePct =
    montantHt > 0 ? round2((margeBruteHt / montantHt) * 100) : 0;

  let feuMarge: MarginTrafficLight = "neutre";
  if (montantHt > 0) {
    if (tauxMargePct >= greenThreshold) {
      feuMarge = "vert";
    } else if (tauxMargePct >= orangeThreshold) {
      feuMarge = "orange";
    } else {
      feuMarge = "rouge";
    }
  }

  return {
    montant_ht: montantHt,
    heures_prevues: heuresPrevues,
    cout_horaire_charge: coutHoraireCharge,
    cout_main_oeuvre_ht: coutMainOeuvreHt,
    matiere_prevue: matierePrevue,
    sous_traitance_prevue: sousTraitancePrevue,
    materiel,
    autres_frais: autresFrais,
    debourse_sec_total_ht: debourseSecTotalHt,
    marge_brute_ht: margeBruteHt,
    taux_marge_pct: tauxMargePct,
    feu_marge: feuMarge,
    requires_manager_approval: blockOnRed && feuMarge === "rouge",
  };
}

/**
 * Tous les calculs arithmétiques sont exécutés de manière déterministe côté code
 * (jamais confiés au modèle IA).
 */
export function computeQuoteTotals(lines: QuoteLine[]): QuoteTotals {
  const buckets = new Map<number, number>();
  let totalHt = 0;

  for (const line of lines) {
    const lineHt = computeLineTotalHt(line);
    totalHt += lineHt;
    const rate = Number.isFinite(line.vat_rate) ? line.vat_rate : 20;
    buckets.set(rate, (buckets.get(rate) ?? 0) + lineHt);
  }

  totalHt = round2(totalHt);

  const vatBreakdown: VatBucket[] = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, base]) => {
      const baseHt = round2(base);
      const vatAmount = round2(baseHt * (rate / 100));
      return { rate, baseHt, vatAmount };
    });

  const totalVat = round2(vatBreakdown.reduce((acc, b) => acc + b.vatAmount, 0));
  const totalTtc = round2(totalHt + totalVat);

  return { totalHt, totalVat, totalTtc, vatBreakdown };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount || 0);
}

export function generateQuoteNumber(docType: DocumentType = "devis"): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(100 + Math.random() * 900));
  const prefix = docType === "avenant_ts" ? "TS" : "DEV";
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export function getCostNatureLabel(nature: CostNature): string {
  switch (nature) {
    case "heures":
      return "Heures MO";
    case "matiere":
      return "Matière";
    case "sous_traitance":
      return "Sous-traitance";
    case "materiel":
      return "Matériel / Engins";
    case "autres_frais":
      return "Autres frais";
  }
}
