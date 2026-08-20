"use client";

import { useMemo, useState } from "react";
import { AppointmentsCalendar } from "@/app/admin/appointments/appointments-calendar";
import { RepAppointmentDetail } from "./rep-appointment-detail";
import type {
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "@/app/admin/appointments/types";

export function AppointmentsClient({
  currentUserId,
  appointments,
  statuses,
  leads,
  initialAssignments,
  initialNotes,
}: {
  currentUserId: string;
  appointments: Appointment[];
  statuses: AppointmentStatus[];
  leads: AppointmentLead[];
  initialAssignments: AppointmentAssignment[];
  initialNotes: AppointmentNote[];
}) {
  const [appointmentsState, setAppointmentsState] = useState(appointments);
  // Not stateful — this view has no way to change who's assigned
  // (that's admin-only, per appointment_assignments_admin_write RLS),
  // so the initial fetch is all it'll ever show.
  const assignments = initialAssignments;
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const selected = appointmentsState.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Appointments</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Your assigned appointments — as opener or closer.
        </p>
      </div>

      {appointmentsState.length === 0 ? (
        <p className="text-sm italic text-black/50 dark:text-white/50">
          No appointments assigned to you yet.
        </p>
      ) : (
        <AppointmentsCalendar
          appointments={appointmentsState}
          statuses={statuses}
          leadById={leadById}
          onSelect={setSelectedId}
        />
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
    </div>
  );
}
