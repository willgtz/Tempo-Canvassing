import { createClient } from "@/lib/supabase/server";
import { StatusRow } from "./status-row";
import { NewStatusForm } from "./new-status-form";

export default async function AppointmentStatusesPage() {
  const supabase = await createClient();
  const { data: statuses, error } = await supabase
    .from("appointment_statuses")
    .select("id, name, color, sort_order, is_default")
    .order("sort_order");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load appointment statuses: {error.message}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Appointment Statuses</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Colors show up as the status dot on both the web and iOS appointment lists. &quot;Assigned&quot;,
          &quot;No Show&quot;, and &quot;Rescheduled&quot; are matched by name for automatic notifications
          and the reschedule flow — renaming them changes that behavior. Only one status can be the
          default for new appointments.
        </p>
      </div>

      <NewStatusForm />

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Sort Order</th>
              <th className="px-3 py-2 font-medium">Default</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(statuses ?? []).map((s) => (
              <StatusRow key={s.id} status={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
