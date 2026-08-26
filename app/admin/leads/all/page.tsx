import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { AllLeadsExplorer } from "./all-leads-explorer";
import type { AdminLead, Disposition } from "./types";

type RawLeadRow = Omit<AdminLead, "batch_filename"> & {
  lead_batches: { filename: string | null } | null;
};

export default async function AllLeadsPage() {
  const supabase = await createClient();

  const [{ data: leads, error: leadsError }, { data: dispositions, error: dispositionsError }] =
    await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from("leads")
          .select(
            "id, first_name, last_name, address_line, city, state, zipcode, phone, email, lat, lng, geocode_precision, disposition_id, prior_sale_date, is_manual, batch_id, lead_batches(filename), created_at"
          )
          // id as a secondary, unique sort key — a bulk CSV insert commonly
          // gives every row in the batch the same created_at (Postgres
          // evaluates now() once per statement), and .range()-based
          // pagination needs a fully deterministic order or rows can be
          // skipped or duplicated across page boundaries.
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      ),
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
