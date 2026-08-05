import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type NoteRow = {
  id: string;
  note: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/leads/[id]/notes">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  // notes_select RLS (deleted_at is null AND lead_id in visible leads)
  // means this naturally returns [] for a lead the caller can't see,
  // rather than needing a manual check here.
  //
  // lead_notes has two FKs to profiles (user_id, deleted_by), so the
  // embed must specify which one via `profiles!user_id` — otherwise
  // PostgREST can't tell which relationship to join through (PGRST201).
  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, note, created_at, profiles!user_id(full_name)")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as NoteRow[];
  const notes = rows.map((n) => ({
    id: n.id,
    note: n.note,
    created_at: n.created_at,
    author_name: n.profiles?.full_name ?? "Unknown",
  }));

  return NextResponse.json(notes);
}
