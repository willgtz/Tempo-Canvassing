import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { TeamsClient } from "./teams-client";

export default async function TeamsPage() {
  const session = await getAdminSession();
  if (!session) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Unauthorized.
      </div>
    );
  }

  const supabase = await createClient();
  const [
    { data: teams, error: teamsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase.from("teams").select("id, name, created_at").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, active, team_id")
      .order("full_name"),
  ]);

  if (teamsError || profilesError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load teams: {teamsError?.message ?? profilesError?.message}
      </div>
    );
  }

  return <TeamsClient initialTeams={teams ?? []} profiles={profiles ?? []} />;
}
