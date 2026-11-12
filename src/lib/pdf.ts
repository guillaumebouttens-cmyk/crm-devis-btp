import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeLineTotalHt, computeQuoteTotals, formatCurrency } from "./quote-calc";
import type { IntakeFieldDefinition, QuoteDraft } from "./types";

export function buildQuotePdf(
  draft: QuoteDraft,
  intakeFields: IntakeFieldDefinition[] = []
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const totals = computeQuoteTotals(draft.lines);
  const today = new Date().toLocaleDateString("fr-FR");
  const validUntil = new Date(Date.now() + 30 * 86400_000).toLocaleDateString("fr-FR");
  const isAvenantTs = draft.document_type === "avenant_ts";

  // Bandeau d'en-tête différencié Devis vs Avenant TS Chantier
  if (isAvenantTs) {
    doc.setFillColor(120, 53, 15); // Ambre foncé chantier
  } else {
    doc.setFillColor(15, 23, 42);
  }
  doc.rect(0, 0, 210, 34, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isAvenantTs ? 15 : 20);
  doc.text(
    isAvenantTs ? "AVENANT — TRAVAUX SUPPLÉMENTAIRES" : "DEVIS",
    15,
    17
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const refSubtitle =
    isAvenantTs && draft.parent_project_ref
      ? `N° ${draft.quote_number}  •  Affaire rattachée : ${draft.parent_project_ref}`
      : `N° ${draft.quote_number}`;
  doc.text(refSubtitle, 15, 26);
  doc.text(`Date : ${today}  |  Validité : ${validUntil}`, 195, 17, { align: "right" });

  // Bloc Client & Chantier
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("CLIENT & CHANTIER", 118, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  let clientY = 50;
  doc.text(draft.client_name || "Client à préciser", 118, clientY);
  if (draft.client_phone) {
    clientY += 5;
    doc.setTextColor(71, 85, 105);
    doc.text(`Tél : ${draft.client_phone}`, 118, clientY);
  }
  if (draft.client_email) {
    clientY += 5;
    doc.setTextColor(71, 85, 105);
    doc.text(draft.client_email, 118, clientY);
  }
  if (draft.site_address) {
    clientY += 5;
    doc.setTextColor(71, 85, 105);
    const addrLines = doc.splitTextToSize(`Chantier : ${draft.site_address}`, 77);
    doc.text(addrLines, 118, clientY);
    clientY += (addrLines.length - 1) * 4.5;
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const titleLines = doc.splitTextToSize(
    `Objet : ${draft.title || (isAvenantTs ? "Travaux supplémentaires en cours de chantier" : "Proposition commerciale")}`,
    95
  );
  doc.text(titleLines, 15, 50);

  let currentY = Math.max(64, clientY + 8, 50 + titleLines.length * 5.5 + 4);

  // Encadré optionnel : Relevé d'entrevue commerciale
  if (draft.include_intake_on_pdf && draft.intake_data) {
    const filledEntries = Object.entries(draft.intake_data).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null
    );

    if (filledEntries.length > 0) {
      const labelMap = new Map(intakeFields.map((f) => [f.id, f.label]));
      const summaryItems = filledEntries.map(([key, val]) => {
        const label = labelMap.get(key) ?? key;
        const formattedVal =
          typeof val === "boolean" ? (val ? "Oui" : "Non") : String(val);
        return `${label} : ${formattedVal}`;
      });

      const summaryText = summaryItems.join("   •   ");
      const wrappedSummary = doc.splitTextToSize(summaryText, 174);
      const boxHeight = 9 + wrappedSummary.length * 4.5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, currentY, 180, boxHeight, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text("RELEVÉ TECHNIQUE & CONTRAINTES CHANTIER :", 18, currentY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(wrappedSummary, 18, currentY + 10);

      currentY += boxHeight + 6;
    }
  }

  // Tableau des lignes (avec descriptif technique des ouvrages composés sans dévoiler les coûts !)
  const showOuvrageDetail = draft.include_ouvrage_detail_on_pdf ?? true;
  autoTable(doc, {
    startY: currentY,
    head: [["Désignation des ouvrages & prestations", "Qté", "Unité", "PU HT", "TVA", "Total HT"]],
    body: draft.lines.map((line) => {
      let label = line.designation;
      if (
        showOuvrageDetail &&
        line.item_kind === "ouvrage" &&
        line.components &&
        line.components.length > 0
      ) {
        const includedList = line.components
          .map((c) => `  • Inclus : ${c.label}`)
          .join("\n");
        label = `${line.designation}\n${includedList}`;
      }
      return [
        label,
        String(line.quantity),
        line.unit,
        formatCurrency(line.unit_price_ht),
        `${line.vat_rate} %`,
        formatCurrency(computeLineTotalHt(line)),
      ];
    }),
    styles: {
      fontSize: 9,
      cellPadding: 3.5,
    },
    headStyles: {
      fillColor: isAvenantTs ? [146, 64, 14] : [30, 41, 59],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "right", cellWidth: 25 },
      4: { halign: "right", cellWidth: 18 },
      5: { halign: "right", cellWidth: 27 },
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    currentY + 40;
  let y = Math.min(finalY + 10, 236);

  // Récapitulatif HT / TVA / TTC
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text("Total HT :", 135, y);
  doc.text(formatCurrency(totals.totalHt), 195, y, { align: "right" });

  for (const bucket of totals.vatBreakdown) {
    y += 6;
    doc.text(`TVA (${bucket.rate} %) :`, 135, y);
    doc.text(formatCurrency(bucket.vatAmount), 195, y, { align: "right" });
  }

  y += 8;
  doc.setFillColor(241, 245, 249);
  doc.rect(130, y - 5.5, 68, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Total TTC :", 135, y);
  doc.text(formatCurrency(totals.totalTtc), 195, y, { align: "right" });

  // Notes & Bon pour accord (avec signature tactile intégrée si signée sur mobile)
  let notesY = finalY + 10;
  if (draft.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("Conditions & Notes :", 15, notesY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const wrapped = doc.splitTextToSize(draft.notes, 105);
    doc.text(wrapped, 15, notesY + 5);
    notesY += 8 + wrapped.length * 4.5;
  }

  const signY = Math.max(y + 14, notesY + 8);
  if (signY < 262) {
    doc.setDrawColor(203, 213, 225);
    doc.rect(15, signY, 95, 28);
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.text("Bon pour accord — Signature du client :", 18, signY + 5.5);

    if (draft.signature?.data_url) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const signedDate = new Date(draft.signature.signed_at).toLocaleString("fr-FR");
      doc.text(
        `Signé électroniquement par ${draft.signature.signer_name} le ${signedDate}`,
        18,
        signY + 10
      );
      try {
        doc.addImage(draft.signature.data_url, "PNG", 22, signY + 11, 55, 15);
      } catch {
        // Ignore image error if malformed
      }
    }
  }

  return doc;
}

export function downloadQuotePdf(
  draft: QuoteDraft,
  intakeFields: IntakeFieldDefinition[] = []
): string {
  const doc = buildQuotePdf(draft, intakeFields);
  const safeClient = (draft.client_name || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = `${draft.quote_number}-${safeClient || "devis"}.pdf`;
  doc.save(fileName);
  return fileName;
}

export async function shareOrEmailQuotePdf(
  draft: QuoteDraft,
  intakeFields: IntakeFieldDefinition[] = []
): Promise<"shared" | "emailed"> {
  const doc = buildQuotePdf(draft, intakeFields);
  const totals = computeQuoteTotals(draft.lines);
  const isAvenantTs = draft.document_type === "avenant_ts";
  const docLabel = isAvenantTs ? "avenant TS" : "devis";
  const safeClient = (draft.client_name || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = `${draft.quote_number}-${safeClient || docLabel}.pdf`;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const blob = doc.output("blob");
    const file = new File([blob], fileName, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `${isAvenantTs ? "Avenant TS" : "Devis"} ${draft.quote_number}`,
        text: `Bonjour ${draft.client_name || ""}, veuillez trouver ci-joint votre ${docLabel} ${draft.quote_number} d'un montant de ${formatCurrency(totals.totalTtc)} TTC.`,
        files: [file],
      });
      return "shared";
    }
  }

  doc.save(fileName);
  const subject = encodeURIComponent(
    `Votre ${docLabel} ${draft.quote_number} — ${draft.title || "Proposition"}`
  );
  const body = encodeURIComponent(
    `Bonjour ${draft.client_name || ""},\n\nVeuillez trouver en pièce jointe votre ${docLabel} ${draft.quote_number} (${draft.title || "Prestation"}) pour un montant total de ${formatCurrency(totals.totalTtc)} TTC.\n\nN'hésitez pas à revenir vers nous pour toute question.\n\nCordialement`
  );
  window.location.href = `mailto:${draft.client_email || ""}?subject=${subject}&body=${body}`;
  return "emailed";
}
