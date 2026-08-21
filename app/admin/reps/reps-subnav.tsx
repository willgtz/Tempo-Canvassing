"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/reps/manage", label: "Manage" },
  { href: "/admin/reps/inactive", label: "Inactive" },
  { href: "/admin/reps/add", label: "Add Rep" },
  { href: "/admin/reps/settings", label: "Settings" },
];

export function RepsSubnav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b border-black/10 px-6 py-2 text-sm dark:border-white/10">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
