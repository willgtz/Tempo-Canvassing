"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead } from "./actions";

type Notification = {
  id: string;
  type: string;
  appointment_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
};

// Admins get a working deep link (the /admin/appointments page reads
// ?appointment= to auto-open the right one — see appointments-explorer.tsx).
// Reps don't have an appointment-management screen on web at all (that's
// iOS-only, per the "web parity is submission-only for reps" scope
// decision) — for them this just marks the notification read, there's
// nowhere else to send them.
export function NotificationsList({
  initialNotifications,
  isAdmin,
}: {
  initialNotifications: Notification[];
  isAdmin: boolean;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(n: Notification) {
    if (!n.read_at) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      startTransition(async () => {
        await markNotificationRead(n.id);
      });
    }
    if (isAdmin && n.appointment_id) {
      router.push(`/admin/appointments?appointment=${n.appointment_id}`);
    }
  }

  if (notifications.length === 0) {
    return <p className="text-sm italic text-black/40 dark:text-white/40">No notifications yet.</p>;
  }

  return (
    <div className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
      {notifications.map((n) => (
        <button
          key={n.id}
          onClick={() => handleClick(n)}
          className="flex w-full items-start gap-3 p-4 text-left hover:bg-black/5 dark:hover:bg-white/5"
        >
          {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
          {n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" />}
          <div className="space-y-0.5">
            <p className="text-sm">{n.message}</p>
            <p className="text-xs text-black/50 dark:text-white/50">
              {new Date(n.created_at).toLocaleString()}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
