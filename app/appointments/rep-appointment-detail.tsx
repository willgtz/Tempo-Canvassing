"use client";

import { useState, useTransition } from "react";
import { updateMyAppointmentStatus, addMyAppointmentNote } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import type {
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "@/app/admin/appointments/types";

// Deliberately simpler than app/admin/appointments/appointment-detail-panel.tsx
// — no assignment editing (that's an admin-only action either way, per
// appointment_assignments_admin_write RLS), no reschedule, no submission-
// form answers. Just what a rep actually needs: who's on it, when it is,
// its status (editable only if this rep is the assigned closer — enforced
// for real by appointments_update RLS, this UI just avoids offering a
// control that would fail), and notes.
export function RepAppointmentDetail({
  appointment,
  lead,
  statuses,
  currentUserId,
  assignments,
  notes,
  onClose,
  onStatusChanged,
  onNoteAdded,
}: {
  appointment: Appointment;
  lead: AppointmentLead | null;
  statuses: AppointmentStatus[];
  currentUserId: string;
  assignments: AppointmentAssignment[];
  notes: AppointmentNote[];
  onClose: () => void;
  onStatusChanged: (appointmentId: string, statusId: string) => void;
  onNoteAdded: (note: AppointmentNote) => void;
}) {
  const isMyCloseJob = assignments.some((a) => a.role === "closer" && a.user_id === currentUserId);
  const openers = assignments.filter((a) => a.role === "opener");
  const closers = assignments.filter((a) => a.role === "closer");
  const currentStatus = statuses.find((s) => s.id === appointment.status_id);

  const visible = useSlideIn();
  const [statusId, setStatusId] = useState(appointment.status_id);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isSavingStatus, startStatusSave] = useTransition();

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
            <p className="text-sm text-black/60 dark:text-white/60">
              {lead ? `${lead.address_line}, ${[lead.city, lead.state, lead.zipcode].filter(Boolean).join(", ")}` : "—"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <p className="mt-4 border-t border-black/10 pt-4 text-sm dark:border-white/10">
          {new Date(appointment.scheduled_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>

        <div className="mt-4 space-y-1 border-t border-black/10 pt-4 dark:border-white/10">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">Opener{openers.length === 1 ? "" : "s"}</p>
          <p className="text-sm">{openers.map((a) => a.full_name).join(", ") || "—"}</p>
          <p className="mt-2 text-xs font-medium text-black/50 dark:text-white/50">Closer{closers.length === 1 ? "" : "s"}</p>
          <p className="text-sm">{closers.map((a) => a.full_name).join(", ") || "Unassigned"}</p>
        </div>

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
            {notes.length === 0 && (
              <p className="text-sm italic text-black/40 dark:text-white/40">No notes yet.</p>
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
