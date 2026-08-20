import { Badge } from "@/components/ui/badge";
import type { Appointment, AppointmentLead, AppointmentStatus } from "@/app/admin/appointments/types";

const DEFAULT_COLOR = "#6B7280";

// Grouped by status, same idea as the leads list's mobile cards — a rep's
// own appointment count is small enough that this doesn't need the
// collapsible-sections treatment the admin's company-wide list has.
export function AppointmentsList({
  appointments,
  statuses,
  leadById,
  onSelect,
}: {
  appointments: Appointment[];
  statuses: AppointmentStatus[];
  leadById: Map<string, AppointmentLead>;
  onSelect: (appointmentId: string) => void;
}) {
  const groups = statuses
    .map((status) => ({
      status,
      appointments: appointments
        .filter((a) => a.status_id === status.id)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    }))
    .filter((g) => g.appointments.length > 0);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.status.id} className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: group.status.color }} />
            {group.status.name}
            <span className="text-black/40 dark:text-white/40">({group.appointments.length})</span>
          </p>
          {group.appointments.map((appt) => {
            const lead = leadById.get(appt.lead_id);
            return (
              <button
                key={appt.id}
                onClick={() => onSelect(appt.id)}
                className="flex w-full flex-col gap-1 rounded-xl border border-black/10 p-3 text-left transition-colors active:bg-black/5 dark:border-white/10 dark:active:bg-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    {[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unknown lead"}
                  </span>
                  <Badge color={group.status.color ?? DEFAULT_COLOR} className="shrink-0">
                    {group.status.name}
                  </Badge>
                </div>
                <span className="text-sm text-black/60 dark:text-white/60">{lead?.address_line ?? "—"}</span>
                <span className="text-xs text-black/40 dark:text-white/40">
                  {new Date(appt.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
