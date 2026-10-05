export type HicFinancingType = {
  id: string;
  key: string;
  label: string;
  is_enabled: boolean;
};

export type HicPanelOption = {
  id: string;
  financing_type_id: string;
  model_name: string;
  wattage_w: number;
  is_active: boolean;
};

// Phase 6 — template/version/field editor. Mirrors hic_templates /
// hic_template_versions / hic_template_fields in schema.sql.
export type HicTemplate = {
  id: string;
  key: string;
  label: string;
  language: "en" | "es" | null;
  financing_type_id: string | null;
  is_active: boolean;
};

export type HicTemplateVersion = {
  id: string;
  template_id: string;
  version: number;
  storage_path: string;
  page_count: number;
  is_active: boolean;
  created_at: string;
};

export type HicTemplateFieldType = "text" | "signature" | "initials" | "date" | "checkbox" | "static_text";
export type HicTemplateFieldSignerRole = "homeowner" | "co_borrower" | "rep" | "none";

export type HicTemplateField = {
  id: string;
  template_version_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  field_key: string;
  field_type: HicTemplateFieldType;
  signer_role: HicTemplateFieldSignerRole;
  font_size: number;
  alignment: "left" | "center" | "right";
  required: boolean;
  format: string | null;
  show_only_if: string | null;
  sort_order: number;
};

export type HicStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partially_signed"
  | "signed"
  | "declined"
  | "expired"
  | "voided";

// Full row — preloaded per-appointment on the appointments page, same
// convention as AppointmentNote[]/AppointmentAssignment[] (page.tsx
// fetches everything up front, appointments-client.tsx filters by
// appointment_id). Used both for the "this appointment's HICs" status
// list and for resuming a draft for editing — no separate summary type
// or extra fetch needed to resume.
export type Hic = {
  id: string;
  appointment_id: string | null;
  status: HicStatus;
  customer_name: string;
  language: "en" | "es";
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  lead_id: string | null;
  financing_type_id: string;
  created_by: string;
  customer_phone: string;
  customer_email: string;
  has_co_borrower: boolean;
  co_borrower_name: string | null;
  co_borrower_phone: string | null;
  co_borrower_email: string | null;
  install_address_line: string;
  install_city: string;
  install_state: string;
  install_zip: string;
  system_size_kw: number;
  est_production_kwh: number;
  first_year_monthly_payment: number;
  escalator: number;
  kwh_rate: number;
  panel_brand: string;
  panel_wattage_w: number;
  number_of_panels: number;
  contract_price: number | null;
  estimated_tax_credit: number;
  amount_due_at_signing: number;
  sales_rep_name: string;
  contractor_name: string;
  monthly_payment_mismatch_acknowledged: boolean;
  original_hic_id: string | null;
  corrected_into_hic_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  declined_at: string | null;
  expired_at: string | null;
  final_pdf_storage_path: string | null;
  final_pdf_sha256: string | null;
  // { [templateKey]: hic_template_versions.id } — frozen at send time
  // (Phase 6) so an in-flight HIC keeps rendering the exact version a
  // signer was shown even if the template is edited afterward.
  template_version_snapshot: Record<string, string> | null;
  // Pure visibility declutter (list pages only) — never affects status,
  // signer tokens, or anything else. Admins/the owning rep can still see
  // an archived HIC directly; it's just filtered out of the main list.
  archived_at: string | null;
  archived_by: string | null;
};

export type HicSignerStatus = "pending" | "sent" | "viewed" | "signed" | "declined";

// Mirrors the hic_signers table — used by the stamping engine to know
// which homeowner/co-borrower signature/initials/date fields are
// already signed (and with what) vs. still blank.
export type HicSigner = {
  id: string;
  hic_id: string;
  role: "homeowner" | "co_borrower";
  full_name: string;
  email: string;
  phone: string | null;
  status: HicSignerStatus;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  signature_type: "typed" | "drawn" | null;
  signature_text: string | null;
  signature_storage_path: string | null;
  initials_text: string | null;
  initials_storage_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  consent_at: string | null;
};

// Client-side form state — camelCase, converted to/from the snake_case
// `hics` row shape only inside actions.ts.
export type HicFormInput = {
  financingTypeId: string;
  language: "en" | "es";
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  hasCoBorrower: boolean;
  coBorrowerName: string;
  coBorrowerPhone: string;
  coBorrowerEmail: string;
  installAddressLine: string;
  installCity: string;
  installState: string;
  installZip: string;
  systemSizeKw: string; // kept as string while editing; parsed on submit
  estProductionKwh: string;
  firstYearMonthlyPayment: string;
  escalator: number;
  kwhRate: number;
  estimatedTaxCredit: string;
  amountDueAtSigning: string;
  monthlyPaymentMismatchAcknowledged: boolean;
};

// Phase 5 settings — document package rules, notification recipients,
// email templates, equipment supplement defaults. Mirrors their
// respective tables in schema.sql.
export type HicPackageRule = {
  id: string;
  template_key: string;
  financing_type_id: string | null;
  condition_type: "always" | "city_in_list";
  city_list: string[] | null;
  is_enabled: boolean;
  sort_order: number;
};

export type HicNotificationRecipient = {
  id: string;
  recipient_type: "user" | "email";
  user_id: string | null;
  raw_email: string | null;
  notify_on_signed: boolean;
  notify_on_viewed: boolean;
  notify_on_declined: boolean;
};

export type HicEmailTemplateType =
  | "signer_invite"
  | "reminder"
  | "signed_confirmation"
  | "viewed_notify"
  | "signed_notify"
  | "declined_notify"
  | "voided_notify";

export type HicEmailTemplate = {
  id: string;
  email_type: HicEmailTemplateType;
  language: "en" | "es";
  subject: string;
  body: string;
};

export type HicEquipmentSupplementDefaults = {
  id: string;
  inverter_make_model: string;
  inverter_quantity: number;
  racking_manufacturer: string;
  racking_model: string;
};
