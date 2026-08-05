import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { NotificationsBell } from "@/components/notifications-bell";

export default async function LeadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Any authenticated + active user (rep/team_lead/admin/super_admin) can
  // reach this screen — unlike /admin, which is admin/super_admin only.
  const session = await requireSession();

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center justify-between gap-4 border-b border-black/10 px-6 py-3 text-sm dark:border-white/10">
        <span className="font-medium">{session.fullName}</span>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          {(session.role === "admin" || session.role === "super_admin") && (
            <Link href="/admin/leads/upload" className="hover:underline">
              Admin
            </Link>
          )}
          <NotificationsBell userId={session.userId} />
        </div>
      </nav>
      {children}
    </div>
  );
}
