import { NextResponse } from "next/server";
import { round2 } from "@/lib/quote-calc";
import type { CostNature, ScannedBlLine, ScannedBlRecord } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      imageDataUrl?: string;
      fileName?: string;
      defaultProjectRef?: string;
      tradeSlug?: string;
    };

    const apiKey = process.env.MISTRAL_API_KEY ?? "";
    const visionModel = process.env.MISTRAL_VISION_MODEL || "pixtral-12b-2409";
    const hasMistralKey = Boolean(apiKey) && !apiKey.includes("votre_cle");

    if (!hasMistralKey || !body.imageDataUrl?.startsWith("data:image/")) {
      const demo = buildDemoScannedBl(
        body.fileName,
        body.defaultProjectRef,
        body.tradeSlug
      );
      return NextResponse.json(demo);
    }

    const systemPrompt = `Tu es l'extracteur OCR BTP d'un ERP (table erp.achats_bl).
Analyse la photo du Bon de Livraison (BL) ou de la facture fournisseur chantier.
Réponds UNIQUEMENT avec un JSON valide respectant strictement cette structure :
{
  "supplier_name": "Nom du négoce ou fournisseur (ex: Rexel, Point.P, Cedeo, Frans Bonhomme)",
  "bl_number": "Numéro du BL",
  "bl_date": "YYYY-MM-DD",
  "project_ref": "Référence chantier si visible sinon vide",
  "lines": [
    {
      "designation": "Désignation claire de l'article livré",
      "quantity": 1,
      "unit": "u",
      "unit_cost_ht": 25.5,
      "cost_nature": "matiere"
    }
  ]
}
Où cost_nature vaut "matiere", "materiel", "sous_traitance" ou "autres_frais".`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: visionModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrais toutes les informations de ce Bon de Livraison chantier.",
              },
              {
                type: "image_url",
                image_url: body.imageDataUrl,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Erreur Pixtral Vision (${response.status}): ${errText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawContent);

    const validNatures: CostNature[] = [
      "matiere",
      "materiel",
      "sous_traitance",
      "autres_frais",
      "heures",
    ];

    const lines: ScannedBlLine[] = Array.isArray(parsed.lines)
      ? parsed.lines.map((l: Record<string, unknown>) => ({
          designation: String(l.designation ?? "Fourniture BL"),
          quantity: Math.max(0, Number(l.quantity ?? 1) || 1),
          unit: String(l.unit ?? "u"),
          unit_cost_ht: Math.max(0, Number(l.unit_cost_ht ?? 0) || 0),
          cost_nature: validNatures.includes(l.cost_nature as CostNature)
            ? (l.cost_nature as CostNature)
            : "matiere",
        }))
      : [];

    const totalCostHt = round2(
      lines.reduce((acc, l) => acc + l.quantity * l.unit_cost_ht, 0)
    );

    const result: ScannedBlRecord = {
      id: crypto.randomUUID(),
      supplier_name: String(parsed.supplier_name || "Fournisseur BTP"),
      bl_number: String(
        parsed.bl_number || `BL-${Math.floor(10000 + Math.random() * 90000)}`
      ),
      bl_date:
        typeof parsed.bl_date === "string" && parsed.bl_date
          ? parsed.bl_date
          : new Date().toISOString().slice(0, 10),
      project_ref: String(
        parsed.project_ref || body.defaultProjectRef || "AFF-2026-042"
      ),
      total_cost_ht: totalCostHt,
      lines,
      provider: "pixtral",
      created_at: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur OCR BL";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildDemoScannedBl(
  fileName?: string,
  defaultProjectRef?: string,
  tradeSlug?: string
): ScannedBlRecord {
  const today = new Date().toISOString().slice(0, 10);

  if (tradeSlug === "menuiserie-ext") {
    const lines: ScannedBlLine[] = [
      {
        designation: "Jeu de photocellules orientables + feu clignotant LED",
        quantity: 1,
        unit: "kit",
        unit_cost_ht: 84,
        cost_nature: "matiere",
      },
      {
        designation: "Couronne fourreau TPC rouge Ø63 (25m) + grillage avertisseur",
        quantity: 1,
        unit: "rouleau",
        unit_cost_ht: 46,
        cost_nature: "matiere",
      },
      {
        designation: "Location découpeuse thermique disque diamant 1j",
        quantity: 1,
        unit: "j",
        unit_cost_ht: 65,
        cost_nature: "materiel",
      },
    ];
    return {
      id: crypto.randomUUID(),
      supplier_name: "POINT.P / Négoce Fermetures",
      bl_number: "BL-PP-89412",
      bl_date: today,
      project_ref: defaultProjectRef || "AFF-FENBAT-2026-18",
      total_cost_ht: 195,
      lines,
      provider: "demo-ocr",
      created_at: new Date().toISOString(),
    };
  }

  const lines: ScannedBlLine[] = [
    {
      designation: `Coffret étanche Plexo IP65 8 modules (${fileName || "photo BL"})`,
      quantity: 1,
      unit: "u",
      unit_cost_ht: 34.5,
      cost_nature: "matiere",
    },
    {
      designation: "Couronne câble R2V 3G2.5mm² (25m)",
      quantity: 1,
      unit: "couronne",
      unit_cost_ht: 41.25,
      cost_nature: "matiere",
    },
    {
      designation: "Disjoncteur différentiel 40A 30mA Type A",
      quantity: 1,
      unit: "u",
      unit_cost_ht: 58.0,
      cost_nature: "matiere",
    },
  ];

  return {
    id: crypto.randomUUID(),
    supplier_name: "REXEL FRANCE",
    bl_number: "BL-RX-504819",
    bl_date: today,
    project_ref: defaultProjectRef || "AFF-2026-042",
    total_cost_ht: 133.75,
    lines,
    provider: "demo-ocr",
    created_at: new Date().toISOString(),
  };
}
