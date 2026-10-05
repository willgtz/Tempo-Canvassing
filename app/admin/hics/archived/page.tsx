import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { AllHicsExplorer } from "../all-hics-explorer";
import type { Hic, HicFinancingType } from "@/app/appointments/send-hic/types";

// Same AllHicsExplorer as /admin/hics, just mode="archived" — unlike
// leads' archived view, this needs no separate RLS-bypassing RPC:
// hics_select already grants admins unconditional visibility
// (is_admin(auth.uid()) or created_by = auth.uid()) regardless of
// archived_at, so a plain select("*") already returns archived rows.
export default async function ArchivedHicsPage() {
  const supabase = await createClient();

  const [{ data: hics, error: hicsError }, { data: profiles }, { data: financingTypes }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("hics").select("*").order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to)
    ),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("hic_financing_types").select("*").order("sort_order"),
  ]);

  if (hicsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load archived HICs: {hicsError.message}
      </div>
    );
  }

  return (
    <AllHicsExplorer
      hics={(hics ?? []) as Hic[]}
      profiles={(profiles ?? []) as { id: string; full_name: string }[]}
      financingTypes={(financingTypes ?? []) as HicFinancingType[]}
      mode="archived"
    />
  );
}
