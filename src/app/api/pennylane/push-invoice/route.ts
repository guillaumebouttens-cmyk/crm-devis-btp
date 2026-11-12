import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildPennylaneCustomerRequest,
  buildPennylaneInvoiceRequest,
} from "@/lib/pennylane";
import type {
  PennylanePushOptions,
  PennylanePushResult,
  PennylaneSyncStatus,
  QuoteDraft,
} from "@/lib/types";

interface PushRequestBody {
  quote: QuoteDraft;
  options: PennylanePushOptions;
}

function isPennylaneTokenConfigured(token: string): boolean {
  return (
    Boolean(token.trim()) &&
    !token.includes("votre_token") &&
    !token.includes("placeholder")
  );
}

async function verifyCallerIfSupabaseConfigured(req: Request): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const isSbConfigured =
    Boolean(supabaseUrl && supabaseAnonKey) &&
    !supabaseUrl.includes("votre-projet") &&
    !supabaseAnonKey.includes("votre_cle");

  if (!isSbConfigured) {
    return { ok: true };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return {
      ok: false,
      error: "Authentification Supabase requise pour pousser une facture vers Pennylane.",
    };
  }

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, error: "Session expirée ou jeton invalide." };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const authCheck = await verifyCallerIfSupabaseConfigured(req);
    if (!authCheck.ok) {
      return NextResponse.json({ error: authCheck.error }, { status: 401 });
    }

    const body = (await req.json()) as PushRequestBody;
    const { quote, options } = body;

    if (!quote || !Array.isArray(quote.lines) || quote.lines.length === 0) {
      return NextResponse.json(
        { error: "Le devis doit contenir au moins une ligne chiffrée avant envoi à Pennylane." },
        { status: 400 }
      );
    }

    const apiToken = process.env.PENNYLANE_API_TOKEN ?? "";
    const baseUrl = (
      process.env.PENNYLANE_API_BASE_URL || "https://app.pennylane.com/api/external/v2"
    ).replace(/\/+$/, "");
    const companyId = (process.env.PENNYLANE_COMPANY_ID ?? "").trim();

    const customerReq = buildPennylaneCustomerRequest(quote, options);
    const shouldSimulate = Boolean(options.dryRun) || !isPennylaneTokenConfigured(apiToken);

    // ========================================================================
    // MODE DRY-RUN / SIMULATION (si PENNYLANE_API_TOKEN non configuré ou test)
    // ========================================================================
    if (shouldSimulate) {
      const simulatedCustomerId = 9001042;
      const invoiceReq = buildPennylaneInvoiceRequest(quote, simulatedCustomerId, options);
      const simulatedInvoiceId = `SIM-${Date.now().toString().slice(-6)}`;
      const simulatedNumber = options.createAsDraft
        ? `BROUILLON-${quote.quote_number}`
        : `F-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

      const result: PennylanePushResult = {
        ok: true,
        providerMode: "dry-run",
        syncStatus: "simulated",
        pennylaneCustomerId: String(simulatedCustomerId),
        pennylaneInvoiceId: simulatedInvoiceId,
        pennylaneInvoiceNumber: simulatedNumber,
        pennylaneInvoiceUrl: "",
        billedAmountHt: invoiceReq.billedAmountHt,
        billedAmountTtc: invoiceReq.billedAmountTtc,
        message: isPennylaneTokenConfigured(apiToken)
          ? "Simulation Dry-Run réussie : contrat JSON Pennylane API v2 validé sans écriture comptable."
          : "Pont Pennylane prêt (mode Simulation : ajoutez PENNYLANE_API_TOKEN dans .env.local pour pousser en réel vers Pennylane).",
        customerEndpoint: `${baseUrl}${customerReq.endpointPath}`,
        customerPayload: customerReq.payload,
        invoiceEndpoint: `${baseUrl}${invoiceReq.endpointPath}`,
        invoicePayload: invoiceReq.payload,
      };

      return NextResponse.json(result);
    }

    // ========================================================================
    // MODE LIVE : APPELS RÉELS VERS PENNYLANE EXTERNAL API V2
    // ========================================================================
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiToken.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (companyId) {
      headers["X-Company-Id"] = companyId;
    }

    // 1. Recherche d'un client existant par external_reference pour éviter tout doublon
    let resolvedCustomerId: number | string | null = null;
    const filterParam = encodeURIComponent(
      JSON.stringify([
        {
          field: "external_reference",
          operator: "eq",
          value: customerReq.externalReference,
        },
      ])
    );

    const lookupRes = await fetch(`${baseUrl}/customers?filter=${filterParam}`, {
      method: "GET",
      headers,
    });

    if (lookupRes.ok) {
      const lookupJson = (await lookupRes.json()) as {
        items?: Array<{ id?: number | string }>;
        customers?: Array<{ id?: number | string }>;
      };
      const list = lookupJson.items ?? lookupJson.customers ?? [];
      if (list.length > 0 && list[0]?.id !== undefined) {
        resolvedCustomerId = list[0].id;
      }
    }

    // 2. Création du client (Particulier B2C ou Entreprise B2B) s'il n'existe pas encore
    if (resolvedCustomerId === null) {
      const createCustRes = await fetch(`${baseUrl}${customerReq.endpointPath}`, {
        method: "POST",
        headers,
        body: JSON.stringify(customerReq.payload),
      });

      const createCustJson = (await createCustRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!createCustRes.ok) {
        return NextResponse.json(
          {
            error: `Erreur Pennylane création client (${createCustRes.status}) : ${
              String(createCustJson.message || createCustJson.error || JSON.stringify(createCustJson))
            }`,
            customerEndpoint: `${baseUrl}${customerReq.endpointPath}`,
            customerPayload: customerReq.payload,
          },
          { status: createCustRes.status }
        );
      }

      const customerObj =
        (createCustJson.customer as Record<string, unknown> | undefined) ?? createCustJson;
      resolvedCustomerId = (customerObj.id as number | string | undefined) ?? null;

      if (resolvedCustomerId === null) {
        return NextResponse.json(
          { error: "Pennylane n'a pas renvoyé d'identifiant customer_id après création du client." },
          { status: 502 }
        );
      }
    }

    // 3. Création de la facture client (Acompte ou 100 %, Brouillon ou Finalisée)
    const invoiceReq = buildPennylaneInvoiceRequest(quote, resolvedCustomerId, options);
    const createInvRes = await fetch(`${baseUrl}${invoiceReq.endpointPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify(invoiceReq.payload),
    });

    const createInvJson = (await createInvRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!createInvRes.ok) {
      return NextResponse.json(
        {
          error: `Erreur Pennylane création facture (${createInvRes.status}) : ${
            String(createInvJson.message || createInvJson.error || JSON.stringify(createInvJson))
          }`,
          invoiceEndpoint: `${baseUrl}${invoiceReq.endpointPath}`,
          invoicePayload: invoiceReq.payload,
        },
        { status: createInvRes.status }
      );
    }

    const invObj =
      (createInvJson.invoice as Record<string, unknown> | undefined) ?? createInvJson;
    const pennylaneInvoiceId = String(invObj.id ?? "");
    const pennylaneInvoiceNumber = String(
      invObj.invoice_number ??
        invObj.label ??
        (options.createAsDraft ? `Brouillon #${pennylaneInvoiceId}` : pennylaneInvoiceId)
    );
    const pennylaneInvoiceUrl = String(invObj.public_file_url ?? invObj.file_url ?? "");

    const syncStatus: PennylaneSyncStatus =
      options.invoiceMode === "deposit" && options.depositPercent < 100
        ? "deposit_pushed"
        : options.createAsDraft
        ? "draft_pushed"
        : "finalized_pushed";

    const result: PennylanePushResult = {
      ok: true,
      providerMode: "live",
      syncStatus,
      pennylaneCustomerId: String(resolvedCustomerId),
      pennylaneInvoiceId,
      pennylaneInvoiceNumber,
      pennylaneInvoiceUrl,
      billedAmountHt: invoiceReq.billedAmountHt,
      billedAmountTtc: invoiceReq.billedAmountTtc,
      message: `Facture transmise à Pennylane (${pennylaneInvoiceNumber}) !`,
      customerEndpoint: `${baseUrl}${customerReq.endpointPath}`,
      customerPayload: customerReq.payload,
      invoiceEndpoint: `${baseUrl}${invoiceReq.endpointPath}`,
      invoicePayload: invoiceReq.payload,
      rawResponse: createInvJson,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne pont Pennylane";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
