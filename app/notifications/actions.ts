"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

// notifications_update_own RLS (schema.sql) already restricts this to the
// caller's own rows — the .eq below just keeps this from ever attempting
// (and silently no-op'ing against) someone else's notification.
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/notifications");
  return { ok: true };
}

// notifications_delete_own RLS (schema.sql) already restricts this to the
// caller's own rows — same .eq belt-and-suspenders as markNotificationRead.
export async function deleteNotification(notificationId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/notifications");
  return { ok: true };
}

// Distinct from clearAllNotifications above — marks every notification
// read (clears the bell's unread badge) without deleting any of them.
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("read_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/notifications");
  return { ok: true };
}

export async function clearAllNotifications(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("user_id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/notifications");
  return { ok: true };
}
