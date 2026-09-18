"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { laDateOnly } from "@/lib/dashboard/stats";

export type SetDoorKnockGoalInput = { targetCount: number; startDate: string; endDate: string };
export type SetDoorKnockGoalResult = { ok: true } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// One active goal at a time — a new one can only be created once the
// current one's window has fully closed (today > end_date), checked
// here rather than as a DB trigger (see schema.sql's door_knock_goals
// migration comment for why: a pure date check can never drift out of
// sync with the live-derived achieved/failed status).
export async function setDoorKnockGoal(input: SetDoorKnockGoalInput): Promise<SetDoorKnockGoalResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  if (!Number.isInteger(input.targetCount) || input.targetCount <= 0) {
    return { ok: false, error: "Target must be a positive whole number." };
  }
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return { ok: false, error: "Invalid date." };
  }
  if (input.endDate < input.startDate) {
    return { ok: false, error: "End date must be on or after the start date." };
  }

  const supabase = await createClient();

  const { data: latest, error: latestError } = await supabase
    .from("door_knock_goals")
    .select("end_date")
    .eq("user_id", session.userId)
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return { ok: false, error: latestError.message };

  const today = laDateOnly(new Date());
  if (latest && latest.end_date >= today) {
    return { ok: false, error: `You already have a goal running through ${latest.end_date}.` };
  }

  const { error } = await supabase.from("door_knock_goals").insert({
    user_id: session.userId,
    target_count: input.targetCount,
    start_date: input.startDate,
    end_date: input.endDate,
    created_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
