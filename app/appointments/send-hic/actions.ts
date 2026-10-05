"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { calculateContractPrice, calculateMonthlyPaymentCheck } from "@/lib/hic/contract-price";
import { generateDraftPreview } from "@/lib/hic/pdf/generate-draft-preview";
import { resolveTemplateVersionSnapshot } from "@/lib/hic/pdf/fill-hic-package";
import { isValidEmail, isValidPhoneInput } from "@/lib/hic/format";
import { generateSigningToken } from "@/lib/hic/signing-token";
import { sendHicEmail } from "@/lib/hic/send-email";
import { getSiteUrl } from "@/lib/hic/site-url";
import { getHicSignedUrl } from "@/lib/hic/storage";
import { getHicSettings, type HicSettings } from "@/lib/hic/settings";
import type { Hic, HicFormInput } from "./types";

export type HicActionResult =
  | { ok: true; hic: Hic; monthlyPaymentMismatch: boolean }
  | { ok: false; error: string };

export type SendHicResult = { ok: true; warning?: string } | { ok: false; error: string };

// Mirrors app/appointments/actions.ts exactly: requireSession() for a
// real session, then let RLS (hics_insert/hics_update: created_by =
// auth.uid() or is_admin) be the actual authorization boundary — this
// just validates shape/business rules before attempting the write.
function validateInput(input: HicFormInput, settings: HicSettings): string | null {
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
  if (!settings.escalatorOptions.includes(input.escalator)) return "Invalid escalator option.";
  if (!settings.kwhRateOptions.includes(input.kwhRate)) return "Invalid kWh rate option.";
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
  input: HicFormInput,
  settings: HicSettings
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
    { degradation: settings.degradationRate, termYears: settings.termYears }
  );

  return {
    ok: true,
    panelBrand: panelOption.model_name,
    panelWattageW: panelOption.wattage_w,
    numberOfPanels,
    contractPrice,
  };
}

function toRow(input: HicFormInput, settings: HicSettings) {
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
    estimated_tax_credit: input.estimatedTaxCredit ? Number(input.estimatedTaxCredit) : settings.defaultTaxCredit,
    amount_due_at_signing: input.amountDueAtSigning
      ? Number(input.amountDueAtSigning)
      : settings.defaultAmountDueAtSigning,
    monthly_payment_mismatch_acknowledged: input.monthlyPaymentMismatchAcknowledged,
  };
}

function mismatchCheck(input: HicFormInput, settings: HicSettings): boolean {
  const expected = calculateMonthlyPaymentCheck(Number(input.estProductionKwh), input.kwhRate);
  const entered = Number(input.firstYearMonthlyPayment);
  return Math.abs(expected - entered) > settings.monthlyPaymentMismatchThreshold;
}

export async function createHicDraft(appointmentId: string, input: HicFormInput): Promise<HicActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const settings = await getHicSettings(supabase);

  const validationError = validateInput(input, settings);
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

  const resolved = await resolvePanelAndPrice(supabase, input, settings);
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
      contractor_name: settings.defaultContractorName,
      panel_brand: resolved.panelBrand,
      panel_wattage_w: resolved.panelWattageW,
      number_of_panels: resolved.numberOfPanels,
      contract_price: resolved.contractPrice,
      ...toRow(input, settings),
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
  return { ok: true, hic: hic as Hic, monthlyPaymentMismatch: mismatchCheck(input, settings) };
}

// Same as createHicDraft, but for a HIC with no appointment to hang off
// of — the admin HICs list's manual "Send HIC" button, and the Correct
// flow (its new draft is pre-filled from the original but otherwise
// stands alone; the original's own appointment_id isn't copied forward
// since a correction isn't really "about" that appointment anymore).
export async function createStandaloneHicDraft(input: HicFormInput): Promise<HicActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const settings = await getHicSettings(supabase);

  const validationError = validateInput(input, settings);
  if (validationError) return { ok: false, error: validationError };

  const resolved = await resolvePanelAndPrice(supabase, input, settings);
  if (!resolved.ok) return resolved;

  const { data: hic, error } = await supabase
    .from("hics")
    .insert({
      appointment_id: null,
      lead_id: null,
      financing_type_id: input.financingTypeId,
      status: "draft",
      created_by: session.userId,
      sales_rep_name: session.fullName,
      contractor_name: settings.defaultContractorName,
      panel_brand: resolved.panelBrand,
      panel_wattage_w: resolved.panelWattageW,
      number_of_panels: resolved.numberOfPanels,
      contract_price: resolved.contractPrice,
      ...toRow(input, settings),
    })
    .select("*")
    .single();

  if (error || !hic) return { ok: false, error: error?.message ?? "Failed to create draft." };

  await supabase.from("hic_events").insert({
    hic_id: hic.id,
    user_id: session.userId,
    event_type: "created",
  });

  revalidatePath("/admin/hics");
  return { ok: true, hic: hic as Hic, monthlyPaymentMismatch: mismatchCheck(input, settings) };
}

export async function updateHicDraft(hicId: string, input: HicFormInput): Promise<HicActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const settings = await getHicSettings(supabase);

  const validationError = validateInput(input, settings);
  if (validationError) return { ok: false, error: validationError };

  const resolved = await resolvePanelAndPrice(supabase, input, settings);
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
        ...toRow(input, settings),
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
  revalidatePath("/admin/hics");
  return { ok: true, hic: hic as Hic, monthlyPaymentMismatch: mismatchCheck(input, settings) };
}

// Flips the HIC to "sent", creates signer rows with their own hashed
// signing token, generates the real document package, and emails each
// signer their unique link. PDF generation is a hard dependency here
// (unlike Phase 2's best-effort draft-preview calls) — the email about
// to go out links straight to a signing page that renders this same
// package, so there's no point emailing a link that can't actually work.
// Per-signer email failures are reported back as a warning rather than
// failing the whole send — the HIC and its links are real either way;
// Phase 4's Resend action covers retrying a failed send.
export async function sendHic(hicId: string): Promise<SendHicResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const settings = await getHicSettings(supabase);

  // Full row (not just the signer-contact columns) — fillHicPackage
  // needs every field (system size, pricing, install address, etc.) to
  // actually stamp the real documents below.
  const { data: hic, error: fetchError } = await supabase.from("hics").select("*").eq("id", hicId).single();
  if (fetchError || !hic) return { ok: false, error: "HIC not found." };
  if (hic.status !== "draft") return { ok: false, error: "This HIC has already been sent." };

  // Frozen now, before status flips — every later re-render of this
  // HIC's package (reminders, resend, the signer reopening their link)
  // uses this exact version even if a template is edited afterward.
  const templateVersionSnapshot = await resolveTemplateVersionSnapshot(hic as Hic);

  const { error: updateError, count } = await supabase
    .from("hics")
    .update(
      { status: "sent", sent_at: new Date().toISOString(), template_version_snapshot: templateVersionSnapshot },
      { count: "exact" }
    )
    .eq("id", hicId)
    .eq("status", "draft");
  if (updateError || !count) {
    return { ok: false, error: updateError?.message ?? "This HIC has already been sent." };
  }
  (hic as Hic).template_version_snapshot = templateVersionSnapshot;

  const tokenExpiresAt = new Date(Date.now() + settings.linkExpirationDays * 24 * 60 * 60 * 1000).toISOString();
  const homeowner = generateSigningToken();
  const coBorrower = hic.has_co_borrower ? generateSigningToken() : null;

  const signerRows = [
    {
      hic_id: hicId,
      role: "homeowner" as const,
      full_name: hic.customer_name,
      email: hic.customer_email,
      phone: hic.customer_phone,
      token_hash: homeowner.tokenHash,
      token_expires_at: tokenExpiresAt,
    },
    ...(hic.has_co_borrower && coBorrower
      ? [
          {
            hic_id: hicId,
            role: "co_borrower" as const,
            full_name: hic.co_borrower_name as string,
            email: hic.co_borrower_email as string,
            phone: hic.co_borrower_phone,
            token_hash: coBorrower.tokenHash,
            token_expires_at: tokenExpiresAt,
          },
        ]
      : []),
  ];
  const { data: insertedSigners, error: signersError } = await supabase
    .from("hic_signers")
    .insert(signerRows)
    .select("id, role, full_name, email");
  if (signersError || !insertedSigners) return { ok: false, error: signersError?.message ?? "Failed to create signers." };

  await supabase.from("hic_events").insert({ hic_id: hicId, user_id: session.userId, event_type: "sent" });

  try {
    await generateDraftPreview(hic as Hic);
  } catch (err) {
    // Content-breaking — nothing downstream (the signing page, the
    // emails about to go out) can work without this, so this is a hard
    // failure, unlike Phase 2's best-effort generation on its own.
    await supabase.from("hic_events").insert({
      hic_id: hicId,
      event_type: "draft_pdf_generation_failed",
      new_value: err instanceof Error ? err.message : "Unknown error",
    });
    return { ok: false, error: "Failed to generate the document package. The HIC was not sent." };
  }

  const siteUrl = await getSiteUrl();
  const tokenByRole = { homeowner: homeowner.token, co_borrower: coBorrower?.token };

  const emailFailures: string[] = [];
  for (const signer of insertedSigners) {
    const token = tokenByRole[signer.role as "homeowner" | "co_borrower"];
    if (!token) continue;
    const signLink = `${siteUrl}/sign/${signer.id}?t=${token}`;

    const result = await sendHicEmail({
      emailType: "signer_invite",
      language: hic.language,
      to: signer.email,
      mergeFields: {
        signer_name: signer.full_name,
        rep_name: hic.sales_rep_name,
        sign_link: signLink,
        expires_in_days: String(settings.linkExpirationDays),
      },
    });

    if (result.ok) {
      await supabase.from("hic_signers").update({ sent_at: new Date().toISOString() }).eq("id", signer.id);
    } else {
      emailFailures.push(`${signer.email}: ${result.error}`);
      await supabase
        .from("hic_events")
        .insert({ hic_id: hicId, signer_id: signer.id, event_type: "signer_invite_email_failed", new_value: result.error });
    }
  }

  // A HIC sent as a correction (see correctHic below) automatically
  // voids the original it replaces, right at the moment it's actually
  // sent — not when the correction draft was merely created, since the
  // rep might still abandon editing it and the original should stay
  // live until a real replacement exists.
  if (hic.original_hic_id) {
    await supabase
      .from("hics")
      .update({ status: "voided", voided_at: new Date().toISOString(), corrected_into_hic_id: hicId })
      .eq("id", hic.original_hic_id);
    await supabase.from("hic_events").insert({
      hic_id: hic.original_hic_id,
      user_id: session.userId,
      event_type: "voided",
      new_value: `Superseded by correction ${hicId}`,
    });
  }

  revalidatePath("/appointments");
  revalidatePath("/admin/hics");
  if (emailFailures.length > 0) {
    return { ok: true, warning: `Sent, but the invite email failed for: ${emailFailures.join("; ")}` };
  }
  return { ok: true };
}

// Used by the review screen to show a live preview of the actual
// filled package before Send is ever clicked — generates against the
// current draft without touching its status.
export async function generateHicPreview(
  hicId: string
): Promise<{ ok: true; url: string; pageCount: number } | { ok: false; error: string }> {
  await requireSession();
  const supabase = await createClient();

  const { data: hic, error } = await supabase.from("hics").select("*").eq("id", hicId).single();
  if (error || !hic) return { ok: false, error: "HIC not found." };

  try {
    const preview = await generateDraftPreview(hic as Hic);
    return { ok: true, ...preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to generate preview." };
  }
}

// Lets the client-side form read the live, admin-editable escalator/
// kWh-rate option lists without threading them as props down through
// every appointment-panel/admin-page call site — HicFormFields fetches
// this itself on mount and falls back to the lib/hic/defaults.ts
// constants until it resolves.
export async function getHicOptionLists(): Promise<{ escalatorOptions: number[]; kwhRateOptions: number[] }> {
  await requireSession();
  const supabase = await createClient();
  const settings = await getHicSettings(supabase);
  return { escalatorOptions: settings.escalatorOptions, kwhRateOptions: settings.kwhRateOptions };
}

export type HicMutationResult = { ok: true } | { ok: false; error: string };

// Re-emails the CURRENT signing link(s) to anyone who hasn't signed yet
// — a fresh token each time (the old one stops working the moment the
// new hash overwrites it), expiration reset per the live
// hic_link_expiration_days setting. Doesn't touch reminder_count —
// that's Phase 4's automatic-reminder counter specifically, a manual
// resend is a different action.
export async function resendHic(hicId: string): Promise<HicMutationResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const settings = await getHicSettings(supabase);

  const { data: hic, error: hicError } = await supabase.from("hics").select("*").eq("id", hicId).single();
  if (hicError || !hic) return { ok: false, error: "HIC not found." };
  if (!["sent", "viewed", "partially_signed"].includes(hic.status)) {
    return { ok: false, error: "This HIC isn't currently awaiting a signature." };
  }

  const { data: signers, error: signersError } = await supabase
    .from("hic_signers")
    .select("id, full_name, email, status")
    .eq("hic_id", hicId)
    .neq("status", "signed");
  if (signersError) return { ok: false, error: signersError.message };
  if (!signers || signers.length === 0) return { ok: false, error: "No unsigned signers to resend to." };

  const siteUrl = await getSiteUrl();
  const tokenExpiresAt = new Date(Date.now() + settings.linkExpirationDays * 24 * 60 * 60 * 1000).toISOString();
  const emailFailures: string[] = [];

  for (const signer of signers) {
    const { token, tokenHash } = generateSigningToken();
    await supabase.from("hic_signers").update({ token_hash: tokenHash, token_expires_at: tokenExpiresAt }).eq("id", signer.id);

    const result = await sendHicEmail({
      emailType: "signer_invite",
      language: hic.language,
      to: signer.email,
      mergeFields: {
        signer_name: signer.full_name,
        rep_name: hic.sales_rep_name,
        sign_link: `${siteUrl}/sign/${signer.id}?t=${token}`,
        expires_in_days: String(settings.linkExpirationDays),
      },
    });
    if (!result.ok) emailFailures.push(`${signer.email}: ${result.error}`);
  }

  await supabase.from("hic_events").insert({ hic_id: hicId, user_id: session.userId, event_type: "resent" });
  revalidatePath("/appointments");
  revalidatePath("/admin/hics");

  if (emailFailures.length > 0) return { ok: false, error: `Resend email failed for: ${emailFailures.join("; ")}` };
  return { ok: true };
}

// Cancels the HIC outright and invalidates all signer links — the
// public GET/sign/decline routes all check hics.status directly, not
// just the token, so this takes effect immediately without needing to
// touch the signer rows themselves.
export async function voidHic(hicId: string, reason?: string): Promise<HicMutationResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: hic, error: hicError } = await supabase.from("hics").select("status").eq("id", hicId).single();
  if (hicError || !hic) return { ok: false, error: "HIC not found." };
  if (hic.status === "voided") return { ok: false, error: "This HIC is already voided." };

  const { error: updateError, count } = await supabase
    .from("hics")
    .update({ status: "voided", voided_at: new Date().toISOString(), voided_by: session.userId, void_reason: reason ?? null }, { count: "exact" })
    .eq("id", hicId);
  if (updateError || !count) return { ok: false, error: updateError?.message ?? "Failed to void." };

  await supabase.from("hic_events").insert({ hic_id: hicId, user_id: session.userId, event_type: "voided", new_value: reason ?? null });
  revalidatePath("/appointments");
  revalidatePath("/admin/hics");
  return { ok: true };
}

// Pure visibility declutter for the admin HICs list — never touches
// status, never affects signer tokens or anything a signer sees.
// RLS (hics_update: is_admin or created_by) is the real boundary here,
// same as every other mutation in this file.
export async function archiveHic(hicId: string): Promise<HicMutationResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: hic, error: hicError } = await supabase.from("hics").select("archived_at").eq("id", hicId).single();
  if (hicError || !hic) return { ok: false, error: "HIC not found." };
  if (hic.archived_at) return { ok: false, error: "This HIC is already archived." };

  const { error: updateError, count } = await supabase
    .from("hics")
    .update({ archived_at: new Date().toISOString(), archived_by: session.userId }, { count: "exact" })
    .eq("id", hicId);
  if (updateError || !count) return { ok: false, error: updateError?.message ?? "Failed to archive." };

  await supabase.from("hic_events").insert({ hic_id: hicId, user_id: session.userId, event_type: "archived" });
  revalidatePath("/appointments");
  revalidatePath("/admin/hics");
  return { ok: true };
}

export async function unarchiveHic(hicId: string): Promise<HicMutationResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { error: updateError, count } = await supabase
    .from("hics")
    .update({ archived_at: null, archived_by: null }, { count: "exact" })
    .eq("id", hicId)
    .not("archived_at", "is", null);
  if (updateError || !count) return { ok: false, error: updateError?.message ?? "This HIC isn't archived." };

  await supabase.from("hic_events").insert({ hic_id: hicId, user_id: session.userId, event_type: "unarchived" });
  revalidatePath("/appointments");
  revalidatePath("/admin/hics");
  return { ok: true };
}

export type CorrectHicResult = { ok: true; hic: Hic } | { ok: false; error: string };

// Creates a new editable draft pre-filled from a sent/signed HIC, for
// fixing a mistake or handling a change order — a signed/sent HIC can
// never be edited directly (hics_prevent_content_edit_after_send
// blocks it), this is the only path to changing one. The original stays
// live and signable until the correction is actually SENT (see the
// original_hic_id check at the end of sendHic above), not the moment
// this draft is merely created.
export async function correctHic(hicId: string): Promise<CorrectHicResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: original, error: fetchError } = await supabase.from("hics").select("*").eq("id", hicId).single();
  if (fetchError || !original) return { ok: false, error: "HIC not found." };
  if (original.status === "draft") return { ok: false, error: "A draft can be edited directly — no need to correct it." };
  if (original.corrected_into_hic_id) return { ok: false, error: "This HIC has already been corrected." };

  const { data: newHic, error: insertError } = await supabase
    .from("hics")
    .insert({
      appointment_id: original.appointment_id,
      lead_id: original.lead_id,
      financing_type_id: original.financing_type_id,
      language: original.language,
      status: "draft",
      created_by: session.userId,
      customer_name: original.customer_name,
      customer_phone: original.customer_phone,
      customer_email: original.customer_email,
      has_co_borrower: original.has_co_borrower,
      co_borrower_name: original.co_borrower_name,
      co_borrower_phone: original.co_borrower_phone,
      co_borrower_email: original.co_borrower_email,
      install_address_line: original.install_address_line,
      install_city: original.install_city,
      install_state: original.install_state,
      install_zip: original.install_zip,
      system_size_kw: original.system_size_kw,
      est_production_kwh: original.est_production_kwh,
      first_year_monthly_payment: original.first_year_monthly_payment,
      escalator: original.escalator,
      kwh_rate: original.kwh_rate,
      panel_brand: original.panel_brand,
      panel_wattage_w: original.panel_wattage_w,
      number_of_panels: original.number_of_panels,
      contract_price: original.contract_price,
      estimated_tax_credit: original.estimated_tax_credit,
      amount_due_at_signing: original.amount_due_at_signing,
      sales_rep_name: original.sales_rep_name,
      contractor_name: original.contractor_name,
      monthly_payment_mismatch_acknowledged: true,
      original_hic_id: original.id,
    })
    .select("*")
    .single();
  if (insertError || !newHic) return { ok: false, error: insertError?.message ?? "Failed to create correction." };

  await supabase.from("hic_events").insert([
    { hic_id: newHic.id, user_id: session.userId, event_type: "created", new_value: `Correction of ${hicId}` },
    { hic_id: hicId, user_id: session.userId, event_type: "corrected", new_value: `Correction draft ${newHic.id} created` },
  ]);

  revalidatePath("/appointments");
  revalidatePath("/admin/hics");
  return { ok: true, hic: newHic as Hic };
}

// Admins can download any HIC regardless of status (draft preview or
// final signed copy); a rep can only download their own, and only once
// actually signed, and only while hic_reps_can_download_signed is on.
// RLS already scopes the initial select to "admin or own," so a rep
// attempting another rep's HIC id gets the same "not found" a
// nonexistent id would.
export async function getHicDownloadUrl(hicId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: hic, error } = await supabase
    .from("hics")
    .select("id, status, final_pdf_storage_path, created_by")
    .eq("id", hicId)
    .single();
  if (error || !hic) return { ok: false, error: "HIC not found." };

  const isAdmin = session.role === "admin" || session.role === "super_admin";
  if (!isAdmin) {
    if (hic.status !== "signed") return { ok: false, error: "This HIC hasn't been signed yet." };
    const settings = await getHicSettings(supabase);
    if (!settings.repsCanDownloadSigned) {
      return { ok: false, error: "Downloading signed HICs is currently disabled. Contact an admin." };
    }
  }

  const path = hic.status === "signed" && hic.final_pdf_storage_path ? hic.final_pdf_storage_path : `generated/${hicId}/draft.pdf`;
  try {
    const url = await getHicSignedUrl(path, 300);
    return { ok: true, url };
  } catch {
    return { ok: false, error: "No document is available for this HIC yet." };
  }
}
