import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { MobileTabBar, MobileTabBarSpacer } from "@/components/mobile-tab-bar";

export default async function AppointmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "admin" || session.role === "super_admin";

  return (
    // h-dvh + overflow-hidden locks this route to exactly the viewport
    // height instead of growing with content — the calendar's day view
    // needs its own internal scroll (see appointments-calendar.tsx),
    // not a second, outer page-level scroll on top of it. h-dvh (not
    // h-screen) tracks mobile Safari's dynamic toolbar so this doesn't
    // over/under-shoot when the address bar shows or hides.
    <div className="flex h-dvh flex-col overflow-hidden">
      <nav className="hidden flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-3 md:flex dark:border-white/10">
        <span className="text-sm font-medium">{session.fullName}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={isAdmin ? "/admin/dashboard" : "/dashboard"}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Dashboard
          </Link>
          <Link
            href="/leads"
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Leads
          </Link>
          {isAdmin && (
            <Link
              href="/admin/appointments"
              className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
            >
              Admin
            </Link>
          )}
          <NotificationsBell userId={session.userId} />
          <SignOutButton />
        </div>
      </nav>
      {/* flex-1 + min-h-0 (not h-full) so this genuinely participates in
          the flex-grow chain above instead of relying on percentage
          height, which doesn't reliably resolve against a flex-item
          ancestor's flex-computed height (min-h-0 is what lets it shrink
          below its content's natural height so the overflow inside
          AppointmentsCalendar actually engages instead of this div just
          growing to fit). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <MobileTabBarSpacer />
      <MobileTabBar isAdmin={isAdmin} />
    </div>
  );
}
