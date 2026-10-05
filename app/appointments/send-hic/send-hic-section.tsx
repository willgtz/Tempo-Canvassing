"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { createHicDraft, updateHicDraft } from "./actions";
import { HicReviewScreen } from "./hic-review-screen";
import { SendHicModal } from "./send-hic-modal";
import { formatCurrency, formatPhoneInput } from "@/lib/hic/format";
import { HIC_ESCALATOR_OPTIONS, HIC_KWH_RATE_OPTIONS } from "@/lib/hic/defaults";
import type { Appointment, AppointmentLead } from "@/app/admin/appointments/types";
import type { Hic, HicFinancingType, HicFormInput } from "./types";

const STATUS_LABEL: Record<Hic["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partially_signed: "Partially signed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  voided: "Voided",
};

const STATUS_COLOR: Record<Hic["status"], string> = {
  draft: "bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/70",
  sent: "bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  viewed: "bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  partially_signed: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  signed: "bg-green-600/10 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  declined: "bg-red-600/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  expired: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
  voided: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
};

// Small uppercase section dividers inside the form/review modals — same
// "Appointment Note" label treatment already used elsewhere in both
// appointment panels, repurposed here to group a long form into
// scannable chunks instead of one undifferentiated list of fields.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
      {children}
    </p>
  );
}

function blankFormInput(lead: AppointmentLead | null, financingTypeId: string): HicFormInput {
  return {
    financingTypeId,
    language: "en",
    // Never pre-filled from the lead, even though the name is right
    // there — re-entered by the rep for verification, per spec.
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    hasCoBorrower: false,
    coBorrowerName: "",
    coBorrowerPhone: "",
    coBorrowerEmail: "",
    installAddressLine: lead?.address_line ?? "",
    installCity: lead?.city ?? "",
    installState: lead?.state ?? "",
    installZip: lead?.zipcode ?? "",
    systemSizeKw: "",
    estProductionKwh: "",
    firstYearMonthlyPayment: "",
    escalator: HIC_ESCALATOR_OPTIONS[0],
    kwhRate: HIC_KWH_RATE_OPTIONS[0],
    estimatedTaxCredit: "",
    amountDueAtSigning: "",
    monthlyPaymentMismatchAcknowledged: false,
  };
}

function hicToFormInput(hic: Hic): HicFormInput {
  return {
    financingTypeId: hic.financing_type_id,
    language: hic.language,
    customerName: hic.customer_name,
    customerPhone: hic.customer_phone,
    customerEmail: hic.customer_email,
    hasCoBorrower: hic.has_co_borrower,
    coBorrowerName: hic.co_borrower_name ?? "",
    coBorrowerPhone: hic.co_borrower_phone ?? "",
    coBorrowerEmail: hic.co_borrower_email ?? "",
    installAddressLine: hic.install_address_line,
    installCity: hic.install_city,
    installState: hic.install_state,
    installZip: hic.install_zip,
    systemSizeKw: String(hic.system_size_kw),
    estProductionKwh: String(hic.est_production_kwh),
    firstYearMonthlyPayment: String(hic.first_year_monthly_payment),
    escalator: hic.escalator,
    kwhRate: hic.kwh_rate,
    estimatedTaxCredit: String(hic.estimated_tax_credit),
    amountDueAtSigning: String(hic.amount_due_at_signing),
    monthlyPaymentMismatchAcknowledged: hic.monthly_payment_mismatch_acknowledged,
  };
}

export function SendHicSection({
  appointment,
  lead,
  financingTypes,
  existingHics,
  onHicChanged,
}: {
  appointment: Appointment;
  lead: AppointmentLead | null;
  financingTypes: HicFinancingType[];
  existingHics: Hic[];
  onHicChanged: (hic: Hic) => void;
}) {
  const enabledFinancingType = financingTypes.find((f) => f.is_enabled);

  const [mode, setMode] = useState<"idle" | "form" | "review">("idle");
  const [activeHic, setActiveHic] = useState<Hic | null>(null);
  const [form, setForm] = useState<HicFormInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleStartNew() {
    if (!enabledFinancingType) return;
    const ok = window.confirm(
      `Start a new Home Improvement Contract for ${lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "this lead" : "this lead"}? You'll fill out system details and the homeowner's info next.`
    );
    if (!ok) return;
    setActiveHic(null);
    setForm(blankFormInput(lead, enabledFinancingType.id));
    setFormError(null);
    setMismatchWarning(false);
    setMode("form");
  }

  function handleResumeDraft(hic: Hic) {
    setActiveHic(hic);
    setForm(hicToFormInput(hic));
    setFormError(null);
    setMismatchWarning(false);
    setMode("form");
  }

  function handleCloseModal() {
    setMode("idle");
    setActiveHic(null);
    setForm(null);
  }

  function update<K extends keyof HicFormInput>(key: K, value: HicFormInput[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedNotice(false);
  }

  function handleSave(advanceToReview: boolean) {
    if (!form) return;
    setFormError(null);
    startSaving(async () => {
      const result = activeHic
        ? await updateHicDraft(activeHic.id, form)
        : await createHicDraft(appointment.id, form);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setActiveHic(result.hic);
      onHicChanged(result.hic);
      setMismatchWarning(result.monthlyPaymentMismatch && !form.monthlyPaymentMismatchAcknowledged);

      if (advanceToReview) {
        setMode("review");
      } else {
        setSavedNotice(true);
      }
    });
  }

  function handleSent(sentHic: Hic) {
    onHicChanged(sentHic);
    handleCloseModal();
  }

  if (mode === "review" && activeHic) {
    return (
      <SendHicModal title="Review & Send" onClose={handleCloseModal}>
        <HicReviewScreen hic={activeHic} onBack={() => setMode("form")} onSent={handleSent} />
      </SendHicModal>
    );
  }

  if (mode === "form" && form) {
    const numberOfPanelsPreview =
      Number(form.systemSizeKw) > 0 ? Math.round((Number(form.systemSizeKw) * 1000) / 450) : null;

    return (
      <SendHicModal title="Send HIC" onClose={handleCloseModal}>
        <div className="space-y-4">
          <div className="space-y-2">
            <SectionLabel>Document</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Language</label>
                <Select value={form.language} onChange={(e) => update("language", e.target.value as "en" | "es")} className="block w-full">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Financing</label>
                <Select value={form.financingTypeId} disabled className="block w-full">
                  {financingTypes.map((f) => (
                    <option key={f.id} value={f.id} disabled={!f.is_enabled}>
                      {f.label}{!f.is_enabled ? " (Coming soon)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Customer</SectionLabel>
            <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} placeholder="Customer name" className="block w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={form.customerPhone}
                onChange={(e) => update("customerPhone", formatPhoneInput(e.target.value))}
                placeholder="999-999-9999"
                className="block w-full"
              />
              <Input
                type="email"
                value={form.customerEmail}
                onChange={(e) => update("customerEmail", e.target.value)}
                placeholder="Customer email"
                className="block w-full"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={form.hasCoBorrower}
                onChange={(e) => update("hasCoBorrower", e.target.checked)}
                className="h-4 w-4"
              />
              Has co-borrower
            </label>
            {form.hasCoBorrower && (
              <div className="space-y-2 rounded-md border border-black/10 p-2 dark:border-white/10">
                <Input
                  value={form.coBorrowerName}
                  onChange={(e) => update("coBorrowerName", e.target.value)}
                  placeholder="Co-borrower name"
                  className="block w-full"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={form.coBorrowerPhone}
                    onChange={(e) => update("coBorrowerPhone", formatPhoneInput(e.target.value))}
                    placeholder="999-999-9999"
                    className="block w-full"
                  />
                  <Input
                    type="email"
                    value={form.coBorrowerEmail}
                    onChange={(e) => update("coBorrowerEmail", e.target.value)}
                    placeholder="Co-borrower email"
                    className="block w-full"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <SectionLabel>Installation address</SectionLabel>
            <Input
              value={form.installAddressLine}
              onChange={(e) => update("installAddressLine", e.target.value)}
              placeholder="Street"
              className="block w-full"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input value={form.installCity} onChange={(e) => update("installCity", e.target.value)} placeholder="City" />
              <Input value={form.installState} onChange={(e) => update("installState", e.target.value)} placeholder="State" />
              <Input value={form.installZip} onChange={(e) => update("installZip", e.target.value)} placeholder="ZIP" />
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>System &amp; pricing</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">System size (kW)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.systemSizeKw}
                  onChange={(e) => update("systemSizeKw", e.target.value)}
                  className="block w-full"
                />
                {numberOfPanelsPreview !== null && (
                  <p className="text-[11px] text-black/50 dark:text-white/50">
                    ≈ {numberOfPanelsPreview} panels (450W) — must divide evenly to send
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Est. production, first year (kWh)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.estProductionKwh}
                  onChange={(e) => update("estProductionKwh", e.target.value)}
                  className="block w-full"
                />
                <p className="text-[11px] text-black/50 dark:text-white/50">
                  Enter exactly as LightReach shows, including decimals.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">1st-yr monthly payment</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.firstYearMonthlyPayment}
                  onChange={(e) => update("firstYearMonthlyPayment", e.target.value)}
                  className="block w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Escalator</label>
                <Select
                  value={form.escalator}
                  onChange={(e) => update("escalator", Number(e.target.value))}
                  className="block w-full"
                >
                  {HIC_ESCALATOR_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {(e * 100).toFixed(2)}%
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">kWh rate</label>
                <Select value={form.kwhRate} onChange={(e) => update("kwhRate", Number(e.target.value))} className="block w-full">
                  {HIC_KWH_RATE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      ${r.toFixed(3)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {mismatchWarning && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              LightReach&apos;s first-year payment for these numbers is usually{" "}
              {formatCurrency(
                Math.round(((Number(form.estProductionKwh) * form.kwhRate) / 12) * 100) / 100
              )}{" "}
              — double-check your entry.
              <button
                type="button"
                onClick={() => update("monthlyPaymentMismatchAcknowledged", true)}
                className="ml-2 underline"
              >
                Looks right, continue
              </button>
            </div>
          )}

          {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}
          {savedNotice && !formError && <p className="text-xs text-green-600 dark:text-green-400">Saved as draft.</p>}

          {/* Cancel repeated down here (not just in the modal's header
              row) so it's reachable without scrolling back up on a long
              form — same reasoning as the header fix itself. */}
          <div className="flex items-center gap-3 border-t border-black/10 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={isSaving}
              className="shrink-0 text-sm text-black/50 hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
            >
              Cancel
            </button>
            <Button type="button" variant="secondary" size="sm" disabled={isSaving} onClick={() => handleSave(false)} className="flex-1">
              {isSaving ? "Saving…" : "Save as draft"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving || (mismatchWarning && !form.monthlyPaymentMismatchAcknowledged)}
              onClick={() => handleSave(true)}
              className="flex-1"
            >
              Continue to review
            </Button>
          </div>
        </div>
      </SendHicModal>
    );
  }

  return (
    <div className="mt-5 space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
      <p className="text-sm font-medium">Send HIC</p>

      {existingHics.length > 0 && (
        <ul className="space-y-1.5">
          {existingHics.map((hic) => (
            <li key={hic.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLOR[hic.status])}>
                  {STATUS_LABEL[hic.status]}
                </span>
                <span className="text-black/70 dark:text-white/70">{hic.customer_name}</span>
              </span>
              {hic.status === "draft" && (
                <button type="button" onClick={() => handleResumeDraft(hic)} className="text-xs underline">
                  Resume
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {enabledFinancingType ? (
        <Button type="button" size="sm" onClick={handleStartNew}>
          Send HIC
        </Button>
      ) : (
        <p className="text-xs text-black/50 dark:text-white/50">No financing type is available yet.</p>
      )}
    </div>
  );
}
