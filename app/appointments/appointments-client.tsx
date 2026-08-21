"use client";

import { useMemo, useState } from "react";
import { AppointmentsCalendar } from "@/app/admin/appointments/appointments-calendar";
import { AppointmentsList } from "./appointments-list";
import { RepAppointmentDetail } from "./rep-appointment-detail";
import { AddMyManualAppointmentModal } from "./add-my-manual-appointment-modal";
import { cn } from "@/components/ui/cn";
import type {
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "@/app/admin/appointments/types";
import type { AppointmentFormField } from "@/app/leads/types";

export function AppointmentsClient({
  currentUserId,
  appointments,
  statuses,
  leads,
  formFields,
  initialAssignments,
  initialNotes,
}: {
  currentUserId: string;
  appointments: Appointment[];
  statuses: AppointmentStatus[];
  leads: AppointmentLead[];
  formFields: AppointmentFormField[];
  initialAssignments: AppointmentAssignment[];
  initialNotes: AppointmentNote[];
}) {
  const [appointmentsState, setAppointmentsState] = useState(appointments);
  const [leadsState, setLeadsState] = useState(leads);
  // Not stateful — this view has no way to change who's assigned
  // (that's admin-only, per appointment_assignments_admin_write RLS),
  // so the initial fetch is all it'll ever show.
  const assignments = initialAssignments;
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showAddAppointment, setShowAddAppointment] = useState(false);

  const leadById = useMemo(() => new Map(leadsState.map((l) => [l.id, l])), [leadsState]);
  const selected = appointmentsState.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden p-4 md:gap-6 md:p-6">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Appointments</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowAddAppointment(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
            aria-label="New appointment"
            title="New appointment"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div className="flex shrink-0 overflow-hidden rounded-full border border-black/15 dark:border-white/20">
            {(["calendar", "list"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 py-1 text-sm font-medium capitalize transition-colors",
                  viewMode === mode ? "bg-blue-600 text-white dark:bg-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {appointmentsState.length === 0 ? (
        <p className="text-sm italic text-black/50 dark:text-white/50">
          No appointments assigned to you yet.
        </p>
      ) : viewMode === "calendar" ? (
        <AppointmentsCalendar
          className="min-h-0 flex-1"
          appointments={appointmentsState}
          statuses={statuses}
          leadById={leadById}
          onSelect={setSelectedId}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AppointmentsList
            appointments={appointmentsState}
            statuses={statuses}
            leadById={leadById}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {selected && (
        <RepAppointmentDetail
          appointment={selected}
          lead={leadById.get(selected.lead_id) ?? null}
          statuses={statuses}
          currentUserId={currentUserId}
          assignments={assignments.filter((a) => a.appointment_id === selected.id)}
          notes={notes.filter((n) => n.appointment_id === selected.id)}
          onClose={() => setSelectedId(null)}
          onStatusChanged={(appointmentId, statusId) => {
            setAppointmentsState((prev) =>
              prev.map((a) => (a.id === appointmentId ? { ...a, status_id: statusId } : a))
            );
          }}
          onNoteAdded={(note) => setNotes((prev) => [note, ...prev])}
        />
      )}

      {showAddAppointment && (
        <AddMyManualAppointmentModal
          formFields={formFields}
          onClose={() => setShowAddAppointment(false)}
          onCreated={(appointment, lead) => {
            setAppointmentsState((prev) => [...prev, appointment]);
            setLeadsState((prev) => [...prev, lead]);
            setShowAddAppointment(false);
          }}
        />
      )}
    </div>
  );
}
