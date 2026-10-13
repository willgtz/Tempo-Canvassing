// One-off seed script — creates the Cash HIC template(s): uploads the PDF,
// creates the hic_templates row + an active v1 version, maps its fields,
// and adds the cash_hic package rule (resolved to cash_hic / cash_hic_es
// by language in fill-hic-package.ts).
//
//   node scripts/seed-cash-hic-template.mjs en "HIC Templates/Cash HIC.pdf"
//   node scripts/seed-cash-hic-template.mjs es "HIC Templates/Spanish Cash HIC.pdf"
//
// Spanish coordinates were measured against the uploaded PDF's own label
// positions (pdfjs-dist text content, origin bottom-left — same space as
// pdf-lib's drawText), using the live loan_hic_es mapping as the base:
// the cash doc shares its layout except page 1 drops the monthly payment
// row, page 2 drops the "Celular" row (everything below shifts), and
// page 4's loan-terms table becomes the signing/install/PTO breakdown.
// Verify in the Templates editor (/admin/hics/templates) before enabling
// Cash for reps. Refuses to run twice for the same template key.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function f(page, x, y, field_key, field_type, signer_role, opts = {}) {
  return {
    page,
    x,
    y,
    width: opts.width ?? 120,
    height: opts.height ?? 14,
    field_key,
    field_type,
    signer_role,
    font_size: opts.font_size ?? 10,
    alignment: opts.alignment ?? "left",
    required: opts.required ?? true,
    format: opts.format ?? null,
    show_only_if: opts.show_only_if ?? null,
    sort_order: opts.sort_order ?? 0,
  };
}

const CO = { show_only_if: "has_co_borrower", required: false };

const CASH_HIC_ES_FIELDS = [
  // Page 1 — summary table (no monthly payment row on the cash doc; the
  // last right-column row is the total price)
  f(1, 154.5, 469, "system_size_kw", "text", "none", { format: "kw" }),
  f(1, 441.8, 467.5, "number_of_panels", "text", "none"),
  f(1, 443.3, 448.9, "amount_due_at_signing", "text", "none", { format: "currency" }),
  f(1, 443.3, 428, "est_production_first_year", "text", "none", { format: "kwh" }),
  f(1, 440.3, 388.2, "contract_price", "text", "none", { format: "currency" }),
  f(1, 59.3, 106.5, "customer_name", "text", "none"),
  f(1, 267, 106.5, "customer_signature_p1", "signature", "homeowner"),
  f(1, 474.8, 106.5, "customer_date_p1", "date", "homeowner"),
  f(1, 59.3, 78.5, "co_buyer_name", "text", "none", CO),
  f(1, 267, 78.5, "co_buyer_signature_p1", "signature", "co_borrower", CO),
  f(1, 474.8, 78.5, "co_buyer_date_p1", "date", "co_borrower", CO),
  // Page 2 — language ack (+15.2 vs loan), buyer table (no Celular row),
  // install address (+37 vs loan)
  f(2, 60, 367.2, "language_checkbox", "checkbox", "none", { width: 10, height: 10 }),
  f(2, 313.5, 366.9, "buyer_initials", "initials", "homeowner", { width: 60 }),
  f(2, 438.8, 366.9, "co_buyer_initials", "initials", "co_borrower", { width: 60, ...CO }),
  f(2, 163.5, 289.5, "primary_buyer_name", "text", "none"),
  f(2, 163.5, 267.7, "primary_buyer_phone", "text", "none"),
  f(2, 163.5, 246.0, "primary_buyer_email", "text", "none"),
  f(2, 363.8, 289.5, "co_buyer_name", "text", "none", CO),
  f(2, 363.8, 267.7, "co_buyer_phone", "text", "none", CO),
  f(2, 363.8, 246.0, "co_buyer_email", "text", "none", CO),
  f(2, 163.5, 186.3, "install_street", "text", "none", { width: 300 }),
  f(2, 163.5, 164.6, "install_city", "text", "none"),
  f(2, 163.5, 142.8, "install_state", "text", "none"),
  f(2, 163.5, 121.1, "install_zip", "text", "none"),
  // Page 3 — system details (+23.5 vs loan)
  f(3, 269.3, 681.8, "panel_brand", "text", "none", { width: 250 }),
  f(3, 269.3, 660.8, "number_of_panels", "text", "none"),
  f(3, 269.3, 639.8, "system_size_dc", "text", "none", { format: "kw" }),
  f(3, 269.3, 618.8, "est_first_year_production_p3", "text", "none", { format: "kwh" }),
  f(3, 54, 423.0, "notes", "text", "none", { width: 500, height: 82, font_size: 9, required: false }),
  // Page 4 — contract price (after the printed "$") + payment breakdown
  f(4, 370, 278.7, "contract_price", "text", "none", { format: "currency_no_symbol", font_size: 11 }),
  f(4, 363, 175.0, "amount_due_at_signing", "text", "none", { format: "currency" }),
  f(4, 363, 153.3, "amount_due_at_install", "text", "none", { format: "currency" }),
  f(4, 363, 131.5, "amount_due_at_pto", "text", "none", { format: "currency" }),
  // Page 5 — signatures (identical to loan)
  f(5, 132.8, 180.8, "buyer_name_p5", "text", "none"),
  f(5, 293.3, 180.8, "buyer_signature_p5", "signature", "homeowner"),
  f(5, 486, 180.8, "buyer_date_p5", "date", "homeowner"),
  f(5, 132.8, 149.3, "co_buyer_name_p5", "text", "none", CO),
  f(5, 293.3, 149.3, "co_buyer_signature_p5", "signature", "co_borrower", CO),
  f(5, 486, 149.3, "co_buyer_date_p5", "date", "co_borrower", CO),
  f(5, 132.8, 117.8, "rep_name_p5", "text", "none"),
  f(5, 293.3, 117.8, "rep_signature_p5", "signature", "rep"),
  f(5, 486, 117.8, "rep_date_p5", "date", "rep"),
  // Page 7 — e-signature authorization (-1.5 vs loan)
  f(7, 174.8, 103.3, "customer_name_p7", "text", "none"),
  f(7, 309.8, 103.3, "customer_signature_p7", "signature", "homeowner"),
  f(7, 475.5, 103.3, "customer_date_p7", "date", "homeowner"),
  f(7, 174.8, 78.5, "rep_name_p7", "text", "none"),
  f(7, 309.8, 78.5, "rep_signature_p7", "signature", "rep"),
  f(7, 475.5, 78.5, "rep_date_p7", "date", "rep"),
].map((field, i) => ({ ...field, sort_order: i }));

// English measured the same way against the live loan_hic mapping: pages
// 1-4 share the loan layout (page 1 drops the monthly payment row; page
// 4's loan table becomes the payment breakdown), while the signature
// blocks sit 31.3pt lower on page 5 and 18.2pt higher on page 7.
const CASH_HIC_EN_FIELDS = [
  // Page 1 — summary table + acknowledgment signature block
  f(1, 154.5, 482.5, "system_size_kw", "text", "none", { format: "kw" }),
  f(1, 430, 482.2, "number_of_panels", "text", "none"),
  f(1, 430, 465.1, "amount_due_at_signing", "text", "none", { format: "currency" }),
  f(1, 430, 447.6, "est_production_first_year", "text", "none", { format: "kwh" }),
  f(1, 430, 412.7, "contract_price", "text", "none", { format: "currency" }),
  f(1, 59.3, 154.4, "customer_name", "text", "none"),
  f(1, 267, 154.4, "customer_signature_p1", "signature", "homeowner"),
  f(1, 474.8, 154.4, "customer_date_p1", "date", "homeowner"),
  f(1, 59.3, 126.4, "co_buyer_name", "text", "none", CO),
  f(1, 267, 126.4, "co_buyer_signature_p1", "signature", "co_borrower", CO),
  f(1, 474.8, 126.4, "co_buyer_date_p1", "date", "co_borrower", CO),
  // Page 2 — identical to loan (keeps the Cell row, filled with the one
  // phone number collected)
  f(2, 60, 352, "language_checkbox", "checkbox", "none", { width: 10, height: 10 }),
  f(2, 313.5, 351.7, "buyer_initials", "initials", "homeowner", { width: 60 }),
  f(2, 438.8, 351.7, "co_buyer_initials", "initials", "co_borrower", { width: 60, ...CO }),
  f(2, 163.5, 274.3, "primary_buyer_name", "text", "none"),
  f(2, 163.5, 252.5, "primary_buyer_phone", "text", "none"),
  f(2, 163.5, 230.8, "primary_buyer_phone", "text", "none"),
  f(2, 163.5, 209.0, "primary_buyer_email", "text", "none"),
  f(2, 363.8, 274.3, "co_buyer_name", "text", "none", CO),
  f(2, 363.8, 252.5, "co_buyer_phone", "text", "none", CO),
  f(2, 363.8, 230.8, "co_buyer_phone", "text", "none", CO),
  f(2, 363.8, 209.0, "co_buyer_email", "text", "none", CO),
  f(2, 163.5, 149.3, "install_street", "text", "none", { width: 300 }),
  f(2, 163.5, 127.6, "install_city", "text", "none"),
  f(2, 163.5, 105.8, "install_state", "text", "none"),
  f(2, 163.5, 84.1, "install_zip", "text", "none"),
  // Page 3 — identical to loan
  f(3, 269.3, 658.3, "panel_brand", "text", "none", { width: 250 }),
  f(3, 269.3, 637.3, "number_of_panels", "text", "none"),
  f(3, 269.3, 616.3, "system_size_dc", "text", "none", { format: "kw" }),
  f(3, 269.3, 595.3, "est_first_year_production_p3", "text", "none", { format: "kwh" }),
  f(3, 54, 399.6, "notes", "text", "none", { width: 500, height: 82, font_size: 9, required: false }),
  // Page 4 — contract price + payment breakdown
  f(4, 370, 292.1, "contract_price", "text", "none", { format: "currency_no_symbol", font_size: 11 }),
  f(4, 363, 188.5, "amount_due_at_signing", "text", "none", { format: "currency" }),
  f(4, 363, 166.7, "amount_due_at_install", "text", "none", { format: "currency" }),
  f(4, 363, 145.0, "amount_due_at_pto", "text", "none", { format: "currency" }),
  // Page 5 — signatures
  f(5, 132.8, 221.0, "buyer_name_p5", "text", "none"),
  f(5, 293.3, 221.0, "buyer_signature_p5", "signature", "homeowner"),
  f(5, 486, 221.0, "buyer_date_p5", "date", "homeowner"),
  f(5, 132.8, 189.5, "co_buyer_name_p5", "text", "none", CO),
  f(5, 293.3, 189.5, "co_buyer_signature_p5", "signature", "co_borrower", CO),
  f(5, 486, 189.5, "co_buyer_date_p5", "date", "co_borrower", CO),
  f(5, 132.8, 154.7, "rep_name_p5", "text", "none"),
  f(5, 293.3, 154.7, "rep_signature_p5", "signature", "rep"),
  f(5, 486, 154.7, "rep_date_p5", "date", "rep"),
  // Page 7 — e-signature authorization
  f(7, 174.8, 116.7, "customer_name_p7", "text", "none"),
  f(7, 309.8, 116.7, "customer_signature_p7", "signature", "homeowner"),
  f(7, 475.5, 116.7, "customer_date_p7", "date", "homeowner"),
  f(7, 174.8, 92.0, "rep_name_p7", "text", "none"),
  f(7, 309.8, 92.0, "rep_signature_p7", "signature", "rep"),
  f(7, 475.5, 92.0, "rep_date_p7", "date", "rep"),
].map((field, i) => ({ ...field, sort_order: i }));

const TEMPLATES = {
  en: { key: "cash_hic", label: "Cash HIC English", language: "en", fields: CASH_HIC_EN_FIELDS },
  es: { key: "cash_hic_es", label: "Cash HIC Spanish", language: "es", fields: CASH_HIC_ES_FIELDS },
};

async function main() {
  const [lang, pdfPath] = process.argv.slice(2);
  const spec = TEMPLATES[lang];
  if (!spec || !pdfPath) {
    console.error(`Usage: node scripts/seed-cash-hic-template.mjs <${Object.keys(TEMPLATES).join("|")}> <pdf path>`);
    process.exit(1);
  }

  const { data: cash, error: cashError } = await admin.from("hic_financing_types").select("id").eq("key", "cash").single();
  if (cashError || !cash) throw new Error("Cash financing type not found.");

  const { data: existing } = await admin.from("hic_templates").select("id").eq("key", spec.key).maybeSingle();
  if (existing) throw new Error(`Template ${spec.key} already exists — edit it in /admin/hics/templates instead.`);

  const bytes = readFileSync(pdfPath);
  const storagePath = `templates/${spec.key}/v1.pdf`;
  const { error: uploadError } = await admin.storage
    .from("hic-documents")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: template, error: templateError } = await admin
    .from("hic_templates")
    .insert({ key: spec.key, label: spec.label, language: spec.language, financing_type_id: cash.id })
    .select("id")
    .single();
  if (templateError) throw new Error(`Template insert failed: ${templateError.message}`);

  const { data: version, error: versionError } = await admin
    .from("hic_template_versions")
    .insert({ template_id: template.id, version: 1, storage_path: storagePath, page_count: 7, is_active: true })
    .select("id")
    .single();
  if (versionError) throw new Error(`Version insert failed: ${versionError.message}`);

  const { error: fieldsError } = await admin
    .from("hic_template_fields")
    .insert(spec.fields.map((field) => ({ ...field, template_version_id: version.id })));
  if (fieldsError) throw new Error(`Fields insert failed: ${fieldsError.message}`);

  // One rule covers both languages (the "cash_hic" sentinel resolves per
  // language) — only add it the first time.
  const { data: rule } = await admin.from("hic_package_rules").select("id").eq("template_key", "cash_hic").maybeSingle();
  if (!rule) {
    const { error: ruleError } = await admin.from("hic_package_rules").insert({
      template_key: "cash_hic",
      financing_type_id: cash.id,
      condition_type: "always",
      is_enabled: true,
      sort_order: 4,
    });
    if (ruleError) throw new Error(`Package rule insert failed: ${ruleError.message}`);
  }

  console.log(`Created ${spec.key} (version ${version.id}) with ${spec.fields.length} fields.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
