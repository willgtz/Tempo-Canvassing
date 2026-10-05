import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { AllHicsExplorer } from "./all-hics-explorer";
import type { Hic } from "@/app/appointments/send-hic/types";

// Gated by app/admin/layout.tsx's own requireAdmin() call — admin-only
// across the whole /admin subtree, same as every other page here (see
// app/admin/leads/all/page.tsx for the identical no-extra-gate
// convention). hics_select RLS lets is_admin(auth.uid()) see every row,
// not just ones this admin created, so no manual filtering is needed —
// same reasoning as every other admin list in this app.
export default async function AdminHicsPage() {
  const supabase = await createClient();

  const [{ data: hics, error: hicsError }, { data: profiles }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("hics").select("*").order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to)
    ),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  if (hicsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load HICs: {hicsError.message}
      </div>
    );
  }

  return (
    <AllHicsExplorer hics={(hics ?? []) as Hic[]} profiles={(profiles ?? []) as { id: string; full_name: string }[]} />
  );
}
