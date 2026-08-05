import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type HistoryRow = {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  profiles: { full_name: string } | null;
};

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/leads/[id]/history">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  // history_select RLS (is_admin OR lead_id in visible leads) means this
  // naturally returns [] for a lead the caller can't see.
  const { data, error } = await supabase
    .from("lead_history")
    .select("id, field_changed, old_value, new_value, changed_at, profiles!user_id(full_name)")
    .eq("lead_id", id)
    .order("changed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as HistoryRow[];
  const history = rows.map((h) => ({
    id: h.id,
    fieldChanged: h.field_changed,
    oldValue: h.old_value,
    newValue: h.new_value,
    changedAt: h.changed_at,
    authorName: h.profiles?.full_name ?? "Unknown",
  }));

  return NextResponse.json(history);
}
