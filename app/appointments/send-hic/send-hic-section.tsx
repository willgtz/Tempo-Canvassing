"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { createHicDraft, updateHicDraft, resendHic, voidHic, correctHic, archiveHic, unarchiveHic } from "./actions";
import { HicReviewScreen } from "./hic-review-screen";
import { HicFormModal } from "./hic-form-modal";
import { SendHicModal } from "./send-hic-modal";
import { HicFormFields, blankFormInput, hicToFormInput } from "./hic-form-fields";
import type { Appointment, AppointmentLead } from "@/app/admin/appointments/types";
import type { Hic, HicFinancingType, HicFormInput, HicStatus } from "./types";

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

// Resend/Void/Correct are only offered while a HIC is still awaiting a
// signature — matches resendHic's own server-side guard exactly, and
// (per William's explicit choice) is also the cutoff for Void and
// Correct here: once a HIC is fully Signed, undoing it is an admin-only
// action from the admin HICs page, not a one-tap button on a rep's
// phone. Declined/expired/voided HICs are already dead ends and get no
// action buttons here either (Archive excepted) — the admin page is the
// place to resurrect/correct one of those if ever needed.
const AWAITING_SIGNATURE: HicStatus[] = ["sent", "viewed", "partially_signed"];

type RowAction = "resend" | "correct" | "void" | "archive" | "unarchive";

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

  // Per-row Resend/Correct/Void/Archive actions — separate from the
  // form's own isSaving transition since they're triggered from the
  // idle list view, never while the form/review modal is open.
  const [correctingHic, setCorrectingHic] = useState<Hic | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowNotice, setRowNotice] = useState<string | null>(null);
  const [pendingHicId, setPendingHicId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<RowAction | null>(null);
  const [isRowPending, startRowAction] = useTransition();

  // Resend/Correct/Void/Archive stay tucked behind an "Actions" toggle
  // per HIC, collapsed by default — with several HICs on one appointment
  // (a correction history, say), four buttons apiece would otherwise
  // make this section scroll on forever. Independent per-row state (not
  // an accordion) so expanding one doesn't collapse another.
  const [expandedHicIds, setExpandedHicIds] = useState<Set<string>>(new Set());

  function toggleExpanded(hicId: string) {
    setExpandedHicIds((prev) => {
      const next = new Set(prev);
      if (next.has(hicId)) next.delete(hicId);
      else next.add(hicId);
      return next;
    });
  }

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

  function handleResend(hic: Hic) {
    setRowError(null);
    setRowNotice(null);
    setPendingHicId(hic.id);
    setPendingAction("resend");
    startRowAction(async () => {
      const result = await resendHic(hic.id);
      if (!result.ok) setRowError(result.error);
      else setRowNotice(`Resent to ${hic.customer_name}.`);
    });
  }

  function handleVoid(hic: Hic) {
    const reason = window.prompt(
      "Reason for voiding this HIC (optional — leave blank and press OK to void without one):"
    );
    // Cancelling the prompt itself aborts, same as the admin page.
    if (reason === null) return;
    setRowError(null);
    setRowNotice(null);
    setPendingHicId(hic.id);
    setPendingAction("void");
    startRowAction(async () => {
      const result = await voidHic(hic.id, reason.trim() || undefined);
      if (!result.ok) setRowError(result.error);
      else {
        onHicChanged(result.hic);
        setRowNotice("Voided.");
      }
    });
  }

  function handleCorrect(hic: Hic) {
    setRowError(null);
    setRowNotice(null);
    setPendingHicId(hic.id);
    setPendingAction("correct");
    startRowAction(async () => {
      const result = await correctHic(hic.id);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      setCorrectingHic(result.hic);
    });
  }

  function handleArchiveToggle(hic: Hic) {
    setRowError(null);
    setRowNotice(null);
    setPendingHicId(hic.id);
    setPendingAction(hic.archived_at ? "unarchive" : "archive");
    startRowAction(async () => {
      const result = hic.archived_at ? await unarchiveHic(hic.id) : await archiveHic(hic.id);
      if (!result.ok) setRowError(result.error);
      else {
        onHicChanged(result.hic);
        setRowNotice(hic.archived_at ? "Unarchived." : "Archived.");
      }
    });
  }

  // The original isn't flipped to voided until the correction is
  // actually SENT (see sendHic in actions.ts), so this component's own
  // local hics list needs a second, client-side patch here — there's no
  // router.refresh() in this tree to pick up the server-side change for
  // us (existingHics lives in the parent's own useState, kept in sync
  // purely via onHicChanged).
  function handleCorrectionSent(newHic: Hic) {
    onHicChanged(newHic);
    if (newHic.original_hic_id) {
      const original = existingHics.find((h) => h.id === newHic.original_hic_id);
      if (original) {
        onHicChanged({
          ...original,
          status: "voided",
          voided_at: new Date().toISOString(),
          corrected_into_hic_id: newHic.id,
        });
      }
    }
    setCorrectingHic(null);
    setRowNotice("Correction sent — the original was voided.");
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

      {rowError && <p className="text-xs text-red-600 dark:text-red-400">{rowError}</p>}
      {rowNotice && !rowError && <p className="text-xs text-green-600 dark:text-green-400">{rowNotice}</p>}

      {existingHics.length > 0 && (
        <ul className="space-y-2">
          {existingHics.map((hic) => {
            const awaitingSignature = AWAITING_SIGNATURE.includes(hic.status);
            const canCorrect = awaitingSignature && !hic.corrected_into_hic_id;
            const busy = isRowPending && pendingHicId === hic.id;
            const isExpanded = expandedHicIds.has(hic.id);

            return (
              <li key={hic.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLOR[hic.status])}>
                      {STATUS_LABEL[hic.status]}
                    </span>
                    {hic.archived_at && (
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
                        Archived
                      </span>
                    )}
                    <span className="text-sm text-black/70 dark:text-white/70">{hic.customer_name}</span>
                  </div>
                  {hic.status !== "draft" && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(hic.id)}
                      className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                    >
                      Actions {isExpanded ? "▴" : "▾"}
                    </button>
                  )}
                </div>

                {hic.status === "draft" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={() => handleResumeDraft(hic)}
                    className="mt-2 w-full"
                  >
                    Resume
                  </Button>
                ) : isExpanded ? (
                  // grid-cols-2 keeps every button large enough for a
                  // thumb regardless of how many apply to this HIC (1-4) —
                  // an odd count just leaves the last button alone on its
                  // own row instead of shrinking everything to fit.
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {awaitingSignature && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        disabled={isRowPending}
                        onClick={() => handleResend(hic)}
                      >
                        {busy && pendingAction === "resend" ? "Resending…" : "Resend"}
                      </Button>
                    )}
                    {canCorrect && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        disabled={isRowPending}
                        onClick={() => handleCorrect(hic)}
                      >
                        {busy && pendingAction === "correct" ? "Preparing…" : "Correct"}
                      </Button>
                    )}
                    {awaitingSignature && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        disabled={isRowPending}
                        onClick={() => handleVoid(hic)}
                      >
                        {busy && pendingAction === "void" ? "Voiding…" : "Void"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      disabled={isRowPending}
                      onClick={() => handleArchiveToggle(hic)}
                    >
                      {busy && (pendingAction === "archive" || pendingAction === "unarchive")
                        ? hic.archived_at
                          ? "Unarchiving…"
                          : "Archiving…"
                        : hic.archived_at
                          ? "Unarchive"
                          : "Archive"}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {enabledFinancingType ? (
        <Button type="button" size="lg" onClick={handleStartNew} className="w-full">
          Send HIC
        </Button>
      ) : (
        <p className="text-xs text-black/50 dark:text-white/50">No financing type is available yet.</p>
      )}

      {correctingHic && (
        <HicFormModal
          initialHic={correctingHic}
          financingTypes={financingTypes}
          title="Correct HIC"
          onClose={() => setCorrectingHic(null)}
          onSent={handleCorrectionSent}
        />
      )}
    </div>
  );
}
