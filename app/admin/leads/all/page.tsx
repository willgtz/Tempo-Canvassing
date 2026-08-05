import { createClient } from "@/lib/supabase/server";
import { AllLeadsExplorer } from "./all-leads-explorer";
import type { AdminLead, Disposition } from "./types";

type RawLeadRow = Omit<AdminLead, "batch_filename"> & {
  lead_batches: { filename: string | null } | null;
};

export default async function AllLeadsPage() {
  const supabase = await createClient();

  const [{ data: leads, error: leadsError }, { data: dispositions, error: dispositionsError }] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, address_line, city, state, zipcode, phone, email, lat, lng, geocode_precision, disposition_id, prior_sale_date, is_manual, batch_id, lead_batches(filename), created_at"
        )
        .order("created_at", { ascending: false }),
      supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    ]);

  if (leadsError || dispositionsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load leads: {leadsError?.message ?? dispositionsError?.message}
      </div>
    );
  }

  const transformedLeads: AdminLead[] = ((leads ?? []) as unknown as RawLeadRow[]).map((l) => ({
    ...l,
    batch_filename: l.lead_batches?.filename ?? null,
  }));

  return (
    <AllLeadsExplorer leads={transformedLeads} dispositions={(dispositions ?? []) as Disposition[]} />
  );
}
