"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/leads/upload", label: "Upload" },
  { href: "/admin/leads/batches", label: "Batches" },
  { href: "/admin/leads/dispositions", label: "Dispositions" },
  { href: "/admin/leads/all", label: "All Leads" },
  { href: "/admin/leads/archived", label: "Archived" },
];

const SUPER_ADMIN_TABS = [{ href: "/admin/leads/special-lists", label: "Special Lists" }];

export function LeadsSubnav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isSuperAdmin ? [...TABS, ...SUPER_ADMIN_TABS] : TABS;

  return (
    <nav className="flex gap-4 overflow-x-auto whitespace-nowrap border-b border-black/10 px-6 py-2 text-sm dark:border-white/10">
      {tabs.map((tab) => {
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
