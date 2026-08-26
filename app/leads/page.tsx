import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
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
    { data: radiusRow, error: radiusError },
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, address_line, city, state, zipcode, lat, lng, geocode_precision, disposition_id, prior_sale_date, is_manual, entered_by, profiles!entered_by(full_name), created_at"
        )
        // id as a secondary, unique sort key — see fetch-all-rows.ts's
        // comment: .range() pagination needs a fully deterministic order,
        // and a bulk CSV insert commonly gives every row the same
        // created_at.
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.rpc("subordinate_zip_assignments", { root_user_id: session.userId }),
    // Same admin-configurable question list the iOS app's NewAppointmentSheet
    // renders — fetched once here (small, mostly-static, same treatment as
    // dispositions above) rather than lazily per-lead like notes/history.
    supabase
      .from("appointment_form_fields")
      .select("id, label, field_type, options, is_required, sort_order")
      .order("sort_order"),
    // Drives the client-side "too far to count as a door knock" notice —
    // purely advisory; the DB trigger (compute_door_knock_verification)
    // is the real system of record and always recomputes server-side
    // regardless of what the client sends. Same app_settings row the
    // admin settings page (app/admin/reps/settings) reads/writes.
    supabase.from("app_settings").select("value").eq("key", "door_knock_radius_feet").single(),
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
  // Same non-blocking treatment — worst case the client-side "too far"
  // notice falls back to the schema's own default (150ft, matching the
  // row app_settings ships with) rather than taking down the whole page.
  if (radiusError) {
    console.error("Failed to load door_knock_radius_feet:", radiusError.message);
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
      doorKnockRadiusFeet={typeof radiusRow?.value === "number" ? radiusRow.value : 150}
      currentUserId={session.userId}
      canFilterByRep={session.role === "team_lead" || session.role === "admin" || session.role === "super_admin"}
      isAdmin={session.role === "admin" || session.role === "super_admin"}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
    />
  );
}
