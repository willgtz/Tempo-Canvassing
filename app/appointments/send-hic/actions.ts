"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { calculateContractPrice, calculateMonthlyPaymentCheck } from "@/lib/hic/contract-price";
import { isValidEmail, isValidPhoneInput } from "@/lib/hic/format";
import {
  HIC_DEFAULT_AMOUNT_DUE_AT_SIGNING,
  HIC_DEFAULT_CONTRACTOR_NAME,
  HIC_DEFAULT_TAX_CREDIT,
  HIC_DEGRADATION_RATE,
  HIC_ESCALATOR_OPTIONS,
  HIC_KWH_RATE_OPTIONS,
  HIC_MONTHLY_PAYMENT_MISMATCH_THRESHOLD,
  HIC_TERM_YEARS,
} from "@/lib/hic/defaults";
import type { Hic, HicFormInput } from "./types";

export type HicActionResult =
  | { ok: true; hic: Hic; monthlyPaymentMismatch: boolean }
  | { ok: false; error: string };

export type SendHicResult = { ok: true } | { ok: false; error: string };

// Mirrors app/appointments/actions.ts exactly: requireSession() for a
// real session, then let RLS (hics_insert/hics_update: created_by =
// auth.uid() or is_admin) be the actual authorization boundary — this
// just validates shape/business rules before attempting the write.
function validateInput(input: HicFormInput): string | null {
  if (!input.customerName.trim()) return "Customer name is required.";
  if (!isValidPhoneInput(input.customerPhone)) return "Enter a valid 10-digit customer phone number.";
  if (!isValidEmail(input.customerEmail)) return "Enter a valid customer email address.";
  if (!input.installAddressLine.trim() || !input.installCity.trim() || !input.installState.trim() || !input.installZip.trim()) {
    return "Installation address is required.";
  }
  if (input.hasCoBorrower) {
    if (!input.coBorrowerName.trim()) return "Co-borrower name is required.";
    if (!isValidPhoneInput(input.coBorrowerPhone)) return "Enter a valid 10-digit co-borrower phone number.";
    if (!isValidEmail(input.coBorrowerEmail)) return "Enter a valid co-borrower email address.";
  }
  const systemSizeKw = Number(input.systemSizeKw);
  if (!(systemSizeKw > 0)) return "System size must be greater than 0.";
  const estProductionKwh = Number(input.estProductionKwh);
  if (!(estProductionKwh > 0)) return "Estimated first-year production must be greater than 0.";
  const firstYearMonthlyPayment = Number(input.firstYearMonthlyPayment);
  if (!(firstYearMonthlyPayment >= 0)) return "First-year monthly payment is required.";
  if (!HIC_ESCALATOR_OPTIONS.includes(input.escalator)) return "Invalid escalator option.";
  if (!HIC_KWH_RATE_OPTIONS.includes(input.kwhRate)) return "Invalid kWh rate option.";
  return null;
}

// Number of panels must divide evenly (systemSize in W / panel wattage) —
// per spec, blocks sending with a clear error rather than rounding.
// Decimal (not plain float division) since this gates a legal document's
// stated panel count, not just a display value.
function computeNumberOfPanels(systemSizeKw: number, panelWattageW: number): number | null {
  const systemSizeW = new Decimal(systemSizeKw).times(1000);
  const quotient = systemSizeW.dividedBy(panelWattageW);
  if (!quotient.isInteger()) return null;
  return quotient.toNumber();
}

async function resolvePanelAndPrice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: HicFormInput
): Promise<
  | { ok: true; panelBrand: string; panelWattageW: number; numberOfPanels: number; contractPrice: number }
  | { ok: false; error: string }
> {
  const { data: financingType, error: financingError } = await supabase
    .from("hic_financing_types")
    .select("id, is_enabled")
    .eq("id", input.financingTypeId)
    .single();
  if (financingError || !financingType) return { ok: false, error: "Invalid financing type." };
  if (!financingType.is_enabled) return { ok: false, error: "This financing type isn't available yet." };

  const { data: panelOption, error: panelError } = await supabase
    .from("hic_panel_options")
    .select("model_name, wattage_w")
    .eq("financing_type_id", input.financingTypeId)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (panelError || !panelOption) {
    return { ok: false, error: "No panel configuration found for this financing type." };
  }

  const systemSizeKw = Number(input.systemSizeKw);
  const numberOfPanels = computeNumberOfPanels(systemSizeKw, panelOption.wattage_w);
  if (numberOfPanels === null) {
    const systemSizeW = Math.round(systemSizeKw * 1000);
    return {
      ok: false,
      error: `System size (${systemSizeKw} kW = ${systemSizeW}W) doesn't divide evenly by the panel wattage (${panelOption.wattage_w}W). Adjust the system size so the panel count is a whole number.`,
    };
  }

  const contractPrice = calculateContractPrice(
    Number(input.estProductionKwh),
    input.kwhRate,
    input.escalator,
    { degradation: HIC_DEGRADATION_RATE, termYears: HIC_TERM_YEARS }
  );

  return {
    ok: true,
    panelBrand: panelOption.model_name,
    panelWattageW: panelOption.wattage_w,
    numberOfPanels,
    contractPrice,
  };
}

function toRow(input: HicFormInput) {
  return {
    language: input.language,
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone,
    customer_email: input.customerEmail.trim(),
    has_co_borrower: input.hasCoBorrower,
    co_borrower_name: input.hasCoBorrower ? input.coBorrowerName.trim() : null,
    co_borrower_phone: input.hasCoBorrower ? input.coBorrowerPhone : null,
    co_borrower_email: input.hasCoBorrower ? input.coBorrowerEmail.trim() : null,
    install_address_line: input.installAddressLine.trim(),
    install_city: input.installCity.trim(),
    install_state: input.installState.trim(),
    install_zip: input.installZip.trim(),
    system_size_kw: Number(input.systemSizeKw),
    est_production_kwh: Number(input.estProductionKwh),
    first_year_monthly_payment: Number(input.firstYearMonthlyPayment),
    escalator: input.escalator,
    kwh_rate: input.kwhRate,
    estimated_tax_credit: input.estimatedTaxCredit ? Number(input.estimatedTaxCredit) : HIC_DEFAULT_TAX_CREDIT,
    amount_due_at_signing: input.amountDueAtSigning
      ? Number(input.amountDueAtSigning)
      : HIC_DEFAULT_AMOUNT_DUE_AT_SIGNING,
    monthly_payment_mismatch_acknowledged: input.monthlyPaymentMismatchAcknowledged,
  };
}

function mismatchCheck(input: HicFormInput): boolean {
  const expected = calculateMonthlyPaymentCheck(Number(input.estProductionKwh), input.kwhRate);
  const entered = Number(input.firstYearMonthlyPayment);
  return Math.abs(expected - entered) > HIC_MONTHLY_PAYMENT_MISMATCH_THRESHOLD;
}

export async function createHicDraft(appointmentId: string, input: HicFormInput): Promise<HicActionResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  // appointments_select RLS (admin or anyone assigned) already scopes
  // this — a 0-row result means the caller can't see this appointment at
  // all, not just that it doesn't exist.
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, lead_id")
    .eq("id", appointmentId)
    .single();
  if (appointmentError || !appointment) {
    return { ok: false, error: "Appointment not found." };
  }

  const resolved = await resolvePanelAndPrice(supabase, input);
  if (!resolved.ok) return resolved;

  const { data: hic, error } = await supabase
    .from("hics")
    .insert({
      appointment_id: appointmentId,
      lead_id: appointment.lead_id,
      financing_type_id: input.financingTypeId,
      status: "draft",
      created_by: session.userId,
      sales_rep_name: session.fullName,
      contractor_name: HIC_DEFAULT_CONTRACTOR_NAME,
      panel_brand: resolved.panelBrand,
      panel_wattage_w: resolved.panelWattageW,
      number_of_panels: resolved.numberOfPanels,
      contract_price: resolved.contractPrice,
      ...toRow(input),
    })
    .select("*")
    .single();

  if (error || !hic) return { ok: false, error: error?.message ?? "Failed to create draft." };

  await supabase.from("hic_events").insert({
    hic_id: hic.id,
    user_id: session.userId,
    event_type: "created",
  });

  revalidatePath("/appointments");
  return { ok: true, hic: hic as Hic, monthlyPaymentMismatch: mismatchCheck(input) };
}

export async function updateHicDraft(hicId: string, input: HicFormInput): Promise<HicActionResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const resolved = await resolvePanelAndPrice(supabase, input);
  if (!resolved.ok) return resolved;

  const { data: hic, error, count } = await supabase
    .from("hics")
    .update(
      {
        financing_type_id: input.financingTypeId,
        panel_brand: resolved.panelBrand,
        panel_wattage_w: resolved.panelWattageW,
        number_of_panels: resolved.numberOfPanels,
        contract_price: resolved.contractPrice,
        updated_at: new Date().toISOString(),
        ...toRow(input),
      },
      { count: "exact" }
    )
    .eq("id", hicId)
    .eq("status", "draft")
    .select("*")
    .single();

  if (error || !hic || !count) {
    return {
      ok: false,
      error: error?.message ?? "This HIC has already been sent and can no longer be edited.",
    };
  }

  await supabase.from("hic_events").insert({
    hic_id: hicId,
    user_id: session.userId,
    event_type: "draft_saved",
  });

  revalidatePath("/appointments");
  return { ok: true, hic: hic as Hic, monthlyPaymentMismatch: mismatchCheck(input) };
}

// Phase 1 stub: flips the HIC to "sent" and creates signer rows, but
// generates no PDF and sends no email — Phase 2/3 extend this function's
// body (not its signature or call sites) to do the real work.
export async function sendHic(hicId: string): Promise<SendHicResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: hic, error: fetchError } = await supabase
    .from("hics")
    .select("id, status, customer_name, customer_email, customer_phone, has_co_borrower, co_borrower_name, co_borrower_email, co_borrower_phone")
    .eq("id", hicId)
    .single();
  if (fetchError || !hic) return { ok: false, error: "HIC not found." };
  if (hic.status !== "draft") return { ok: false, error: "This HIC has already been sent." };

  const { error: updateError, count } = await supabase
    .from("hics")
    .update({ status: "sent", sent_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", hicId)
    .eq("status", "draft");
  if (updateError || !count) {
    return { ok: false, error: updateError?.message ?? "This HIC has already been sent." };
  }

  const signerRows = [
    { hic_id: hicId, role: "homeowner" as const, full_name: hic.customer_name, email: hic.customer_email, phone: hic.customer_phone },
    ...(hic.has_co_borrower
      ? [
          {
            hic_id: hicId,
            role: "co_borrower" as const,
            full_name: hic.co_borrower_name as string,
            email: hic.co_borrower_email as string,
            phone: hic.co_borrower_phone,
          },
        ]
      : []),
  ];
  const { error: signersError } = await supabase.from("hic_signers").insert(signerRows);
  if (signersError) return { ok: false, error: signersError.message };

  await supabase.from("hic_events").insert({
    hic_id: hicId,
    user_id: session.userId,
    event_type: "sent",
  });

  revalidatePath("/appointments");
  return { ok: true };
}
