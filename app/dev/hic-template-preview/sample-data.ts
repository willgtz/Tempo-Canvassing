import type { Hic } from "@/app/appointments/send-hic/types";

// Lightreach's id in hic_financing_types — stable across environments
// since it's seeded by the Phase 1 migration, but hardcoded here rather
// than queried since this is a throwaway dev tool, not app code.
const LIGHTREACH_FINANCING_TYPE_ID = "014876c0-6506-4e75-aa53-94ff07c59314";

// Base values straight from the original feature spec's own worked
// example — using the real numbers means the contract price shown here
// is independently checkable against lib/hic/contract-price.test.ts's
// first case ($47,694.12).
const BASE: Omit<Hic, "id" | "language" | "has_co_borrower" | "co_borrower_name" | "co_borrower_phone" | "co_borrower_email" | "install_city" | "status" | "created_at" | "sent_at" | "completed_at"> = {
  appointment_id: null,
  lead_id: null,
  financing_type_id: LIGHTREACH_FINANCING_TYPE_ID,
  created_by: "00000000-0000-0000-0000-000000000000",
  customer_name: "John Doe",
  customer_phone: "999-999-9999",
  customer_email: "none@gmail.com",
  install_address_line: "673 Italian Roast Ct",
  install_state: "NV",
  install_zip: "89052",
  system_size_kw: 8.55,
  est_production_kwh: 14997.93,
  first_year_monthly_payment: 168.73,
  escalator: 0,
  kwh_rate: 0.135,
  panel_brand: "ELNSM54M-HC-N-450 DC:BS-E-J",
  panel_wattage_w: 450,
  number_of_panels: 19,
  contract_price: 47694.12,
  estimated_tax_credit: 0,
  amount_due_at_signing: 0,
  sales_rep_name: "Pere Briggs",
  contractor_name: "Tempo Solar World",
  monthly_payment_mismatch_acknowledged: true,
  original_hic_id: null,
  corrected_into_hic_id: null,
  void_reason: null,
  voided_at: null,
  voided_by: null,
  declined_at: null,
  expired_at: null,
  final_pdf_storage_path: null,
  final_pdf_sha256: null,
  template_version_snapshot: null,
  archived_at: null,
  archived_by: null,
};

export const SAMPLE_SCENARIOS: { key: string; label: string; hic: Hic }[] = [
  {
    key: "en-henderson-solo",
    label: "English · Henderson (HIC + Equipment Supplement + Henderson form) · no co-borrower",
    hic: {
      ...BASE,
      id: "dev-sample-en-henderson-solo",
      language: "en",
      install_city: "Henderson",
      has_co_borrower: false,
      co_borrower_name: null,
      co_borrower_phone: null,
      co_borrower_email: null,
      status: "draft",
      created_at: new Date().toISOString(),
      sent_at: null,
      completed_at: null,
    },
  },
  {
    key: "en-henderson-co-borrower",
    label: "English · Henderson · WITH co-borrower",
    hic: {
      ...BASE,
      id: "dev-sample-en-henderson-co-borrower",
      language: "en",
      install_city: "Henderson",
      has_co_borrower: true,
      co_borrower_name: "Jane Doe",
      co_borrower_phone: "999-999-0000",
      co_borrower_email: "jane@example.com",
      status: "draft",
      created_at: new Date().toISOString(),
      sent_at: null,
      completed_at: null,
    },
  },
  {
    key: "es-henderson-solo",
    label: "Spanish · Henderson · no co-borrower",
    hic: {
      ...BASE,
      id: "dev-sample-es-henderson-solo",
      language: "es",
      install_city: "Henderson",
      has_co_borrower: false,
      co_borrower_name: null,
      co_borrower_phone: null,
      co_borrower_email: null,
      status: "draft",
      created_at: new Date().toISOString(),
      sent_at: null,
      completed_at: null,
    },
  },
  {
    key: "en-las-vegas-no-henderson",
    label: "English · Las Vegas (confirms Henderson form is correctly excluded)",
    hic: {
      ...BASE,
      id: "dev-sample-en-las-vegas-no-henderson",
      language: "en",
      install_city: "Las Vegas",
      has_co_borrower: false,
      co_borrower_name: null,
      co_borrower_phone: null,
      co_borrower_email: null,
      status: "draft",
      created_at: new Date().toISOString(),
      sent_at: null,
      completed_at: null,
    },
  },
];
