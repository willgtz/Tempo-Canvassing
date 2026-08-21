import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RouteHistoryList } from "./route-history-list";

// Reads the `routes` table (schema.sql) — RLS (routes_own: user_id =
// auth.uid() or is_admin) already scopes this to just the signed-in
// rep's own past routes, or everyone's for an admin, with zero manual
// filtering needed here. Nothing wrote to this table until the
// route-building API started logging to it (app/api/leads/route) —
// this is the first UI that reads it back.
export default async function RouteHistoryPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: routes, error } = await supabase
    .from("routes")
    .select("id, user_id, lead_ids, ordered_lead_ids, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load route history: {error.message}
      </div>
    );
  }

  const allLeadIds = Array.from(
    new Set((routes ?? []).flatMap((r) => r.ordered_lead_ids ?? r.lead_ids ?? []))
  );
  const userIds = Array.from(new Set((routes ?? []).map((r) => r.user_id)));

  const [{ data: leads }, { data: profiles }] = await Promise.all([
    allLeadIds.length
      ? supabase
          .from("leads")
          .select("id, first_name, last_name, address_line, city, state, zipcode")
          .in("id", allLeadIds)
      : Promise.resolve({ data: [] }),
    // Only matters for admin viewing other reps' routes — a rep's own
    // routes are all their own name, shown for consistency either way.
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <RouteHistoryList
      currentUserId={session.userId}
      routes={(routes ?? []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        leadIds: r.ordered_lead_ids?.length ? r.ordered_lead_ids : r.lead_ids,
        createdAt: r.created_at,
      }))}
      leads={(leads ?? []) as { id: string; first_name: string | null; last_name: string | null; address_line: string; city: string | null; state: string | null; zipcode: string }[]}
      profiles={(profiles ?? []) as { id: string; full_name: string }[]}
    />
  );
}
