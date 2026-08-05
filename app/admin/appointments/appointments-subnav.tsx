"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/appointments", label: "Appointments" },
  { href: "/admin/appointments/statuses", label: "Statuses" },
  { href: "/admin/appointments/form-fields", label: "Form Fields" },
];

export function AppointmentsSubnav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b border-black/10 px-6 py-2 text-sm dark:border-white/10">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "font-medium underline underline-offset-4"
                : "text-black/60 hover:underline dark:text-white/60"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
