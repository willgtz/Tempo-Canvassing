import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { DoorKnockSettingsClient } from "./door-knock-settings-client";

export default async function AdminSettingsPage() {
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
    { data: radiusRow, error: radiusError },
    { data: profiles, error: profilesError },
    { data: grants, error: grantsError },
  ] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "door_knock_radius_feet").single(),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase
      .from("door_knock_visibility_grants")
      .select("id, grantee_id, target_id")
      .order("granted_at", { ascending: false }),
  ]);

  if (radiusError || profilesError || grantsError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load settings:{" "}
        {radiusError?.message ?? profilesError?.message ?? grantsError?.message}
      </div>
    );
  }

  return (
    <DoorKnockSettingsClient
      radiusFeet={typeof radiusRow?.value === "number" ? radiusRow.value : 150}
      profiles={profiles ?? []}
      initialGrants={(grants ?? []).map((g) => ({
        id: g.id,
        granteeId: g.grantee_id,
        targetId: g.target_id,
      }))}
    />
  );
}
