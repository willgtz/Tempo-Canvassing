import "server-only";
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "crypto";
import { fillHicPackage, resolveApplicableTemplateKeys } from "./fill-hic-package";
import { uploadHicDocument } from "../storage";
import { formatDocumentDate } from "../format";
import { parseUserAgent } from "../parse-user-agent";
import type { Hic, HicSigner } from "@/app/appointments/send-hic/types";

const TEMPLATE_LABELS: Record<string, string> = {
  hic_en: "Home Improvement Contract (English)",
  hic_es: "Home Improvement Contract (Spanish)",
  lightreach_equipment_supplement: "LightReach Equipment Supplement",
  henderson_form: "City of Henderson PV Permit Authorization",
};

export type CompletionResult = { storagePath: string; sha256: string };

// Called once the last signer finishes. Re-stamps the full package with
// every signature now in place, computes the SHA-256 of that (BEFORE
// the certificate page is appended — a hash can't include a page that
// quotes itself), appends a Certificate of Completion page, and stores
// the result as the immutable final signed document.
export async function completeHic(hic: Hic, signers: HicSigner[]): Promise<CompletionResult> {
  const applicableKeys = await resolveApplicableTemplateKeys(hic);
  const documents = await fillHicPackage(hic, signers);

  const merged = await PDFDocument.create();
  for (const doc of documents) {
    const src = await PDFDocument.load(doc.bytes);
    const copiedPages = await merged.copyPages(src, src.getPageIndices());
    copiedPages.forEach((p) => merged.addPage(p));
  }
  const preCertificateBytes = await merged.save();
  const sha256 = createHash("sha256").update(preCertificateBytes).digest("hex");

  await appendCertificatePage(merged, hic, signers, applicableKeys, sha256);
  const finalBytes = await merged.save();

  const storagePath = `completed/${hic.id}/signed.pdf`;
  await uploadHicDocument(storagePath, finalBytes);

  return { storagePath, sha256 };
}

async function appendCertificatePage(
  doc: PDFDocument,
  hic: Hic,
  signers: HicSigner[],
  templateKeys: string[],
  sha256: string
): Promise<void> {
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  const marginX = 54;
  const lineHeight = 14;
  let page: PDFPage = doc.addPage([612, 792]);
  let y = 740;

  function ensureSpace() {
    if (y < 70) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
  }

  function drawLine(text: string, opts: { bold?: boolean; size?: number } = {}) {
    ensureSpace();
    page.drawText(text, {
      x: marginX,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? helveticaBold : helvetica,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  }

  drawLine("Certificate of Completion", { bold: true, size: 18 });
  y -= 6;
  drawLine(`HIC ID: ${hic.id}`);
  drawLine(`SHA-256 hash of the signed document: ${sha256}`, { size: 8 });
  y -= 10;

  drawLine("Documents included", { bold: true, size: 12 });
  for (const key of templateKeys) {
    drawLine(`• ${TEMPLATE_LABELS[key] ?? key}`);
  }
  y -= 10;

  drawLine("Parties", { bold: true, size: 12 });
  y -= 2;

  // Rep — auto-countersigned, not a hic_signers row of its own.
  drawLine(`${hic.sales_rep_name} — Sales Representative`, { bold: true });
  drawLine(`Signature auto-applied on send by ${hic.sales_rep_name} under company e-signature authorization.`);
  y -= 8;

  for (const signer of signers) {
    const roleLabel = signer.role === "homeowner" ? "Homeowner" : "Co-Borrower";
    drawLine(`${signer.full_name} — ${roleLabel} (${signer.email})`, { bold: true });
    drawLine(`Sent: ${formatCertTimestamp(signer.sent_at)}`);
    drawLine(`Viewed: ${formatCertTimestamp(signer.viewed_at)}`);
    drawLine(`Signed: ${formatCertTimestamp(signer.signed_at)}`);
    drawLine(`Consent to electronic signature: ${formatCertTimestamp(signer.consent_at)}`);
    drawLine(`IP address: ${signer.ip_address ?? "—"}`);
    drawLine(`Device/browser: ${parseUserAgent(signer.user_agent ?? "")}`);
    y -= 8;
  }
}

function formatCertTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const dateStr = formatDocumentDate(date);
  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/Los_Angeles",
  }).format(date);
  return `${dateStr} ${timeStr} Pacific`;
}
