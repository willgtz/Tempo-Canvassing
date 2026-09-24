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
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase.from("teams").select("id, name, created_at").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, active")
      .order("full_name"),
    supabase.from("team_memberships").select("user_id, team_id"),
  ]);

  if (teamsError || profilesError || membershipsError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load teams: {teamsError?.message ?? profilesError?.message ?? membershipsError?.message}
      </div>
    );
  }

  return (
    <TeamsClient
      initialTeams={teams ?? []}
      profiles={profiles ?? []}
      initialMemberships={(memberships ?? []).map((m) => ({ userId: m.user_id, teamId: m.team_id }))}
    />
  );
}
