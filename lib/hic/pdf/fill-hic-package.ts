import "server-only";
import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { downloadHicDocument } from "../storage";
import {
  formatCurrency,
  formatCurrencyNoSymbol,
  formatDocumentDate,
  formatKw,
  formatKwh,
  formatKwhRate,
  formatPercent,
} from "../format";
import type { Hic, HicSigner } from "@/app/appointments/send-hic/types";

type TemplateField = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  field_key: string;
  field_type: "text" | "signature" | "initials" | "date" | "checkbox" | "static_text";
  signer_role: "homeowner" | "co_borrower" | "rep" | "none";
  font_size: number;
  alignment: "left" | "center" | "right";
  required: boolean;
  format: string | null;
  show_only_if: string | null;
};

// Checked into the repo as a static asset specifically so embedding it
// never depends on a runtime network fetch at send time.
const DANCING_SCRIPT_PATH = path.join(process.cwd(), "lib/hic/fonts/DancingScript-Regular.ttf");

let dancingScriptBytesCache: Buffer | null = null;
function loadDancingScriptBytes(): Buffer {
  if (!dancingScriptBytesCache) dancingScriptBytesCache = readFileSync(DANCING_SCRIPT_PATH);
  return dancingScriptBytesCache;
}

// Equipment supplement defaults — hardcoded here until Phase 5 adds a
// real Settings UI over these (hic_equipment_supplement_defaults table,
// per the plan); resolveFieldValue reads them as a fallback below.
const EQUIPMENT_DEFAULTS: Record<string, string> = {
  inverter_make_model: "SolarEdge, SE11400-USSKBEZ8",
  inverter_quantity: "1",
  racking_manufacturer: "Unirac",
  racking_model: "Unirac Pegasus",
};

// field_keys are shared across templates wherever the same logical value
// applies (e.g. 'panel_brand' appears on both the HIC and the equipment
// supplement) — this is the one place that maps every key back to the
// hics row, regardless of which template/page placed it.
function resolveFieldValue(fieldKey: string, hic: Hic): string | null {
  switch (fieldKey) {
    case "system_size_kw":
    case "system_size_dc":
      return String(hic.system_size_kw);
    case "estimated_tax_credit":
      return String(hic.estimated_tax_credit);
    case "amount_due_at_signing":
      return String(hic.amount_due_at_signing);
    case "est_production_first_year":
    case "est_first_year_production_p3":
      return String(hic.est_production_kwh);
    case "first_year_monthly_payment":
      return String(hic.first_year_monthly_payment);
    case "escalator":
      return String(hic.escalator);
    case "kwh_rate":
      return String(hic.kwh_rate);
    case "contract_price":
      return hic.contract_price != null ? String(hic.contract_price) : null;
    case "customer_name":
    case "customer_name_p7":
    case "primary_buyer_name":
    case "buyer_name_p5":
    case "henderson_owner_name":
    case "supplement_homeowner_name":
      return hic.customer_name;
    case "primary_buyer_phone":
      return hic.customer_phone;
    case "primary_buyer_email":
    case "henderson_email":
      return hic.customer_email;
    case "co_buyer_name":
    case "co_buyer_name_p5":
      return hic.co_borrower_name;
    case "co_buyer_phone":
      return hic.co_borrower_phone;
    case "co_buyer_email":
      return hic.co_borrower_email;
    case "install_street":
      return hic.install_address_line;
    case "install_city":
      return hic.install_city;
    case "install_state":
      return hic.install_state;
    case "install_zip":
      return hic.install_zip;
    case "henderson_phone":
      return hic.customer_phone;
    case "henderson_address":
      return `${hic.install_address_line}, ${hic.install_city}, ${hic.install_state} ${hic.install_zip}`;
    case "henderson_contractor_name":
      return hic.contractor_name;
    case "panel_brand":
      return hic.panel_brand;
    case "number_of_panels":
      return String(hic.number_of_panels);
    case "rep_name_p5":
    case "rep_name_p7":
      return hic.sales_rep_name;
    default:
      return EQUIPMENT_DEFAULTS[fieldKey] ?? null;
  }
}

function applyFormat(raw: string, format: string | null): string {
  if (!format) return raw;
  const num = Number(raw);
  switch (format) {
    case "currency":
      return formatCurrency(num);
    case "currency_no_symbol":
      return formatCurrencyNoSymbol(num);
    case "kw":
      return formatKw(num);
    case "kwh":
      return formatKwh(num);
    case "kwh_rate":
      return formatKwhRate(num);
    case "percent":
      return formatPercent(num);
    default:
      return raw;
  }
}

// Reduces font size until the text fits within maxWidth, down to a
// legibility floor — never overflows its cell, per spec, rather than
// truncating.
function fitFontSize(font: PDFFont, text: string, startSize: number, maxWidth: number): number {
  const MIN_SIZE = 6;
  let size = startSize;
  while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

export type PackageDocument = { templateKey: string; bytes: Uint8Array };

// Which documents apply to this specific HIC, in order — driven
// entirely by hic_package_rules (always the HIC itself; + equipment
// supplement if LightReach; + Henderson form if the install city
// matches). Exported separately from fillHicPackage (not just inlined
// there) because the public signing routes need this same resolution
// order to map each template's field positions into the final MERGED
// document's global page numbers — see resolveSignerFields below.
export async function resolveApplicableTemplateKeys(hic: Hic): Promise<string[]> {
  const supabase = await createClient();

  const { data: rules } = await supabase
    .from("hic_package_rules")
    .select("template_key, financing_type_id, condition_type, city_list, is_enabled, sort_order")
    .eq("is_enabled", true)
    .order("sort_order");

  const installCity = hic.install_city.trim().toLowerCase();
  return (rules ?? [])
    .filter((r) => {
      if (r.financing_type_id && r.financing_type_id !== hic.financing_type_id) return false;
      if (r.condition_type === "city_in_list") {
        return ((r.city_list ?? []) as string[]).map((c) => c.toLowerCase()).includes(installCity);
      }
      return true;
    })
    .map((r) => (r.template_key === "hic" ? `hic_${hic.language}` : r.template_key));
}

// Core stamping function — resolves which documents apply via
// hic_package_rules, then fills each one from the live hics row. Returns
// each document's bytes separately (not merged) — generate-draft-preview.ts
// merges them for a rep-facing preview; Phase 3's complete-hic.ts does
// the final merge + appends the certificate of completion once signed.
//
// `signers` defaults to empty (Phase 2's pre-send/draft callers never
// pass it) — when provided (Phase 3's signing routes, re-generating
// after each signature), any homeowner/co-borrower signer with
// status='signed' gets their stored signature/initials/date stamped in;
// everyone else's fields stay blank, same as before.
export async function fillHicPackage(hic: Hic, signers: HicSigner[] = []): Promise<PackageDocument[]> {
  const applicableKeys = await resolveApplicableTemplateKeys(hic);

  const documents: PackageDocument[] = [];
  for (const templateKey of applicableKeys) {
    documents.push({ templateKey, bytes: await fillSingleTemplate(templateKey, hic, signers) });
  }
  return documents;
}

async function fillSingleTemplate(templateKey: string, hic: Hic, signers: HicSigner[]): Promise<Uint8Array> {
  const supabase = await createClient();

  const { data: template } = await supabase.from("hic_templates").select("id").eq("key", templateKey).single();
  if (!template) throw new Error(`Unknown template: ${templateKey}`);

  const { data: version } = await supabase
    .from("hic_template_versions")
    .select("id, storage_path")
    .eq("template_id", template.id)
    .eq("is_active", true)
    .single();
  if (!version) throw new Error(`No active version for template: ${templateKey}`);

  const { data: fields } = await supabase
    .from("hic_template_fields")
    .select(
      "page, x, y, width, height, field_key, field_type, signer_role, font_size, alignment, required, format, show_only_if"
    )
    .eq("template_version_id", version.id)
    .order("sort_order");

  const originalBytes = await downloadHicDocument(version.storage_path);
  const pdfDoc = await PDFDocument.load(originalBytes);
  pdfDoc.registerFontkit(fontkit);

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const dancingScript = await pdfDoc.embedFont(loadDancingScriptBytes());
  const pages = pdfDoc.getPages();

  // Downloaded/embedded once per signer (not once per field) — the same
  // signer can have 2-3 signature fields across a package (e.g. pages
  // 1, 5, and 7 of the HIC), all showing the identical adopted image.
  const imageCache = new Map<string, PDFImage>();
  async function embedSignerImage(storagePath: string): Promise<PDFImage> {
    const cached = imageCache.get(storagePath);
    if (cached) return cached;
    const bytes = await downloadHicDocument(storagePath);
    const image = await pdfDoc.embedPng(bytes);
    imageCache.set(storagePath, image);
    return image;
  }

  // Draws either a typed (script-font text) or drawn (embedded PNG)
  // signature/initials image within the field's box — images are
  // scaled to fit (preserving aspect ratio) rather than stretched.
  async function drawSignerArtifact(
    page: (typeof pages)[number],
    field: TemplateField,
    text: string | null,
    storagePath: string | null,
    baseFontSize: number
  ) {
    if (storagePath) {
      const image = await embedSignerImage(storagePath);
      const scale = Math.min(field.width / image.width, field.height / image.height, 1);
      page.drawImage(image, { x: field.x, y: field.y, width: image.width * scale, height: image.height * scale });
    } else if (text) {
      const size = fitFontSize(dancingScript, text, baseFontSize, field.width);
      page.drawText(text, { x: field.x, y: field.y, size, font: dancingScript, color: rgb(0, 0, 0.2) });
    }
  }

  function findSignedSigner(role: "homeowner" | "co_borrower"): HicSigner | null {
    return signers.find((s) => s.role === role && s.status === "signed") ?? null;
  }

  for (const field of (fields ?? []) as TemplateField[]) {
    if (field.show_only_if === "has_co_borrower" && !hic.has_co_borrower) continue;

    const page = pages[field.page - 1];
    if (!page) continue;

    if (field.field_type === "checkbox") {
      // Pre-checked for the language this template represents — a
      // language-specific template only ever exists because it was
      // actually the one sent, so there's no conditional here.
      page.drawText("X", { x: field.x, y: field.y, size: field.font_size + 1, font: helvetica, color: rgb(0, 0, 0) });
      continue;
    }

    if (field.field_type === "signature" && field.signer_role === "rep") {
      // The auto-countersign — applied unconditionally at generation
      // time, before any customer has touched the document.
      const size = fitFontSize(dancingScript, hic.sales_rep_name, 18, field.width);
      page.drawText(hic.sales_rep_name, { x: field.x, y: field.y, size, font: dancingScript, color: rgb(0, 0, 0.2) });
      continue;
    }

    if (field.field_type === "date" && field.signer_role === "rep") {
      const text = formatDocumentDate(new Date());
      const size = fitFontSize(helvetica, text, field.font_size, field.width);
      page.drawText(text, { x: field.x, y: field.y, size, font: helvetica, color: rgb(0, 0, 0) });
      continue;
    }

    if (field.field_type === "signature" && (field.signer_role === "homeowner" || field.signer_role === "co_borrower")) {
      const signer = findSignedSigner(field.signer_role);
      if (signer) await drawSignerArtifact(page, field, signer.signature_text, signer.signature_storage_path, 18);
      continue;
    }

    if (field.field_type === "initials" && (field.signer_role === "homeowner" || field.signer_role === "co_borrower")) {
      const signer = findSignedSigner(field.signer_role);
      if (signer) await drawSignerArtifact(page, field, signer.initials_text, signer.initials_storage_path, 14);
      continue;
    }

    if (field.field_type === "date" && (field.signer_role === "homeowner" || field.signer_role === "co_borrower")) {
      const signer = findSignedSigner(field.signer_role);
      if (signer?.signed_at) {
        const text = formatDocumentDate(new Date(signer.signed_at));
        const size = fitFontSize(helvetica, text, field.font_size, field.width);
        page.drawText(text, { x: field.x, y: field.y, size, font: helvetica, color: rgb(0, 0, 0) });
      }
      continue;
    }

    const raw = resolveFieldValue(field.field_key, hic);
    if (raw == null || raw === "") continue;
    const text = applyFormat(raw, field.format);
    const size = fitFontSize(helvetica, text, field.font_size, field.width);
    page.drawText(text, { x: field.x, y: field.y, size, font: helvetica, color: rgb(0, 0, 0) });
  }

  return pdfDoc.save();
}
