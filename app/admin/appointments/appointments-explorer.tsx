"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppointmentDetailPanel } from "./appointment-detail-panel";
import type {
  ActiveProfile,
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "./types";
import type { AppointmentFormField } from "@/app/leads/types";

// Grouped-by-status list, same idea as iOS's AppointmentsListView (List
// mode) — one section per status, ordered by each status's own sort_order.
export function AppointmentsExplorer({
  initialAppointments,
  statuses,
  formFields,
  leads,
  initialAssignments,
  initialNotes,
  activeProfiles,
}: {
  initialAppointments: Appointment[];
  statuses: AppointmentStatus[];
  formFields: AppointmentFormField[];
  leads: AppointmentLead[];
  initialAssignments: AppointmentAssignment[];
  initialNotes: AppointmentNote[];
  activeProfiles: ActiveProfile[];
}) {
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState(initialAppointments);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [notes, setNotes] = useState(initialNotes);
  const [leadsState, setLeadsState] = useState(leads);
  // Supports deep-linking from a notification ("View appointment") via
  // /admin/appointments?appointment=<id> — see notifications-list.tsx.
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("appointment"));

  const leadById = new Map(leadsState.map((l) => [l.id, l]));

  const groupedByStatus = statuses
    .map((status) => ({
      status,
      appointments: appointments
        .filter((a) => a.status_id === status.id)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    }))
    .filter((g) => g.appointments.length > 0);

  const selected = appointments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {appointments.length === 0 && (
        <p className="text-sm italic text-black/50 dark:text-white/50">No appointments yet.</p>
      )}

      {groupedByStatus.map((group) => (
        <div key={group.status.id}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: group.status.color }}
            />
            {group.status.name}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Date &amp; Time</th>
                  <th className="px-3 py-2 font-medium">Closer</th>
                </tr>
              </thead>
              <tbody>
                {group.appointments.map((a) => {
                  const lead = leadById.get(a.lead_id);
                  const closerNames = assignments
                    .filter((x) => x.appointment_id === a.id && x.role === "closer")
                    .map((x) => x.full_name)
                    .join(", ");
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="cursor-pointer border-t border-black/5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <td className="px-3 py-2">
                        {[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unknown"}
                      </td>
                      <td className="px-3 py-2 text-black/70 dark:text-white/70">
                        {lead?.address_line ?? "—"}
                      </td>
                      <td className="px-3 py-2">{new Date(a.scheduled_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{closerNames || "Unassigned"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {selected && (
        <AppointmentDetailPanel
          appointment={selected}
          lead={leadById.get(selected.lead_id) ?? null}
          statuses={statuses}
          formFields={formFields}
          assignments={assignments.filter((x) => x.appointment_id === selected.id)}
          notes={notes.filter((x) => x.appointment_id === selected.id)}
          activeProfiles={activeProfiles}
          onClose={() => setSelectedId(null)}
          onAppointmentUpdated={(updated) => {
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }}
          onAssignmentsUpdated={(newAssignments) => {
            setAssignments((prev) => [
              ...prev.filter((x) => x.appointment_id !== selected.id),
              ...newAssignments,
            ]);
          }}
          onNoteAdded={(note) => {
            setNotes((prev) => [note, ...prev]);
          }}
          onLeadNameUpdated={(leadId, firstName, lastName) => {
            setLeadsState((prev) =>
              prev.map((l) => (l.id === leadId ? { ...l, first_name: firstName, last_name: lastName } : l))
            );
          }}
        />
      )}
    </div>
  );
}
