import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";

// /dashboard had no nav of its own at all — the page a rep lands on
// immediately after login, with no way to reach /leads or sign out short
// of typing a URL. Mirrors /leads' own nav bar for consistency.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-3 dark:border-white/10">
        <span className="text-sm font-medium">{session.fullName}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/leads"
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Leads
          </Link>
          {(session.role === "admin" || session.role === "super_admin") && (
            <Link
              href="/admin/dashboard"
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
    </div>
  );
}
