"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { createHicDraft, updateHicDraft } from "./actions";
import { HicReviewScreen } from "./hic-review-screen";
import { SendHicModal } from "./send-hic-modal";
import { HicFormFields, blankFormInput, hicToFormInput } from "./hic-form-fields";
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
    return (
      <SendHicModal title="Send HIC" onClose={handleCloseModal}>
        <div className="space-y-4">
          <HicFormFields form={form} update={update} financingTypes={financingTypes} mismatchWarning={mismatchWarning} />

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
