import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { MobileTabBar, MobileTabBarSpacer } from "@/components/mobile-tab-bar";

const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/leads/upload", label: "Manage Leads" },
  { href: "/admin/appointments", label: "Appointments" },
  { href: "/admin/reps/manage", label: "Reps" },
  { href: "/leads", label: "Leads Map" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // UX-level gate only. Redirects non-admins to /login before any admin UI
  // renders. Actual data access is enforced by Postgres RLS, and every
  // Server Action / Route Handler under /admin re-checks independently.
  const session = await requireAdmin();

  return (
    // h-dvh + overflow-hidden locks the whole admin shell to the
    // viewport instead of growing with content — pages that need their
    // own internal scroll (like the Appointments calendar) can now
    // actually fill available space instead of the body scrolling on
    // top of an already-scrollable inner region. Ordinary admin pages
    // are unaffected: the flex-1/min-h-0/overflow-y-auto wrapper below
    // just moves where the scrollbar lives (from body to this div),
    // not whether the page scrolls.
    <div className="flex h-dvh flex-col overflow-hidden">
      <nav className="hidden flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-3 md:flex dark:border-white/10">
        <div className="flex flex-wrap gap-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium text-black transition-transform duration-100 hover:bg-black/5 active:scale-95 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell userId={session.userId} />
          <SignOutButton />
        </div>
      </nav>
      {/* Mobile-only compact header — the full NAV_LINKS list (5 items,
          several admin-config-specific) doesn't map cleanly to a 3-tab
          bottom bar, so mobile gets the same Dashboard/Leads/Appointments
          tabs reps get (pointed at the admin equivalents) plus a minimal
          top strip for sign-out/notifications, rather than trying to
          cram every admin nav item into the tab bar. */}
      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2 md:hidden dark:border-white/10">
        <span className="text-sm font-medium">Admin</span>
        <div className="flex items-center gap-3">
          <NotificationsBell userId={session.userId} />
          <SignOutButton />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      <MobileTabBarSpacer />
      <MobileTabBar isAdmin />
    </div>
  );
}
