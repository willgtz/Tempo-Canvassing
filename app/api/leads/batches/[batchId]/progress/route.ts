import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/leads/batches/[batchId]/progress">
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { batchId } = await ctx.params;
  const supabase = await createClient();

  const base = () => supabase.from("leads").select("id", { count: "exact", head: true }).eq("batch_id", batchId);

  const [total, geocoded, rooftop, failed] = await Promise.all([
    base(),
    base().not("geocoded_at", "is", null),
    base().eq("geocode_precision", "ROOFTOP"),
    base().not("geocoded_at", "is", null).is("lat", null),
  ]);

  if (total.error) {
    return NextResponse.json({ error: total.error.message }, { status: 500 });
  }

  return NextResponse.json({
    total: total.count ?? 0,
    geocoded: geocoded.count ?? 0,
    rooftop: rooftop.count ?? 0,
    failed: failed.count ?? 0,
  });
}
