import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LeadsExplorer } from "./leads-explorer";
import type { AppointmentFormField, Disposition, Lead, TeamZip } from "./types";

type RawLeadRow = Omit<Lead, "entered_by_name"> & {
  profiles: { full_name: string } | null;
};

export default async function LeadsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  // No manual zip filtering here — leads_select RLS (schema.sql) already
  // scopes this to whatever the signed-in user is allowed to see: their own
  // active zip assignments for a rep, + subordinates' for a team_lead, or
  // everything for admin/super_admin.
  const [
    { data: leads, error: leadsError },
    { data: dispositions, error: dispositionsError },
    { data: teamZips, error: teamZipsError },
    { data: appointmentFormFields, error: appointmentFormFieldsError },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, address_line, city, state, zipcode, lat, lng, geocode_precision, disposition_id, prior_sale_date, is_manual, entered_by, profiles!entered_by(full_name), created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.rpc("subordinate_zip_assignments", { root_user_id: session.userId }),
    // Same admin-configurable question list the iOS app's NewAppointmentSheet
    // renders — fetched once here (small, mostly-static, same treatment as
    // dispositions above) rather than lazily per-lead like notes/history.
    supabase
      .from("appointment_form_fields")
      .select("id, label, field_type, options, is_required, sort_order")
      .order("sort_order"),
  ]);

  if (leadsError || dispositionsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load leads: {leadsError?.message ?? dispositionsError?.message}
      </div>
    );
  }

  if (teamZipsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load zip assignments for filters: {teamZipsError.message}. Has the
        subordinate_zip_assignments migration been run in Supabase?
      </div>
    );
  }

  // Non-blocking, unlike the errors above — Appointments is an additive
  // feature on top of core leads functionality (e.g. the 2026-08-04
  // migration not having run yet on this Supabase project shouldn't take
  // down the whole leads page). Just means "Set Appointment" renders with
  // no extra questions beyond the fixed date/time until it's fixed.
  if (appointmentFormFieldsError) {
    console.error("Failed to load appointment_form_fields:", appointmentFormFieldsError.message);
  }

  const transformedLeads: Lead[] = ((leads ?? []) as unknown as RawLeadRow[]).map((l) => ({
    ...l,
    entered_by_name: l.profiles?.full_name ?? null,
  }));

  return (
    <LeadsExplorer
      leads={transformedLeads}
      dispositions={(dispositions ?? []) as Disposition[]}
      teamZips={(teamZips ?? []) as TeamZip[]}
      appointmentFormFields={(appointmentFormFields ?? []) as AppointmentFormField[]}
      currentUserId={session.userId}
      canFilterByRep={session.role === "team_lead" || session.role === "admin" || session.role === "super_admin"}
      isAdmin={session.role === "admin" || session.role === "super_admin"}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
    />
  );
}
