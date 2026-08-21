"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import { AddressActionsMenu } from "@/components/address-actions-menu";
import {
  addAppointmentNote,
  markDealSubmitted,
  rescheduleAppointment,
  saveAppointmentAssignments,
  updateAppointmentLeadName,
  updateAppointmentScheduledAt,
  updateAppointmentStatus,
} from "./actions";
import type {
  ActiveProfile,
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentRole,
  AppointmentStatus,
} from "./types";
import type { AppointmentFormField } from "@/app/leads/types";
import { StatusSelect } from "./status-select";

// Configured once William confirms the deal tool's actual stable
// production URL (Vercel Dashboard → tempo-deal-tool project → Domains —
// per-deployment URLs with a random hash turned out unreliable last time,
// don't hardcode one of those here).
const DEAL_TOOL_URL = process.env.NEXT_PUBLIC_DEAL_TOOL_URL;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no seconds/Z —
// same conversion set-appointment-modal.tsx already uses.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Mirrors AppointmentDetailScreen.swift's full layout: editable lead name,
// always-editable schedule date, staged opener/closer assign editor, status
// picker (with a "Rescheduled" special case that also asks for a new date),
// submission-form answers, and the notes section (submission note shown as
// a distinct card + ongoing notes below it). Section order (below the
// always-fixed Close button) is admin-configurable — see sectionOrder prop
// and /admin/appointments/section-order.
export function AppointmentDetailPanel({
  appointment,
  lead,
  statuses,
  formFields,
  assignments,
  notes,
  activeProfiles,
  sectionOrder,
  onClose,
  onAppointmentUpdated,
  onAssignmentsUpdated,
  onNoteAdded,
  onLeadNameUpdated,
}: {
  appointment: Appointment;
  lead: AppointmentLead | null;
  statuses: AppointmentStatus[];
  formFields: AppointmentFormField[];
  assignments: AppointmentAssignment[];
  notes: AppointmentNote[];
  activeProfiles: ActiveProfile[];
  sectionOrder: string[];
  onClose: () => void;
  onAppointmentUpdated: (updated: Appointment) => void;
  onAssignmentsUpdated: (newAssignments: AppointmentAssignment[]) => void;
  onNoteAdded: (note: AppointmentNote) => void;
  onLeadNameUpdated: (leadId: string, firstName: string | null, lastName: string | null) => void;
}) {
  const visible = useSlideIn();
  const originalName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ");
  const [nameDraft, setNameDraft] = useState(originalName);
  const [isSavingName, startNameSave] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

  const openers = assignments.filter((a) => a.role === "opener");
  const closers = assignments.filter((a) => a.role === "closer");
  const [stagedOpenerIds, setStagedOpenerIds] = useState<string[]>(openers.map((a) => a.user_id));
  const [stagedCloserIds, setStagedCloserIds] = useState<string[]>(closers.map((a) => a.user_id));
  const [isSavingAssignments, startAssignmentsSave] = useTransition();
  const [assignError, setAssignError] = useState<string | null>(null);

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateEditDraft, setDateEditDraft] = useState(() => toDatetimeLocal(appointment.scheduled_at));
  const [isSavingDate, startDateSave] = useTransition();

  const [pendingRescheduleStatusId, setPendingRescheduleStatusId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => toDatetimeLocal(appointment.scheduled_at));
  const [isUpdatingStatus, startStatusUpdate] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);

  const [newNoteText, setNewNoteText] = useState("");
  const [isSavingNote, startNoteSave] = useTransition();
  const [noteError, setNoteError] = useState<string | null>(null);

  const [isMarkingDeal, startMarkDeal] = useTransition();

  const hasUnsavedAssignmentChanges =
    JSON.stringify([...stagedOpenerIds].sort()) !== JSON.stringify(openers.map((a) => a.user_id).sort()) ||
    JSON.stringify([...stagedCloserIds].sort()) !== JSON.stringify(closers.map((a) => a.user_id).sort());

  function profileName(userId: string): string {
    return (
      activeProfiles.find((p) => p.id === userId)?.full_name ??
      assignments.find((a) => a.user_id === userId)?.full_name ??
      "Unknown"
    );
  }

  // Matched by label, same convention as iOS's notesFormField/Rescheduled
  // matching — there's no dedicated is_notes flag on the field, just a
  // plain admin-editable label.
  const notesFormField = formFields.find((f) => f.label.toLowerCase().includes("notes"));
  const otherFormFields = formFields.filter((f) => f.id !== notesFormField?.id);
  const submissionNoteText = notesFormField
    ? (appointment.custom_field_responses[notesFormField.id] ?? "").trim() || null
    : null;

  function submissionAnswer(field: AppointmentFormField): string {
    const raw = (appointment.custom_field_responses[field.id] ?? "").trim();
    if (!raw) return "—";
    if (field.field_type === "checkbox") return raw === "true" ? "Yes" : "No";
    return raw;
  }

  function handleSaveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || !lead) return;
    setNameError(null);
    startNameSave(async () => {
      const parts = trimmed.split(/\s+/);
      const firstName = parts[0] ?? null;
      const lastName = parts.slice(1).join(" ") || null;
      const result = await updateAppointmentLeadName(lead.id, firstName, lastName);
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      onLeadNameUpdated(lead.id, firstName, lastName);
    });
  }

  function handleSaveAssignments() {
    setAssignError(null);
    startAssignmentsSave(async () => {
      const result = await saveAppointmentAssignments({
        appointmentId: appointment.id,
        openerIds: stagedOpenerIds,
        closerIds: stagedCloserIds,
        currentOpenerIds: openers.map((a) => a.user_id),
        currentCloserIds: closers.map((a) => a.user_id),
      });
      if (!result.ok) {
        setAssignError(result.error);
        return;
      }
      const updated: AppointmentAssignment[] = [
        ...stagedOpenerIds.map((uid) => ({
          id: `opener-${uid}`,
          appointment_id: appointment.id,
          user_id: uid,
          role: "opener" as AppointmentRole,
          full_name: profileName(uid),
        })),
        ...stagedCloserIds.map((uid) => ({
          id: `closer-${uid}`,
          appointment_id: appointment.id,
          user_id: uid,
          role: "closer" as AppointmentRole,
          full_name: profileName(uid),
        })),
      ];
      onAssignmentsUpdated(updated);
    });
  }

  function handleSaveDate() {
    setStatusError(null);
    startDateSave(async () => {
      const iso = new Date(dateEditDraft).toISOString();
      const result = await updateAppointmentScheduledAt(appointment.id, iso);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      onAppointmentUpdated({ ...appointment, scheduled_at: iso, updated_at: new Date().toISOString() });
      setIsEditingDate(false);
    });
  }

  function handleSelectStatus(status: AppointmentStatus) {
    if (status.name.toLowerCase().includes("resched")) {
      setRescheduleDate(toDatetimeLocal(appointment.scheduled_at));
      setPendingRescheduleStatusId(status.id);
      return;
    }
    setStatusError(null);
    startStatusUpdate(async () => {
      const result = await updateAppointmentStatus(appointment.id, status.id);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      onAppointmentUpdated({ ...appointment, status_id: status.id, updated_at: new Date().toISOString() });
    });
  }

  function handleConfirmReschedule() {
    if (!pendingRescheduleStatusId) return;
    setStatusError(null);
    const statusId = pendingRescheduleStatusId;
    startStatusUpdate(async () => {
      const iso = new Date(rescheduleDate).toISOString();
      const result = await rescheduleAppointment(appointment.id, statusId, iso);
      setPendingRescheduleStatusId(null);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      onAppointmentUpdated({
        ...appointment,
        status_id: statusId,
        scheduled_at: iso,
        updated_at: new Date().toISOString(),
      });
    });
  }

  function handleSaveNote() {
    const text = newNoteText.trim();
    if (!text) return;
    setNoteError(null);
    startNoteSave(async () => {
      const result = await addAppointmentNote(appointment.id, text);
      if (!result.ok) {
        setNoteError(result.error);
        return;
      }
      onNoteAdded(result.note);
      setNewNoteText("");
    });
  }

  function handleSubmitDeal() {
    window.open(`${DEAL_TOOL_URL}/submit`, "_blank");
    startMarkDeal(async () => {
      const result = await markDealSubmitted(appointment.id);
      if (result.ok) {
        onAppointmentUpdated({ ...appointment, deal_submitted_at: new Date().toISOString() });
      }
    });
  }

  const currentStatus = statuses.find((s) => s.id === appointment.status_id);

  // Deal isn't one of the six admin-orderable sections (appointment_
  // detail_sections) — it always renders right after Status, same fixed
  // relationship the two already had before section ordering existed.
  // Only shown once the appointment has actually closed — matched by
  // name, same convention as the "Rescheduled" status match elsewhere in
  // this panel — not for every status like before.
  const isClosed = currentStatus?.name.toLowerCase().includes("closed") ?? false;
  const dealBlock = DEAL_TOOL_URL && isClosed && (
    <div className="mt-6 rounded-md border border-black/10 p-3 dark:border-white/10">
      <label className="text-xs font-medium">Deal</label>
      {appointment.deal_submitted_at ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
          <span className="text-black/60 dark:text-white/60">
            Submitted {new Date(appointment.deal_submitted_at).toLocaleString()}
          </span>
          <button
            onClick={handleSubmitDeal}
            disabled={isMarkingDeal}
            className="shrink-0 rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/20"
          >
            Resubmit
          </button>
        </div>
      ) : (
        <button
          onClick={handleSubmitDeal}
          disabled={isMarkingDeal}
          className="mt-1.5 w-full rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Submit Deal
        </button>
      )}
    </div>
  );

  const sectionContent: Record<string, ReactNode> = {
    lead: (
      <div>
        <div className="flex items-center gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-lg font-semibold dark:border-white/20 dark:bg-transparent"
          />
          {nameDraft.trim() && nameDraft.trim() !== originalName && (
            <button
              onClick={handleSaveName}
              disabled={isSavingName}
              className="shrink-0 rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isSavingName ? "…" : "Save"}
            </button>
          )}
        </div>
        {nameError && <p className="text-xs text-red-600 dark:text-red-400">{nameError}</p>}
        {lead && (
          <div className="mt-1 flex items-start justify-between gap-2">
            <AddressActionsMenu
              addressLine={lead.address_line}
              city={lead.city}
              state={lead.state}
              zipcode={lead.zipcode}
              lat={lead.lat}
              lng={lead.lng}
              className="text-left text-sm text-black/70 underline decoration-black/30 underline-offset-2 hover:decoration-black dark:text-white/70 dark:decoration-white/30 dark:hover:decoration-white"
            />
            <Link
              href={`/leads?lead=${lead.id}`}
              className="shrink-0 rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Go to Lead
            </Link>
          </div>
        )}
      </div>
    ),

    schedule: (
      <div className="space-y-2">
        <label className="text-xs font-medium">Schedule</label>
        {isEditingDate ? (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={dateEditDraft}
              onChange={(e) => setDateEditDraft(e.target.value)}
              className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
            <button
              onClick={handleSaveDate}
              disabled={isSavingDate}
              className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isSavingDate ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setIsEditingDate(false)}
              className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm">{new Date(appointment.scheduled_at).toLocaleString()}</span>
            <button
              onClick={() => {
                setDateEditDraft(toDatetimeLocal(appointment.scheduled_at));
                setIsEditingDate(true);
              }}
              className="text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    ),

    assigned: (
      <div className="space-y-3">
        <label className="text-xs font-medium">Assigned</label>
        <AssignRoleEditor
          title={stagedOpenerIds.length > 1 ? "Openers" : "Opener"}
          variant="opener"
          staged={stagedOpenerIds}
          setStaged={setStagedOpenerIds}
          activeProfiles={activeProfiles}
          profileName={profileName}
        />
        <AssignRoleEditor
          title={stagedCloserIds.length > 1 ? "Closers" : "Closer"}
          variant="closer"
          staged={stagedCloserIds}
          setStaged={setStagedCloserIds}
          activeProfiles={activeProfiles}
          profileName={profileName}
        />
        <button
          onClick={handleSaveAssignments}
          disabled={isSavingAssignments || !hasUnsavedAssignmentChanges}
          className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isSavingAssignments ? "Saving…" : "Save Assignment Changes"}
        </button>
        {assignError && <p className="text-xs text-red-600 dark:text-red-400">{assignError}</p>}
      </div>
    ),

    submission_details: otherFormFields.length > 0 && (
      <div className="space-y-1">
        <label className="text-xs font-medium">Submission Details</label>
        {otherFormFields.map((field) => (
          <div key={field.id} className="flex justify-between text-sm">
            <span className="text-black/60 dark:text-white/60">{field.label}</span>
            <span>{submissionAnswer(field)}</span>
          </div>
        ))}
      </div>
    ),

    status: (
      <div className="space-y-2">
        <label className="text-xs font-medium">Status</label>
        {pendingRescheduleStatusId ? (
          <div className="space-y-2">
            <input
              type="datetime-local"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
            <div className="flex gap-2">
              <button
                onClick={handleConfirmReschedule}
                disabled={isUpdatingStatus}
                className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                Confirm
              </button>
              <button
                onClick={() => setPendingRescheduleStatusId(null)}
                className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <StatusSelect
            statuses={statuses}
            value={appointment.status_id}
            onChange={handleSelectStatus}
            disabled={isUpdatingStatus}
          />
        )}
        {isUpdatingStatus && !pendingRescheduleStatusId && (
          <p className="text-xs text-black/50 dark:text-white/50">Updating…</p>
        )}
        {statusError && <p className="text-xs text-red-600 dark:text-red-400">{statusError}</p>}
        {!pendingRescheduleStatusId && currentStatus && (
          <p className="text-xs text-black/40 dark:text-white/40">Current: {currentStatus.name}</p>
        )}
        {dealBlock}
      </div>
    ),

    notes: (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Notes</h3>
        <div className="space-y-1">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className="w-full rounded border border-black/15 px-2 py-1 text-base md:text-sm dark:border-white/20 dark:bg-transparent"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveNote}
              disabled={!newNoteText.trim() || isSavingNote}
              className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isSavingNote ? "Saving…" : "Save Note"}
            </button>
            {noteError && <span className="text-xs text-red-600 dark:text-red-400">{noteError}</span>}
          </div>
          <p className="text-xs text-black/40 dark:text-white/40">
            Only visible to people assigned to this appointment.
          </p>
        </div>

        <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
          {!submissionNoteText && notes.length === 0 && (
            <p className="text-xs italic text-black/40 dark:text-white/40">No notes yet.</p>
          )}

          {/* The note typed into the submission form itself — shown with
              a card treatment so it visually reads as the appointment's
              own note, same distinction AppointmentDetailScreen.swift
              makes on iOS. */}
          {submissionNoteText && (
            <div className="rounded-md bg-black/[0.03] p-3 text-sm dark:bg-white/[0.06]">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                Appointment Note
              </p>
              <p className="whitespace-pre-wrap">{submissionNoteText}</p>
            </div>
          )}

          {notes.map((n) => (
            <div key={n.id} className="text-sm">
              <p className="text-xs text-black/50 dark:text-white/50">
                {n.author_name} · {new Date(n.created_at).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{n.note}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-30 h-full w-full max-w-md overflow-y-auto border-l border-black/10 bg-white p-6 shadow-xl transition-transform duration-200 ease-out dark:border-white/10 dark:bg-neutral-950",
          visible ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="shrink-0 text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        {sectionOrder.map((key, i) => (
          <div
            key={key}
            className={cn(
              "mt-4",
              // First section sits right under the name/close row — a
              // divider there would look like a stray line, not an
              // actual boundary between two data groups.
              i > 0 && "mt-6 border-t border-black/10 pt-4 dark:border-white/10"
            )}
          >
            {sectionContent[key] ?? null}
          </div>
        ))}
      </div>
    </>
  );
}

// Opener = blue, Closer = amber — distinct accent colors so the two
// sections are easy to tell apart at a glance instead of just reading
// the small text label above each one.
const ROLE_VARIANT_CLASSES = {
  opener: "border-blue-600/30 bg-blue-50 dark:border-blue-400/30 dark:bg-blue-500/10",
  closer: "border-amber-600/30 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-500/10",
} as const;

const ROLE_LABEL_CLASSES = {
  opener: "text-blue-700 dark:text-blue-400",
  closer: "text-amber-700 dark:text-amber-400",
} as const;

function AssignRoleEditor({
  title,
  variant,
  staged,
  setStaged,
  activeProfiles,
  profileName,
}: {
  title: string;
  variant: "opener" | "closer";
  staged: string[];
  setStaged: (updater: (prev: string[]) => string[]) => void;
  activeProfiles: ActiveProfile[];
  profileName: (userId: string) => string;
}) {
  const [pickerValue, setPickerValue] = useState("");
  const available = activeProfiles.filter((p) => !staged.includes(p.id));

  return (
    <div className={cn("space-y-1.5 rounded-lg border p-2.5", ROLE_VARIANT_CLASSES[variant])}>
      <p className={cn("text-xs font-semibold", ROLE_LABEL_CLASSES[variant])}>{title}</p>
      {staged.length === 0 && (
        <p className="text-sm text-black/40 dark:text-white/40">Unassigned</p>
      )}
      {[...staged]
        .sort((a, b) => profileName(a).localeCompare(profileName(b)))
        .map((userId) => (
          <div key={userId} className="flex items-center justify-between text-sm">
            <span>{profileName(userId)}</span>
            <button
              onClick={() => setStaged((prev) => prev.filter((id) => id !== userId))}
              className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              aria-label={`Remove ${profileName(userId)}`}
            >
              ✕
            </button>
          </div>
        ))}
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={pickerValue}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              setStaged((prev) => [...prev, id]);
              setPickerValue("");
            }}
            className="rounded border border-black/15 bg-white px-2 py-1 text-xs dark:border-white/20 dark:bg-transparent"
          >
            <option value="">+ Add person…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
