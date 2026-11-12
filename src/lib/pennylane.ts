import { computeLineTotalHt, computeQuoteTotals, round2 } from "./quote-calc";
import type {
  PennylanePaymentConditions,
  PennylanePushOptions,
  QuoteDraft,
  QuoteLine,
} from "./types";

/**
 * Convertit un taux de TVA numérique français (20, 10, 5.5, 2.1, 0)
 * vers le code énuméré strict attendu par l'API Pennylane v2.
 */
export function mapVatRateToPennylane(vatRate: number): string {
  const normalized = Number(vatRate);
  if (Math.abs(normalized - 20) < 0.01) return "FR_200";
  if (Math.abs(normalized - 10) < 0.01) return "FR_100";
  if (Math.abs(normalized - 5.5) < 0.01) return "FR_55";
  if (Math.abs(normalized - 2.1) < 0.01) return "FR_21";
  if (normalized <= 0) return "exempt";
  return "FR_200";
}

/**
 * Convertit une unité BTP (m², ml, m, h, u, forfait) vers les unités Pennylane v2.
 */
export function mapUnitToPennylane(unit: string): string {
  const u = (unit || "").trim().toLowerCase();
  if (u === "h" || u === "heure" || u === "heures") return "hour";
  if (u === "j" || u === "jour" || u === "jours") return "day";
  if (u === "m" || u === "ml") return "meter";
  if (u === "m²" || u === "m2") return "square_meter";
  if (u === "forfait" || u === "ens") return "flat_rate";
  return "piece";
}

/**
 * Extrait rue, code postal et ville à partir d'une adresse libre française.
 * Pennylane API v2 impose strictement `country_alpha2` (2 lettres ISO, ex: "FR").
 */
export function parseFrenchAddress(rawAddress: string): {
  address: string;
  postal_code: string;
  city: string;
  country_alpha2: string;
} {
  const clean = (rawAddress || "").trim();
  if (!clean) {
    return {
      address: "Adresse chantier à compléter",
      postal_code: "75000",
      city: "À préciser",
      country_alpha2: "FR",
    };
  }

  const cpMatch = clean.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ0-9' -]{2,})/);
  if (cpMatch) {
    const postalCode = cpMatch[1];
    const city = cpMatch[2].replace(/[,.;]+$/, "").trim() || "France";
    const streetPart = clean
      .slice(0, cpMatch.index)
      .replace(/[,;-]\s*$/, "")
      .trim();
    return {
      address: streetPart || clean,
      postal_code: postalCode,
      city,
      country_alpha2: "FR",
    };
  }

  return {
    address: clean,
    postal_code: "75000",
    city: "À préciser",
    country_alpha2: "FR",
  };
}

/**
 * Découpe un nom complet ("M. Jean Dupont") en prénom / nom pour `individual_customers`.
 */
export function splitFullName(rawName: string): {
  first_name: string;
  last_name: string;
} {
  const cleaned = (rawName || "")
    .replace(/^(m\.|mme\.?|mr\.?|monsieur|madame)\s+/i, "")
    .trim();
  if (!cleaned) {
    return { first_name: "Client", last_name: "Particulier" };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: "Client", last_name: parts[0] };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

/**
 * Génère une référence client déterministe (`external_reference`) pour éviter les doublons Pennylane.
 */
export function buildCustomerExternalReference(quote: QuoteDraft): string {
  const seed = (quote.client_email || quote.client_name || quote.quote_number)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `crm-btp-${seed || "client"}`;
}

export function computeDeadlineDate(
  issueDateIso: string,
  conditions: PennylanePaymentConditions
): string {
  const d = new Date(`${issueDateIso}T12:00:00Z`);
  const daysMap: Record<PennylanePaymentConditions, number> = {
    upon_receipt: 0,
    "7_days": 7,
    "15_days": 15,
    "30_days": 30,
    "45_days": 45,
  };
  d.setUTCDate(d.getUTCDate() + (daysMap[conditions] ?? 30));
  return d.toISOString().slice(0, 10);
}

/**
 * Construit le payload Pennylane API v2 pour créer le client (`individual_customers` ou `company_customers`).
 */
export function buildPennylaneCustomerRequest(
  quote: QuoteDraft,
  options: PennylanePushOptions
): {
  endpointPath: "/individual_customers" | "/company_customers";
  externalReference: string;
  payload: Record<string, unknown>;
} {
  const externalReference = buildCustomerExternalReference(quote);
  const billingAddress = parseFrenchAddress(quote.site_address);
  const emails = quote.client_email?.trim() ? [quote.client_email.trim()] : [];
  const phone = quote.client_phone?.trim() || undefined;

  if (options.customerType === "company") {
    return {
      endpointPath: "/company_customers",
      externalReference,
      payload: {
        name: quote.client_name?.trim() || "Entreprise Cliente",
        external_reference: externalReference,
        emails,
        ...(phone ? { phone } : {}),
        payment_conditions: options.paymentConditions,
        billing_language: "fr_FR",
        billing_address: billingAddress,
      },
    };
  }

  const { first_name, last_name } = splitFullName(quote.client_name);
  return {
    endpointPath: "/individual_customers",
    externalReference,
    payload: {
      first_name,
      last_name,
      external_reference: externalReference,
      emails,
      ...(phone ? { phone } : {}),
      payment_conditions: options.paymentConditions,
      billing_language: "fr_FR",
      billing_address: billingAddress,
    },
  };
}

export interface BuiltPennylaneInvoice {
  endpointPath: "/customer_invoices";
  payload: Record<string, unknown>;
  billedAmountHt: number;
  billedAmountTtc: number;
}

/**
 * Construit le payload Pennylane API v2 `POST /customer_invoices` :
 * - Mode `full` : pousse 100 % des lignes du devis avec `raw_currency_unit_price` (string décimale) et `vat_rate`.
 * - Mode `deposit` : ventile automatiquement l'acompte (ex: 30 %) par taux de TVA présent sur le devis
 *   afin de garantir une TVA d'acompte BTP multi-taux (5,5 % / 10 % / 20 %) exacte au centime dans Pennylane.
 */
export function buildPennylaneInvoiceRequest(
  quote: QuoteDraft,
  customerId: number | string,
  options: PennylanePushOptions,
  issueDateIso = new Date().toISOString().slice(0, 10)
): BuiltPennylaneInvoice {
  const deadline = computeDeadlineDate(issueDateIso, options.paymentConditions);
  const clampedPct = Math.min(100, Math.max(1, round2(options.depositPercent || 30)));

  let invoiceLines: Array<Record<string, unknown>> = [];
  let billedAmountHt = 0;
  let billedAmountTtc = 0;

  if (options.invoiceMode === "deposit" && clampedPct < 100) {
    // Regroupement par taux de TVA pour respecter la ventilation fiscale des acomptes multi-TVA
    const byVat = new Map<number, number>();
    for (const line of quote.lines) {
      const rate = Number(line.vat_rate) || 0;
      const lineHt = computeLineTotalHt(line);
      byVat.set(rate, round2((byVat.get(rate) ?? 0) + lineHt));
    }

    const syntheticLines: QuoteLine[] = [];
    for (const [rate, baseHt] of Array.from(byVat.entries()).sort((a, b) => a[0] - b[0])) {
      if (baseHt <= 0) continue;
      const depositHt = round2((baseHt * clampedPct) / 100);
      syntheticLines.push({
        id: `dep-${rate}`,
        designation: `Acompte ${clampedPct} % sur devis ${quote.quote_number}`,
        quantity: 1,
        unit: "forfait",
        unit_price_ht: depositHt,
        vat_rate: rate,
      });
      invoiceLines.push({
        label: `Acompte ${clampedPct} % — Devis ${quote.quote_number} (${quote.title || "Travaux"}) — TVA ${rate} %`,
        quantity: 1,
        unit: "flat_rate",
        raw_currency_unit_price: depositHt.toFixed(2),
        vat_rate: mapVatRateToPennylane(rate),
      });
    }

    const depTotals = computeQuoteTotals(syntheticLines);
    billedAmountHt = depTotals.totalHt;
    billedAmountTtc = depTotals.totalTtc;
  } else {
    const fullTotals = computeQuoteTotals(quote.lines);
    billedAmountHt = fullTotals.totalHt;
    billedAmountTtc = fullTotals.totalTtc;

    invoiceLines = quote.lines.map((line) => ({
      label: line.designation,
      quantity: round2(line.quantity),
      unit: mapUnitToPennylane(line.unit),
      raw_currency_unit_price: round2(line.unit_price_ht).toFixed(2),
      vat_rate: mapVatRateToPennylane(line.vat_rate),
    }));
  }

  const externalRefSuffix =
    options.invoiceMode === "deposit" && clampedPct < 100
      ? `ACOMPTE-${clampedPct}`
      : "SOLDE-100";

  const freeTextParts = [
    `Facture issue du devis ${quote.quote_number} — ${quote.title || "Travaux"}.`,
    quote.site_address ? `Lieu d'intervention : ${quote.site_address}.` : "",
    quote.notes ? `Conditions : ${quote.notes}` : "",
  ].filter(Boolean);

  return {
    endpointPath: "/customer_invoices",
    billedAmountHt,
    billedAmountTtc,
    payload: {
      customer_id: typeof customerId === "string" && /^\d+$/.test(customerId)
        ? Number(customerId)
        : customerId,
      draft: options.createAsDraft,
      date: issueDateIso,
      deadline,
      currency: "EUR",
      external_reference: `${quote.quote_number}-${externalRefSuffix}`,
      pdf_invoice_free_text: freeTextParts.join("\n"),
      invoice_lines: invoiceLines,
    },
  };
}
