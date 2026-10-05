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
