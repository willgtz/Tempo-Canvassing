// One-off seed script — populates hic_template_fields for the 4 real
// templates, measured by extracting exact label coordinates via
// pdfjs-dist text-content (origin bottom-left, matching pdf-lib's
// drawText coordinate space directly) cross-checked against rendered
// page images. Run manually (`node scripts/seed-hic-template-fields.mjs`),
// not part of the app's runtime — Phase 6's drag-and-drop editor
// replaces this as the real way to maintain field positions going
// forward; this just gets Phase 2 off the ground with real values.
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

// field_keys are shared across templates wherever the same logical
// value applies (e.g. 'panel_brand' appears on both the HIC and the
// equipment supplement) — the stamping engine resolves each by key
// against one shared HIC-record value-resolver, regardless of which
// template/page it's placed on.
function f(page, x, y, field_key, field_type, signer_role, opts = {}) {
  return {
    page,
    x,
    y,
    width: opts.width ?? 140,
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

const HIC_EN_FIELDS = [
  // Page 1
  f(1, 154.5, 462.7, "system_size_kw", "text", "none", { format: "kw" }),
  f(1, 445, 462.7, "estimated_tax_credit", "text", "none", { format: "currency", width: 105 }),
  f(1, 445, 445.2, "amount_due_at_signing", "text", "none", { format: "currency", width: 105 }),
  f(1, 445, 427.8, "est_production_first_year", "text", "none", { format: "kwh", width: 105 }),
  f(1, 445, 410.3, "first_year_monthly_payment", "text", "none", { format: "currency", width: 105 }),
  f(1, 445, 392.9, "escalator", "text", "none", { format: "percent", width: 105 }),
  f(1, 445, 374.7, "kwh_rate", "text", "none", { format: "kwh_rate", width: 105 }),
  f(1, 59.3, 145, "customer_name", "text", "none"),
  f(1, 267.0, 145, "customer_signature_p1", "signature", "homeowner"),
  f(1, 474.8, 145, "customer_date_p1", "date", "homeowner"),
  // Page 2
  f(2, 60.5, 367.5, "language_checkbox", "checkbox", "none", { width: 10, height: 10 }),
  f(2, 318.5, 366.9, "buyer_initials", "initials", "homeowner", { width: 60 }),
  f(2, 443.8, 366.9, "co_buyer_initials", "initials", "co_borrower", { width: 60, show_only_if: "has_co_borrower", required: false }),
  f(2, 168.5, 289.5, "primary_buyer_name", "text", "none"),
  f(2, 168.5, 267.7, "primary_buyer_phone", "text", "none"),
  f(2, 168.5, 224.2, "primary_buyer_email", "text", "none"),
  f(2, 368.5, 289.5, "co_buyer_name", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 368.5, 267.7, "co_buyer_phone", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 368.5, 224.2, "co_buyer_email", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 168.5, 164.6, "install_street", "text", "none"),
  f(2, 168.5, 142.8, "install_city", "text", "none"),
  f(2, 168.5, 121.1, "install_state", "text", "none"),
  f(2, 168.5, 99.3, "install_zip", "text", "none"),
  // Page 3
  f(3, 274, 681.8, "panel_brand", "text", "none"),
  f(3, 274, 660.8, "number_of_panels", "text", "none"),
  f(3, 274, 639.8, "system_size_dc", "text", "none", { format: "kw" }),
  f(3, 274, 618.8, "est_first_year_production_p3", "text", "none", { format: "kwh" }),
  f(3, 54, 423, "notes", "text", "none", { width: 500, height: 82, font_size: 9, required: false }),
  // Page 4
  f(4, 371, 292.1, "contract_price", "text", "none", { format: "currency_no_symbol", font_size: 11 }),
  // Page 5
  f(5, 132.8, 221.0, "buyer_name_p5", "text", "none"),
  f(5, 293.3, 221.0, "buyer_signature_p5", "signature", "homeowner"),
  f(5, 486.0, 221.0, "buyer_date_p5", "date", "homeowner"),
  f(5, 132.8, 189.5, "co_buyer_name_p5", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(5, 293.3, 189.5, "co_buyer_signature_p5", "signature", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(5, 486.0, 189.5, "co_buyer_date_p5", "date", "co_borrower", { show_only_if: "has_co_borrower", required: false }),
  f(5, 132.8, 158.0, "rep_name_p5", "text", "none"),
  f(5, 293.3, 158.0, "rep_signature_p5", "signature", "rep"),
  f(5, 486.0, 158.0, "rep_date_p5", "date", "rep"),
  // Page 7
  f(7, 168.5, 116.7, "customer_name_p7", "text", "none"),
  f(7, 168.5, 92.0, "customer_signature_p7", "signature", "homeowner"),
  f(7, 168.5, 67.2, "customer_date_p7", "date", "homeowner"),
  f(7, 368.8, 116.7, "rep_name_p7", "text", "none"),
  f(7, 368.8, 92.0, "rep_signature_p7", "signature", "rep"),
  f(7, 368.8, 67.2, "rep_date_p7", "date", "rep"),
];

const HIC_ES_FIELDS = [
  // Page 1
  f(1, 154.5, 462.7, "system_size_kw", "text", "none", { format: "kw" }),
  f(1, 445, 462.7, "estimated_tax_credit", "text", "none", { format: "currency", width: 105 }),
  f(1, 445, 445.2, "amount_due_at_signing", "text", "none", { format: "currency", width: 105 }),
  f(1, 445, 422.9, "est_production_first_year", "text", "none", { format: "kwh", width: 105 }),
  f(1, 445, 400.6, "first_year_monthly_payment", "text", "none", { format: "currency", width: 105 }),
  f(1, 445, 383.1, "escalator", "text", "none", { format: "percent", width: 105 }),
  f(1, 445, 364.9, "kwh_rate", "text", "none", { format: "kwh_rate", width: 105 }),
  f(1, 59.3, 135, "customer_name", "text", "none"),
  f(1, 267.0, 135, "customer_signature_p1", "signature", "homeowner"),
  f(1, 474.8, 135, "customer_date_p1", "date", "homeowner"),
  // Page 2 — no separate "Cell" row in Spanish, so Email sits one row higher
  f(2, 60.5, 367.5, "language_checkbox", "checkbox", "none", { width: 10, height: 10 }),
  f(2, 318.5, 366.9, "buyer_initials", "initials", "homeowner", { width: 60 }),
  f(2, 443.8, 366.9, "co_buyer_initials", "initials", "co_borrower", { width: 60, show_only_if: "has_co_borrower", required: false }),
  f(2, 168.5, 289.5, "primary_buyer_name", "text", "none"),
  f(2, 168.5, 267.7, "primary_buyer_phone", "text", "none"),
  f(2, 168.5, 246.0, "primary_buyer_email", "text", "none"),
  f(2, 368.5, 289.5, "co_buyer_name", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 368.5, 267.7, "co_buyer_phone", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 368.5, 246.0, "co_buyer_email", "text", "none", { show_only_if: "has_co_borrower", required: false }),
  f(2, 168.5, 186.3, "install_street", "text", "none"),
  f(2, 168.5, 164.6, "install_city", "text", "none"),
  f(2, 168.5, 142.8, "install_state", "text", "none"),
  f(2, 168.5, 121.1, "install_zip", "text", "none"),
  // Page 3
  f(3, 274, 681.8, "panel_brand", "text", "none"),
  f(3, 274, 660.8, "number_of_panels", "text", "none"),
  f(3, 274, 639.8, "system_size_dc", "text", "none", { format: "kw" }),
  f(3, 274, 618.8, "est_first_year_production_p3", "text", "none", { format: "kwh" }),
  f(3, 54, 423, "notes", "text", "none", { width: 500, height: 82, font_size: 9, required: false }),
  // Page 4 — no pre-printed "$" in the Spanish template, unlike English
  f(4, 368, 278.7, "contract_price", "text", "none", { format: "currency", font_size: 11 }),
  // Page 5
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
  f(7, 168.5, 118.2, "customer_name_p7", "text", "none"),
  f(7, 168.5, 93.5, "customer_signature_p7", "signature", "homeowner"),
  f(7, 168.5, 68.7, "customer_date_p7", "date", "homeowner"),
  f(7, 368.8, 118.2, "rep_name_p7", "text", "none"),
  f(7, 368.8, 93.5, "rep_signature_p7", "signature", "rep"),
  f(7, 368.8, 68.7, "rep_date_p7", "date", "rep"),
];

const EQUIPMENT_SUPPLEMENT_FIELDS = [
  f(1, 365, 394.8, "panel_brand", "text", "none", { width: 170 }),
  f(1, 365, 376.7, "number_of_panels", "text", "none", { width: 170 }),
  f(1, 365, 358.0, "inverter_make_model", "text", "none", { width: 170 }),
  f(1, 365, 341.6, "inverter_quantity", "text", "none", { width: 170 }),
  f(1, 365, 326.6, "racking_manufacturer", "text", "none", { width: 170 }),
  f(1, 365, 312.3, "racking_model", "text", "none", { width: 170 }),
  f(1, 135, 140.3, "supplement_homeowner_signature", "signature", "homeowner", { width: 260 }),
  f(1, 135, 103.6, "supplement_homeowner_name", "text", "none", { width: 260 }),
  f(1, 135, 66.8, "supplement_homeowner_date", "date", "homeowner", { width: 260 }),
];

const HENDERSON_FIELDS = [
  f(1, 85, 467.5, "henderson_owner_name", "text", "none", { width: 190 }),
  f(1, 350, 467.5, "henderson_address", "text", "none", { width: 140 }),
  f(1, 70, 397.3, "henderson_contractor_name", "text", "none", { width: 420 }),
  f(1, 70, 232.9, "henderson_email", "text", "none", { width: 440 }),
  f(1, 430, 232.9, "henderson_phone", "text", "none", { width: 110 }),
  f(1, 70, 166.0, "henderson_signature", "signature", "homeowner", { width: 440 }),
  f(1, 430, 166.0, "henderson_date", "date", "homeowner", { width: 110 }),
];

const TEMPLATES = [
  { key: "hic_en", fields: HIC_EN_FIELDS },
  { key: "hic_es", fields: HIC_ES_FIELDS },
  { key: "lightreach_equipment_supplement", fields: EQUIPMENT_SUPPLEMENT_FIELDS },
  { key: "henderson_form", fields: HENDERSON_FIELDS },
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

  // Idempotent — clear any previously-seeded rows for this version before
  // inserting, so re-running this script after adjusting coordinates
  // doesn't duplicate rows.
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
