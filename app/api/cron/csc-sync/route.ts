import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron, once every morning (vercel.json): moves appointments that
// have gone 14 days with no activity into the Tempo CSC list. All the
// rules live in run_csc_sync() (scripts/migrations/2026-11-12-special-
// lists-tempo-csc.sql), which only the service role can execute. Same
// CRON_SECRET bearer check as /api/cron/hic-reminders.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("run_csc_sync");
  if (error) {
    console.error("run_csc_sync failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
