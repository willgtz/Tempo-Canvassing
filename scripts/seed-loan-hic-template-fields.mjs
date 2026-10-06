// One-off seed script — populates hic_template_fields for the two real
// Loan HIC templates (loan_hic / hic_sp), measured the same way as
// scripts/seed-hic-template-fields.mjs: exact label coordinates
// extracted via pdfjs-dist text-content (origin bottom-left, matching
// pdf-lib's drawText coordinate space directly). This is a best-effort
// first pass from reading the uploaded PDFs directly, not a live
// rendered-preview check — verify/adjust in the Templates editor
// (/admin/hics/templates) before activating either version.
//
// EN and ES coordinates are NOT the same despite an identical page
// count — Spanish text reflow shifts several rows (e.g. the whole
// Signatures section lands on a different page in each language,
// because a banner paragraph that sits at the bottom of English's
// page 4 sits at the top of Spanish's page 5 instead), so both were
// measured independently rather than reusing English's numbers.
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

const LOAN_HIC_EN_FIELDS = [
  // Page 1 — top summary table (left column: physical specs; right
  // column: dollar figures + Total Loan Amount)
  f(1, 154.5, 482.5, "system_size_kw", "text", "none", { format: "kw" }),
  f(1, 430, 482.2, "number_of_panels", "text", "none"),
  f(1, 430, 465.1, "amount_due_at_signing", "text", "none", { format: "currency" }),
  f(1, 430, 447.6, "est_production_first_year", "text", "none", { format: "kwh" }),
  f(1, 430, 430.2, "first_year_monthly_payment", "text", "none", { format: "currency" }),
  f(1, 430, 412.7, "total_loan_amount", "text", "none", { format: "currency" }),
  // Page 1 — short acknowledgment signature block (Buyer always;
  // Co-Buyer row only if present — unconfirmed row 2 usage, included
  // since the document visibly has 2 blank rows)
  f(1, 59.3, 154.4, "customer_name", "text", "none"),
  f(1, 267.0, 154.4, "customer_signature_p1", "signature", "homeowner"),
  f(1, 474.8, 154.4, "customer_date_p1", "date", "homeowner"),
  f(1, 59.3, 126.4, "co_buyer_name", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(1, 267.0, 126.4, "co_buyer_signature_p1", "signature", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(1, 474.8, 126.4, "co_buyer_date_p1", "date", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  // Page 2
  f(2, 60, 352, "language_checkbox", "checkbox", "none", { width: 10, height: 10 }),
  f(2, 313.5, 351.7, "buyer_initials", "initials", "homeowner", { width: 60 }),
  f(2, 438.8, 351.7, "co_buyer_initials", "initials", "co_borrower", { width: 60, show_only_if: "has_co_borrower", required: false }),
  f(2, 163.5, 274.3, "primary_buyer_name", "text", "none"),
  f(2, 163.5, 252.5, "primary_buyer_phone", "text", "none"),
  f(2, 163.5, 230.8, "primary_buyer_phone", "text", "none"), // "Cell" row — no separate cell number collected, reuses the one phone value
  f(2, 163.5, 209.0, "primary_buyer_email", "text", "none"),
  f(2, 363.8, 274.3, "co_buyer_name", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 363.8, 252.5, "co_buyer_phone", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 363.8, 230.8, "co_buyer_phone", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 363.8, 209.0, "co_buyer_email", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 163.5, 149.3, "install_street", "text", "none", { width: 300 }),
  f(2, 163.5, 127.6, "install_city", "text", "none"),
  f(2, 163.5, 105.8, "install_state", "text", "none"),
  f(2, 163.5, 84.1, "install_zip", "text", "none"),
  // Page 3
  f(3, 269.3, 658.3, "panel_brand", "text", "none", { width: 250 }),
  f(3, 269.3, 637.3, "number_of_panels", "text", "none"),
  f(3, 269.3, 616.3, "system_size_dc", "text", "none", { format: "kw" }),
  f(3, 269.3, 595.3, "est_first_year_production_p3", "text", "none", { format: "kwh" }),
  f(3, 54, 399.6, "notes", "text", "none", { width: 500, height: 82, font_size: 9, required: false }),
  // Page 4 — Pricing + Breakdown ("$" is pre-printed before Contract price)
  f(4, 370, 292.1, "contract_price", "text", "none", { format: "currency_no_symbol", font_size: 11 }),
  f(4, 363.0, 188.5, "fixed_apr", "text", "none", { format: "percent" }),
  f(4, 363.0, 166.7, "loan_term_years", "text", "none"),
  f(4, 363.0, 145.0, "first_year_monthly_payment", "text", "none", { format: "currency" }),
  f(4, 363.0, 123.2, "payment_after_36_months", "text", "none", { format: "currency" }),
  // Page 5 — main Signatures block
  f(5, 132.8, 252.3, "buyer_name_p5", "text", "none"),
  f(5, 293.3, 252.3, "buyer_signature_p5", "signature", "homeowner"),
  f(5, 486.0, 252.3, "buyer_date_p5", "date", "homeowner"),
  f(5, 132.8, 220.8, "co_buyer_name_p5", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(5, 293.3, 220.8, "co_buyer_signature_p5", "signature", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(5, 486.0, 220.8, "co_buyer_date_p5", "date", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(5, 132.8, 186, "rep_name_p5", "text", "none"),
  f(5, 293.3, 186, "rep_signature_p5", "signature", "rep"),
  f(5, 486.0, 186, "rep_date_p5", "date", "rep"),
  // Page 7 — Electronic Signature Authorization
  f(7, 174.8, 98.5, "customer_name_p7", "text", "none"),
  f(7, 309.8, 98.5, "customer_signature_p7", "signature", "homeowner"),
  f(7, 475.5, 98.5, "customer_date_p7", "date", "homeowner"),
  f(7, 174.8, 73.7, "rep_name_p7", "text", "none"),
  f(7, 309.8, 73.7, "rep_signature_p7", "signature", "rep"),
  f(7, 475.5, 73.7, "rep_date_p7", "date", "rep"),
];

const LOAN_HIC_ES_FIELDS = [
  // Page 1
  f(1, 154.5, 469.0, "system_size_kw", "text", "none", { format: "kw" }),
  f(1, 430, 469.0, "number_of_panels", "text", "none"),
  f(1, 430, 451.8, "amount_due_at_signing", "text", "none", { format: "currency" }),
  f(1, 430, 429.5, "est_production_first_year", "text", "none", { format: "kwh" }),
  // "Pagos mensuales del primer año" is the longest left-side label on
  // this page and runs to x=432 — x=430 (used elsewhere on this page)
  // would overlap it, so this one row needs more clearance.
  f(1, 440, 407.2, "first_year_monthly_payment", "text", "none", { format: "currency", width: 110 }),
  f(1, 430, 389.7, "total_loan_amount", "text", "none", { format: "currency" }),
  f(1, 59.3, 106.5, "customer_name", "text", "none"),
  f(1, 267.0, 106.5, "customer_signature_p1", "signature", "homeowner"),
  f(1, 474.8, 106.5, "customer_date_p1", "date", "homeowner"),
  f(1, 59.3, 78.5, "co_buyer_name", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(1, 267.0, 78.5, "co_buyer_signature_p1", "signature", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(1, 474.8, 78.5, "co_buyer_date_p1", "date", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  // Page 2
  f(2, 60, 352, "language_checkbox", "checkbox", "none", { width: 10, height: 10 }),
  f(2, 313.5, 351.7, "buyer_initials", "initials", "homeowner", { width: 60 }),
  f(2, 438.8, 351.7, "co_buyer_initials", "initials", "co_borrower", { width: 60, show_only_if: "has_co_borrower", required: false }),
  f(2, 163.5, 274.3, "primary_buyer_name", "text", "none"),
  f(2, 163.5, 252.5, "primary_buyer_phone", "text", "none"),
  f(2, 163.5, 230.8, "primary_buyer_phone", "text", "none"),
  f(2, 163.5, 209.0, "primary_buyer_email", "text", "none"),
  f(2, 363.8, 274.3, "co_buyer_name", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 363.8, 252.5, "co_buyer_phone", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 363.8, 230.8, "co_buyer_phone", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 363.8, 209.0, "co_buyer_email", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 163.5, 149.3, "install_street", "text", "none", { width: 300 }),
  f(2, 163.5, 127.6, "install_city", "text", "none"),
  f(2, 163.5, 105.8, "install_state", "text", "none"),
  f(2, 163.5, 84.1, "install_zip", "text", "none"),
  // Page 3
  f(3, 269.3, 658.3, "panel_brand", "text", "none", { width: 250 }),
  f(3, 269.3, 637.3, "number_of_panels", "text", "none"),
  f(3, 269.3, 616.3, "system_size_dc", "text", "none", { format: "kw" }),
  f(3, 269.3, 595.3, "est_first_year_production_p3", "text", "none", { format: "kwh" }),
  f(3, 54, 399.6, "notes", "text", "none", { width: 500, height: 82, font_size: 9, required: false }),
  // Page 4 — "$" is pre-printed before Precio del contrato too
  f(4, 370, 278.7, "contract_price", "text", "none", { format: "currency_no_symbol", font_size: 11 }),
  f(4, 363.0, 175.0, "fixed_apr", "text", "none", { format: "percent" }),
  f(4, 363.0, 153.3, "loan_term_years", "text", "none"),
  f(4, 363.0, 131.5, "first_year_monthly_payment", "text", "none", { format: "currency" }),
  f(4, 363.0, 109.8, "payment_after_36_months", "text", "none", { format: "currency" }),
  // Page 5 — Signatures section lands here (not page 4) in Spanish,
  // because of text-reflow page-break differences from English
  f(5, 132.8, 180.8, "buyer_name_p5", "text", "none"),
  f(5, 293.3, 180.8, "buyer_signature_p5", "signature", "homeowner"),
  f(5, 486.0, 180.8, "buyer_date_p5", "date", "homeowner"),
  f(5, 132.8, 149.3, "co_buyer_name_p5", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(5, 293.3, 149.3, "co_buyer_signature_p5", "signature", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(5, 486.0, 149.3, "co_buyer_date_p5", "date", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(5, 132.8, 117.8, "rep_name_p5", "text", "none"),
  f(5, 293.3, 117.8, "rep_signature_p5", "signature", "rep"),
  f(5, 486.0, 117.8, "rep_date_p5", "date", "rep"),
  // Page 7
  f(7, 174.8, 104.8, "customer_name_p7", "text", "none"),
  f(7, 309.8, 104.8, "customer_signature_p7", "signature", "homeowner"),
  f(7, 475.5, 104.8, "customer_date_p7", "date", "homeowner"),
  f(7, 174.8, 80.1, "rep_name_p7", "text", "none"),
  f(7, 309.8, 80.1, "rep_signature_p7", "signature", "rep"),
  f(7, 475.5, 80.1, "rep_date_p7", "date", "rep"),
];

const TEMPLATES = [
  { key: "loan_hic", fields: LOAN_HIC_EN_FIELDS },
  { key: "loan_hic_es", fields: LOAN_HIC_ES_FIELDS },
];

for (const t of TEMPLATES) {
  const { data: template, error: templateError } = await admin
    .from("hic_templates")
    .select("id")
    .eq("key", t.key)
    .single();
  if (templateError || !template) {
    console.error(`FAILED: template not found for ${t.key}:`, templateError?.message);
    continue;
  }

  const { data: version, error: versionError } = await admin
    .from("hic_template_versions")
    .select("id")
    .eq("template_id", template.id)
    .eq("is_active", true)
    .single();
  if (versionError || !version) {
    console.error(`FAILED: active version not found for ${t.key}:`, versionError?.message);
    continue;
  }

  await admin.from("hic_template_fields").delete().eq("template_version_id", version.id);

  const rows = t.fields.map((field, i) => ({
    template_version_id: version.id,
    ...field,
    sort_order: i,
  }));

  const { error: insertError } = await admin.from("hic_template_fields").insert(rows);
  if (insertError) {
    console.error(`FAILED: insert fields for ${t.key}:`, insertError.message);
    continue;
  }

  console.log(`OK: ${t.key} — ${rows.length} fields`);
}
