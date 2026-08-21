import { createAdminClient } from "@/lib/supabase/admin";
import { PublicAppointmentRequestForm } from "./public-appointment-request-form";
import type { AppointmentFormField } from "@/app/leads/types";

export const metadata = {
  title: "Request an Appointment",
};

// Genuinely public route — no requireSession/requireAdmin, reachable by
// anyone with the link, no account needed. Uses the service-role client
// just to read the (non-sensitive) admin-configured question list, since
// there's no session here for the normal RLS-scoped client to run under.
export default async function AppointmentRequestPage() {
  const supabase = createAdminClient();
  const { data: formFields } = await supabase
    .from("appointment_form_fields")
    .select("id, label, field_type, options, is_required, sort_order")
    .order("sort_order");

  return <PublicAppointmentRequestForm formFields={(formFields ?? []) as AppointmentFormField[]} />;
}
