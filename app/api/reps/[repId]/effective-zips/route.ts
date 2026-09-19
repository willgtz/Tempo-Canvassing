import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Powers the "preview what a rep can see" filter on the leads map/list and
// admin dashboard. visible_zipcodes/teammate_ids (schema.sql) are security
// definer with no built-in caller restriction on their uid param — the role
// check below is what actually prevents a plain rep from probing another
// rep's effective visibility through this endpoint. A team_lead is further
// restricted to reps on their own team (team_id) — the same scoping the
// rep-filter dropdown itself already applies server-side (app/leads/page.tsx)
// — so this endpoint can't be used to route around that and probe an
// out-of-team rep's zips directly by id.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/reps/[repId]/effective-zips">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canQuery = ["team_lead", "admin", "super_admin"].includes(session.role);
  if (!canQuery) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { repId } = await ctx.params;
  const supabase = await createClient();

  if (session.role === "team_lead") {
    const { data: ownProfile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", session.userId)
      .single();
    const ownTeamId = ownProfile?.team_id ?? null;
    if (!ownTeamId) {
      return NextResponse.json({ error: "You're not on a team." }, { status: 403 });
    }
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", repId)
      .single();
    if (targetProfile?.team_id !== ownTeamId) {
      return NextResponse.json({ error: "That rep isn't on your team." }, { status: 403 });
    }
  }

  const [{ data: zips, error: zipsError }, { data: teammates, error: teammatesError }] =
    await Promise.all([
      supabase.rpc("visible_zipcodes", { root_user_id: repId }),
      supabase.rpc("teammate_ids", { uid: repId }),
    ]);

  if (zipsError || teammatesError) {
    return NextResponse.json(
      { error: zipsError?.message ?? teammatesError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    zipcodes: (zips ?? []).map((r: { zipcode: string }) => r.zipcode),
    teammateIds: (teammates ?? []) as string[],
  });
}
