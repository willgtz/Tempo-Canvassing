"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearAllNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "./actions";

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
  const [isClearingAll, startClearAll] = useTransition();
  const [isMarkingAllRead, startMarkAllRead] = useTransition();
  const router = useRouter();
  const hasUnread = notifications.some((n) => !n.read_at);

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

  function handleDelete(id: string) {
    setNotifications((prev) => prev.filter((x) => x.id !== id));
    startTransition(async () => {
      await deleteNotification(id);
    });
  }

  function handleClearAll() {
    if (!confirm("Clear all notifications?")) return;
    setNotifications([]);
    startClearAll(async () => {
      await clearAllNotifications();
    });
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    startMarkAllRead(async () => {
      await markAllNotificationsRead();
    });
  }

  if (notifications.length === 0) {
    return <p className="text-sm italic text-black/40 dark:text-white/40">No notifications yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-4">
        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            disabled={isMarkingAllRead}
            className="text-xs text-black/50 hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
          >
            Read all
          </button>
        )}
        <button
          onClick={handleClearAll}
          disabled={isClearingAll}
          className="text-xs text-black/50 hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
        >
          Clear all
        </button>
      </div>
      <div className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
        {notifications.map((n) => (
          <div key={n.id} className="flex items-start gap-2 p-4 hover:bg-black/5 dark:hover:bg-white/5">
            <button onClick={() => handleClick(n)} className="flex flex-1 items-start gap-3 text-left">
              {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
              {n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" />}
              <div className="space-y-0.5">
                <p className="text-sm">{n.message}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            </button>
            <button
              onClick={() => handleDelete(n.id)}
              aria-label="Clear notification"
              className="shrink-0 text-black/30 hover:text-black dark:text-white/30 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
