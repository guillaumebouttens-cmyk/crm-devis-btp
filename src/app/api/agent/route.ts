import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { enrichLineFromCatalog } from "@/lib/quote-calc";
import type {
  AgentApiPayload,
  CatalogItem,
  ChatMessage,
  IntakeDataMap,
  ProposedSkillUpdate,
  QuoteDraft,
  QuoteLine,
  TradeSkill,
  UserRole,
} from "@/lib/types";

function buildSystemPrompt(
  canManageRules: boolean,
  userRole: UserRole,
  isAvenantTs: boolean
): string {
  const governanceBlock = canManageRules
    ? `=== DROITS DE L'INTERLOCUTEUR : ${userRole.toUpperCase()} (AUTORISÉ À MODIFIER LES INSTRUCTIONS MÉTIER) ===
- Si l'interlocuteur te demande au fil de la conversation de mémoriser une nouvelle consigne permanente, une règle tarifaire/technique ou de modifier les instructions du métier (ex: "Retiens désormais que...", "Ajoute dans les instructions...", "Impose toujours...", "Ne descends jamais sous..."), tu DOIS remplir l'objet "proposed_skill_update" :
  - "summary" : résumé court en 1 phrase de l'évolution de la règle,
  - "updated_instructions" : le nouveau texte COMPLET et consolidé des instructions du métier (fusionnant proprement les anciennes instructions et la nouvelle consigne, sans doublon).
- Si l'interlocuteur parle uniquement du chiffrage en cours sans demander d'actualiser les règles générales du métier, laisse "proposed_skill_update" à null.`
    : `=== DROITS DE L'INTERLOCUTEUR : COMMERCIAL (LECTURE SEULE SUR LES INSTRUCTIONS MÉTIER) ===
- Cet interlocuteur N'A PAS le droit de modifier les instructions permanentes du métier.
- Laisse TOUJOURS "proposed_skill_update" à null.
- S'il te demande de changer les consignes permanentes du métier pour l'entreprise, explique-lui poliment en 1 phrase que seul un Directeur Commercial ou Administrateur peut actualiser les instructions du métier, tout en appliquant si pertinent sa demande ponctuelle uniquement sur le document en cours.`;

  const docContext = isAvenantTs
    ? `MODE ACTIF : AVENANT / TRAVAUX SUPPLÉMENTAIRES EN COURS DE CHANTIER (erp.preparation_ts).
- L'utilisateur est sur chantier face à un imprévu ou une demande additionnelle du client.
- Sois ultra-concis, opérationnel et propose de faire signer immédiatement le Bon pour accord mobile.`
    : `MODE ACTIF : DEVIS COMMERCIAL INITIAL (erp.crm_devis).`;

  return `Tu es l'assistant de chiffrage BTP (vocal et écrit) d'une équipe commerciale et travaux.
${docContext}

Ton rôle :
1. Analyser la demande (saisie clavier ou dictée vocale) EN CROISANT :
   - les INSTRUCTIONS MÉTIER du corps d'état actif,
   - les DONNÉES D'ENTREVUE COMMERCIALE déjà saisies dans le formulaire,
   - la BASE D'OUVRAGES COMPOSÉS & ARTICLES fournie.
2. PRIVILÉGIE SYSTÉMATIQUEMENT LES OUVRAGES COMPOSÉS ([OUV-...]) lorsqu'une prestation complète fournie-posée correspond (portail posé, clôture, tableau électrique, borne IRVE, douche, cloison, carrelage posé), et renseigne leur "catalog_ref" exact pour activer la ventilation analytique ERP automatique (Heures + Matière + Matériel).
3. Si l'interlocuteur mentionne une information correspondant à un champ du formulaire d'entrevue, mets à jour "intake_data". S'il cite un code affaire/chantier (ex: AFF-2026-18), renseigne "parent_project_ref".
4. Ne calcule JAMAIS les totaux HT/TTC : renvoie uniquement le tableau "lines" à jour (catalog_ref, designation, quantity, unit, unit_price_ht, vat_rate).
5. Garde "reply" COURTE et claire (1 à 2 phrases maximum).
6. Demande confirmation explicite des quantités/prix avant validation finale ("ready_to_validate": true si confirmé).

${governanceBlock}

Réponds UNIQUEMENT avec un objet JSON valide respectant strictement cette structure :
{
  "reply": "Réponse courte",
  "client_name": "Nom du client",
  "client_email": "Email du client",
  "client_phone": "Téléphone du client",
  "site_address": "Adresse du chantier",
  "parent_project_ref": "Code affaire si avenant TS",
  "title": "Titre court du devis ou de l'avenant TS",
  "notes": "Conditions ou notes",
  "intake_data": {},
  "proposed_skill_update": null,
  "ready_to_validate": false,
  "lines": [
    {
      "catalog_ref": "OUV-EXT-PORTAIL-4M",
      "designation": "Nom clair de l'ouvrage ou article",
      "quantity": 1,
      "unit": "ens",
      "unit_price_ht": 4150.0,
      "vat_rate": 10
    }
  ]
}`;
}

async function resolveVerifiedRole(
  req: Request,
  clientClaimedRole?: UserRole
): Promise<UserRole> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const isSbConfigured =
    Boolean(supabaseUrl && supabaseAnonKey) &&
    !supabaseUrl.includes("votre-projet") &&
    !supabaseAnonKey.includes("votre_cle");

  if (!isSbConfigured) {
    return clientClaimedRole &&
      ["commercial", "directeur_commercial", "admin"].includes(clientClaimedRole)
      ? clientClaimedRole
      : "commercial";
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return "commercial";
  }

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData } = await sb.auth.getUser(token);
  if (!userData?.user) {
    return "commercial";
  }

  const { data: profile } = await sb
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  return role && ["commercial", "directeur_commercial", "admin"].includes(role)
    ? role
    : "commercial";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages: ChatMessage[];
      currentDraft: QuoteDraft;
      catalog: CatalogItem[];
      tradeSkill?: TradeSkill;
      userRole?: UserRole;
    };

    const verifiedRole = await resolveVerifiedRole(req, body.userRole);
    const canManageRules =
      verifiedRole === "directeur_commercial" || verifiedRole === "admin";
    const isAvenantTs = body.currentDraft.document_type === "avenant_ts";

    const apiKey = process.env.MISTRAL_API_KEY ?? "";
    const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
    const hasMistralKey = Boolean(apiKey) && !apiKey.includes("votre_cle");

    const activeTrade = body.tradeSkill;
    const activeSlug = activeTrade?.slug ?? body.currentDraft.trade_slug ?? "general";
    const lastUserMessage = body.messages[body.messages.length - 1]?.content ?? "";

    // Tri : ouvrages composés du métier actif d'abord, puis articles du métier, puis généraliste
    const relevantCatalog = [...(body.catalog ?? [])].sort((a, b) => {
      const tradeScore = (item: CatalogItem) =>
        item.trade_slug === activeSlug ? 0 : item.trade_slug === "general" ? 1 : 2;
      const kindScore = (item: CatalogItem) => (item.item_kind === "ouvrage" ? 0 : 1);
      const diff = tradeScore(a) - tradeScore(b);
      return diff !== 0 ? diff : kindScore(a) - kindScore(b);
    });

    if (!hasMistralKey) {
      const simulated = simulateLocalSkill(
        body.messages,
        body.currentDraft,
        relevantCatalog,
        activeTrade,
        verifiedRole,
        canManageRules
      );
      return NextResponse.json(simulated);
    }

    const intakeSchemaText =
      activeTrade?.intake_fields && activeTrade.intake_fields.length > 0
        ? activeTrade.intake_fields
            .map(
              (f) =>
                `- clé "${f.id}" (${f.type}) : ${f.label}${
                  f.options?.length ? ` [choix: ${f.options.join(" | ")}]` : ""
                }`
            )
            .join("\n")
        : "(Aucun champ spécifique)";

    const tradeInstructionsBlock = activeTrade
      ? `=== SKILL MÉTIER ACTIF : ${activeTrade.name.toUpperCase()} (slug: ${activeTrade.slug}) ===
TVA par défaut du métier : ${activeTrade.default_vat_rate} %
Instructions métier actuelles :
${activeTrade.system_instructions}

=== CHAMPS DU FORMULAIRE D'ENTREVUE COMMERCIALE ===
${intakeSchemaText}`
      : `=== SKILL MÉTIER ACTIF : GÉNÉRALISTE ===`;

    // Note : on n'envoie JAMAIS cost_price_ht au LLM commercial (isolation stricte des coûts)
    const catalogContext = relevantCatalog
      .map(
        (item) =>
          `- [${item.supplier_ref}] (${
            item.item_kind === "ouvrage" ? "OUVRAGE COMPOSÉ" : "ARTICLE"
          } | ${item.trade_slug}) ${item.name} | unité: ${item.unit} | PU Vente HT: ${
            item.unit_price_ht
          } € | TVA: ${item.vat_rate}% | pose incluse: ${item.hours_per_unit ?? 0}h/${item.unit}`
      )
      .join("\n");

    const draftContext = JSON.stringify(
      {
        document_type: body.currentDraft.document_type ?? "devis",
        parent_project_ref: body.currentDraft.parent_project_ref ?? "",
        client_name: body.currentDraft.client_name,
        client_email: body.currentDraft.client_email,
        client_phone: body.currentDraft.client_phone,
        site_address: body.currentDraft.site_address,
        title: body.currentDraft.title,
        notes: body.currentDraft.notes,
        intake_data: body.currentDraft.intake_data ?? {},
        lines: body.currentDraft.lines.map((l) => ({
          catalog_ref: l.catalog_ref,
          designation: l.designation,
          quantity: l.quantity,
          unit: l.unit,
          unit_price_ht: l.unit_price_ht,
          vat_rate: l.vat_rate,
        })),
      },
      null,
      2
    );

    const mistralMessages = [
      {
        role: "system",
        content: `${buildSystemPrompt(
          canManageRules,
          verifiedRole,
          isAvenantTs
        )}\n\n${tradeInstructionsBlock}\n\n=== BIBLIOTHÈQUE D'OUVRAGES COMPOSÉS & TARIFS DE VENTE ===\n${
          catalogContext || "(Base de prix vide)"
        }\n\n=== DOCUMENT & RÉPONSES D'ENTREVUE ACTUELS ===\n${draftContext}`,
      },
      ...body.messages.slice(-12).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: mistralMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Erreur API Mistral (${response.status}): ${errText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawContent);

    const defaultVat = activeTrade?.default_vat_rate ?? 20;
    const mergedIntake: IntakeDataMap = {
      ...(body.currentDraft.intake_data ?? {}),
      ...(parsed.intake_data && typeof parsed.intake_data === "object"
        ? (parsed.intake_data as IntakeDataMap)
        : {}),
    };

    let proposedSkillUpdate: ProposedSkillUpdate | null = null;
    if (
      canManageRules &&
      activeTrade &&
      parsed.proposed_skill_update &&
      typeof parsed.proposed_skill_update === "object" &&
      typeof parsed.proposed_skill_update.updated_instructions === "string" &&
      parsed.proposed_skill_update.updated_instructions.trim()
    ) {
      proposedSkillUpdate = {
        trade_slug: activeTrade.slug,
        summary: String(
          parsed.proposed_skill_update.summary ?? "Nouvelle consigne métier ajoutée"
        ),
        updated_instructions: parsed.proposed_skill_update.updated_instructions.trim(),
        source_utterance: lastUserMessage,
      };
    }

    const mappedLines = Array.isArray(parsed.lines)
      ? parsed.lines.map((l: Record<string, unknown>) => {
          const rawLine: QuoteLine = {
            id: crypto.randomUUID(),
            catalog_ref: l.catalog_ref ? String(l.catalog_ref) : undefined,
            designation: String(l.designation ?? "Ouvrage / Article"),
            quantity: Math.max(0, Number(l.quantity ?? 1) || 1),
            unit: String(l.unit ?? "u"),
            unit_price_ht: Math.max(0, Number(l.unit_price_ht ?? 0) || 0),
            vat_rate: Number(l.vat_rate ?? defaultVat) || defaultVat,
          };
          return enrichLineFromCatalog(rawLine, relevantCatalog);
        })
      : body.currentDraft.lines;

    const payload: AgentApiPayload = {
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : "J'ai mis à jour le chiffrage et ventilé les heures/matériaux. Confirmez-vous ces éléments ?",
      client_name:
        typeof parsed.client_name === "string"
          ? parsed.client_name
          : body.currentDraft.client_name,
      client_email:
        typeof parsed.client_email === "string"
          ? parsed.client_email
          : body.currentDraft.client_email,
      client_phone:
        typeof parsed.client_phone === "string"
          ? parsed.client_phone
          : body.currentDraft.client_phone,
      site_address:
        typeof parsed.site_address === "string"
          ? parsed.site_address
          : body.currentDraft.site_address,
      parent_project_ref:
        typeof parsed.parent_project_ref === "string" && parsed.parent_project_ref.trim()
          ? parsed.parent_project_ref.trim()
          : body.currentDraft.parent_project_ref,
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title
          : body.currentDraft.title,
      notes:
        typeof parsed.notes === "string" ? parsed.notes : body.currentDraft.notes,
      intake_data: mergedIntake,
      proposed_skill_update: proposedSkillUpdate,
      ready_to_validate: Boolean(parsed.ready_to_validate),
      lines: mappedLines,
      provider: "mistral",
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function simulateLocalSkill(
  messages: ChatMessage[],
  currentDraft: QuoteDraft,
  catalog: CatalogItem[],
  tradeSkill: TradeSkill | undefined,
  verifiedRole: UserRole,
  canManageRules: boolean
): AgentApiPayload {
  const lastMsg = messages[messages.length - 1]?.content ?? "";
  const lower = lastMsg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const isAvenantTs = currentDraft.document_type === "avenant_ts";

  const isRuleIntent =
    /\b(desormais|dorenavant|retiens|memorise|ajoute dans les instructions|consigne metier|regle metier|impose toujours|systematiquement)\b/.test(
      lower
    );

  if (isRuleIntent && tradeSkill) {
    if (!canManageRules) {
      return {
        reply: `Votre profil (${verifiedRole}) ne dispose pas des droits pour modifier les instructions permanentes du métier « ${tradeSkill.name} ». Seul un Directeur Commercial ou Administrateur peut actualiser les règles globales.`,
        client_name: currentDraft.client_name,
        client_email: currentDraft.client_email,
        client_phone: currentDraft.client_phone,
        site_address: currentDraft.site_address,
        parent_project_ref: currentDraft.parent_project_ref,
        title: currentDraft.title,
        notes: currentDraft.notes,
        intake_data: currentDraft.intake_data,
        proposed_skill_update: null,
        lines: currentDraft.lines,
        ready_to_validate: false,
        provider: "demo-fallback",
      };
    }

    const cleanedRule = lastMsg
      .replace(/^(désormais|desormais|dorénavant|retiens que|retiens|consigne métier\s*:?)\s*/i, "")
      .trim();
    const updatedInstructions = `${tradeSkill.system_instructions.replace(/\s+$/, "")} Règle ajoutée : ${
      cleanedRule.endsWith(".") ? cleanedRule : `${cleanedRule}.`
    }`;

    return {
      reply: `J'ai préparé la mise à jour des instructions du métier « ${tradeSkill.name} ». Cliquez sur « Appliquer au Skill Métier » juste en dessous pour l'enregistrer.`,
      client_name: currentDraft.client_name,
      client_email: currentDraft.client_email,
      client_phone: currentDraft.client_phone,
      site_address: currentDraft.site_address,
      parent_project_ref: currentDraft.parent_project_ref,
      title: currentDraft.title,
      notes: currentDraft.notes,
      intake_data: currentDraft.intake_data,
      proposed_skill_update: {
        trade_slug: tradeSkill.slug,
        summary: `Ajout de la consigne : « ${cleanedRule} »`,
        updated_instructions: updatedInstructions,
        source_utterance: lastMsg,
      },
      lines: currentDraft.lines,
      ready_to_validate: false,
      provider: "demo-fallback",
    };
  }

  const isConfirm =
    /\b(oui|ok|parfait|valide|confirme|c'est bon|enregistre)\b/.test(lower) &&
    currentDraft.lines.length > 0;

  if (isConfirm) {
    return {
      reply: isAvenantTs
        ? "Avenant TS prêt ! Faites signer le Bon pour accord directement sur l'écran du téléphone avant exécution."
        : "Parfait, devis validé ! Les heures et fournitures sont ventilées pour l'ERP. Vous pouvez faire signer ou envoyer le PDF.",
      client_name: currentDraft.client_name,
      client_email: currentDraft.client_email,
      client_phone: currentDraft.client_phone,
      site_address: currentDraft.site_address,
      parent_project_ref: currentDraft.parent_project_ref,
      title: currentDraft.title,
      notes: currentDraft.notes,
      intake_data: currentDraft.intake_data,
      proposed_skill_update: null,
      lines: currentDraft.lines,
      ready_to_validate: true,
      provider: "demo-fallback",
    };
  }

  // Changement global de TVA demandé
  if (/passe la tva a (10|5[.,]5|20)\s*%/.test(lower) && currentDraft.lines.length > 0) {
    const m = lower.match(/passe la tva a (10|5[.,]5|20)/);
    const nextVat = m ? Number(m[1].replace(",", ".")) : 10;
    const updatedVatLines = currentDraft.lines.map((l) => ({ ...l, vat_rate: nextVat }));
    return {
      reply: `(Mode démo) Taux de TVA passé à ${nextVat} % sur l'ensemble des lignes.`,
      client_name: currentDraft.client_name,
      client_email: currentDraft.client_email,
      client_phone: currentDraft.client_phone,
      site_address: currentDraft.site_address,
      parent_project_ref: currentDraft.parent_project_ref,
      title: currentDraft.title,
      notes: currentDraft.notes,
      intake_data: currentDraft.intake_data,
      proposed_skill_update: null,
      lines: updatedVatLines,
      ready_to_validate: false,
      provider: "demo-fallback",
    };
  }

  const ancienneteVal = String(currentDraft.intake_data?.anciennete ?? "");
  const inferredVat = ancienneteVal.includes("10%")
    ? 10
    : ancienneteVal.includes("20%")
    ? 20
    : tradeSkill?.default_vat_rate ?? 20;

  let clientName = currentDraft.client_name;
  const clientMatch = lastMsg.match(
    /(?:pour|chez|client)\s+((?:M\.|Mme|Monsieur|Madame|Société)?\s*[A-ZÀ-Ÿ][a-zà-ÿA-ZÀ-Ÿ-]+)/
  );
  if (clientMatch?.[1]) {
    clientName = clientMatch[1].trim();
  }

  let parentProjectRef = currentDraft.parent_project_ref;
  const affMatch = lastMsg.match(/\b(AFF-[A-Z0-9-]+)\b/i);
  if (affMatch?.[1]) {
    parentProjectRef = affMatch[1].toUpperCase();
  }

  const nextLines = [...currentDraft.lines];
  const addedSummary: string[] = [];

  const surfaceFromIntake = Number(
    currentDraft.intake_data?.surface_nette_m2 ||
      currentDraft.intake_data?.surface_murs_m2 ||
      currentDraft.intake_data?.surface_m2 ||
      0
  );
  const pointsFromIntake = Number(currentDraft.intake_data?.nb_points || 0);

  if (lower.includes("fiche d'entrevue") || lower.includes("releve commercial")) {
    const primaryTradeItem = catalog.find(
      (c) => c.trade_slug === (tradeSkill?.slug ?? currentDraft.trade_slug)
    );
    if (primaryTradeItem) {
      const baseQty =
        surfaceFromIntake > 0 && primaryTradeItem.unit === "m²"
          ? Math.ceil(surfaceFromIntake * 1.1)
          : pointsFromIntake > 0 && primaryTradeItem.unit === "u"
          ? pointsFromIntake
          : 1;
      const existingIdx = nextLines.findIndex(
        (l) => l.designation === primaryTradeItem.name
      );
      const enriched = enrichLineFromCatalog(
        {
          id: crypto.randomUUID(),
          catalog_ref: primaryTradeItem.supplier_ref,
          designation: primaryTradeItem.name,
          quantity: baseQty,
          unit: primaryTradeItem.unit,
          unit_price_ht: primaryTradeItem.unit_price_ht,
          vat_rate: inferredVat,
        },
        catalog
      );
      if (existingIdx >= 0) {
        nextLines[existingIdx] = { ...enriched, id: nextLines[existingIdx].id };
      } else {
        nextLines.push(enriched);
      }
      addedSummary.push(`${baseQty} ${primaryTradeItem.unit} de ${primaryTradeItem.name}`);
    }
  }

  const stopWords = new Set([
    "ouvrage",
    "fourni",
    "fournie",
    "pose",
    "posee",
    "avec",
    "pour",
    "dans",
    "forfait",
  ]);

  for (const cat of catalog) {
    const keywords = cat.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w));

    const matched = keywords.some((kw) => lower.includes(kw.slice(0, 5)));
    if (matched) {
      const qtyRegex = new RegExp(
        `(\\d+(?:[.,]\\d+)?)\\s*(?:m2|m²|ml|metres?|m|ens|unites?|heures?|h)?\\s*(?:de\\s+|d')?[^.,;]*${keywords[0].slice(
          0,
          4
        )}`,
        "i"
      );
      const qtyMatch = lower.match(qtyRegex);
      const qty = qtyMatch
        ? Number(qtyMatch[1].replace(",", "."))
        : surfaceFromIntake > 0 && cat.unit === "m²"
        ? Math.ceil(surfaceFromIntake * 1.1)
        : 1;

      const enriched = enrichLineFromCatalog(
        {
          id: crypto.randomUUID(),
          catalog_ref: cat.supplier_ref,
          designation: cat.name,
          quantity: qty,
          unit: cat.unit,
          unit_price_ht: cat.unit_price_ht,
          vat_rate: cat.vat_rate || inferredVat,
        },
        catalog
      );

      const existingIdx = nextLines.findIndex((l) => l.designation === cat.name);
      if (existingIdx >= 0) {
        nextLines[existingIdx] = { ...enriched, id: nextLines[existingIdx].id };
      } else {
        nextLines.push(enriched);
      }
      addedSummary.push(
        `${qty} ${cat.unit} × ${cat.name.replace(/^Ouvrage\s*:\s*/i, "")} (${
          cat.hours_per_unit ?? 0
        }h/${cat.unit} ventilées)`
      );
    }
  }

  const reply =
    addedSummary.length > 0
      ? `(Mode démo) Ajouté avec ventilation analytique auto : ${addedSummary.join(
          " ; "
        )}. Confirmez-vous ou souhaitez-vous ajuster ?`
      : isAvenantTs
      ? `(Mode démo — Avenant TS) Dictez l'imprévu chantier (ex: « 4 ml de tranchée et 3 spots IP65 ») ou scannez un BL fournisseur pour générer le TS à faire signer.`
      : `(Mode démo) Dictez un besoin (ex: « 1 portail coulissant 4m et 12 ml de clôture » ou « tableau 2 rangées + borne IRVE ») pour tester l'éclatement automatique des ouvrages composés !`;

  return {
    reply,
    client_name: clientName,
    client_email: currentDraft.client_email,
    client_phone: currentDraft.client_phone,
    site_address: currentDraft.site_address,
    parent_project_ref: parentProjectRef,
    title: currentDraft.title,
    notes: currentDraft.notes,
    intake_data: currentDraft.intake_data,
    proposed_skill_update: null,
    lines: nextLines,
    ready_to_validate: false,
    provider: "demo-fallback",
  };
}
