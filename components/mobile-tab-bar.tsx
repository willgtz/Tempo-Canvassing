"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui/cn";

const ICONS = {
  dashboard: (active: boolean) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className="h-6 w-6">
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </svg>
  ),
  leads: (active: boolean) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className="h-6 w-6">
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  appointments: (active: boolean) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className="h-6 w-6">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </svg>
  ),
  reps: (active: boolean) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className="h-6 w-6">
      <circle cx="9" cy="8" r="3" />
      <path strokeLinecap="round" d="M3.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" />
      <path strokeLinecap="round" d="M15.5 4.5a3 3 0 0 1 0 6M17.5 20c0-3-1.5-5.2-3.8-5.9" />
    </svg>
  ),
};

// Mobile-only (hidden at md and up, where the existing top nav takes
// over) — matches the native iOS app's Dashboard/Leads/Appointments tab
// structure exactly, so the web experience feels like the same app
// rather than a separate product. Fixed to the bottom with a safe-area
// inset so it doesn't collide with the home indicator on notched
// iPhones, same consideration the PWA manifest work will lean on too.
//
// isAdmin swaps Dashboard/Appointments to their /admin equivalents —
// without this, an admin landing on /admin/dashboard (which has its own
// separate layout) saw no mobile treatment at all, since this component
// previously only ever pointed at the rep-facing routes.
export function MobileTabBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const TABS = [
    { href: isAdmin ? "/admin/dashboard" : "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
    { href: "/leads", label: "Leads", icon: ICONS.leads },
    { href: isAdmin ? "/admin/appointments" : "/appointments", label: "Appointments", icon: ICONS.appointments },
    // Admin-only fourth tab — Reps management previously had no mobile
    // entry point at all (the desktop nav's Reps link is hidden below
    // md, and the mobile header strip only had notifications/sign-out).
    ...(isAdmin ? [{ href: "/admin/reps/manage", label: "Reps", icon: ICONS.reps }] : []),
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-black/10 bg-white/90 backdrop-blur-lg md:hidden dark:border-white/10 dark:bg-neutral-950/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors active:opacity-60",
              active ? "text-blue-600 dark:text-blue-400" : "text-black/50 dark:text-white/50"
            )}
          >
            {tab.icon(active)}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Reserves space at the bottom of the page content, on mobile only, so
// the fixed tab bar never overlaps the last bit of scrollable content.
export function MobileTabBarSpacer() {
  return <div className="h-16 md:hidden" style={{ height: `calc(4rem + env(safe-area-inset-bottom))` }} />;
}
