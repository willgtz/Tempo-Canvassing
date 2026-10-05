"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/hics", label: "All HICs" },
  { href: "/admin/hics/templates", label: "Templates" },
  { href: "/admin/hics/settings", label: "Settings" },
];

export function HicsSubnav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b border-black/10 px-6 py-2 text-sm dark:border-white/10">
      {TABS.map((tab) => {
        const active = tab.href === "/admin/hics" ? pathname === tab.href : pathname.startsWith(tab.href);
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
