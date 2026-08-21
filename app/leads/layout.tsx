import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { MobileTabBar } from "@/components/mobile-tab-bar";

export default async function LeadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Any authenticated + active user (rep/team_lead/admin/super_admin) can
  // reach this screen — unlike /admin, which is admin/super_admin only.
  const session = await requireSession();
  const isAdmin = session.role === "admin" || session.role === "super_admin";

  return (
    <div className="flex flex-1 flex-col">
      <nav className="hidden flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-3 md:flex dark:border-white/10">
        <span className="font-medium text-sm">{session.fullName}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={isAdmin ? "/admin/dashboard" : "/dashboard"}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Dashboard
          </Link>
          <Link
            href={isAdmin ? "/admin/appointments" : "/appointments"}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Appointments
          </Link>
          <Link
            href="/leads/routes"
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Route History
          </Link>
          {isAdmin && (
            <Link
              href="/admin/leads/upload"
              className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
            >
              Admin
            </Link>
          )}
          <NotificationsBell userId={session.userId} />
          <SignOutButton />
        </div>
      </nav>
      {children}
      {/* No MobileTabBarSpacer here — the leads map deliberately bleeds
          edge-to-edge on mobile (matches the native app's map treatment);
          precise height accounting for the fixed tab bar overlapping it is
          handled in the mobile polish pass, not here. */}
      <MobileTabBar isAdmin={isAdmin} />
    </div>
  );
}
