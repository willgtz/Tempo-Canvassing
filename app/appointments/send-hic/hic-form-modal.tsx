"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SendHicModal } from "@/app/appointments/send-hic/send-hic-modal";
import { HicReviewScreen } from "@/app/appointments/send-hic/hic-review-screen";
import { HicFormFields, blankFormInput, hicToFormInput } from "@/app/appointments/send-hic/hic-form-fields";
import { createStandaloneHicDraft, updateHicDraft } from "@/app/appointments/send-hic/actions";
import type { Hic, HicFinancingType, HicFormInput } from "@/app/appointments/send-hic/types";

// Shared form->review->send modal for every "no fresh idle state needed"
// context: the Correct flow from either the admin HICs list/detail page
// or the rep appointment panel (initialHic is the new draft correctHic()
// already created, pre-filled), and manually creating a standalone HIC
// from the admin list (initialHic is null, blank form). Mirrors
// SendHicSection's own state machine but starts at "form" instead of
// "idle" since the caller already decided to open this.
export function HicFormModal({
  initialHic,
  financingTypes,
  title,
  onClose,
  onSent,
  isAdmin,
}: {
  initialHic: Hic | null;
  financingTypes: HicFinancingType[];
  title: string;
  onClose: () => void;
  onSent: (hic: Hic) => void;
  isAdmin: boolean;
}) {
  const enabledFinancingType = financingTypes.find((f) => f.is_enabled);

  const [mode, setMode] = useState<"form" | "review">("form");
  const [activeHic, setActiveHic] = useState<Hic | null>(initialHic);
  const [form, setForm] = useState<HicFormInput>(() =>
    initialHic ? hicToFormInput(initialHic) : blankFormInput(null, enabledFinancingType?.id ?? "")
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function update<K extends keyof HicFormInput>(key: K, value: HicFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(false);
  }

  function handleSave(advanceToReview: boolean) {
    setFormError(null);
    startSaving(async () => {
      const result = activeHic
        ? await updateHicDraft(activeHic.id, form)
        : await createStandaloneHicDraft(form);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setActiveHic(result.hic);
      setMismatchWarning(result.monthlyPaymentMismatch && !form.monthlyPaymentMismatchAcknowledged);

      if (advanceToReview) {
        setMode("review");
      } else {
        setSavedNotice(true);
      }
    });
  }

  if (mode === "review" && activeHic) {
    return (
      <SendHicModal title="Review & Send" onClose={onClose}>
        <HicReviewScreen hic={activeHic} onBack={() => setMode("form")} onSent={onSent} />
      </SendHicModal>
    );
  }

  return (
    <SendHicModal title={title} onClose={onClose}>
      <div className="space-y-4">
        <HicFormFields form={form} update={update} financingTypes={financingTypes} mismatchWarning={mismatchWarning} isAdmin={isAdmin} />

        {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}
        {savedNotice && !formError && <p className="text-xs text-green-600 dark:text-green-400">Saved as draft.</p>}

        <div className="flex items-center gap-3 border-t border-black/10 pt-3 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
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
