import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { NotificationsBell } from "@/components/notifications-bell";

const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/leads/upload", label: "Manage Leads" },
  { href: "/admin/appointments", label: "Appointments" },
  { href: "/admin/reps/manage", label: "Reps" },
  { href: "/admin/settings", label: "Settings" },
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
      <nav className="flex items-center justify-between gap-4 border-b border-black/10 px-6 py-3 text-sm dark:border-white/10">
        <div className="flex gap-4">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </div>
        <NotificationsBell userId={session.userId} />
      </nav>
      {children}
    </div>
  );
}
