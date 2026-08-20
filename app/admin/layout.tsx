import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";

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
    <div className="flex flex-1 flex-col">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-3 dark:border-white/10">
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
      {children}
    </div>
  );
}
