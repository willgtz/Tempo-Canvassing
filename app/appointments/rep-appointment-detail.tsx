"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateMyAppointmentStatus, updateMyAppointmentScheduledAt, addMyAppointmentNote } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddressActionsMenu } from "@/components/address-actions-menu";
import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import type {
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "@/app/admin/appointments/types";
import type { AppointmentFormField } from "@/app/leads/types";

// Deliberately simpler than app/admin/appointments/appointment-detail-panel.tsx
// — no assignment editing (that's an admin-only action either way, per
// appointment_assignments_admin_write RLS). Does show submission-form
// answers (added 2026-09-16 — previously admin-only, but any assignee
// can already see the whole appointment row via appointments_select RLS;
// this was a missing-UI gap, not a real permission boundary) using the
// same notesFormField/otherFormFields split as the admin panel.

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no seconds/Z —
// same conversion app/admin/appointments/appointment-detail-panel.tsx
// already uses for the exact same control.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function RepAppointmentDetail({
  appointment,
  lead,
  statuses,
  formFields,
  currentUserId,
  assignments,
  notes,
  onClose,
  onStatusChanged,
  onScheduledAtChanged,
  onNoteAdded,
}: {
  appointment: Appointment;
  lead: AppointmentLead | null;
  statuses: AppointmentStatus[];
  formFields: AppointmentFormField[];
  currentUserId: string;
  assignments: AppointmentAssignment[];
  notes: AppointmentNote[];
  onClose: () => void;
  onStatusChanged: (appointmentId: string, statusId: string) => void;
  onScheduledAtChanged: (appointmentId: string, scheduledAt: string) => void;
  onNoteAdded: (note: AppointmentNote) => void;
}) {
  const isMyCloseJob = assignments.some((a) => a.role === "closer" && a.user_id === currentUserId);
  // Broader than isMyCloseJob — any role, opener or closer. The date/time
  // fix is deliberately available to whoever's assigned, unlike status
  // (still closer-only, matching appointments_update RLS).
  const isAssignedToThis = assignments.some((a) => a.user_id === currentUserId);
  const openers = assignments.filter((a) => a.role === "opener");
  const closers = assignments.filter((a) => a.role === "closer");
  const currentStatus = statuses.find((s) => s.id === appointment.status_id);

  // Same notesFormField/otherFormFields split as
  // app/admin/appointments/appointment-detail-panel.tsx — matched by
  // label containing "notes" (no dedicated is_notes flag on the field).
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

  const visible = useSlideIn();
  const [statusId, setStatusId] = useState(appointment.status_id);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isSavingStatus, startStatusSave] = useTransition();

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateEditDraft, setDateEditDraft] = useState(() => toDatetimeLocal(appointment.scheduled_at));
  const [dateError, setDateError] = useState<string | null>(null);
  const [isSavingDate, startDateSave] = useTransition();

  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, startNoteSave] = useTransition();

  function handleStatusChange(newStatusId: string) {
    setStatusId(newStatusId);
    setStatusError(null);
    startStatusSave(async () => {
      const result = await updateMyAppointmentStatus(appointment.id, newStatusId);
      if (!result.ok) {
        setStatusError(result.error);
        setStatusId(appointment.status_id);
        return;
      }
      onStatusChanged(appointment.id, newStatusId);
    });
  }

  function handleSaveDate() {
    setDateError(null);
    startDateSave(async () => {
      const iso = new Date(dateEditDraft).toISOString();
      const result = await updateMyAppointmentScheduledAt(appointment.id, iso);
      if (!result.ok) {
        setDateError(result.error);
        return;
      }
      onScheduledAtChanged(appointment.id, iso);
      setIsEditingDate(false);
    });
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    setNoteError(null);
    startNoteSave(async () => {
      const result = await addMyAppointmentNote(appointment.id, noteText);
      if (!result.ok) {
        setNoteError(result.error);
        return;
      }
      onNoteAdded(result.note);
      setNoteText("");
    });
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-black/10 bg-white/90 p-5 shadow-xl backdrop-blur-xl transition-all duration-200 ease-out sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-md sm:rounded-2xl sm:border dark:border-white/10 dark:bg-neutral-950/90",
          visible ? "translate-y-0 sm:translate-y-0 sm:opacity-100" : "translate-y-full sm:translate-y-4 sm:opacity-0"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unknown lead"}
            </h2>
            {lead ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AddressActionsMenu
                  addressLine={lead.address_line}
                  city={lead.city}
                  state={lead.state}
                  zipcode={lead.zipcode}
                  lat={lead.lat}
                  lng={lead.lng}
                  singleLine
                  className="text-left text-sm text-black/60 underline decoration-black/30 underline-offset-2 hover:decoration-black dark:text-white/60 dark:decoration-white/30 dark:hover:decoration-white"
                />
                <Link
                  href={`/leads?lead=${lead.id}`}
                  className="shrink-0 rounded-full border border-black/15 px-2 py-0.5 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Go to Lead
                </Link>
              </div>
            ) : (
              <p className="text-sm text-black/60 dark:text-white/60">—</p>
            )}
            {lead?.phone && (
              <p className="mt-0.5 text-sm text-black/60 dark:text-white/60">{lead.phone}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
          {isEditingDate ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={dateEditDraft}
                onChange={(e) => setDateEditDraft(e.target.value)}
                className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
              <Button size="sm" onClick={handleSaveDate} disabled={isSavingDate}>
                {isSavingDate ? "Saving…" : "Save"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsEditingDate(false)} disabled={isSavingDate}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {new Date(appointment.scheduled_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              {isAssignedToThis && (
                <button
                  onClick={() => {
                    setDateEditDraft(toDatetimeLocal(appointment.scheduled_at));
                    setIsEditingDate(true);
                  }}
                  className="text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
                >
                  Edit
                </button>
              )}
            </div>
          )}
          {dateError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{dateError}</p>}
        </div>

        <div className="mt-4 space-y-1 border-t border-black/10 pt-4 dark:border-white/10">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">Opener{openers.length === 1 ? "" : "s"}</p>
          <p className="text-sm">{openers.map((a) => a.full_name).join(", ") || "—"}</p>
          <p className="mt-2 text-xs font-medium text-black/50 dark:text-white/50">Closer{closers.length === 1 ? "" : "s"}</p>
          <p className="text-sm">{closers.map((a) => a.full_name).join(", ") || "Unassigned"}</p>
        </div>

        {otherFormFields.length > 0 && (
          <div className="mt-4 space-y-1 border-t border-black/10 pt-4 dark:border-white/10">
            <p className="text-xs font-medium text-black/50 dark:text-white/50">Submission Details</p>
            {otherFormFields.map((field) => (
              <div key={field.id} className="flex justify-between text-sm">
                <span className="text-black/60 dark:text-white/60">{field.label}</span>
                <span>{submissionAnswer(field)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-1 border-t border-black/10 pt-4 dark:border-white/10">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">Status</p>
          {isMyCloseJob ? (
            <Select value={statusId} onChange={(e) => handleStatusChange(e.target.value)} disabled={isSavingStatus}>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : (
            <Badge color={currentStatus?.color}>{currentStatus?.name ?? "—"}</Badge>
          )}
          {statusError && <p className="text-xs text-red-600 dark:text-red-400">{statusError}</p>}
        </div>

        <div className="mt-5 space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
          <p className="text-sm font-medium">Notes</p>
          <form onSubmit={handleAddNote} className="flex gap-2">
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={isSavingNote || !noteText.trim()}>
              {isSavingNote ? "Saving…" : "Add"}
            </Button>
          </form>
          {noteError && <p className="text-xs text-red-600 dark:text-red-400">{noteError}</p>}

          <div className="space-y-2 pt-1">
            {!submissionNoteText && notes.length === 0 && (
              <p className="text-sm italic text-black/40 dark:text-white/40">No notes yet.</p>
            )}

            {/* The note typed into the submission form itself — same card
                treatment as the admin panel, so it visually reads as the
                appointment's own note rather than a regular note. */}
            {submissionNoteText && (
              <div className="rounded-md bg-black/[0.03] p-3 text-sm dark:bg-white/[0.06]">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                  Appointment Note
                </p>
                <p className="whitespace-pre-wrap">{submissionNoteText}</p>
              </div>
            )}

            {notes.map((note) => (
              <div key={note.id} className="text-sm">
                <p className="text-xs text-black/50 dark:text-white/50">
                  {note.author_name} · {new Date(note.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <p>{note.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
