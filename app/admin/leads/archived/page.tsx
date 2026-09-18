import { createClient } from "@/lib/supabase/server";
import { ArchivedLeadsExplorer } from "./archived-leads-explorer";
import type { ArchivedLead } from "./types";

export default async function ArchivedLeadsPage() {
  const supabase = await createClient();

  // list_archived_leads (schema.sql) is a security-definer function with
  // its own inline is_admin() check — RLS's leads_select policy treats
  // archived_at is null as a blanket condition (no admin exemption,
  // exactly like the existing deleted_at is null), so a plain .select()
  // here would return nothing at all. Archived rows can only ever
  // surface through this dedicated function, never through the leads
  // table's normal RLS-scoped queries — the whole point being that
  // archiving actually removes a lead from EVERYONE's ordinary view,
  // admin included, not just reps/team_leads.
  const { data: leads, error } = await supabase.rpc("list_archived_leads");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load archived leads: {error.message}
      </div>
    );
  }

  return <ArchivedLeadsExplorer leads={(leads ?? []) as ArchivedLead[]} />;
}
