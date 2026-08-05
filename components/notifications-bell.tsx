import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Server component — fetches the unread count on render (page load /
// navigation), no client polling or Realtime. Matches the "web stays on
// refresh" decision: iOS gets Realtime for its bell, web just re-fetches
// whenever this layout re-renders, which is "good enough" per William.
// Dropped into both LeadsLayout and AdminLayout so it's visible regardless
// of role — notifications go to openers/closers (reps) as well as admins.
export async function NotificationsBell({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  return (
    <Link href="/notifications" className="relative inline-flex" aria-label="Notifications">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
      {!!count && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
