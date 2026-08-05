import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, type, appointment_id, message, read_at, created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load notifications: {error.message}
      </div>
    );
  }

  const isAdmin = session.role === "admin" || session.role === "super_admin";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <NotificationsList initialNotifications={notifications ?? []} isAdmin={isAdmin} />
    </div>
  );
}
